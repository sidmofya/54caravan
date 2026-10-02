// The dive, as pure functions of film time t (seconds into the section).
//
// L(t) is log10 of the frame width in metres: 0 frames a metre, -10 frames
// an atom. S(t) is how much visual time is slowed, as a power of ten. Level
// weights say which scale scenes are on screen and how they blend.

import type { Note, Performance } from "../timeline";

export type LevelId = "piano" | "hammer" | "contact" | "pearlite" | "lattice" | "atom" | "nucleus" | "proton";
export const LEVELS: LevelId[] = ["piano", "hammer", "contact", "pearlite", "lattice", "atom", "nucleus", "proton"];

/** Where each scene hands over to the next, in L, and the half-width of the dissolve. */
export const BOUNDARIES: { L: number; h: number }[] = [
  { L: -1.62, h: 0.15 }, // piano -> hammer macro
  { L: -2.88, h: 0.12 }, // hammer -> felt/steel contact
  { L: -4.05, h: 0.15 }, // contact -> inside the steel
  { L: -7.95, h: 0.15 }, // pearlite -> iron lattice
  { L: -9.2, h: 0.15 }, // lattice -> one atom
  { L: -11.85, h: 0.15 }, // atom -> the empty atom and its nucleus
  { L: -14.05, h: 0.12 }, // nucleus -> proton
];

/** Bars (downbeat indices) the dive is cut to, for the 0:30-1:00 section. */
export interface SectionCues {
  strikeBar: number; // the featured hammer strikes on this downbeat
  contactBar: number; // arrive at the felt/steel contact
  pearliteBar: number;
  latticeBar: number;
  atomBar: number; // the quiet breakdown begins
  voidBar: number;
  protonBar: number; // chorus entry
  rushBar: number; // start the rush back out
  landBar: number; // back on the keys
}

/** Bars for chorus 2 (1:52-2:32 in the 60-209 data): a quick plunge, then a stay in the atom. */
export interface AtomCues {
  strikeBar: number; // the plunge's hammer strikes on this downbeat
  quietBar: number; // the breakdown: drift deeper
  returnBar: number; // the band comes back
  peakBar: number; // the loudest bar: a glimpse of the nucleus
  backBar: number; // back out to the atom
  rushBar: number;
  landBar: number;
}

export const CUES_CHORUS_2: AtomCues = {
  strikeBar: 24,
  quietBar: 30,
  returnBar: 32,
  peakBar: 36,
  backBar: 38,
  rushBar: 41,
  landBar: 42,
};

export const CUES_30_60: SectionCues = {
  strikeBar: 2,
  contactBar: 4,
  pearliteBar: 5,
  latticeBar: 6,
  atomBar: 7,
  voidBar: 8,
  protonBar: 9,
  rushBar: 10,
  landBar: 11,
};

export interface Pulse {
  note: Note;
  age: number; // seconds since the note sounded
  strength: number; // decays from v
}

export interface Blend {
  outer: LevelId;
  inner: LevelId | null;
  mix: number; // 0 = all outer, 1 = all inner
}

interface Key {
  t: number;
  v: number;
}

/** Monotone cubic (Fritsch-Carlson): smooth, and never overshoots a keyframe. */
class Curve {
  private readonly m: number[];
  constructor(private readonly k: Key[]) {
    const n = k.length;
    const d = k.slice(0, -1).map((a, i) => (k[i + 1].v - a.v) / (k[i + 1].t - a.t));
    const m = k.map((_, i) => (i === 0 ? d[0] : i === n - 1 ? d[n - 2] : (d[i - 1] + d[i]) / 2));
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) {
        m[i] = m[i + 1] = 0;
        continue;
      }
      const a = m[i] / d[i];
      const b = m[i + 1] / d[i];
      const s = a * a + b * b;
      if (s > 9) {
        const tau = 3 / Math.sqrt(s);
        m[i] = tau * a * d[i];
        m[i + 1] = tau * b * d[i];
      }
      if (a < 0) m[i] = 0;
      if (b < 0) m[i + 1] = 0;
    }
    this.m = m;
  }
  at(t: number): number {
    const k = this.k;
    if (t <= k[0].t) return k[0].v;
    if (t >= k[k.length - 1].t) return k[k.length - 1].v;
    let i = 0;
    while (t > k[i + 1].t) i++;
    const h = k[i + 1].t - k[i].t;
    const u = (t - k[i].t) / h;
    const u2 = u * u;
    const u3 = u2 * u;
    return (
      (2 * u3 - 3 * u2 + 1) * k[i].v +
      (u3 - 2 * u2 + u) * h * this.m[i] +
      (-2 * u3 + 3 * u2) * k[i + 1].v +
      (u3 - u2) * h * this.m[i + 1]
    );
  }
}

