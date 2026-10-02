// Camera direction. A shot list is built from the bar grid, then the camera
// pose for any time is a pure function of t.

import * as THREE from "three";
import { HAMMER, KEY_FRONT, STRIKE_Y, WHITE_TOP, hammerX, keyX, LOWEST, HIGHEST } from "./piano/layout";
import type { Note, Performance } from "./timeline";

export type ShotKind = "wide" | "medium" | "keys" | "action" | "row" | "macro" | "outro";

export interface Shot {
  kind: ShotKind;
  start: number;
  end: number;
  /** Seconds spent easing in from the previous shot; 0 means a cut. */
  move: number;
  /** Pitch a macro shot frames. */
  pitch?: number;
}

export interface CameraPose {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
}

/**
 * Default plan, in bars: open wide, go down to the keys, crane up into the
 * action for the busy run, look down the hammer row, close in on one
 * hammer, pull out as the verse arrives, then repeat the in-and-out around
 * the left hand before a final pull back.
 */
export interface PlanStep {
  bars: number;
  kind: ShotKind;
  move: number;
}

const PLAN: PlanStep[] = [
  { bars: 1, kind: "wide", move: 0 },
  { bars: 1, kind: "keys", move: 0 },
  { bars: 1, kind: "action", move: 1.1 },
  { bars: 1, kind: "row", move: 0 },
  { bars: 1, kind: "macro", move: 0 },
  { bars: 2, kind: "medium", move: 2.2 },
  { bars: 1, kind: "keys", move: 0 },
  { bars: 1, kind: "action", move: 1.2 },
  { bars: 1, kind: "macro", move: 0 },
  { bars: 2, kind: "row", move: 0 },
  { bars: 1, kind: "keys", move: 0 },
  { bars: 99, kind: "outro", move: 1.6 },
];

/** Cuts land this long before the downbeat, so the first strike is seen in flight. */
const CUT_LEAD = 0.3;

const ease = (x: number) => {
  const c = Math.min(Math.max(x, 0), 1);
  return c * c * c * (c * (c * 6 - 15) + 10);
};
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

export class Director {
  readonly shots: Shot[] = [];
  private readonly focus: Float32Array; // smoothed centre pitch, sampled at FOCUS_RATE
  private static readonly FOCUS_RATE = 30;

  /**
   * `plan` replaces the default shot plan; `from` starts it at the first
   * downbeat at or after that time (the journey film hands over mid-song).
   */
  constructor(
    private readonly perf: Performance,
    opts: { plan?: PlanStep[]; from?: number } = {},
  ) {
    this.focus = this.buildFocus();
    this.buildShots(opts.plan ?? PLAN, opts.from ?? 0);
  }

  private buildShots(plan: PlanStep[], from: number) {
    const bars = this.perf.downbeats;
    let i = Math.max(bars.findIndex((b) => b >= from - 0.01), 0);
    let start = from;
    for (const step of plan) {
      const endBar = i + step.bars;
      const end = endBar < bars.length ? bars[endBar] - CUT_LEAD : this.perf.duration + 1;
      const shot: Shot = { kind: step.kind, start, end, move: step.move };
      if (step.kind === "macro") {
        // Fall back to the last chord before the shot, still ringing.
        const note = this.featuredNote(start, end) ?? this.perf.notes.filter((n) => n.on < start + 0.15).at(-1);
        shot.pitch = note?.p ?? 64;
      }
      this.shots.push(shot);
      start = end;
      i = endBar;
      if (start >= this.perf.duration) break;
    }
  }

  /** The loudest note struck during a span, for a macro shot. */
  private featuredNote(start: number, end: number): Note | undefined {
    const inSpan = this.perf.notes.filter((n) => n.on >= start + 0.15 && n.on < end - 0.4);
    return [...inSpan].sort((a, b) => b.v - a.v)[0];
  }

