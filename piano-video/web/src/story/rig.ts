// A small skeleton for the pianist, plus the inverse-kinematics solvers
// that pose it: two-bone IK for arms and legs, and a curl solver for fingers.
//
// Her local frame: +y up, +z forward (the way she faces), +x her left.
// Limb bones hang along their local -y axis.

import * as THREE from "three";

export type Side = "L" | "R";
export const SIDES: Side[] = ["L", "R"];
/** +1 for her left, -1 for her right: her left is local +x. */
export const sideSign = (s: Side) => (s === "L" ? 1 : -1);

/** Body measurements in metres, for a woman about 1.68 m tall. */
export const DIM = {
  hipHeight: 0.93, // pelvis root above the floor, standing
  hipWidth: 0.086, // hip joint from the midline
  thigh: 0.42,
  shin: 0.4,
  ankle: 0.068, // ankle joint above the sole
  footLength: 0.235,
  spine: 0.1,
  chest: 0.14,
  neck: 0.235, // chest root to neck root
  head: 0.085, // neck root to head pivot
  shoulderWidth: 0.16,
  shoulderHeight: 0.215, // above the chest root
  upperArm: 0.28,
  foreArm: 0.235,
  palm: 0.092,
};

/** One finger: knuckle position on the palm (hand frame), phalanx lengths, radius. */
export interface FingerSpec {
  name: string;
  knuckle: [number, number, number]; // x is multiplied by the hand's thumb sign
  lengths: [number, number, number];
  radius: number;
  splay: number; // resting sideways angle, radians
}

export const FINGERS: FingerSpec[] = [
  { name: "thumb", knuckle: [0.03, -0.028, -0.014], lengths: [0.034, 0.03, 0.026], radius: 0.0092, splay: 0.62 },
  { name: "index", knuckle: [0.025, -DIM.palm, 0], lengths: [0.04, 0.024, 0.02], radius: 0.0082, splay: 0.06 },
  { name: "middle", knuckle: [0.007, -DIM.palm - 0.003, 0], lengths: [0.044, 0.027, 0.021], radius: 0.0084, splay: 0 },
  { name: "ring", knuckle: [-0.011, -DIM.palm, 0], lengths: [0.041, 0.025, 0.02], radius: 0.0079, splay: -0.05 },
  { name: "little", knuckle: [-0.027, -DIM.palm + 0.008, 0], lengths: [0.033, 0.019, 0.018], radius: 0.0071, splay: -0.12 },
];

export interface Hand {
  hand: THREE.Object3D; // wrist joint
  fingers: THREE.Object3D[][]; // [finger][phalanx], each a joint
}

export interface Rig {
  root: THREE.Group; // on the floor under the pelvis; place and turn her with this
  hips: THREE.Object3D;
  spine: THREE.Object3D;
  chest: THREE.Object3D;
  neck: THREE.Object3D;
  head: THREE.Object3D;
  shoulder: Record<Side, THREE.Object3D>;
  upperArm: Record<Side, THREE.Object3D>;
  foreArm: Record<Side, THREE.Object3D>;
  hand: Record<Side, Hand>;
  thigh: Record<Side, THREE.Object3D>;
  shin: Record<Side, THREE.Object3D>;
  foot: Record<Side, THREE.Object3D>;
}

function joint(name: string, parent: THREE.Object3D, x: number, y: number, z: number): THREE.Object3D {
  const j = new THREE.Object3D();
  j.name = name;
  j.position.set(x, y, z);
  parent.add(j);
  return j;
}

