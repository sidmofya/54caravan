import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Director } from "./director";
import { buildAction } from "./piano/action";
import { buildCabinet } from "./piano/cabinet";
import { KEY_ANGLE, buildKeyboard } from "./piano/keyboard";
import { HIGHEST, LOWEST } from "./piano/layout";
import { buildStrings } from "./piano/strings";
import { buildRoom } from "./room";
import { Timeline, type KeyState, type Performance } from "./timeline";

const PEDAL_TRAVEL = 0.16; // radians the sustain pedal dips

/** The renderer settings both films share. */
export function createRenderer(canvas: HTMLCanvasElement, antialias = true): THREE.WebGLRenderer {
  const r = new THREE.WebGLRenderer({ canvas, antialias, preserveDrawingBuffer: true });
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.05;
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFShadowMap;
  return r;
}

export class PianoScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.004, 40);
  readonly timeline: Timeline;
  readonly director: Director;
  private readonly keyboard = buildKeyboard();
  private readonly action = buildAction();
  private readonly strings = buildStrings();
  private readonly cabinet = buildCabinet();

  constructor(
    target: HTMLCanvasElement | THREE.WebGLRenderer,
    perf: Performance,
    opts: { antialias?: boolean; director?: Director } = {},
  ) {
    this.timeline = new Timeline(perf);
    this.director = opts.director ?? new Director(perf);

    const r = target instanceof THREE.WebGLRenderer ? target : createRenderer(target, opts.antialias ?? true);
    this.renderer = r;

    this.scene.background = new THREE.Color(0x0d0a08);
    this.scene.add(this.cabinet.group, this.keyboard.group, this.action.group, this.strings.group);
    this.scene.add(buildRoom().group);
    this.addLights();

    // Reflections only where they show: metals and gloss lacquer. Image-based
    // lighting on every surface more than doubles software-rendering time.
    const env = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.traverse((o) => {
      const mat = (o as THREE.Mesh).material as THREE.MeshPhysicalMaterial | undefined;
      if (!mat || !("metalness" in mat)) return;
      if (mat.metalness >= 0.5 || mat.clearcoat > 0) {
        mat.envMap = env;
        mat.envMapIntensity = 0.1;
      }
    });
  }

  private addLights() {
    // Night, lamp-lit: "just a little light to work by". A dim cool ambient,
    // the floor lamp as the key light, and a warm work light inside the case.
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0xc9b8a4, 0x2a1c12, 0.55));

    const lamp = new THREE.SpotLight(0xffc488, 14, 0, 0.85, 1, 2);
    lamp.position.set(-1.0, 1.95, 0.45);
    lamp.target.position.set(0.25, 0.85, 0.05);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(1024, 1024);
    lamp.shadow.bias = -0.0004;
    lamp.shadow.normalBias = 0.01;
    lamp.shadow.camera.near = 0.2;
    lamp.shadow.camera.far = 5;
    s.add(lamp, lamp.target);

    // Faint moonlight from the right so the far side doesn't go black.
    const moon = new THREE.SpotLight(0xa8b8ff, 5, 0, 0.6, 1, 2);
    moon.position.set(2.3, 2.2, 2.4);
    moon.target.position.set(0, 0.8, 0);
    s.add(moon, moon.target);

    // Work light inside the top: lights the action and throws hammer shadows on the plate.
    const inside = new THREE.SpotLight(0xffd9a8, 3.2, 0, 1.0, 0.85, 2);
    inside.position.set(0.05, 1.18, 0.4);
    inside.target.position.set(0, 0.95, -0.22);
    inside.castShadow = true;
    inside.shadow.mapSize.set(1536, 1536);
    inside.shadow.bias = -0.0003;
    inside.shadow.normalBias = 0.004;
    inside.shadow.camera.near = 0.1;
    inside.shadow.camera.far = 1.5;
    s.add(inside, inside.target);

  }

  setSize(width: number, height: number) {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /** Pose the whole piano and camera for time t and draw one frame. */
  renderAt(t: number) {
    this.pose(t);
    const pose = this.director.pose(t);
    this.camera.position.copy(pose.position);
    this.camera.lookAt(pose.target);
    if (this.camera.fov !== pose.fov) {
      this.camera.fov = pose.fov;
      this.camera.updateProjectionMatrix();
    }
    this.renderer.render(this.scene, this.camera);
  }

  /** Set every key, hammer, damper, string and the pedal for performance time t. */
  pose(t: number) {
    const states: KeyState[] = [];
    for (let p = LOWEST; p <= HIGHEST; p++) states.push(this.timeline.key(p, t));
    const state = (p: number) => states[p - LOWEST];

    for (let i = 0; i < this.keyboard.keys.length; i++) {
      this.keyboard.keys[i].rotation.x = states[i].depression * KEY_ANGLE;
    }
    this.action.update(state);
    this.strings.update(t, (p) => state(p).amplitude);
    this.cabinet.pedals[2].rotation.x = this.timeline.pedal(t) * PEDAL_TRAVEL;
  }
}
