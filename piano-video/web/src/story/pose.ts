// Poses for the pianist: standing, and seated at the piano with her feet on
// the floor and the sustain pedal, her arms and fingers reaching real keys.
// Everything is solved fresh from a spec, so any frame can be posed alone.

import * as THREE from "three";
import { KEY_ANGLE } from "../piano/keyboard";
import { BLACK_FRONT, BLACK_RISE, KEY_FRONT, KEY_PIVOT_Z, WHITE_TOP, isBlack, keyX } from "../piano/layout";
import type { Pianist } from "./body";
import { DIM, FINGERS, SIDES, fingerIK, setFingerCurl, setWorldQuaternion, sideSign, twoBoneIK, type Side } from "./rig";
import { STOOL } from "./stool";

/** Sustain pedal: toe end in world space, and how far it dips when pressed. */
const SUSTAIN = { x: 0.068, top: 0.0735, z: 0.15, drop: 0.019 };
/** Hip joint above the seat's cushion when sitting. */
const SEAT_CUSHION = STOOL.seatHeight + 0.013;
const SIT_HIP = SEAT_CUSHION + 0.085 + 0.045; // hips joint, 4.5 cm above the thigh joints

/** One finger's job: touch key `p` (pressed by `depression`), or hover `lift` above it. */
export interface FingerTarget {
  p: number;
  depression: number;
  lift: number;
}

export interface SeatSpec {
  /** Stool centre on the floor (world). */
  stool: THREE.Vector3;
  /** Forward lean of the upper body, radians. */
  lean: number;
  /** Sideways sway, radians (positive leans to her left, the bass). */
  sway: number;
  /** Head pitch down toward the keys, radians. */
  nod: number;
  /** Five targets per hand, thumb first. */
  hands: Record<Side, FingerTarget[]>;
  /** Sustain pedal 0..1, under the right foot. */
  pedal: number;
}

/** Where a fingertip's pad meets a key, lowered by the key's depression. */
export function keyContact(p: number, depression: number, finger: number): THREE.Vector3 {
  const black = isBlack(p);
  // The thumb plays nearer the key's front; long fingers reach further in.
  const inset = finger === 0 ? 0.028 : finger === 4 ? 0.04 : 0.05;
  const z = black ? BLACK_FRONT - inset + 0.012 : KEY_FRONT - inset;
  const top = black ? WHITE_TOP + BLACK_RISE : WHITE_TOP;
  return new THREE.Vector3(keyX(p), top - Math.sin(depression * KEY_ANGLE) * (z - KEY_PIVOT_Z), z);
}

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const qBasis = (x: THREE.Vector3, y: THREE.Vector3, z: THREE.Vector3) =>
  new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));

/** Her root on the floor, facing the piano (world -z), at the stool. */
function seatRoot(pianist: Pianist, spec: SeatSpec) {
  const r = pianist.rig;
  r.root.position.set(spec.stool.x, 0, spec.stool.z - 0.03);
  r.root.rotation.set(0, Math.PI, 0);
  r.hips.position.set(0, SIT_HIP, 0);
  // Pelvis tips forward a little; the spine carries most of the lean.
  r.hips.rotation.set(spec.lean * 0.25, 0, spec.sway * 0.3);
  r.spine.rotation.set(spec.lean * 0.45, 0, spec.sway * 0.4);
  r.chest.rotation.set(spec.lean * 0.3, 0, spec.sway * 0.3);
  r.neck.rotation.set(-spec.lean * 0.55, 0, -spec.sway * 0.5);
  r.head.rotation.set(spec.nod, 0, -spec.sway * 0.3);
  for (const s of SIDES) {
    r.shoulder[s].rotation.set(0, 0, 0);
  }
  r.root.updateMatrixWorld(true);
}

/** World quaternion for a foot pitched toes-up by `pitch`, turned out by `yaw`. */
function footQuat(pianist: Pianist, pitch: number, yaw: number) {
  const f = v3(0, Math.sin(pitch), Math.cos(pitch));
  const u = v3(0, Math.cos(pitch), -Math.sin(pitch));
  const local = qBasis(v3(1, 0, 0), u, f).premultiply(new THREE.Quaternion().setFromAxisAngle(v3(0, 1, 0), yaw));
  return pianist.rig.root.getWorldQuaternion(new THREE.Quaternion()).multiply(local);
}

