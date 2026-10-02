// Who plays what: every note of the break goes to a hand and a finger.
//
// A beam search walks the music chord by chord, splitting each chord
// between the hands and moving each hand only as far as it must, so the
// hands travel the way a pianist's would. Each hand then sits over a
// position and its fingers fall on the keys under it. Fingertip targets
// follow the same key depression the piano shows, so finger and key go
// down together.

import * as THREE from "three";
import { KEYBOARD_LEFT, LOWEST, WHITE_PITCH, WHITE_TOP, isBlack } from "../piano/layout";
import { leadTime, type KeyState, type Note } from "../timeline";
import { keyContact, whiteContactZ, type TipGoal } from "./pose";
import type { Side } from "./rig";

/** Position across the keyboard in white keys: a white key's index, or halfway for a black key. */
export function whiteIndex(p: number): number {
  let n = 0;
  for (let q = LOWEST; q < p; q++) if (!isBlack(q)) n++;
  return isBlack(p) ? n - 0.5 : n;
}

/** Keyboard x of a (fractional) white index's centre. */
export const whiteX = (w: number) => KEYBOARD_LEFT + (w + 0.5) * WHITE_PITCH;

export interface Strike {
  note: Note;
  hand: Side;
  finger: number; // 0 thumb .. 4 little
  /** When the key starts down: the finger must be on it by then. */
  down: number;
  /** When the finger lets go; the key rises from here. */
  release: number;
  /** Index of the hand position this strike is played from. */
  place: number;
}

interface Cluster {
  t: number; // earliest key-down in the chord
  notes: Note[]; // sorted by pitch
}

interface State {
  c: Record<Side, number>; // hand centres, in white keys
  last: Record<Side, number>; // when each hand last played
  cost: number;
  hands: Side[][]; // per cluster, per note
  centres: Record<Side, number>[]; // per cluster
}

const SPREAD = 3; // a hand reaches this many white keys either side of its centre
const MAX_SPAN = 7; // widest chord one hand takes, in white keys (an octave)
const BEAM = 160;
const HOVER = 0.02; // fingers rest this far above the keys
const APPROACH = 0.12; // seconds a finger takes to drop onto its key
const LIFT = 0.1; // and to rise again
const PREP = 0.06; // a hand settles this long before its first key goes down
/** Seconds a hand takes to travel `d` white keys. */
const moveTime = (d: number) => THREE.MathUtils.clamp(0.12 + 0.025 * d, 0.12, 0.5);

/** Where a hand must sit to cover these notes, moving as little as possible from `prev`. */
function placeHand(ws: number[], prev: number): number | null {
  const lo = Math.min(...ws);
  const hi = Math.max(...ws);
  if (hi - lo > MAX_SPAN) return null;
  if (hi - lo > 2 * SPREAD) return (lo + hi) / 2;
  const stay = THREE.MathUtils.clamp(prev, hi - SPREAD, lo + SPREAD);
  // A hand that has to move anyway lands nearer the middle of what it plays.
  return stay === prev ? prev : THREE.MathUtils.clamp(prev, hi - SPREAD / 2, lo + SPREAD / 2);
}

export class Fingering {
  readonly strikes: Strike[] = [];
  private readonly byHand: Record<Side, { t: number; c: number; until: number }[]> = { L: [], R: [] };
  private readonly byFinger: Record<Side, Strike[][]> = { L: [[], [], [], [], []], R: [[], [], [], [], []] };

