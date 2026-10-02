// Camera for the pianist's scene, 2:31 to the end. Each shot is a framing
// that is a pure function of song time; tracking shots follow her root.
// Faces get only brief glimpses: the framing favours her hands, her back
// and her outline against the light.

import * as THREE from "three";
import type { CameraPose } from "../director";
import type { Performer } from "./performer";
import { whiteX } from "./fingering";

type Vec = [number, number, number];
const v = (p: Vec) => new THREE.Vector3(...p);
const ease = (x: number) => {
  const c = Math.min(Math.max(x, 0), 1);
  return c * c * c * (c * (c * 6 - 15) + 10);
};

interface StoryShot {
  name: string;
  /** Nominal start, in song seconds; snapped to the nearest downbeat less a lead. */
  at: number;
  frame: (u: number, t: number) => CameraPose;
}

const CUT_LEAD = 0.3;

export class StoryDirector {
  readonly shots: { name: string; start: number; end: number; frame: StoryShot["frame"] }[];

  constructor(
    private readonly performer: Performer,
    downbeats: number[], // song seconds
    end: number,
  ) {
    const her = (t: number, y = 1.15) => {
      performer.pianist.rig.root.updateMatrixWorld(true);
      return performer.pianist.rig.root.position.clone().setY(y);
    };
    const rightHand = (t: number) => whiteX(performer.fingering.centre("R", t - performer.offset));
    const leftHand = (t: number) => whiteX(performer.fingering.centre("L", t - performer.offset));
    const still = (pos: Vec, look: Vec, fov: number) => () => ({ position: v(pos), target: v(look), fov });
    const move = (a: Vec, b: Vec, la: Vec, lb: Vec, fov: number) => (u: number) => ({
      position: v(a).lerp(v(b), ease(u)),
      target: v(la).lerp(v(lb), ease(u)),
      fov,
    });

    const plan: StoryShot[] = [
      // The door opens on warm hall light; she comes through with the stool.
      { name: "door", at: 151.6, frame: move([0.95, 1.3, 1.0], [0.8, 1.27, 1.12], [-2.6, 1.05, 1.95], [-2.4, 1.0, 1.85], 30) },
      // Across the room toward the piano, the camera turning to keep her.
      { name: "walk", at: 153.8, frame: (_u, t) => ({ position: v([1.25, 1.35, 3.3]), target: her(t, 1.0), fov: 34 }) },
      // Low: the stool comes down onto the floor; her bare feet step round.
      { name: "stool", at: 156.0, frame: move([0.62, 0.3, 1.5], [0.55, 0.27, 1.42], [-0.12, 0.28, 0.74], [-0.1, 0.27, 0.7], 34) },
      // She sits.
      { name: "sit", at: 158.4, frame: move([1.2, 1.2, 1.45], [1.1, 1.15, 1.35], [-0.08, 0.85, 0.6], [-0.06, 0.82, 0.55], 34) },
      // Over her shoulder as her hands find the keys.
      { name: "shoulder", at: 160.6, frame: move([0.66, 1.56, 1.22], [0.6, 1.5, 1.1], [0.02, 0.76, 0.32], [0.04, 0.75, 0.3], 36) },
      // Down at the keys from the treble end, following the right hand.
      {
        name: "hands",
        at: 165.1,
        frame: (u, t) => ({
          position: v([0.9, 0.93, 0.5]).add(v([-0.05 * ease(u), 0, 0])),
          target: new THREE.Vector3(THREE.MathUtils.clamp(rightHand(t), -0.1, 0.45) * 0.6, 0.73, 0.3),
          fov: 30,
        }),
      },
      // Her profile from the right, against the lamp.
      { name: "profile", at: 169.6, frame: move([1.3, 1.08, 0.78], [1.2, 1.06, 0.74], [-0.5, 0.98, 0.52], [-0.5, 0.97, 0.5], 30) },
      // Her foot on the sustain pedal.
      { name: "pedal", at: 174.1, frame: still([0.7, 0.22, 0.52], [0.06, 0.12, 0.24], 36) },
      // Wide from the corner as she reaches into the bass.
      { name: "reach", at: 176.3, frame: move([1.65, 1.42, 2.55], [1.5, 1.38, 2.35], [-0.2, 0.82, 0.5], [-0.22, 0.82, 0.48], 32) },
      // The left hand in the deep bass.
      {
        name: "bass",
        at: 180.7,
        frame: (u, t) => ({
          position: v([-1.0, 0.96, 0.82]).add(v([0.04 * ease(u), 0, 0])),
          target: new THREE.Vector3(THREE.MathUtils.clamp(leftHand(t), -0.6, -0.1), 0.74, 0.3),
          fov: 30,
        }),
      },
      // She lifts her hands, stands, rests a hand on the piano.
      { name: "rise", at: 185.2, frame: move([1.05, 1.32, 1.65], [0.95, 1.3, 1.5], [-0.05, 1.0, 0.5], [-0.03, 1.08, 0.45], 34) },
      // Wide as she walks out, the camera turning to keep her until the doorway.
      {
        name: "leave",
        at: 189.6,
        frame: (_u, t) => {
          const door = new THREE.Vector3(-2.6, 1.0, 1.95);
          const gone = performer.visible(t) ? 0 : 1;
          const target = gone ? door : her(t, 1.0).lerp(door, THREE.MathUtils.clamp((t - 194.5) / 2, 0, 1) * 0.3);
          return { position: v([1.75, 1.55, 3.5]), target, fov: 34 };
        },
      },
      // The keys going on alone beside the empty stool.
      { name: "alone", at: 196.3, frame: move([0.58, 0.98, 1.08], [0.5, 0.96, 0.98], [0.0, 0.72, 0.32], [0.02, 0.72, 0.3], 32) },
      // Pull back into the first light, then dark.
      { name: "dawn", at: 200.7, frame: move([0.35, 1.25, 1.55], [1.35, 1.7, 4.3], [-0.1, 0.9, 0.2], [-0.4, 1.1, 0.6], 34) },
    ];

    const snap = (t: number) => downbeats.reduce((a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a), t) - CUT_LEAD;
    const starts = plan.map((s, i) => (i === 0 ? s.at : snap(s.at)));
    this.shots = plan.map((s, i) => ({ name: s.name, start: starts[i], end: starts[i + 1] ?? end, frame: s.frame }));
  }

  shotAt(t: number) {
    for (let i = this.shots.length - 1; i >= 0; i--) if (t >= this.shots[i].start) return this.shots[i];
    return this.shots[0];
  }

  pose(t: number): CameraPose {
    const s = this.shotAt(t);
    const pose = s.frame((t - s.start) / Math.max(s.end - s.start, 1e-3), t);
    // A breath of handheld drift, deterministic.
    pose.position.add(new THREE.Vector3(Math.sin(t * 0.71) * 0.6 + Math.sin(t * 1.37 + 1.1) * 0.4, Math.sin(t * 0.53 + 2) * 0.5, 0).multiplyScalar(0.003));
    return pose;
  }
}