export function buildRig(): Rig {
  const root = new THREE.Group();
  root.name = "pianist";
  const hips = joint("hips", root, 0, DIM.hipHeight, 0);
  const spine = joint("spine", hips, 0, DIM.spine, -0.01);
  const chest = joint("chest", spine, 0, DIM.chest, 0.005);
  const neck = joint("neck", chest, 0, DIM.neck, -0.012);
  const head = joint("head", neck, 0, DIM.head, 0.012);

  const shoulder = {} as Record<Side, THREE.Object3D>;
  const upperArm = {} as Record<Side, THREE.Object3D>;
  const foreArm = {} as Record<Side, THREE.Object3D>;
  const hand = {} as Record<Side, Hand>;
  const thigh = {} as Record<Side, THREE.Object3D>;
  const shin = {} as Record<Side, THREE.Object3D>;
  const foot = {} as Record<Side, THREE.Object3D>;

  for (const s of SIDES) {
    const k = sideSign(s);
    shoulder[s] = joint(`shoulder${s}`, chest, k * DIM.shoulderWidth, DIM.shoulderHeight, -0.012);
    upperArm[s] = joint(`upperArm${s}`, shoulder[s], 0, 0, 0);
    foreArm[s] = joint(`foreArm${s}`, upperArm[s], 0, -DIM.upperArm, 0);
    const wrist = joint(`hand${s}`, foreArm[s], 0, -DIM.foreArm, 0);
    // Thumb side of each hand: toward her midline when palms face down.
    const thumbSign = -k;
    const fingers = FINGERS.map((f) => {
      const chain: THREE.Object3D[] = [];
      let parent: THREE.Object3D = wrist;
      f.lengths.forEach((len, i) => {
        const pos = i === 0 ? [f.knuckle[0] * thumbSign, f.knuckle[1], f.knuckle[2]] : [0, -f.lengths[i - 1], 0];
        const j = joint(`${s}${f.name}${i}`, parent, pos[0], pos[1], pos[2]);
        chain.push(j);
        parent = j;
        void len;
      });
      return chain;
    });
    hand[s] = { hand: wrist, fingers };

    thigh[s] = joint(`thigh${s}`, hips, k * DIM.hipWidth, -0.045, 0);
    shin[s] = joint(`shin${s}`, thigh[s], 0, -DIM.thigh, 0);
    foot[s] = joint(`foot${s}`, shin[s], 0, -DIM.shin, 0);
  }
  return { root, hips, spine, chest, neck, head, shoulder, upperArm, foreArm, hand, thigh, shin, foot };
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _qp = new THREE.Quaternion();

/**
 * Give `bone` the world orientation whose local -y points along `dir` and
 * whose local +z leans toward `pole`. The bone's parent must be up to date.
 */
export function aimBone(bone: THREE.Object3D, dir: THREE.Vector3, pole: THREE.Vector3) {
  const y = dir.clone().normalize().negate();
  const z = pole.clone().addScaledVector(y, -pole.dot(y));
  if (z.lengthSq() < 1e-10) z.set(0, 0, 1).addScaledVector(y, -y.z);
  z.normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  _m.makeBasis(x, y, z);
  _q.setFromRotationMatrix(_m);
  bone.parent!.getWorldQuaternion(_qp);
  bone.quaternion.copy(_qp.invert().multiply(_q));
  bone.updateMatrixWorld(true);
}

/** Set a bone's world orientation directly (hands, feet, head). */
export function setWorldQuaternion(bone: THREE.Object3D, q: THREE.Quaternion) {
  bone.parent!.getWorldQuaternion(_qp);
  bone.quaternion.copy(_qp.invert().multiply(q));
  bone.updateMatrixWorld(true);
}

/**
 * Two-bone IK: bend `upper` and `lower` (lengths l1, l2) so the end of
 * `lower` reaches `target`, with the middle joint pointing toward `pole`
 * (a world direction). Returns how far short of the target it fell.
 */
export function twoBoneIK(
  upper: THREE.Object3D,
  lower: THREE.Object3D,
  l1: number,
  l2: number,
  target: THREE.Vector3,
  pole: THREE.Vector3,
): number {
  upper.parent!.updateMatrixWorld(true);
  const a = upper.getWorldPosition(new THREE.Vector3());
  const toT = target.clone().sub(a);
  const dist = Math.min(toT.length(), (l1 + l2) * 0.9995);
  const dir = toT.clone().normalize();
  // Law of cosines for the angle at the root joint.
  const cosA = THREE.MathUtils.clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1);
  const bendDir = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
  const mid = a
    .clone()
    .addScaledVector(dir, l1 * cosA)
    .addScaledVector(bendDir, l1 * Math.sqrt(1 - cosA * cosA));
  aimBone(upper, mid.clone().sub(a), bendDir);
  const end = a.clone().addScaledVector(dir, dist);
  aimBone(lower, end.clone().sub(mid), bendDir);
  return toT.length() - dist;
}

