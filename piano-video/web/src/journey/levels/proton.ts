// 10⁻¹⁵ m: a proton, in tenths of a femtometre.
//
// Two up quarks and a down quark, each carrying a "colour" charge (the
// strong force's version of charge; red, green and blue are labels, not
// hues), held by gluon flux tubes meeting in a Y. Gluons swap colours
// between quarks; virtual quark-antiquark pairs blink in and out of the
// field. The chorus arrives here, and each note makes the tubes flare.

import * as THREE from "three";
import { rng } from "../../rng";
import type { Choreography } from "../choreography";
import { aim, glowTexture, pulseEnergy, type FrameContext, type Level } from "../level";

const RADIUS = 8.4; // proton charge radius 0.84 fm, in 0.1 fm units
const COLOURS = [new THREE.Color(1, 0.22, 0.18), new THREE.Color(0.25, 1, 0.35), new THREE.Color(0.3, 0.45, 1)];
const SEA_EVENTS = 140;

const shellShader = {
  uniforms: { uGlow: { value: 0.5 } },
  vertexShader: /* glsl */ `
    varying vec3 vN;
    varying vec3 vV;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vN = normalize(normalMatrix * normal);
      vV = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    uniform float uGlow;
    varying vec3 vN;
    varying vec3 vV;
    void main() {
      // The proton's edge is soft: brighter where we look through more of it.
      float rim = pow(1.0 - abs(dot(vN, vV)), 2.5);
      vec3 col = mix(vec3(1.0, 0.55, 0.3), vec3(1.0, 0.85, 0.6), rim);
      gl_FragColor = vec4(col * (0.025 + rim * 0.45) * uGlow, 1.0);
    }`,
};

