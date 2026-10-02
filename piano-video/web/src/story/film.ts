// The pianist's scene as a film: the piano room, her, the stool, the door
// and the window's dawn, from the door opening to the fade. Render time is
// performance time; `offset` turns it into song time.

import * as THREE from "three";
import { PianoScene } from "../scene";
import type { Performance } from "../timeline";
import { Pianist } from "./body";
import { StoryDirector } from "./director";
import { breakFingering, Performer } from "./performer";
import { buildStool } from "./stool";

const smooth = (x: number) => {
  const u = Math.min(Math.max(x, 0), 1);
  return u * u * (3 - 2 * u);
};

/** When the window starts to pale, and when the picture is gone. */
const DAWN = { from: 196, to: 209 };
const FADE = { from: 207.0, to: 209.0 };
const EXPOSURE = 1.05;

export class StoryFilm {
  readonly piano: PianoScene;
  readonly pianist = new Pianist();
  readonly stool = buildStool();
  readonly performer: Performer;
  readonly director: StoryDirector;
  /** A soft warm light from near the camera, so she reads at night. */
  private readonly fill = new THREE.SpotLight(0xffe2c4, 1, 0, 0.5, 0.9, 2);
  private readonly night = new THREE.Color(0x0b1424);
  private readonly morning = new THREE.Color(0x7d8fb4);

  constructor(
    target: HTMLCanvasElement | THREE.WebGLRenderer,
    perf: Performance,
    readonly offset: number,
  ) {
    // Her fingers decide when keys let go, so the piano is built from the adjusted notes.
    const fingering = breakFingering(perf.notes, offset);
    this.piano = new PianoScene(target, { ...perf, notes: fingering.adjust(perf.notes) });
    this.performer = new Performer(this.pianist, this.stool, this.piano, fingering, offset);
    this.director = new StoryDirector(this.performer, perf.downbeats.map((d) => d + offset), perf.duration + offset);
    this.piano.scene.add(this.pianist.rig.root, this.pianist.group, this.stool, this.fill, this.fill.target);
  }

  setSize(w: number, h: number) {
    this.piano.setSize(w, h);
  }

  /** Draw the frame for performance time `tp`. */
  renderAt(tp: number) {
    this.piano.renderer.render(this.piano.scene, this.prepare(tp));
  }

  /** Pose everything and the camera for performance time `tp`; returns the camera to draw with. */
  prepare(tp: number): THREE.PerspectiveCamera {
    const t = tp + this.offset;
    this.piano.pose(tp);
    this.performer.pose(t);

    const cam = this.piano.camera;
    const pose = this.director.pose(t);
    cam.position.copy(pose.position);
    cam.lookAt(pose.target);
    if (cam.fov !== pose.fov) {
      cam.fov = pose.fov;
      cam.updateProjectionMatrix();
    }
    this.fill.position.copy(cam.position).add(new THREE.Vector3(0.4, 0.3, 0));
    this.fill.target.position.copy(pose.target);
    this.fill.intensity = 0.7 * this.fill.position.distanceToSquared(pose.target);
    this.fill.visible = this.performer.visible(t);

    // First light at the window, then the fade to black on the last note.
    const dawn = smooth((t - DAWN.from) / (DAWN.to - DAWN.from));
    const room = this.piano.room;
    room.sky.color.copy(this.night).lerp(this.morning, dawn);
    room.dawn.intensity = 1.4 * dawn;
    this.piano.renderer.toneMappingExposure = EXPOSURE * (1 - smooth((t - FADE.from) / (FADE.to - FADE.from)));
    return cam;
  }
}