  /**
   * @param notes the whole performance
   * @param from, to the window she plays (seconds, performance time)
   * @param start where her hands sit before she plays, in white keys
   */
  constructor(notes: Note[], readonly from: number, readonly to: number, start: Record<Side, number> = { L: 18, R: 27 }) {
    const mine = notes.filter((n) => n.on >= from && n.on < to).sort((a, b) => a.on - b.on || a.p - b.p);
    const clusters: Cluster[] = [];
    for (const n of mine) {
      const down = n.on - leadTime(n.v);
      const last = clusters[clusters.length - 1];
      if (last && down - last.t < 0.035) {
        last.notes.push(n);
        last.notes.sort((a, b) => a.p - b.p);
      } else clusters.push({ t: down, notes: [n] });
    }

    // Beam search over ways to split each chord between the hands.
    let beam: State[] = [{ c: { ...start }, last: { L: -1e9, R: -1e9 }, cost: 0, hands: [], centres: [] }];
    for (const cl of clusters) {
      const next = new Map<string, State>();
      const ws = cl.notes.map((n) => whiteIndex(n.p));
      for (const s of beam) {
        for (let k = 0; k <= cl.notes.length; k++) {
          const parts: Record<Side, number[]> = { L: ws.slice(0, k), R: ws.slice(k) };
          const c = { ...s.c };
          const last = { ...s.last };
          let cost = s.cost;
          let ok = true;
          for (const side of ["L", "R"] as Side[]) {
            if (!parts[side].length) continue;
            const placed = placeHand(parts[side], s.c[side]);
            if (placed === null) {
              ok = false;
              break;
            }
            const d = Math.abs(placed - s.c[side]);
            const dt = Math.max(cl.t - s.last[side], 0.08);
            cost += 0.04 * d + 0.015 * (d / dt) ** 2;
            // Octaves in one hand are a stretch: share them between the hands when the other is near.
            const span = Math.max(...parts[side]) - Math.min(...parts[side]);
            cost += 0.5 * Math.max(0, span - 5) ** 2;
            // A gentle preference: the left hand below middle C's neighbourhood, the right above.
            for (const w of parts[side]) cost += 0.05 * Math.max(0, side === "L" ? w - 27 : 20 - w);
            c[side] = placed;
            last[side] = cl.t;
          }
          if (!ok) continue;
          // Hands keep their order and don't sit on top of each other.
          if (c.L > c.R - 4) cost += 20 + 5 * (c.L - c.R + 4);
          const hands = cl.notes.map((_, i) => (i < k ? "L" : "R") as Side);
          const key = `${Math.round(c.L * 2)},${Math.round(c.R * 2)}`;
          const prev = next.get(key);
          if (!prev || cost < prev.cost) {
            next.set(key, { c, last, cost, hands: [...s.hands, hands], centres: [...s.centres, { ...c }] });
          }
        }
      }
      beam = [...next.values()].sort((a, b) => a.cost - b.cost).slice(0, BEAM);
    }
    const best = beam[0];

    // Fingers under each hand, in pitch order, without collisions.
    clusters.forEach((cl, ci) => {
      for (const side of ["L", "R"] as Side[]) {
        const notes = cl.notes.filter((_, i) => best.hands[ci][i] === side);
        if (!notes.length) continue;
        const c = best.centres[ci][side];
        const dir = side === "R" ? 1 : -1;
        let fingers = notes.map((n) => THREE.MathUtils.clamp(Math.round(2 + dir * (whiteIndex(n.p) - c)), 0, 4));
        // Pitch order must map to finger order (thumb low on the right hand, high on the left).
        if (side === "L") fingers = fingers.reverse();
        for (let i = 1; i < fingers.length; i++) fingers[i] = Math.max(fingers[i], fingers[i - 1] + 1);
        for (let i = fingers.length - 1; i >= 0; i--) {
          const cap = 4 - (fingers.length - 1 - i);
          fingers[i] = Math.min(fingers[i], cap);
          if (i < fingers.length - 1) fingers[i] = Math.min(fingers[i], fingers[i + 1] - 1);
        }
        if (side === "L") fingers = fingers.reverse();
        const place = this.byHand[side].length;
        notes.forEach((n, i) => {
          this.strikes.push({ note: n, hand: side, finger: fingers[i], down: n.on - leadTime(n.v), release: n.off, place });
        });
        this.byHand[side].push({ t: cl.t, c, until: cl.t });
      }
    });
    this.strikes.sort((a, b) => a.down - b.down);

    // Let go in time: before the same finger is needed again, and before
    // the hand has to move to a new position.
    for (const s of this.strikes) {
      const minHold = s.note.on + 0.05;
      const again = this.strikes.find((o) => o !== s && o.hand === s.hand && o.finger === s.finger && o.down > s.down);
      if (again) s.release = Math.min(s.release, again.down - APPROACH * 0.5);
      const places = this.byHand[s.hand];
      const c = places[s.place].c;
      const move = places.slice(s.place + 1).find((p) => Math.abs(p.c - c) > 0.25);
      if (move) s.release = Math.min(s.release, move.t - PREP - moveTime(Math.abs(move.c - c)));
      s.release = Math.max(s.release, minHold);
    }
    for (const s of this.strikes) {
      const p = this.byHand[s.hand][s.place];
      p.until = Math.max(p.until, s.release);
      this.byFinger[s.hand][s.finger].push(s);
    }
  }

