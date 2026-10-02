// Poses for the pianist, and the solver that puts the rig into them.
//
// A Pose is a body (root, spine, head and feet, as numbers that blend
// linearly) plus arms, which are worked out after the body is placed,
// because hands that hold a stool or play keys depend on where the
// shoulders ended up. Blending two poses blends their bodies, then blends
// their arms on the blended body, so any motion is a crossfade of poses.

import * as THREE from "three";
import { KEY_ANGLE } from "../piano/keyboard";
import { BLACK_FRONT, BLACK_RISE, KEY_FRONT, KEY_PIVOT_Z, WHITE_TOP, isBlack, keyX } from "../piano/layout";
import type { Pianist } from "./body";
import {
  DIM,
  FINGERS,
  SIDES,
  setFingerCurl,
  setWorldQuaternion,
  sideSign,
  solveFinger,
  twoBoneIK,
  type Side,
} from "./rig";
import { STOOL } from "./stool";

/** Sustain pedal: toe end in world space, and how far it dips when pressed. */
const SUSTAIN = { x: 0.068, top: 0.0735, z: 0.15, drop: 0.019 };
/** The hips joint when sitting: 8.5 cm of flesh and 4.5 cm of pelvis above the cushion. */
export const SIT_HIP = STOOL.seatHeight + 0.013 + 0.085 + 0.045;
/** Foot geometry along the sole, from the ankle. */
const BALL = 0.13;
const HEEL = 0.05;

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const qBasis = (x: THREE.Vector3, y: THREE.Vector3, z: THREE.Vector3) =>
  new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
const smooth = (x: number) => {
  const u = Math.min(Math.max(x, 0), 1);
  return u * u * (3 - 2 * u);
};

// ---------------------------------------------------------------- keys

/** How far from a white key's front edge each finger plays. */
const INSET = [0.028, 0.048, 0.055, 0.05, 0.032];
export const whiteContactZ = (finger: number) => KEY_FRONT - INSET[finger];

/** Where a fingertip's pad meets a key, lowered by the key's depression. */
export function keyContact(p: number, depression: number, finger: number): THREE.Vector3 {
  const black = isBlack(p);
  const z = black ? BLACK_FRONT - INSET[finger] + 0.012 : whiteContactZ(finger);
  const top = black ? WHITE_TOP + BLACK_RISE : WHITE_TOP;
  return v3(keyX(p), top - Math.sin(depression * KEY_ANGLE) * (z - KEY_PIVOT_Z), z);
}

/** One finger's goal: a point on a key surface and a height above it. */
export interface TipGoal {
  contact: THREE.Vector3;
  lift: number;
}

// ---------------------------------------------------------------- types

/** Joint rotation as [x, y, z] radians, applied yaw first (order YXZ). */
export type Euler3 = [number, number, number];
export interface FootPose {
  ankle: THREE.Vector3; // world
  quat: THREE.Quaternion; // world
}
export interface BodyPose {
  root: THREE.Vector3; // floor point under the pelvis
  yaw: number; // 0 faces +z
  hips: THREE.Vector3; // hips joint in the root's frame
  pelvis: Euler3;
  spine: Euler3;
  chest: Euler3;
  neck: Euler3;
  head: Euler3;
  feet: Record<Side, FootPose>;
  knee: Record<Side, THREE.Vector3>; // world direction the knees bend toward
  look: THREE.Vector3; // world point the head turns toward
  lookWeight: number;
}
export interface Curl {
  a: number;
  c: number;
  spread: number;
}
export interface ArmPose {
  wrist: THREE.Vector3;
  hand: THREE.Quaternion;
  pole: THREE.Vector3;
  fingers: Curl[];
}
export type Arms = Record<Side, ArmPose>;
export type ArmsFn = (p: Pianist) => Arms;
export interface Pose {
  body: BodyPose;
  arms: ArmsFn;
}

// ---------------------------------------------------------------- blending

const lerpE = (a: Euler3, b: Euler3, u: number): Euler3 => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
const lerpV = (a: THREE.Vector3, b: THREE.Vector3, u: number) => a.clone().lerp(b, u);
const slerpQ = (a: THREE.Quaternion, b: THREE.Quaternion, u: number) => a.clone().slerp(b, u);