  /** Where the music is on the keyboard, smoothed so the camera glides. */
  private buildFocus(): Float32Array {
    const rate = Director.FOCUS_RATE;
    const n = Math.ceil((this.perf.duration + 1) * rate);
    const raw = new Float32Array(n);
    let last = 64;
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      let sum = 0;
      let w = 0;
      for (const note of this.perf.notes) {
        if (note.on > t + 0.4 || note.off < t - 0.6) continue;
        const weight = 0.3 + note.v;
        sum += note.p * weight;
        w += weight;
      }
      last = w > 0 ? sum / w : last;
      raw[i] = last;
    }
    // Gaussian smoothing, sigma ~0.9 s.
    const sigma = 0.9 * rate;
    const radius = Math.ceil(sigma * 3);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      let w = 0;
      for (let k = -radius; k <= radius; k++) {
        const j = Math.min(Math.max(i + k, 0), n - 1);
        const g = Math.exp(-(k * k) / (2 * sigma * sigma));
        s += raw[j] * g;
        w += g;
      }
      out[i] = s / w;
    }
    return out;
  }

  focusPitch(t: number): number {
    const f = Math.min(Math.max(t * Director.FOCUS_RATE, 0), this.focus.length - 1);
    const i = Math.floor(f);
    const j = Math.min(i + 1, this.focus.length - 1);
    return lerp(this.focus[i], this.focus[j], f - i);
  }

  private shotAt(t: number): number {
    for (let i = this.shots.length - 1; i >= 0; i--) if (t >= this.shots[i].start) return i;
    return 0;
  }

  shotName(t: number): string {
    return this.shots[this.shotAt(t)].kind;
  }

  pose(t: number): CameraPose {
    const i = this.shotAt(t);
    const shot = this.shots[i];
    const pose = this.framing(shot, t);
    if (i > 0 && shot.move > 0 && t < shot.start + shot.move) {
      const from = this.framing(this.shots[i - 1], t);
      const u = ease((t - shot.start) / shot.move);
      pose.position.lerpVectors(from.position, pose.position, u);
      pose.target.lerpVectors(from.target, pose.target, u);
      pose.fov = lerp(from.fov, pose.fov, u);
    }
    // A breath of handheld drift, deterministic.
    const drift = new THREE.Vector3(
      Math.sin(t * 0.71) * 0.6 + Math.sin(t * 1.37 + 1.1) * 0.4,
      Math.sin(t * 0.53 + 2.0) * 0.5 + Math.sin(t * 1.11) * 0.3,
      0,
    ).multiplyScalar(this.driftScale(shot.kind));
    pose.position.add(drift);
    return pose;
  }

  private driftScale(kind: ShotKind) {
    return kind === "macro" ? 0.0006 : kind === "wide" || kind === "medium" || kind === "outro" ? 0.006 : 0.0018;
  }

  /** Pose for one shot at time t (u runs 0..1 across the shot). */
  private framing(shot: Shot, t: number): CameraPose {
    const u = (t - shot.start) / Math.max(shot.end - shot.start, 0.001);
    const p = this.focusPitch(t);
    const kx = clamp(pitchX(p, keyX), -0.5, 0.5);
    const hx = clamp(pitchX(p, hammerX), -0.48, 0.48);
    const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    switch (shot.kind) {
      case "wide":
        return {
          position: v(lerp(-1.05, -0.7, ease(u)), lerp(1.5, 1.32, u), lerp(3.6, 2.75, ease(u))),
          target: v(-0.05, 0.86, 0),
          fov: 32,
        };
      case "medium": {
        const a = lerp(-0.42, -0.2, u);
        return {
          position: v(Math.sin(a) * 2.05, lerp(1.3, 1.2, u), Math.cos(a) * 2.05),
          target: v(0, 0.9, -0.02),
          fov: 30,
        };
      }
      case "outro":
        return {
          position: v(lerp(0.6, 0.85, u), lerp(1.25, 1.5, u), lerp(2.3, 3.7, ease(u))),
          target: v(0.05, 0.88, 0),
          fov: 32,
        };
      case "keys":
        return {
          position: v(kx + lerp(0.25, 0.19, u), 0.87, KEY_FRONT + 0.3),
          target: v(kx - 0.03, WHITE_TOP + 0.004, KEY_FRONT - 0.1),
          fov: 32,
        };
      case "action":
        return {
          position: v(clamp(hx - 0.26, -0.62, 0.62) + lerp(0, 0.05, u), 1.2, 0.2),
          target: v(hx + 0.02, STRIKE_Y + 0.004, -0.17),
          fov: 34,
        };
      case "row": {
        // Inside the case at one end, looking down the line of hammers.
        const fromLeft = hx >= 0;
        const s = fromLeft ? 1 : -1;
        return {
          position: v(-s * lerp(0.7, 0.64, u), STRIKE_Y + 0.05, -0.085),
          target: v(s * 0.25, STRIKE_Y - 0.02, -0.165),
          fov: 42,
        };
      }
      case "macro": {
        const x = hammerX(shot.pitch ?? 64);
        return {
          position: v(x - 0.1 + lerp(0, 0.015, u), STRIKE_Y + 0.08, HAMMER.pivotZ + 0.1),
          target: v(x + 0.004, STRIKE_Y - 0.008, -0.175),
          fov: 34,
        };
      }
    }
  }
}

const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);

/** x of a fractional pitch, interpolating a per-key position function. */
function pitchX(p: number, fx: (p: number) => number) {
  const c = clamp(p, LOWEST, HIGHEST);
  const lo = Math.floor(c);
  const hi = Math.min(lo + 1, HIGHEST);
  return lerp(fx(lo), fx(hi), c - lo);
}
