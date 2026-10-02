// Look-development stills of the pianist: render mode only. `t` picks a
// shot (0, 1, 2, ...): standing front, side, back and face; then seated at
// the piano, wide, profile, over the shoulder, hands and the pedal foot.

import * as THREE from "three";
import { PianoScene } from "../scene";
import type { Performance } from "../timeline";
import { Pianist } from "./body";
import { seatedPose, standingPose, type FingerTarget } from "./pose";
import { buildStool } from "./stool";

type Vec = [number, number, number];
interface Shot {
  name: string;
  pose: "stand" | "seat";
  stand?: [number, number, number]; // x, z, yaw
  cam: Vec;
  look: Vec;
  fov: number;
}

const STOOL_AT = new THREE.Vector3(-0.04, 0, 0.74);

export const SHOTS: Shot[] = [
  { name: "front", pose: "stand", stand: [-0.7, 1.85, 0.35], cam: [-0.15, 1.0, 4.6], look: [-0.7, 0.86, 1.85], fov: 36 },
  { name: "side", pose: "stand", stand: [-0.7, 1.85, 0.35 + Math.PI / 2], cam: [-0.15, 1.0, 4.6], look: [-0.7, 0.86, 1.85], fov: 36 },
  { name: "back", pose: "stand", stand: [-0.7, 1.85, Math.PI + 0.35], cam: [-0.15, 1.0, 4.6], look: [-0.7, 0.86, 1.85], fov: 36 },
  { name: "face", pose: "stand", stand: [-0.7, 1.85, 0.35], cam: [-0.3, 1.52, 2.85], look: [-0.7, 1.45, 1.85], fov: 26 },
  { name: "seated", pose: "seat", cam: [1.35, 1.25, 2.1], look: [-0.05, 0.78, 0.55], fov: 36 },
  { name: "profile", pose: "seat", cam: [-1.5, 1.05, 1.25], look: [-0.04, 0.84, 0.6], fov: 34 },
  { name: "shoulder", pose: "seat", cam: [0.38, 1.62, 1.35], look: [-0.05, 0.8, 0.35], fov: 34 },
  { name: "hands", pose: "seat", cam: [-0.5, 0.92, 0.62], look: [-0.06, 0.74, 0.3], fov: 30 },
  { name: "pedal", pose: "seat", cam: [0.75, 0.22, 0.45], look: [0.06, 0.1, 0.22], fov: 36 },
];

// An E minor shape: left hand E3 G3 B3, right hand E4 and B4 under thumb and little finger.
const down = (p: number): FingerTarget => ({ p, depression: 1, lift: 0 });
const hover = (p: number): FingerTarget => ({ p, depression: 0, lift: 0.012 });
const HANDS: Record<"L" | "R", FingerTarget[]> = {
  L: [down(59), hover(57), down(55), hover(53), down(52)],
  R: [down(64), hover(66), hover(67), hover(69), down(71)],
};

export class PortraitFilm {
  readonly piano: PianoScene;
  readonly pianist = new Pianist();
  readonly stool = buildStool();
  private readonly fill = new THREE.SpotLight(0xffe2c4, 3.5, 0, 0.5, 0.9, 2);

  constructor(canvas: HTMLCanvasElement, w: number, h: number) {
    // Hold the chord's keys down for the whole still.
    const notes = [...HANDS.L, ...HANDS.R].filter((f) => f.depression > 0).map((f) => ({ p: f.p, on: 0.2, off: 1e4, v: 0.5 }));
    const perf: Performance = { duration: SHOTS.length, tempo: 108, beats: [], downbeats: [], notes, pedal: [{ on: 0, off: 1e4 }] };
    this.piano = new PianoScene(canvas, perf);
    this.piano.setSize(w, h);
    const s = this.piano.scene;
    s.add(this.pianist.rig.root, this.pianist.group, this.stool);
    // A soft warm fill from the camera side so her front reads at night.
    s.add(this.fill, this.fill.target);
    this.piano.room.door.rotation.y = -1.2;
    this.piano.room.spill.intensity = 18;
  }

  renderAt(t: number) {
    const shot = SHOTS[Math.min(Math.max(Math.floor(t), 0), SHOTS.length - 1)];
    if (shot.pose === "stand") {
      const [x, z, yaw] = shot.stand!;
      standingPose(this.pianist, x, z, yaw);
      this.stool.position.set(x + 0.55, 0, z - 0.25);
    } else {
      seatedPose(this.pianist, { stool: STOOL_AT, lean: 0.14, sway: 0.02, nod: 0.32, hands: HANDS, pedal: 1 });
      this.stool.position.copy(STOOL_AT);
    }
    this.piano.pose(5);
    const cam = this.piano.camera;
    cam.position.set(...shot.cam);
    cam.lookAt(...shot.look);
    cam.fov = shot.fov;
    cam.updateProjectionMatrix();
    this.fill.position.copy(cam.position).add(new THREE.Vector3(0.4, 0.3, 0));
    this.fill.target.position.set(...shot.look);
    // Same brightness on her whatever the camera distance.
    this.fill.intensity = 1.6 * this.fill.position.distanceToSquared(this.fill.target.position);
    this.piano.renderer.render(this.piano.scene, cam);
  }
}