/** Shortest-way interpolation of angles. */
function lerpAngle(a: number, b: number, u: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * u;
}

export function lerpBody(a: BodyPose, b: BodyPose, u: number): BodyPose {
  if (u <= 0) return a;
  if (u >= 1) return b;
  const feet = {} as Record<Side, FootPose>;
  const knee = {} as Record<Side, THREE.Vector3>;
  for (const s of SIDES) {
    feet[s] = { ankle: lerpV(a.feet[s].ankle, b.feet[s].ankle, u), quat: slerpQ(a.feet[s].quat, b.feet[s].quat, u) };
    knee[s] = lerpV(a.knee[s], b.knee[s], u);
  }
  return {
    root: lerpV(a.root, b.root, u),
    yaw: lerpAngle(a.yaw, b.yaw, u),
    hips: lerpV(a.hips, b.hips, u),
    pelvis: lerpE(a.pelvis, b.pelvis, u),
    spine: lerpE(a.spine, b.spine, u),
    chest: lerpE(a.chest, b.chest, u),
    neck: lerpE(a.neck, b.neck, u),
    head: lerpE(a.head, b.head, u),
    feet,
    knee,
    look: lerpV(a.look, b.look, u),
    lookWeight: a.lookWeight + (b.lookWeight - a.lookWeight) * u,
  };
}

export function lerpArms(a: Arms, b: Arms, u: number): Arms {
  if (u <= 0) return a;
  if (u >= 1) return b;
  const out = {} as Arms;
  for (const s of SIDES) {
    out[s] = {
      wrist: lerpV(a[s].wrist, b[s].wrist, u),
      hand: slerpQ(a[s].hand, b[s].hand, u),
      pole: lerpV(a[s].pole, b[s].pole, u),
      fingers: a[s].fingers.map((f, i) => {
        const g = b[s].fingers[i];
        return { a: f.a + (g.a - f.a) * u, c: f.c + (g.c - f.c) * u, spread: f.spread + (g.spread - f.spread) * u };
      }),
    };
  }
  return out;
}

/** Crossfade two poses. */
export function blend(a: Pose, b: Pose, u: number): Pose {
  if (u <= 0) return a;
  if (u >= 1) return b;
  return { body: lerpBody(a.body, b.body, u), arms: (p) => lerpArms(a.arms(p), b.arms(p), u) };
}

/** Mix one side's arm from another arms function (for one hand doing something else). */
export function withArm(base: ArmsFn, side: Side, other: ArmsFn, u: number): ArmsFn {
  if (u <= 0) return base;
  return (p) => {
    const a = base(p);
    const b = other(p);
    return { ...a, [side]: lerpArms(a, b, u)[side] };
  };
}

// ---------------------------------------------------------------- solver

function setE(j: THREE.Object3D, e: Euler3) {
  j.rotation.set(e[0], e[1], e[2], "YXZ");
}

export function applyBody(p: Pianist, b: BodyPose) {
  const r = p.rig;
  r.root.position.copy(b.root);
  r.root.rotation.set(0, b.yaw, 0);
  r.hips.position.copy(b.hips);
  setE(r.hips, b.pelvis);
  setE(r.spine, b.spine);
  setE(r.chest, b.chest);
  setE(r.neck, b.neck);
  setE(r.head, b.head);
  r.root.updateMatrixWorld(true);

  if (b.lookWeight > 0) {
    // Turn neck and head toward the look point, relative to the chest.
    const head = r.head.getWorldPosition(v3());
    const chestQ = r.chest.getWorldQuaternion(new THREE.Quaternion()).invert();
    const d = b.look.clone().sub(head).applyQuaternion(chestQ);
    const yaw = THREE.MathUtils.clamp(Math.atan2(d.x, d.z), -1.1, 1.1);
    const pitch = THREE.MathUtils.clamp(Math.atan2(-d.y, Math.hypot(d.x, d.z)), -0.5, 0.9);
    const w = b.lookWeight;
    setE(r.neck, lerpE(b.neck, [pitch * 0.35, yaw * 0.4, b.neck[2]], w));
    setE(r.head, lerpE(b.head, [pitch * 0.65, yaw * 0.6, b.head[2]], w));
    r.neck.updateMatrixWorld(true);
  }

  for (const s of SIDES) {
    twoBoneIK(r.thigh[s], r.shin[s], DIM.thigh, DIM.shin, b.feet[s].ankle, b.knee[s]);
    setWorldQuaternion(r.foot[s], b.feet[s].quat);
  }
}