const smoothstep = (e0: number, e1: number, x: number) => {
  const u = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return u * u * (3 - 2 * u);
};

export interface ChoreographyOptions {
  cues: SectionCues | AtomCues;
  startL: number; // frame width when the dive opens (matches the shot before)
  landL: number; // frame width of the shot we land on
  /** When the dive opens; cut 2 opens at 0. */
  startTime?: number;
}

const isAtom = (c: SectionCues | AtomCues): c is AtomCues => "peakBar" in c;

export class Choreography {
  readonly strike: Note;
  readonly strikeTime: number;
  readonly rushStart: number;
  readonly landing: number;
  private readonly zoom: Curve;
  private readonly slow: Curve;
  private readonly physTable: Float64Array; // ms since the strike, sampled at PHYS_RATE
  private static readonly PHYS_RATE = 600;

  constructor(
    readonly perf: Performance,
    readonly opts: ChoreographyOptions,
  ) {
    const db = perf.downbeats;
    const c = opts.cues;
    this.strike = Choreography.featuredNote(perf, db[c.strikeBar]);
    const s = (this.strikeTime = this.strike.on);
    this.rushStart = db[c.rushBar] + 0.15;
    this.landing = db[c.landBar];
    if (isAtom(c)) {
      const keys = this.atomKeys(c, opts);
      this.zoom = new Curve(keys.zoom);
      this.slow = new Curve(keys.slow);
    } else {
      const keys = this.diveKeys(c, opts);
      this.zoom = new Curve(keys.zoom);
      this.slow = new Curve(keys.slow);
    }

    // Physical milliseconds since the strike: the integral of the slowed rate.
    const rate = Choreography.PHYS_RATE;
    const n = Math.ceil((perf.duration + 1 - s) * rate) + 1;
    this.physTable = new Float64Array(n);
    for (let i = 1; i < n; i++) {
      const t = s + (i - 0.5) / rate;
      this.physTable[i] = this.physTable[i - 1] + (1000 / rate) * Math.pow(10, -this.S(t));
    }
  }

  /**
   * Chorus 2: a quick plunge through the scales cut 2 took time over, then a
   * stay in the iron atom that follows the song: deeper in the breakdown, a
   * glimpse of the nucleus on the loudest bar, and the rush back out.
   */
  private atomKeys(c: AtomCues, opts: ChoreographyOptions) {
    const db = this.perf.downbeats;
    const s = this.strikeTime;
    const t0 = opts.startTime ?? s - 1.6;
    const zoom: Key[] = [
      // A flat key before the start, so the dive eases in from rest (no jolt
      // or sudden zoom blur where verse 2's camera hands over).
      { t: t0 - 1, v: opts.startL },
      { t: t0, v: opts.startL },
      { t: s - 0.5, v: -0.95 },
      { t: s, v: -1.2 },
      { t: s + 0.7, v: -1.75 },
      { t: s + 1.4, v: -2.6 },
      { t: s + 2.0, v: -3.05 },
      { t: s + 2.8, v: -4.3 },
      { t: s + 3.6, v: -6.9 },
      { t: s + 4.3, v: -8.1 },
      { t: s + 5.0, v: -9.1 },
      { t: s + 6.0, v: -10.1 },
      { t: db[c.quietBar], v: -10.35 },
      { t: db[c.returnBar] - 0.3, v: -10.9 },
      { t: db[c.returnBar] + 0.6, v: -10.55 },
      { t: db[c.peakBar] - 0.8, v: -10.65 },
      { t: db[c.peakBar] + 0.5, v: -12.3 },
      { t: db[c.peakBar + 1], v: -12.4 },
      { t: db[c.backBar], v: -10.5 },
      { t: this.rushStart, v: -10.7 },
      { t: this.landing, v: opts.landL },
    ];
    const slow: Key[] = [
      { t: s, v: 2.6 },
      { t: s + 1.0, v: 2.9 },
      { t: s + 2.0, v: 4.2 },
      { t: s + 3.0, v: 6 },
      { t: s + 4.3, v: 9 },
      { t: s + 6.0, v: 12 },
      { t: db[c.peakBar], v: 13 },
      { t: this.rushStart, v: 12.5 },
      { t: this.rushStart + 1.1, v: 6 },
      { t: this.landing - 0.3, v: 2 },
      { t: this.landing, v: 0 },
    ];
    return { zoom, slow };
  }

