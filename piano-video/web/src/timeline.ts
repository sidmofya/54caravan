// Every moving part as a pure function of time, so any frame can be
// rendered on its own and always comes out the same.

import { HIGHEST, KEY_COUNT, LOWEST, hasDamper } from "./piano/layout";

export interface Note {
  p: number; // MIDI pitch
  on: number; // seconds, the moment the hammer reaches the string
  off: number; // seconds, key release
  v: number; // velocity 0..1
}

export interface Pedal {
  on: number;
  off: number;
}

export interface Performance {
  duration: number;
  tempo: number;
  beats: number[];
  downbeats: number[];
  notes: Note[];
  pedal: Pedal[];
}

const KEY_RELEASE = 0.07; // seconds for a key to rise
const HAMMER_REBOUND = 0.05; // strike to backcheck
const HAMMER_RETURN = 0.09; // backcheck to rest after release
const CHECK_FRACTION = 0.42; // how far back toward rest the backcheck catches
const PEDAL_RAMP = 0.09;
const DAMPER_FALL = 0.035; // key release to damper on string
const DAMPED_DECAY = 0.07; // seconds, ring-down once the damper lands

/** Key travel before the sound: loud notes are struck faster. */
export const leadTime = (v: number) => 0.065 - 0.04 * v;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x: number) => {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
};

/** Natural decay time constant of an undamped string, long in the bass. */
export const ringTime = (p: number) => 4.5 * Math.pow(2, -(p - LOWEST) / 22);

export interface KeyState {
  depression: number; // 0 up .. 1 fully down
  hammer: number; // 0 at rest .. 1 touching the string (may be fractional at check)
  damper: number; // 0 on the string .. 1 fully lifted
  amplitude: number; // string vibration, 0..~1.2
}

export class Timeline {
  readonly byKey: Note[][];
  readonly pedals: Pedal[];
  private readonly dampAt = new Map<Note, number>();

  constructor(readonly perf: Performance) {
    this.byKey = Array.from({ length: KEY_COUNT }, () => []);
    for (const n of perf.notes) {
      if (n.p >= LOWEST && n.p <= HIGHEST) this.byKey[n.p - LOWEST].push(n);
    }
    for (const list of this.byKey) list.sort((a, b) => a.on - b.on);
    this.pedals = [...perf.pedal].sort((a, b) => a.on - b.on);
    for (const n of perf.notes) this.dampAt.set(n, this.computeDampTime(n));
  }

  /** Sustain pedal position 0..1. */
  pedal(t: number): number {
    let v = 0;
    for (const s of this.pedals) {
      if (t < s.on) break;
      const down = smooth((t - s.on) / PEDAL_RAMP);
      const up = smooth((t - s.off) / PEDAL_RAMP);
      v = Math.max(v, down * (1 - up));
    }
    return v;
  }

  private pedalHeldUntil(t: number): number | null {
    for (const s of this.pedals) if (t >= s.on && t < s.off) return s.off;
    return null;
  }

  /** When the damper lands back on this note's strings after it is struck. */
  private computeDampTime(n: Note): number {
    if (!hasDamper(n.p)) return Infinity;
    const fall = n.off + DAMPER_FALL;
    const held = this.pedalHeldUntil(fall);
    let damp = held === null ? fall : held + PEDAL_RAMP * 0.6;
    // A repeated strike of the same key lifts the damper again.
    const list = this.byKey[n.p - LOWEST];
    const next = list[list.indexOf(n) + 1];
    if (next && next.on - leadTime(next.v) < damp) damp = Infinity;
    return damp;
  }

  /** Index of the last note on this key whose key travel has begun by t. */
  private latest(list: Note[], t: number): number {
    let lo = 0;
    let hi = list.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].on - leadTime(list[mid].v) <= t) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return found;
  }

  private depressionFor(n: Note, t: number): number {
    const start = n.on - leadTime(n.v);
    if (t < start) return 0;
    if (t < n.on) return Math.pow((t - start) / (n.on - start), 1.4);
    if (t < n.off) return 1;
    return 1 - smooth((t - n.off) / KEY_RELEASE);
  }

  /** Hammer travel for one note, starting its throw from `from`. */
  private hammerFor(n: Note, t: number, from: number): number {
    const start = n.on - leadTime(n.v);
    const held = (x: number) => {
      if (x < start) return from;
      if (x < n.on) {
        const u = (x - start) / (n.on - start);
        return from + (1 - from) * u * u; // accelerating throw
      }
      return 1 - CHECK_FRACTION * smooth((x - n.on) / HAMMER_REBOUND);
    };
    if (t < n.off || n.off <= n.on) return held(t);
    return held(n.off) * (1 - smooth((t - n.off) / HAMMER_RETURN));
  }

  key(p: number, t: number): KeyState {
    const list = this.byKey[p - LOWEST];
    const i = this.latest(list, t);
    if (i < 0) return { depression: 0, hammer: 0, damper: this.pedal(t), amplitude: 0 };

    const n = list[i];
    const prev = i > 0 ? list[i - 1] : null;
    let depression = this.depressionFor(n, t);
    let from = 0;
    if (prev) {
      depression = Math.max(depression, this.depressionFor(prev, t));
      from = this.hammerFor(prev, n.on - leadTime(n.v), 0);
    }
    const hammer = this.hammerFor(n, t, from);

    const keyLift = clamp01((depression - 0.35) / 0.5);
    const damper = hasDamper(p) ? Math.max(keyLift, this.pedal(t)) : 1;

    let amplitude = 0;
    for (const m of prev ? [prev, n] : [n]) amplitude += this.ring(m, t);
    return { depression, hammer, damper, amplitude: Math.min(amplitude, 1.2) };
  }

  private ring(n: Note, t: number): number {
    if (t < n.on) return 0;
    let a = (0.35 + 0.65 * n.v) * Math.exp(-(t - n.on) / ringTime(n.p));
    const damp = this.dampAt.get(n) ?? Infinity;
    if (t > damp) a *= Math.exp(-(t - damp) / DAMPED_DECAY);
    return a;
  }

  /** Notes sounding (struck and not yet damped) at t. */
  sounding(t: number, threshold = 0.05): Note[] {
    return this.perf.notes.filter((n) => n.on <= t && this.ring(n, t) > threshold);
  }
}
