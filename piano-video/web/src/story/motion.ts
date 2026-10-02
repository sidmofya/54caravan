// Walking: a path on the floor, footsteps planned along it, and a body that
// rides over the feet. Planted feet never slide; a swinging foot peels off
// heel first and lands heel first; the pelvis drops exactly as much as the
// legs need to reach, which gives the walk its natural bob.

import * as THREE from "three";
import { DIM, SIDES, sideSign, type Side } from "./rig";
import { footPose, forwardAxis, leftAxis, type BodyPose, type Euler3, type FootPose } from "./pose";

const clamp = THREE.MathUtils.clamp;
const smooth = (x: number) => {
  const u = clamp(x, 0, 1);
  return u * u * (3 - 2 * u);
};

/** Shortest-way blend between two headings. */
function blendYaw(a: number, b: number, u: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * u;
}

/** A smooth path across the floor through (x, z) points, measured in metres. */
export class Path {
  readonly curve: THREE.CatmullRomCurve3;
  readonly length: number;
  constructor(points: [number, number][]) {
    this.curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, "centripetal");
    this.curve.arcLengthDivisions = 600;
    this.length = this.curve.getLength();
  }
  point(s: number) {
    return this.curve.getPointAt(clamp(s / this.length, 0, 1));
  }
  heading(s: number) {
    const t = this.curve.getTangentAt(clamp(s / this.length, 0, 1));
    return Math.atan2(t.x, t.z);
  }
}

interface Ground {
  x: number;
  z: number;
  yaw: number;
}

export interface Step {
  side: Side;
  from: Ground;
  to: Ground;
  lift: number;
  land: number;
}

export interface WalkSpec {
  path: Path;
  t0: number; // she starts moving
  t1: number; // the pelvis arrives
  first: Side; // the foot that steps first
  stride?: number; // preferred step length, metres
  yawStart?: number; // facing before she sets off, blended out over `turn` metres
  yawEnd?: number; // facing when she stops, blended in over the last `turn` metres
  turn?: number;
  accel?: number; // seconds to reach speed
  decel?: number; // seconds to stop
  lean?: number; // forward lean of the upper body
}

const HEEL_OFF = 0.15; // seconds the heel rises before a foot lifts
const HEEL_ON = 0.12; // seconds the foot takes to flatten after landing
const TOE_OFF = -0.35; // foot pitch as it leaves the floor
const HEEL_STRIKE = 0.2; // foot pitch as it lands
const STEP_WIDTH = 0.09; // each foot's distance from the path
const LEG = (DIM.thigh + DIM.shin) * 0.997;

export class Walk {
  readonly steps: Step[] = [];
  /** When the last foot has settled. */
  readonly done: number;
  private readonly v: number;
  private readonly spec: Required<WalkSpec>;

  constructor(spec: WalkSpec) {
    const path = spec.path;
    this.spec = {
      stride: 0.55,
      yawStart: path.heading(0),
      yawEnd: path.heading(path.length),
      turn: 0.45,
      accel: 0.5,
      decel: 0.6,
      lean: 0.04,
      ...spec,
    };
    const { t0, t1, accel, decel } = this.spec;
    const L = path.length;
    this.v = L / (t1 - t0 - (accel + decel) / 2);

    const n = Math.max(1, Math.ceil(L / this.spec.stride - 0.2));
    const Ls = L / n;
    const last: Record<Side, Ground> = { L: this.ground(0, "L"), R: this.ground(0, "R") };
    let side = spec.first;
    for (let k = 1; k <= n; k++) {
      const a = k * Ls;
      const lift = k === 1 ? t0 + 0.02 : this.steps[k - 2].land + 0.08;
      const land = Math.max(this.tAt(a - 0.3 * Ls), lift + 0.3);
      const to = this.ground(a, side);
      this.steps.push({ side, from: last[side], to, lift, land });
      last[side] = to;
      side = side === "L" ? "R" : "L";
    }
    // The trailing foot comes alongside.
    const lift = this.steps[n - 1].land + 0.08;
    this.steps.push({ side, from: last[side], to: this.ground(L, side), lift, land: lift + 0.42 });
    this.done = lift + 0.42 + HEEL_ON;
  }

  /** Distance travelled by the pelvis at time t: speed up, cruise, slow down. */
  s(t: number): number {
    const { t0, t1, accel: ta, decel: td } = this.spec;
    const T = t1 - t0;
    const L = this.spec.path.length;
    const tau = t - t0;
    if (tau <= 0) return 0;
    if (tau < ta) return (0.5 * this.v * tau * tau) / ta;
    if (tau < T - td) return (this.v * ta) / 2 + this.v * (tau - ta);
    if (tau < T) return L - (0.5 * this.v * (T - tau) ** 2) / td;
    return L;
  }

  /** Inverse of s: when the pelvis has travelled `s` metres. */
  tAt(s: number): number {
    let lo = this.spec.t0;
    let hi = this.spec.t1;
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      if (this.s(mid) < s) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }

  /** Which way she faces after `s` metres: the path's heading, eased into her start and end facings. */
  yawAt(s: number): number {
    const { path, yawStart, yawEnd, turn } = this.spec;
    let yaw = path.heading(s);
    yaw = blendYaw(yaw, yawEnd, smooth((s - (path.length - turn)) / turn));
    return blendYaw(yawStart, yaw, smooth(s / turn));
  }