  /** Cut 2: a slow dive all the way to a proton, and the rush back out. */
  private diveKeys(c: SectionCues, opts: ChoreographyOptions) {
    const db = this.perf.downbeats;
    const s = this.strikeTime;
    const zoom: Key[] = [
      { t: 0, v: opts.startL },
      { t: s - 0.7, v: -0.95 },
      { t: s, v: -1.2 },
      { t: s + 0.9, v: -1.72 },
      { t: s + 1.64, v: -2.05 },
      { t: db[c.contactBar] - 0.7, v: -2.75 },
      { t: db[c.contactBar], v: -3.0 },
      { t: db[c.contactBar] + 1.8, v: -3.95 },
      { t: db[c.pearliteBar] + 1.34, v: -6.6 },
      { t: db[c.latticeBar] + 0.6, v: -7.95 },
      { t: db[c.atomBar], v: -8.95 },
      { t: db[c.atomBar] + 1.5, v: -10.2 },
      { t: db[c.voidBar] + 0.52, v: -11.95 },
      { t: db[c.voidBar] + 1.52, v: -13.6 },
      { t: db[c.protonBar], v: -14.45 },
      { t: this.rushStart, v: -14.62 },
      { t: this.landing, v: opts.landL },
    ];

    // Slow-motion factor as a power of ten. It jumps at the strike (time all
    // but stops at impact), deepens with the dive, and unwinds in the rush.
    const slow: Key[] = [
      { t: s, v: 2.6 },
      { t: s + 1.04, v: 2.9 },
      { t: s + 2.54, v: 3.3 },
      { t: db[c.contactBar], v: 4.2 },
      { t: db[c.contactBar] + 2.3, v: 6 },
      { t: db[c.latticeBar], v: 9 },
      { t: db[c.atomBar], v: 12 },
      { t: db[c.voidBar], v: 16 },
      { t: db[c.protonBar], v: 21 },
      { t: this.rushStart, v: 23 },
      { t: this.rushStart + 1.1, v: 12 },
      { t: this.landing - 0.3, v: 2 },
      { t: this.landing, v: 0 },
    ];
    return { zoom, slow };
  }

  /** The hammer we dive into: the loudest mid-keyboard note struck in the strike bar. */
  static featuredNote(perf: Performance, barStart: number): Note {
    const near = perf.notes.filter((n) => Math.abs(n.on - barStart) < 0.25 && n.p >= 45 && n.p <= 76);
    const pool = near.length ? near : perf.notes.filter((n) => n.on >= barStart - 0.25);
    return [...pool].sort((a, b) => b.v - a.v || b.p - a.p)[0];
  }

  /** log10 of the frame width in metres. */
  L(t: number): number {
    return this.zoom.at(t);
  }

  /** Zoom speed in decades per second (negative while diving). */
  dLdt(t: number): number {
    return (this.L(t + 0.01) - this.L(t - 0.01)) / 0.02;
  }

  /** How far visual time is slowed, as a power of ten (0 = real time). */
  S(t: number): number {
    return t < this.strikeTime || t >= this.landing ? 0 : this.slow.at(t);
  }

  /** Physical milliseconds since the featured strike, as the slowed clock runs. */
  physMs(t: number): number {
    if (t <= this.strikeTime) return 0;
    const f = (t - this.strikeTime) * Choreography.PHYS_RATE;
    const i = Math.min(Math.floor(f), this.physTable.length - 2);
    return this.physTable[i] + (this.physTable[i + 1] - this.physTable[i]) * (f - i);
  }

  /** Performance time for the piano: real until the strike, crawling in the dive, real again for the landing. */
  pianoTime(t: number): number {
    if (t <= this.strikeTime || t >= this.rushStart) return t;
    return this.strikeTime + this.physMs(t) / 1000;
  }

  /** Which scenes are on screen at zoom L, and how they blend. */
  blend(L: number): Blend {
    for (let k = 0; k < BOUNDARIES.length; k++) {
      const b = BOUNDARIES[k];
      if (L <= b.L + b.h && L >= b.L - b.h) {
        return { outer: LEVELS[k], inner: LEVELS[k + 1], mix: smoothstep(b.L + b.h, b.L - b.h, L) };
      }
    }
    let k = 0;
    while (k < BOUNDARIES.length && L < BOUNDARIES[k].L) k++;
    return { outer: LEVELS[k], inner: null, mix: 0 };
  }

  /** Notes sounding recently, for the pulses each scale shows. */
  pulses(t: number): Pulse[] {
    const out: Pulse[] = [];
    for (const note of this.perf.notes) {
      const age = t - note.on;
      if (age >= 0 && age < 3) out.push({ note, age, strength: note.v * Math.exp(-age / 0.7) });
    }
    return out;
  }
}
