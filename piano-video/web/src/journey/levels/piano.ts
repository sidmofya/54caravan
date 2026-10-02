// The piano itself, as the outermost scale. It flies in from where cut 1
// left off, closes on the featured hammer, and catches us on the way out.

import * as THREE from "three";
import { Director, type CameraPose, type PlanStep } from "../../director";
import { HAMMER, hammerX, strikeAngle } from "../../piano/layout";
import { PianoScene } from "../../scene";
import type { Performance } from "../../timeline";
import type { Choreography } from "../choreography";
import { aim, distanceFor, type FrameContext, type Level } from "../level";

/**
 * Directions from the strike point toward the camera. We come in through the
 * open front (FRONT_DIR), rise over the hammer tops (ABOVE_DIR), then drop
 * into the slot between the strings and the resting hammers' noses, which
 * only the struck hammer has swung into, and look along it from the bass
 * side (SIDE_DIR). The hammer scene picks up on SIDE_DIR.
 */
export const FRONT_DIR = new THREE.Vector3(-0.42, 0.36, 1).normalize();
export const ABOVE_DIR = new THREE.Vector3(-0.5, 0.85, 0.15).normalize();
export const SIDE_DIR = new THREE.Vector3(-1, 0.2, 0.1).normalize();

/** Cut 1 ends on this pose (director "outro" at its last frame). */
export const CUT1_END: CameraPose = { position: new THREE.Vector3(0.85, 1.5, 3.7), target: new THREE.Vector3(0.05, 0.88, 0), fov: 32 };

/** Where the dive opens, and the camera once it has landed. */
export interface PianoShots {
  start: CameraPose;
  after: (t: number) => CameraPose;
}

/** After landing on the keys, the coda's shots. */
const CODA: PlanStep[] = [
  { bars: 1, kind: "keys", move: 0 },
  { bars: 1, kind: "action", move: 1.2 },
  { bars: 99, kind: "outro", move: 1.6 },
];

/** Where the felt meets the middle string at the moment of strike, in piano coordinates. */
export function strikePoint(p: number): THREE.Vector3 {
  const a = strikeAngle(p);
  const f = HAMMER.strikeOffset;
  const ly = HAMMER.shank + f * Math.sin(HAMMER.headTilt);
  const lz = -f * Math.cos(HAMMER.headTilt);
  return new THREE.Vector3(
    hammerX(p),
    HAMMER.pivotY + ly * Math.cos(a) - lz * Math.sin(a),
    HAMMER.pivotZ + ly * Math.sin(a) + lz * Math.cos(a),
  );
}

const ease = (x: number) => {
  const c = Math.min(Math.max(x, 0), 1);
  return c * c * (3 - 2 * c);
};

function slerpDir(a: THREE.Vector3, b: THREE.Vector3, u: number) {
  const qa = new THREE.Quaternion();
  const q = new THREE.Quaternion().setFromUnitVectors(a, b);
  return a.clone().applyQuaternion(qa.slerp(q, u)).normalize();
}

/** log10 of the frame width at the target for a camera pose. */
export function poseL(position: THREE.Vector3, target: THREE.Vector3, fov: number, aspect: number): number {
  const cam = new THREE.PerspectiveCamera(fov, aspect);
  return Math.log10(position.distanceTo(target) / distanceFor(1, cam, aspect));
}

/** Frame width (log10 m) of a pose, so the dive opens exactly where the shot before ended. */
export const startL = (aspect: number, start: CameraPose = CUT1_END) => poseL(start.position, start.target, start.fov, aspect);

export class PianoLevel implements Level {
  readonly id = "piano" as const;
  readonly unitExp = 0;
  readonly bloom = 0.04;
  readonly scene: THREE.Scene;
  readonly camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.004, 40);
  readonly piano: PianoScene;
  private readonly contact: THREE.Vector3;

  /** The coda's director: lands on the keys at `landing` and plays out the section. */
  static codaDirector(perf: Performance, landing: number) {
    return new Director(perf, { plan: CODA, from: landing });
  }

  constructor(
    renderer: THREE.WebGLRenderer,
    perf: Performance,
    private readonly ch: Choreography,
    private readonly shots: PianoShots,
    piano?: PianoScene,
  ) {
    this.piano = piano ?? new PianoScene(renderer, perf);
    this.scene = this.piano.scene;
    this.contact = strikePoint(ch.strike.p);
  }

  /** Cut 2's camera: opens on cut 1's last frame, lands into the coda's shots. */
  static cut2Shots(perf: Performance, landing: number): PianoShots {
    const coda = PianoLevel.codaDirector(perf, landing);
    return { start: CUT1_END, after: (t) => coda.pose(t) };
  }

  /** Frame width (log10 m) of the shot we land on. */
  static landL(shots: PianoShots, landing: number, aspect: number): number {
    const pose = shots.after(landing);
    return poseL(pose.position, pose.target, pose.fov, aspect);
  }

  update(ctx: FrameContext) {
    this.piano.pose(this.ch.pianoTime(ctx.t));
    const cam = this.camera;
    const width = Math.pow(10, ctx.L);

    if (ctx.t >= this.ch.landing) {
      const pose = this.shots.after(ctx.t);
      cam.fov = pose.fov;
      cam.aspect = ctx.aspect;
      cam.near = 0.004;
      cam.far = 40;
      cam.position.copy(pose.position);
      cam.up.set(0, 1, 0);
      cam.lookAt(pose.target);
      cam.updateProjectionMatrix();
      return;
    }

    const START = this.shots.start;
    const startDir = START.position.clone().sub(START.target).normalize();
    if (ctx.diving) {
      // Close in on the strike point: aim at it early, swing round to the
      // front, then tip over the hammers to look down onto the contact.
      const s0 = this.ch.opts.startL;
      const aimProg = ease((s0 - ctx.L) / (s0 + 0.5));
      const frontProg = ease((s0 - ctx.L) / (s0 + 0.6));
      const overProg = ease((-0.7 - ctx.L) / 0.35);
      const sideProg = ease((-1.05 - ctx.L) / 0.3);
      const target = START.target.clone().lerp(this.contact, aimProg);
      let dir = slerpDir(startDir, FRONT_DIR, frontProg);
      dir = slerpDir(dir, ABOVE_DIR, overProg);
      dir = slerpDir(dir, SIDE_DIR, sideProg);
      cam.fov = START.fov;
      aim(cam, target, dir, width, ctx.aspect);
    } else {
      // Rushing back out: from the strike point to the opening shot of the coda.
      const pose = this.shots.after(this.ch.landing);
      const landDir = pose.position.clone().sub(pose.target).normalize();
      const prog = ease((ctx.L + 1.9) / (this.ch.opts.landL + 1.9));
      const target = this.contact.clone().lerp(pose.target, prog);
      cam.fov = THREE.MathUtils.lerp(START.fov, pose.fov, prog);
      let dir = slerpDir(SIDE_DIR, ABOVE_DIR, ease(prog * 3));
      dir = slerpDir(dir, FRONT_DIR, ease(prog * 2 - 0.5));
      dir = slerpDir(dir, landDir, ease(prog * 1.4 - 0.4));
      aim(cam, target, dir, width, ctx.aspect);
    }
    cam.near = Math.min(cam.near, 0.004);
    cam.far = 40;
    cam.updateProjectionMatrix();
  }
}