  /** The performance's notes with key releases moved to when her fingers let go. */
  adjust(notes: Note[]): Note[] {
    const release = new Map(this.strikes.map((s) => [s.note, s.release]));
    return notes.map((n) => (release.has(n) ? { ...n, off: release.get(n)! } : n));
  }

  /** Hand centre in white keys at time t: held while playing, gliding between positions. */
  centre(side: Side, t: number): number {
    const ps = this.byHand[side];
    if (!ps.length) return side === "L" ? 18 : 27;
    if (t <= ps[0].t) return ps[0].c;
    for (let i = 0; i < ps.length - 1; i++) {
      const a = ps[i];
      const b = ps[i + 1];
      if (t >= b.t - PREP) continue;
      if (Math.abs(b.c - a.c) < 1e-6) return a.c;
      const arrive = b.t - PREP;
      const leave = Math.max(a.until, arrive - moveTime(Math.abs(b.c - a.c)));
      if (t <= leave) return a.c;
      const u = (t - leave) / Math.max(arrive - leave, 1e-3);
      return THREE.MathUtils.lerp(a.c, b.c, u * u * (3 - 2 * u));
    }
    return ps[ps.length - 1].c;
  }

  /**
   * How far a hand has gone back to her lap (0..1): only in gaps of three
   * seconds or more between what it plays.
   */
  rest(side: Side, t: number): number {
    let before = -Infinity;
    let after = Infinity;
    for (const s of this.strikes) {
      if (s.hand !== side) continue;
      if (s.release <= t) before = Math.max(before, s.release);
      else if (s.down - APPROACH > t) after = Math.min(after, s.down);
      else return 0; // busy now
    }
    if (after - before < 3) return 0;
    return smooth((t - before - 0.3) / 0.7) * smooth((after - 0.9 - t) / 0.7);
  }

  /** Five fingertip goals for a hand at time t, thumb first. */
  goals(side: Side, t: number, key: (p: number) => KeyState): TipGoal[] {
    const c = this.centre(side, t);
    const dir = side === "R" ? 1 : -1;
    return [0, 1, 2, 3, 4].map((f) => {
      const rest: TipGoal = { contact: new THREE.Vector3(whiteX(c + dir * (f - 2) * 0.95), WHITE_TOP, whiteContactZ(f)), lift: HOVER };
      const mine = this.byFinger[side][f];
      // The latest strike this finger has started reaching for.
      let i = -1;
      for (let j = 0; j < mine.length && mine[j].down - APPROACH <= t; j++) i = j;
      if (i < 0) return rest;
      const lifting = (s: Strike): TipGoal => {
        const onKey = keyContact(s.note.p, key(s.note.p).depression, f);
        if (t <= s.release) return { contact: onKey, lift: 0 };
        const u = smooth((t - s.release) / (LIFT + 0.07));
        return { contact: onKey.lerp(rest.contact, u * u), lift: HOVER * u };
      };
      const s = mine[i];
      if (t >= s.down) return lifting(s);
      // Dropping onto the key: from wherever the finger was, the last key it left or its rest.
      const prev = mine[i - 1];
      const from = prev && t < prev.release + LIFT + 0.07 ? lifting(prev) : rest;
      const u = smooth((t - (s.down - APPROACH)) / APPROACH);
      return { contact: from.contact.lerp(keyContact(s.note.p, key(s.note.p).depression, f), u), lift: from.lift * (1 - u) };
    });
  }
}

const smooth = (x: number) => {
  const u = Math.min(Math.max(x, 0), 1);
  return u * u * (3 - 2 * u);
};