const tubeShader = {
  uniforms: { uColorA: { value: new THREE.Color() }, uColorB: { value: new THREE.Color() }, uTime: { value: 0 }, uFlare: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    varying vec3 vN;
    varying vec3 vV;
    void main() {
      vUv = uv;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vN = normalize(normalMatrix * normal);
      vV = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uColorA;
    uniform vec3 uColorB;
    uniform float uTime;
    uniform float uFlare;
    varying vec2 vUv;
    varying vec3 vN;
    varying vec3 vV;
    void main() {
      // A glowing, flickering string of colour field from junction to quark.
      float core = pow(abs(dot(vN, vV)), 1.5);
      float flicker = 0.75 + 0.25 * sin(vUv.x * 40.0 - uTime * 14.0) * sin(vUv.x * 17.0 + uTime * 5.0);
      vec3 col = mix(uColorB, uColorA, vUv.x);
      gl_FragColor = vec4(col * core * flicker * (0.6 + 1.6 * uFlare), 1.0);
    }`,
};

interface SeaEvent {
  at: THREE.Vector3;
  axis: THREE.Vector3;
  t0: number;
  life: number;
  colour: number;
}

export class ProtonLevel implements Level {
  readonly id = "proton" as const;
  readonly unitExp = -16;
  readonly bloom = 0.6;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.001, 1e5);
  private readonly quarks: THREE.Mesh[] = [];
  private readonly quarkGlows: THREE.Sprite[] = [];
  private readonly tubes: THREE.Mesh[] = [];
  private readonly tubeMats: THREE.ShaderMaterial[] = [];
  private readonly shell: THREE.ShaderMaterial;
  private readonly sea: THREE.Points;
  private readonly seaEvents: SeaEvent[] = [];
  private readonly sparks: THREE.Points;

  constructor(private readonly ch: Choreography) {
    this.scene.background = new THREE.Color(0x030104);

    this.shell = new THREE.ShaderMaterial({ ...shellShader, uniforms: THREE.UniformsUtils.clone(shellShader.uniforms), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(RADIUS, 64, 48), this.shell));

    const glowMap = glowTexture(128, 1.8);
    for (let i = 0; i < 3; i++) {
      const q = new THREE.Mesh(new THREE.SphereGeometry(0.35, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap, blending: THREE.AdditiveBlending, depthWrite: false }));
      g.scale.setScalar(3.2);
      this.quarks.push(q);
      this.quarkGlows.push(g);
      this.scene.add(q, g);
      const mat = new THREE.ShaderMaterial({ ...tubeShader, uniforms: THREE.UniformsUtils.clone(tubeShader.uniforms), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const tube = new THREE.Mesh(new THREE.BufferGeometry(), mat);
      tube.frustumCulled = false;
      this.tubeMats.push(mat);
      this.tubes.push(tube);
      this.scene.add(tube);
    }

    // Virtual quark-antiquark pairs: born, drift apart, rejoin, annihilate.
    const R = rng(1932);
    for (let i = 0; i < SEA_EVENTS; i++) {
      const dir = new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize();
      this.seaEvents.push({
        at: dir.multiplyScalar(Math.cbrt(R()) * RADIUS * 0.85),
        axis: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize(),
        t0: 17.5 + R() * 6,
        life: 0.35 + R() * 0.5,
        colour: Math.floor(R() * 3),
      });
    }
    const seaGeo = new THREE.BufferGeometry();
    seaGeo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(SEA_EVENTS * 3 * 3), 3));
    seaGeo.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(SEA_EVENTS * 3 * 3), 3));
    this.sea = new THREE.Points(
      seaGeo,
      new THREE.PointsMaterial({ size: 0.9, map: glowTexture(64, 2), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.sea.frustumCulled = false;
    this.scene.add(this.sea);

    // Gluons: sparks running along the flux tubes.
    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(3 * 10 * 3), 3));
    this.sparks = new THREE.Points(
      sparkGeo,
      new THREE.PointsMaterial({ color: 0xfff4e0, size: 0.6, map: glowTexture(64, 2.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.sparks.frustumCulled = false;
    this.scene.add(this.sparks);
  }

  /** Where each valence quark is: wandering paths inside the proton. */
  private quarkPositions(t: number): THREE.Vector3[] {
    return [0, 1, 2].map((i) => {
      const a = t * (0.55 + i * 0.13) + i * 2.1;
      const b = t * (0.41 + i * 0.07) + i * 4.3;
      return new THREE.Vector3(Math.cos(a) * Math.cos(b), Math.sin(b) * 0.8, Math.sin(a) * Math.cos(b)).multiplyScalar(3.6 + 1.2 * Math.sin(t * 0.7 + i));
    });
  }

  /** Colour charge on each quark: gluon exchanges swap pairs every so often. */
  private colours(t: number): THREE.Color[] {
    const perm = [0, 1, 2];
    const swaps = Math.floor(t / 0.9);
    for (let s = 0; s < swaps; s++) {
      const a = s % 3;
      const b = (s + 1) % 3;
      [perm[a], perm[b]] = [perm[b], perm[a]];
    }
    // Ease the latest swap in over 0.2 s.
    const prev = [...perm];
    if (swaps > 0) {
      const s = swaps - 1;
      const a = s % 3;
      const b = (s + 1) % 3;
      [prev[a], prev[b]] = [prev[b], prev[a]];
    }
    const u = Math.min((t - swaps * 0.9) / 0.2, 1);
    return perm.map((c, i) => COLOURS[prev[i]].clone().lerp(COLOURS[c], u));
  }

  update(ctx: FrameContext) {
    const t = ctx.t;
    const energy = Math.min(pulseEnergy(ctx.pulses), 1.4);
    const qp = this.quarkPositions(t);
    const cols = this.colours(t);
    const junction = qp[0].clone().add(qp[1]).add(qp[2]).multiplyScalar(1 / 3);

    qp.forEach((p, i) => {
      this.quarks[i].position.copy(p);
      (this.quarks[i].material as THREE.MeshBasicMaterial).color.copy(cols[i]).multiplyScalar(1.6);
      this.quarkGlows[i].position.copy(p);
      (this.quarkGlows[i].material as THREE.SpriteMaterial).color.copy(cols[i]);
      this.quarkGlows[i].scale.setScalar(2.6 * (1 + 0.25 * energy));

      // Flux tube from the junction to this quark, sagging and writhing a little.
      const mid = junction.clone().lerp(p, 0.5).add(new THREE.Vector3(Math.sin(t * 3 + i), Math.cos(t * 2.4 + i * 2), Math.sin(t * 2.7 + i * 3)).multiplyScalar(0.5));
      const curve = new THREE.QuadraticBezierCurve3(junction, mid, p);
      this.tubes[i].geometry.dispose();
      this.tubes[i].geometry = new THREE.TubeGeometry(curve, 40, 0.32 * (1 + 0.8 * energy), 10, false);
      const m = this.tubeMats[i];
      m.uniforms.uColorA.value.copy(cols[i]);
      m.uniforms.uColorB.value.set(0.9, 0.85, 0.8);
      m.uniforms.uTime.value = t;
      m.uniforms.uFlare.value = energy;
    });
    this.shell.uniforms.uGlow.value = 0.8 + 0.8 * energy;

    // Gluon sparks: ten per tube, running out from the junction.
    const sp = this.sparks.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < 3; i++) {
      for (let k = 0; k < 10; k++) {
        const u = (t * 1.3 + k / 10 + i * 0.33) % 1;
        const p = junction.clone().lerp(qp[i], u);
        sp.setXYZ(i * 10 + k, p.x, p.y, p.z);
      }
    }
    sp.needsUpdate = true;

    // Sea pairs: more of them while notes ring.
    const pos = this.sea.geometry.attributes.position as THREE.BufferAttribute;
    const col = this.sea.geometry.attributes.color as THREE.BufferAttribute;
    this.seaEvents.forEach((e, i) => {
      const age = (t - e.t0) / e.life;
      const alive = age > 0 && age < 1 && (i % 3 !== 0 || energy > 0.15);
      const sep = Math.sin(Math.PI * Math.max(0, Math.min(age, 1))) * 0.9;
      const c = COLOURS[e.colour];
      const anti = new THREE.Color(1 - c.r * 0.7, 1 - c.g * 0.7, 1 - c.b * 0.7);
      const a = alive ? e.at.clone().addScaledVector(e.axis, sep) : new THREE.Vector3(1e6, 1e6, 1e6);
      const b = alive ? e.at.clone().addScaledVector(e.axis, -sep) : a;
      // The annihilation flash at the very end.
      const flash = alive && age > 0.88 ? (age - 0.88) / 0.12 : 0;
      pos.setXYZ(i * 3, a.x, a.y, a.z);
      pos.setXYZ(i * 3 + 1, b.x, b.y, b.z);
      pos.setXYZ(i * 3 + 2, alive ? e.at.x : 1e6, e.at.y, e.at.z);
      col.setXYZ(i * 3, c.r, c.g, c.b);
      col.setXYZ(i * 3 + 1, anti.r, anti.g, anti.b);
      col.setXYZ(i * 3 + 2, flash * 2, flash * 1.8, flash * 1.5);
    });
    pos.needsUpdate = true;
    col.needsUpdate = true;

    // Camera: arrive from the nucleus side, then circle the proton slowly.
    const width = Math.pow(10, ctx.L + 16);
    const a = 0.4 + t * 0.05 + Math.max(t - 18, 0) * 0.16;
    const dir = new THREE.Vector3(Math.sin(a), 0.3 + 0.1 * Math.sin(t * 0.3), Math.cos(a)).normalize();
    aim(this.camera, new THREE.Vector3(), dir, width, ctx.aspect);
  }
}