  /** Where a foot is placed at `s` metres along the path. */
  private ground(s: number, side: Side): Ground {
    const k = sideSign(side);
    const yaw = this.yawAt(s);
    const p = this.spec.path.point(s).addScaledVector(leftAxis(yaw), k * STEP_WIDTH);
    return { x: p.x, z: p.z, yaw: yaw + k * 0.08 };
  }

  /** A foot at time t: planted, rolling off, swinging or landing. */
  foot(side: Side, t: number): FootPose {
    const mine = this.steps.filter((s) => s.side === side);
    let i = -1;
    for (let j = 0; j < mine.length; j++) if (mine[j].lift <= t) i = j;
    const next = mine[i + 1];
    const heelOff = (g: Ground) => {
      if (next && t > next.lift - HEEL_OFF) return footPose(g.x, g.z, g.yaw, TOE_OFF * smooth((t - (next.lift - HEEL_OFF)) / HEEL_OFF), "ball");
      return footPose(g.x, g.z, g.yaw);
    };
    if (i < 0) return heelOff(mine[0]?.from ?? this.ground(0, side));
    const s = mine[i];
    if (t < s.land) {
      const u = (t - s.lift) / (s.land - s.lift);
      const a = footPose(s.from.x, s.from.z, s.from.yaw, TOE_OFF, "ball");
      const b = footPose(s.to.x, s.to.z, s.to.yaw, HEEL_STRIKE, "heel");
      const e = 0.5 - 0.5 * Math.cos(Math.PI * u);
      const ankle = a.ankle.clone().lerp(b.ankle, e);
      ankle.y += 0.05 * Math.sin(Math.PI * Math.min(u * 1.15, 1));
      return { ankle, quat: a.quat.clone().slerp(b.quat, smooth(u)) };
    }
    if (t < s.land + HEEL_ON) return footPose(s.to.x, s.to.z, s.to.yaw, HEEL_STRIKE * (1 - smooth((t - s.land) / HEEL_ON)), "heel");
    return heelOff(s.to);
  }

  /** How firmly a foot bears weight (0 in the air, 1 planted). */
  private planted(side: Side, t: number): number {
    for (const s of this.steps) {
      if (s.side !== side) continue;
      if (t > s.lift - 0.1 && t < s.land + 0.1) {
        return 1 - Math.min(smooth((t - (s.lift - 0.1)) / 0.1), 1 - smooth((t - s.land) / 0.1));
      }
    }
    return 1;
  }

  body(t: number, opts: { lookAhead?: number } = {}): BodyPose {
    const s = this.s(t);
    const yaw = this.yawAt(s);
    const left = leftAxis(yaw);
    const fwd = forwardAxis(yaw);
    const centre = this.spec.path.point(s);
    const feet = { L: this.foot("L", t), R: this.foot("R", t) };

    // Shift the pelvis over the foot that carries the weight.
    const wL = this.planted("L", t);
    const wR = this.planted("R", t);
    const lean = (wL * STEP_WIDTH - wR * STEP_WIDTH) / Math.max(wL + wR, 1e-3);
    const root = centre.clone().addScaledVector(left, 0.28 * lean);

    // As high as both legs can reach.
    let hipsY = DIM.hipHeight - 0.012;
    for (const side of SIDES) {
      const joint = root.clone().addScaledVector(left, sideSign(side) * DIM.hipWidth);
      const a = feet[side].ankle;
      const dh = Math.hypot(joint.x - a.x, joint.z - a.z);
      hipsY = Math.min(hipsY, a.y + Math.sqrt(Math.max(LEG * LEG - dh * dh, 0)) + 0.045 - 0.002);
    }

    // The pelvis turns with the stride; the chest turns back against it.
    const reach = (side: Side) => feet[side].ankle.clone().sub(root).dot(fwd);
    const stride = (reach("L") - reach("R")) / this.spec.stride;
    const turn = -0.07 * stride;
    const roll = 0.03 * (wL - wR);
    const lean0 = this.spec.lean;
    const look = centre.clone().addScaledVector(fwd, opts.lookAhead ?? 1.6).setY(1.25);
    const pelvis: Euler3 = [0.02, turn, roll];
    return {
      root,
      yaw,
      hips: new THREE.Vector3(0, hipsY, 0),
      pelvis,
      spine: [lean0 * 0.6, -turn * 0.5, -roll * 0.6],
      chest: [lean0 * 0.4, -turn * 0.6, -roll * 0.3],
      neck: [-0.03, 0, 0],
      head: [0.08, 0, 0],
      feet,
      knee: { L: fwd.clone().addScaledVector(left, 0.12), R: fwd.clone().addScaledVector(left, -0.12) },
      look,
      lookWeight: 0.5,
    };
  }

  /** Arm swing, forward positive, opposite to the legs. */
  swing(t: number): Record<Side, number> {
    const s = this.s(t);
    const fwd = forwardAxis(this.yawAt(s));
    const centre = this.spec.path.point(s);
    const reach = (side: Side) => this.foot(side, t).ankle.clone().sub(centre).dot(fwd) / (0.5 * this.spec.stride);
    return { L: 0.28 * clamp(reach("R"), -1, 1), R: 0.28 * clamp(reach("L"), -1, 1) };
  }
}