export function applyArms(p: Pianist, arms: Arms) {
  const r = p.rig;
  for (const s of SIDES) {
    const a = arms[s];
    twoBoneIK(r.upperArm[s], r.foreArm[s], DIM.upperArm, DIM.foreArm, a.wrist, a.pole);
    setWorldQuaternion(r.hand[s].hand, a.hand);
    FINGERS.forEach((f, i) => setFingerCurl(r.hand[s].fingers[i], f, a.fingers[i].a, a.fingers[i].c, a.fingers[i].spread, i === 0));
  }
}

export function applyPose(p: Pianist, pose: Pose) {
  applyBody(p, pose.body);
  applyArms(p, pose.arms(p));
  p.rig.root.updateMatrixWorld(true);
  p.update();
}

// ---------------------------------------------------------------- feet

/** Her left (+x) axis in world space for a yaw. */
export const leftAxis = (yaw: number) => v3(Math.cos(yaw), 0, -Math.sin(yaw));
export const forwardAxis = (yaw: number) => v3(Math.sin(yaw), 0, Math.cos(yaw));

/**
 * A foot whose ankle sits over floor point (x, z), turned to `yaw`, pitched
 * toes-up by `pitch` (negative lifts the heel) about the heel or the ball,
 * raised `lift` off the floor.
 */
export function footPose(x: number, z: number, yaw: number, pitch = 0, pivot: "heel" | "ball" = "ball", lift = 0): FootPose {
  const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-pitch, yaw, 0, "YXZ"));
  const f = v3(0, 0, 1).applyQuaternion(quat);
  const u = v3(0, 1, 0).applyQuaternion(quat);
  const fg = forwardAxis(yaw);
  const ankle =
    pivot === "ball"
      ? v3(x, 0, z).addScaledVector(fg, BALL).addScaledVector(f, -BALL).addScaledVector(u, DIM.ankle)
      : v3(x, 0, z).addScaledVector(fg, -HEEL).addScaledVector(f, HEEL).addScaledVector(u, DIM.ankle);
  ankle.y += lift;
  return { ankle, quat };
}

/** The right foot with its heel on the floor and the ball on the sustain pedal. */
export function pedalFoot(pedal: number, yaw = Math.PI - 0.08): FootPose {
  const ball = v3(SUSTAIN.x + 0.006, SUSTAIN.top + 0.006 - SUSTAIN.drop * pedal, SUSTAIN.z);
  const pitch = Math.asin(THREE.MathUtils.clamp((ball.y - 0.004) / (BALL + HEEL), 0, 0.8));
  const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-pitch, yaw, 0, "YXZ"));
  const f = v3(0, 0, 1).applyQuaternion(quat);
  const u = v3(0, 1, 0).applyQuaternion(quat);
  return { ankle: ball.addScaledVector(f, -BALL).addScaledVector(u, DIM.ankle), quat };
}

const kneePoles = (yaw: number): Record<Side, THREE.Vector3> => ({
  L: forwardAxis(yaw).addScaledVector(leftAxis(yaw), 0.15),
  R: forwardAxis(yaw).addScaledVector(leftAxis(yaw), -0.15),
});

// ---------------------------------------------------------------- bodies

const ZERO: Euler3 = [0, 0, 0];