/**
 * Curl one finger so its tip reaches `target` (world). Flexion is shared
 * across the joints in a natural ratio; the knuckle also turns sideways
 * toward the target. Iterative, deterministic (fixed iterations).
 */
export function fingerIK(chain: THREE.Object3D[], spec: FingerSpec, target: THREE.Vector3, isThumb: boolean) {
  const hand = chain[0].parent!;
  hand.updateMatrixWorld(true);
  const local = hand.worldToLocal(target.clone());
  const k = chain[0].position.clone();
  const rel = local.sub(k);
  // Sideways (abduction) toward the target, about the hand's z axis.
  const spread = Math.atan2(rel.x, -rel.y);
  const reach = new THREE.Vector2(Math.hypot(rel.x, rel.y), -rel.z); // along finger, toward palm
  const [l1, l2, l3] = spec.lengths;
  const ratio = isThumb ? [0.5, 0.6] : [1.0, 0.72];
  // Find knuckle angle a and curl c so the tip lands on `reach`.
  let a = 0.4;
  let c = 0.5;
  const tip = (a0: number, c0: number) => {
    const b = c0 * ratio[0];
    const d = c0 * ratio[1];
    return new THREE.Vector2(
      l1 * Math.cos(a0) + l2 * Math.cos(a0 + b) + l3 * Math.cos(a0 + b + d),
      l1 * Math.sin(a0) + l2 * Math.sin(a0 + b) + l3 * Math.sin(a0 + b + d),
    );
  };
  for (let i = 0; i < 24; i++) {
    const p = tip(a, c);
    const e = reach.clone().sub(p);
    if (e.lengthSq() < 1e-9) break;
    const h = 1e-4;
    const pa = tip(a + h, c).sub(p).divideScalar(h);
    const pc = tip(a, c + h).sub(p).divideScalar(h);
    // Damped least squares on the 2x2 Jacobian.
    const lambda = 1e-4;
    const j11 = pa.x * pa.x + pa.y * pa.y + lambda;
    const j12 = pa.x * pc.x + pa.y * pc.y;
    const j22 = pc.x * pc.x + pc.y * pc.y + lambda;
    const r1 = pa.x * e.x + pa.y * e.y;
    const r2 = pc.x * e.x + pc.y * e.y;
    const det = j11 * j22 - j12 * j12;
    a = THREE.MathUtils.clamp(a + (j22 * r1 - j12 * r2) / det, -0.35, 1.45);
    c = THREE.MathUtils.clamp(c + (j11 * r2 - j12 * r1) / det, 0.05, 1.6);
  }
  setFingerCurl(chain, spec, a, c, spread, isThumb);
}

/** Pose a finger from knuckle angle, curl and sideways spread. */
export function setFingerCurl(chain: THREE.Object3D[], spec: FingerSpec, a: number, c: number, spread: number, isThumb: boolean) {
  const ratio = isThumb ? [0.5, 0.6] : [1.0, 0.72];
  const base = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), spread);
  chain[0].quaternion.copy(base).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a));
  chain[1].quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), c * ratio[0]);
  chain[2].quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), c * ratio[1]);
  void spec;
  chain[0].updateMatrixWorld(true);
}

/** World position of a finger's tip. */
export function fingertip(chain: THREE.Object3D[], spec: FingerSpec): THREE.Vector3 {
  chain[2].updateMatrixWorld(true);
  return chain[2].localToWorld(new THREE.Vector3(0, -spec.lengths[2], 0));
}