function seatLegs(pianist: Pianist, spec: SeatSpec) {
  const r = pianist.rig;
  const root = r.root;
  const forwardUp = (s: Side) => root.localToWorld(v3(sideSign(s) * 0.15, 1, 1)).sub(root.localToWorld(v3()));

  // Left foot flat on the floor, a little ahead of the knee.
  const lq = footQuat(pianist, 0, 0.12);
  const lAnkle = root.localToWorld(v3(0.16, DIM.ankle, 0.4));
  twoBoneIK(r.thigh.L, r.shin.L, DIM.thigh, DIM.shin, lAnkle, forwardUp("L"));
  setWorldQuaternion(r.foot.L, lq);

  // Right foot: heel on the floor, the ball of the foot on the sustain pedal.
  const ball = v3(SUSTAIN.x + 0.006, SUSTAIN.top + 0.006 - SUSTAIN.drop * spec.pedal, SUSTAIN.z);
  const ballAhead = 0.13; // ankle to ball, along the sole
  const heelBack = 0.05;
  const pitch = Math.asin(THREE.MathUtils.clamp((ball.y - 0.004) / (ballAhead + heelBack), 0, 0.8));
  const rq = footQuat(pianist, pitch, -0.08);
  const f = v3(0, 0, 1).applyQuaternion(rq);
  const u = v3(0, 1, 0).applyQuaternion(rq);
  const rAnkle = ball.clone().addScaledVector(f, -ballAhead).addScaledVector(u, DIM.ankle);
  twoBoneIK(r.thigh.R, r.shin.R, DIM.thigh, DIM.shin, rAnkle, forwardUp("R"));
  setWorldQuaternion(r.foot.R, rq);
}

/** Fingertip target: the end of the last bone sits a finger-radius above the contact. */
function tipTarget(t: FingerTarget, finger: number) {
  const c = keyContact(t.p, t.depression, finger);
  const radius = FINGERS[finger].radius * 0.8;
  return c.add(v3(0, radius + t.lift, finger === 0 ? 0.002 : 0.004));
}

function seatArm(pianist: Pianist, s: Side, targets: FingerTarget[]) {
  const r = pianist.rig;
  const k = sideSign(s);
  const tips = targets.map((t, i) => tipTarget(t, i));
  // The wrist rides behind and above the fingers it is playing with.
  const centre = tips.slice(1).reduce((a, b) => a.add(b), v3()).multiplyScalar(1 / 4);
  const wrist = centre.clone().add(v3(0, 0.05, 0.15));
  // Elbows hang out from the body and a little back.
  const pole = r.root.localToWorld(v3(k * 0.7, -0.6, -0.35)).sub(r.root.localToWorld(v3()));
  twoBoneIK(r.upperArm[s], r.foreArm[s], DIM.upperArm, DIM.foreArm, wrist, pole);

  // Palm down, fingers toward the keys, partly following the forearm's angle.
  const elbow = r.foreArm[s].getWorldPosition(v3());
  const along = wrist.clone().sub(elbow).setY(0).normalize();
  const dir = v3(0, 0, -1).lerp(along, 0.4).normalize();
  const y = dir.clone().negate();
  const z = v3(0, 1, 0);
  const x = v3().crossVectors(y, z);
  const q = qBasis(x, y, z)
    .multiply(new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), 0.14)) // fingers angle down
    .multiply(new THREE.Quaternion().setFromAxisAngle(v3(0, 1, 0), 0.12 * k)); // little-finger side lower
  setWorldQuaternion(r.hand[s].hand, q);

  FINGERS.forEach((spec, i) => fingerIK(r.hand[s].fingers[i], spec, tips[i], i === 0));
}

export function seatedPose(pianist: Pianist, spec: SeatSpec) {
  seatRoot(pianist, spec);
  seatLegs(pianist, spec);
  for (const s of SIDES) seatArm(pianist, s, spec.hands[s]);
  pianist.rig.root.updateMatrixWorld(true);
  pianist.update();
}

/** Standing at (x, z), turned `yaw` from facing the camera side (+z). */
export function standingPose(pianist: Pianist, x: number, z: number, yaw: number) {
  const r = pianist.rig;
  r.root.position.set(x, 0, z);
  r.root.rotation.set(0, yaw, 0);
  r.hips.position.set(0, DIM.hipHeight, 0);
  for (const j of [r.hips, r.spine, r.chest, r.neck, r.head]) j.rotation.set(0, 0, 0);
  r.head.rotation.x = 0.06;
  pianist.standingPose();
  pianist.update();
}

/** A relaxed hand, fingers gently curled, for hands that are not playing. */
export function restFingers(pianist: Pianist, s: Side) {
  FINGERS.forEach((f, i) => setFingerCurl(pianist.rig.hand[s].fingers[i], f, 0.3, 0.5, f.splay * -sideSign(s), i === 0));
}