/** Standing at (x, z) facing `yaw`, feet under the hips. */
export function standingBody(x: number, z: number, yaw: number, look?: THREE.Vector3): BodyPose {
  const feet = {} as Record<Side, FootPose>;
  for (const s of SIDES) {
    const k = sideSign(s);
    const g = v3(x, 0, z).addScaledVector(leftAxis(yaw), k * 0.09);
    feet[s] = footPose(g.x, g.z, yaw + k * 0.08);
  }
  return {
    root: v3(x, 0, z),
    yaw,
    hips: v3(0, DIM.hipHeight - 0.012, 0),
    pelvis: [0.02, 0, 0],
    spine: [0.024, 0, 0],
    chest: [0.016, 0, 0],
    neck: [-0.03, 0, 0],
    head: [0.08, 0, 0],
    feet,
    knee: kneePoles(yaw),
    look: look ?? v3(x, 1.5, z).addScaledVector(forwardAxis(yaw), 2),
    lookWeight: look ? 1 : 0,
  };
}

export interface SeatBody {
  stool: THREE.Vector3; // stool centre on the floor
  lean: number; // forward lean of the upper body
  sway: number; // lean toward her left (the bass), radians
  twist: number; // chest turned toward her left, radians
  nod: number; // head pitch down toward the keys
  shift?: number; // sliding along the seat toward world +x, metres
  feet: Record<Side, FootPose>;
  look?: THREE.Vector3;
}

/** Her root on the floor when sitting on a stool at `stool`, facing the piano (-z). */
export const seatRoot = (stool: THREE.Vector3) => v3(stool.x, 0, stool.z - 0.03);

export function seatedBody(s: SeatBody): BodyPose {
  return {
    root: seatRoot(s.stool).add(v3(s.shift ?? 0, 0, 0)),
    yaw: Math.PI,
    hips: v3(0, SIT_HIP, 0),
    // The pelvis tips forward a little; the spine carries most of the lean.
    pelvis: [s.lean * 0.25, 0, -s.sway * 0.3],
    spine: [s.lean * 0.45, s.twist * 0.4, -s.sway * 0.4],
    chest: [s.lean * 0.3, s.twist * 0.6, -s.sway * 0.3],
    neck: [-s.lean * 0.55, -s.twist * 0.3, s.sway * 0.5],
    head: [s.nod, -s.twist * 0.2, s.sway * 0.3],
    feet: s.feet,
    knee: kneePoles(Math.PI),
    look: s.look ?? v3(s.stool.x, 0.72, 0.25),
    lookWeight: s.look ? 0.6 : 0,
  };
}

/** Seated feet: the left flat ahead of the knee, the right on the sustain pedal. */
export function playingFeet(stool: THREE.Vector3, pedal: number): Record<Side, FootPose> {
  const root = seatRoot(stool);
  return { L: footPose(root.x - 0.16, root.z - 0.4, Math.PI + 0.12), R: pedalFoot(pedal) };
}

// ---------------------------------------------------------------- arms

const relaxedFingers = (s: Side, curl = 0.4): Curl[] =>
  FINGERS.map((f, i) => (i === 0 ? { a: 0.2, c: 0.2, spread: f.splay * -sideSign(s) } : { a: 0.25, c: curl, spread: f.splay * -sideSign(s) }));

/** World vector from a direction in her root frame. */
const rootDir = (p: Pianist, x: number, y: number, z: number) =>
  v3(x, y, z).applyQuaternion(p.rig.root.getWorldQuaternion(new THREE.Quaternion()));

/** Arms hanging at her sides, swinging forward by `swing` (about -0.3..0.3). */
export function relaxedArms(swing: Record<Side, number> = { L: 0, R: 0 }): ArmsFn {
  return (p) => {
    const out = {} as Arms;
    const rootQ = p.rig.root.getWorldQuaternion(new THREE.Quaternion());
    for (const s of SIDES) {
      const k = sideSign(s);
      const shoulder = p.rig.upperArm[s].getWorldPosition(v3());
      const dir = v3(k * 0.1, -1, 0.06 + swing[s]).normalize().applyQuaternion(rootQ);
      // Palm toward the thigh, thumb forward.
      const hand = qBasis(v3(0, 0, -k), v3(0, 1, 0), v3(k, 0, 0))
        .premultiply(rootQ)
        .multiply(new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), 0.15 + swing[s] * 0.3));
      out[s] = { wrist: shoulder.addScaledVector(dir, 0.495), hand, pole: rootDir(p, k * 0.2, 0, -1), fingers: relaxedFingers(s) };
    }
    return out;
  };
}

