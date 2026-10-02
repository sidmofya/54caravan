// Single source of truth for piano geometry. Units are metres.
// x runs bass (left, negative) to treble (right), y is up from the floor,
// z points from the back wall toward the viewer.

export const LOWEST = 21; // A0
export const HIGHEST = 108; // C8
export const KEY_COUNT = HIGHEST - LOWEST + 1;

export const CABINET = {
  width: 1.53,
  height: 1.21,
  back: -0.3,
  sideThickness: 0.03,
};

// Keyboard
export const WHITE_PITCH = 0.0235; // centre-to-centre spacing of white keys
export const WHITE_GAP = 0.0012;
export const WHITE_TOP = 0.72; // key surface height
export const WHITE_THICK = 0.022;
export const KEY_FRONT = 0.31;
export const KEY_BACK = -0.1;
export const KEY_PIVOT_Z = 0.03; // balance rail
export const KEY_DIP = 0.0105; // white key front travel
export const BLACK_WIDTH = 0.0105;
export const BLACK_FRONT = 0.255;
export const BLACK_RISE = 0.0125; // black key top above white surface
export const NAME_BOARD_Z = 0.16; // where visible key length ends

const BLACK_IN_OCTAVE = new Set([1, 3, 6, 8, 10]);
export const isBlack = (p: number) => BLACK_IN_OCTAVE.has(p % 12);

const whiteIndexOf = (p: number) => {
  let n = 0;
  for (let q = LOWEST; q < p; q++) if (!isBlack(q)) n++;
  return n;
};
export const WHITE_COUNT = whiteIndexOf(HIGHEST) + 1; // 52
export const KEYBOARD_WIDTH = WHITE_COUNT * WHITE_PITCH;
export const KEYBOARD_LEFT = -KEYBOARD_WIDTH / 2;

// Black keys sit off-centre between their white neighbours, as on a real
// keyboard: C# and F# lean left, D# and A# lean right.
const BLACK_OFFSET: Record<number, number> = { 1: -0.15, 3: 0.15, 6: -0.2, 8: 0, 10: 0.2 };

/** Centre x of a key's playing surface. */
export function keyX(p: number): number {
  if (!isBlack(p)) return KEYBOARD_LEFT + (whiteIndexOf(p) + 0.5) * WHITE_PITCH;
  const boundary = KEYBOARD_LEFT + whiteIndexOf(p + 1) * WHITE_PITCH;
  return boundary + BLACK_OFFSET[p % 12] * WHITE_PITCH;
}

// Action: three sections divided by brass brackets, as in the photo.
export const SECTIONS = [
  { first: 21, last: 46 }, // bass, overstrung copper strings
  { first: 47, last: 76 }, // tenor
  { first: 77, last: 108 }, // treble
];
export const HAMMER_PITCH = 0.0138;
export const SECTION_GAP = 0.036;
const ROW_WIDTH = KEY_COUNT * HAMMER_PITCH + (SECTIONS.length - 1) * SECTION_GAP;
export const ROW_LEFT = -ROW_WIDTH / 2;

export const sectionOf = (p: number) => SECTIONS.findIndex((s) => p >= s.first && p <= s.last);

/** x of the hammer centre, which is also where its strings cross the strike line. */
export function hammerX(p: number): number {
  return ROW_LEFT + (p - LOWEST + 0.5) * HAMMER_PITCH + sectionOf(p) * SECTION_GAP;
}

/** x of the brass bracket centres: row ends plus each gap between sections. */
export function bracketXs(): number[] {
  const xs = [ROW_LEFT - 0.012];
  for (let i = 0; i < SECTIONS.length - 1; i++) {
    xs.push(hammerX(SECTIONS[i].last) + HAMMER_PITCH / 2 + SECTION_GAP / 2);
  }
  xs.push(-ROW_LEFT + 0.012);
  return xs;
}

// Hammer: a shank pivoting on its butt flange. Angles rotate about +x, so a
// positive angle tips the head toward the viewer. The head is mounted tilted
// on the shank so its felt meets the strings square at the moment of strike.
export const HAMMER = {
  pivotY: 0.86,
  pivotZ: -0.15,
  shank: 0.135,
  headHeight: 0.044,
  strikeOffset: 0.0175, // shank tip to the felt's striking point
  backDepth: 0.013, // wooden moulding behind the tip
  headTilt: 0.16,
  width: 0.0118,
  rest: 0.15,
};
export const STRIKE_Y = HAMMER.pivotY + HAMMER.shank * 0.985;

// Strings. Tenor and treble lie in one plane; the overstrung bass crosses
// in front of them on its own plane and leans like "\" seen from the front.
export const STRING_Z = -0.19;
export const BASS_STRING_Z = -0.178;
export const BASS_TILT = 0.2; // radians from vertical
export const STRING_TOP = 1.165; // tuning pins
export const SPEAKING_TOP = 1.1; // pressure bar / agraffe
export const STRING_BOTTOM = 0.3; // hitch pins, hidden behind the keybed

export function stringCount(p: number): number {
  if (p <= 27) return 1;
  if (p <= 46) return 2;
  return 3;
}

export function stringRadius(p: number): number {
  if (p <= 46) return 0.0026 - ((p - 21) / 25) * 0.0013; // copper wound
  return 0.00062 - ((p - 47) / 61) * 0.00018;
}

/** z of the centre of the felt's striking face at shank angle a. */
export function feltFaceZ(a: number): number {
  const f = HAMMER.strikeOffset;
  const y = HAMMER.shank + f * Math.sin(HAMMER.headTilt);
  const z = -f * Math.cos(HAMMER.headTilt);
  return HAMMER.pivotZ + y * Math.sin(a) + z * Math.cos(a);
}

/** Hammer angle at which the felt touches this note's strings. */
export function strikeAngle(p: number): number {
  const z = sectionOf(p) === 0 ? BASS_STRING_Z : STRING_Z;
  const contact = z + stringRadius(p) + 0.0004;
  // feltFaceZ falls as the hammer swings back; bisect for the contact angle.
  let lo = -0.6;
  let hi = HAMMER.rest;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (feltFaceZ(mid) > contact) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

// Dampers rest on the strings just below the strike line (an underdamper
// action). The top notes have none, as on a real upright.
export const DAMPER_Y = 0.93;
export const HIGHEST_DAMPED = 88;
export const hasDamper = (p: number) => p <= HIGHEST_DAMPED;

// Lower action parts that ride on the back of each key.
export const WIPPEN = { y: 0.775, z: -0.095 };
