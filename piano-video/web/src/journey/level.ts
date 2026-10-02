import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { LevelId, Pulse } from "./choreography";

let env: THREE.Texture | null = null;
/** A soft studio environment for metal reflections, built once and shared. */
export function sharedEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  env ??= new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  return env;
}

/** Give metals in a scene reflections, leaving other surfaces cheap. */
export function reflectMetals(scene: THREE.Scene, renderer: THREE.WebGLRenderer, intensity = 0.35) {
  const tex = sharedEnvironment(renderer);
  scene.traverse((o) => {
    const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (mat && "metalness" in mat && mat.metalness >= 0.5) {
      mat.envMap = tex;
      mat.envMapIntensity = intensity;
    }
  });
}

/** Everything a scale scene needs to pose itself for one frame. */
export interface FrameContext {
  t: number; // film time, seconds
  L: number; // log10 of frame width in metres
  dLdt: number; // zoom speed, decades per second
  S: number; // time slowed by 10^S
  physMs: number; // physical milliseconds since the featured strike
  pulses: Pulse[]; // recent notes
  aspect: number;
  height: number; // frame height in pixels, for sizing points
  diving: boolean; // false during the rush back out
}

/** One scale of the dive: its own scene, in its own units, with its own camera. */
export interface Level {
  readonly id: LevelId;
  /** log10 of metres per scene unit (mm = -3, nm = -9, fm = -15). */
  readonly unitExp: number;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  /** Bloom strength when this level fills the frame. */
  readonly bloom: number;
  update(ctx: FrameContext): void;
}

/** Frame width at zoom L, in this level's units. */
export function frameWidth(L: number, unitExp: number): number {
  return Math.pow(10, L - unitExp);
}

/** Camera distance that makes the frame width at the target equal `width`. */
export function distanceFor(width: number, camera: THREE.PerspectiveCamera, aspect: number): number {
  const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * aspect);
  return width / (2 * Math.tan(hfov / 2));
}

/**
 * Point the camera at `target` from direction `dir` (unit vector from target
 * toward camera) at a distance giving frame width `width`. Near and far
 * planes follow the distance so depth precision holds at every scale.
 */
export function aim(
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
  dir: THREE.Vector3,
  width: number,
  aspect: number,
  up = new THREE.Vector3(0, 1, 0),
) {
  const d = distanceFor(width, camera, aspect);
  camera.position.copy(target).addScaledVector(dir.clone().normalize(), d);
  camera.up.copy(up);
  camera.lookAt(target);
  camera.near = d * 0.02;
  camera.far = d * 400;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
}

/** Sum of recent note pulses, optionally weighted per note. */
export function pulseEnergy(pulses: Pulse[], weight: (p: Pulse) => number = () => 1): number {
  let e = 0;
  for (const p of pulses) e += p.strength * weight(p);
  return e;
}

export const smoothstep = (e0: number, e1: number, x: number) => {
  const u = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return u * u * (3 - 2 * u);
};

/** Soft round sprite texture for points and glows. */
export function glowTexture(size = 128, falloff = 2.2): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x - size / 2 + 0.5, y - size / 2 + 0.5) / (size / 2);
      const a = Math.max(0, 1 - r) ** falloff;
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