/** Hands resting on her thighs, palms down, as she sits. */
export const lapArms: ArmsFn = (p) => {
  const r = p.rig;
  const out = {} as Arms;
  for (const s of SIDES) {
    const k = sideSign(s);
    const hip = r.thigh[s].getWorldPosition(v3());
    const knee = r.shin[s].getWorldPosition(v3());
    const along = knee.clone().sub(hip).normalize();
    const flat = along.clone().setY(0).normalize();
    const palm = hip.clone().lerp(knee, 0.62).add(v3(0, 0.078, 0)).addScaledVector(rootDir(p, 1, 0, 0), -k * 0.02);
    const wrist = palm.addScaledVector(flat, -0.05);
    const y = flat.clone().negate();
    const z = v3(0, 1, 0);
    const hand = qBasis(v3().crossVectors(y, z), y, z).multiply(new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), 0.25));
    out[s] = { wrist, hand, pole: rootDir(p, k * 0.6, -0.3, -0.6), fingers: relaxedFingers(s, 0.55) };
  }
  return out;
};

/** Hands over the keys, fingertips on their goals. */
export function keyArms(goals: (s: Side) => TipGoal[]): ArmsFn {
  return (p) => {
    const r = p.rig;
    const out = {} as Arms;
    for (const s of SIDES) {
      const k = sideSign(s);
      const goal = goals(s);
      const tips = goal.map((g, i) => g.contact.clone().add(v3(0, FINGERS[i].radius * 0.8 + g.lift, i === 0 ? 0.002 : 0.004)));
      // The wrist rides behind and above the fingers.
      // The hand centres over the fingers that are playing. The thumb reaches
      // much further sideways than the little finger, so it counts for less.
      const centre = v3();
      let weight = 0;
      tips.forEach((tip, i) => {
        const w = (goal[i].lift < 0.005 ? 1 : 0.2) * [0.35, 1, 1, 1, 2][i];
        centre.addScaledVector(tip, w);
        weight += w;
      });
      centre.multiplyScalar(1 / weight);
      const wrist = centre.add(v3(0, 0.05, 0)).addScaledVector(rootDir(p, 0, 0, 1), -0.135);
      const pole = rootDir(p, k * 0.7, -0.6, -0.35);
      const placeHand = () => {
        twoBoneIK(r.upperArm[s], r.foreArm[s], DIM.upperArm, DIM.foreArm, wrist, pole);
        // Palm down, fingers toward the keys, partly following the forearm's angle.
        const elbow = r.foreArm[s].getWorldPosition(v3());
        const along = wrist.clone().sub(elbow).setY(0).normalize();
        const dir = rootDir(p, 0, 0, 1).lerp(along, 0.4).normalize();
        const y = dir.clone().negate();
        const z = v3(0, 1, 0);
        const q = qBasis(v3().crossVectors(y, z), y, z)
          .multiply(new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), 0.14)) // fingers angle down
          .multiply(new THREE.Quaternion().setFromAxisAngle(v3(0, 1, 0), 0.12 * k)); // little-finger side lower
        setWorldQuaternion(r.hand[s].hand, q);
        return q;
      };
      let hand = placeHand();
      // A finger that is playing but can't reach its key pulls the hand toward it.
      const pull = v3();
      FINGERS.forEach((f, i) => {
        if (goal[i].lift > 0.005) return;
        const knuckle = r.hand[s].fingers[i][0].getWorldPosition(v3());
        const d = tips[i].clone().sub(knuckle);
        const reach = (f.lengths[0] + f.lengths[1] + f.lengths[2]) * 0.93;
        if (d.length() > reach && d.length() - reach > pull.length()) pull.copy(d).setLength(d.length() - reach);
      });
      if (pull.lengthSq() > 0) {
        wrist.add(pull);
        hand = placeHand();
      }
      // In an octave the little finger can't splay far: slide the hand over
      // its key and let the thumb, which reaches much further sideways, stretch.
      if (goal[4].lift < 0.005) {
        const handObj = r.hand[s].hand;
        const rel = handObj.worldToLocal(tips[4].clone()).sub(r.hand[s].fingers[4][0].position);
        const outward = -sideSign(s) * -1; // the little finger's side of the hand, in hand x
        const side = rel.x * outward;
        if (side > 0.028) {
          const shift = v3(outward * (side - 0.028), 0, 0).applyQuaternion(handObj.getWorldQuaternion(new THREE.Quaternion()));
          wrist.add(shift);
          hand = placeHand();
        }
      }
      const fingers = FINGERS.map((f, i) => solveFinger(r.hand[s].fingers[i], f, tips[i], i === 0));
      out[s] = { wrist, hand, pole, fingers };
    }
    return out;
  };
}

/** Both hands gripping the stool's seat rim from the sides. */
export function carryArms(stool: THREE.Object3D): ArmsFn {
  return (p) => {
    stool.updateMatrixWorld(true);
    const sq = stool.getWorldQuaternion(new THREE.Quaternion());
    const out = {} as Arms;
    for (const s of SIDES) {
      const k = sideSign(s);
      const rim = stool.localToWorld(v3(k * 0.2, 0.47 + 0.07, -0.01));
      // Palm toward the stool's centre, fingers down over the rim, thumb forward.
      const hand = qBasis(v3(0, 0, -k), v3(0, 1, 0), v3(k, 0, 0))
        .premultiply(sq)
        .multiply(new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), -0.25));
      const fingers = FINGERS.map((f, i) => (i === 0 ? { a: 0.5, c: 0.3, spread: 0.3 * -k } : { a: 0.75, c: 1.05, spread: f.splay * -k * 0.5 }));
      out[s] = { wrist: rim, hand, pole: rootDir(p, k * 0.8, -0.5, -0.4), fingers };
    }
    return out;
  };
}

/** One hand laid flat on a surface at `at` (world), fingers pointing along `toward`. */
export function restingHand(side: Side, at: THREE.Vector3, toward: THREE.Vector3, base: ArmsFn): ArmsFn {
  return (p) => {
    const out = base(p);
    const k = sideSign(side);
    const y = toward.clone().setY(0).normalize().negate();
    const z = v3(0, 1, 0);
    const hand = qBasis(v3().crossVectors(y, z), y, z).multiply(new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), 0.08));
    const wrist = at.clone().add(v3(0, 0.03, 0)).addScaledVector(y, 0.05);
    out[side] = {
      wrist,
      hand,
      pole: rootDir(p, k * 0.5, -0.7, -0.3),
      fingers: FINGERS.map((f, i) => ({ a: i === 0 ? 0.15 : 0.12, c: i === 0 ? 0.1 : 0.18, spread: f.splay * -k * 1.4 })),
    };
    return out;
  };
}

// ---------------------------------------------------------------- stills

/** One finger's job for a still: touch key `p` (pressed by `depression`), or hover `lift` above it. */
export interface FingerTarget {
  p: number;
  depression: number;
  lift: number;
}

/** Seated at the piano holding fixed keys (look-development stills). */
export function seatedPose(
  pianist: Pianist,
  spec: { stool: THREE.Vector3; lean: number; sway: number; nod: number; hands: Record<Side, FingerTarget[]>; pedal: number },
) {
  const body = seatedBody({ ...spec, twist: 0, feet: playingFeet(spec.stool, spec.pedal) });
  const goals = (s: Side) => spec.hands[s].map((f, i) => ({ contact: keyContact(f.p, f.depression, i), lift: f.lift }));
  applyPose(pianist, { body, arms: keyArms(goals) });
}

/** Standing at (x, z), turned `yaw` from facing the camera side (+z). */
export function standingPose(pianist: Pianist, x: number, z: number, yaw: number) {
  applyPose(pianist, { body: standingBody(x, z, yaw), arms: relaxedArms() });
}

export { smooth };
