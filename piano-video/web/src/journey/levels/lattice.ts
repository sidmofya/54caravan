// 10⁻⁹ m: the iron crystal, in ångströms.
//
// Inside a ferrite layer the iron atoms sit on a body-centred cubic lattice,
// 2.87 Å on a side. We arrive outside a block of it, looking down one of
// its channels, fly in between the rows, and close on a single atom. The
// atoms jostle with heat; each note sends a phonon, a ripple of the whole
// lattice, travelling down the channel.

import * as THREE from "three";
import type { Choreography } from "../choreography";
import { aim, smoothstep, type FrameContext, type Level } from "../level";

export const A_FE = 2.866; // Å, lattice constant of α-iron
const NX = 20; // cells each way along the channel
const NY = 14;
const NZ = 14;
const MAX_WAVES = 6;

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uSize;
  uniform float uScale;
  uniform vec4 uWave[${MAX_WAVES}]; // x centre, amplitude, wavelength, unused
  attribute float aPhase;
  varying float vGlow;
  varying float vDepth;
  void main() {
    vec3 p = position;
    // Thermal jostling, a few hundredths of an ångström.
    p += 0.07 * vec3(sin(uTime * 2.1 + aPhase), sin(uTime * 1.7 + aPhase * 1.3), sin(uTime * 1.9 + aPhase * 0.7));
    vGlow = 0.0;
    for (int i = 0; i < ${MAX_WAVES}; i++) {
      vec4 w = uWave[i];
      if (w.y <= 0.0) continue;
      float d = p.x - w.x;
      float env = exp(-pow(d / (2.5 * w.z), 2.0));
      float s = sin(6.2831853 * d / w.z);
      p.x += w.y * env * s;
      p.y += w.y * 0.35 * env * cos(6.2831853 * d / w.z);
      vGlow += env * abs(s) * w.y * 3.0;
    }
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vDepth = -mv.z;
    gl_PointSize = uSize * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;

const coreFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uFog;
  varying float vGlow;
  varying float vDepth;
  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(c, c);
    if (r2 > 1.0) discard;
    vec3 n = vec3(c.x, -c.y, sqrt(1.0 - r2));
    vec3 l = normalize(vec3(-0.4, 0.6, 0.7));
    float diff = max(dot(n, l), 0.0);
    float spec = pow(max(dot(reflect(-l, n), vec3(0.0, 0.0, 1.0)), 0.0), 24.0);
    vec3 col = uColor * (0.18 + 0.82 * diff) + vec3(1.0, 0.95, 0.85) * spec * 0.6;
    col += vec3(1.0, 0.7, 0.35) * vGlow;
    float fog = exp(-vDepth * uFog);
    gl_FragColor = vec4(col * fog, 1.0);
  }`;

const haloFragment = /* glsl */ `
  uniform float uFog;
  varying float vGlow;
  varying float vDepth;
  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(c, c);
    if (r2 > 1.0) discard;
    // The atom's outer electrons: a soft blue haze, warmed by a passing wave.
    float a = pow(1.0 - r2, 2.0) * 0.012;
    vec3 col = mix(vec3(0.35, 0.55, 1.0), vec3(1.0, 0.7, 0.4), clamp(vGlow, 0.0, 1.0));
    float fog = exp(-vDepth * uFog * 3.0);
    gl_FragColor = vec4(col * a * (1.0 + vGlow * 4.0) * fog, 1.0);
  }`;

export class LatticeLevel implements Level {
  readonly id = "lattice" as const;
  readonly unitExp = -10;
  readonly bloom = 0.22;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.01, 1e5);
  private readonly uniforms: Record<string, THREE.IUniform>;

  constructor(private readonly ch: Choreography) {
    this.scene.background = new THREE.Color(0x04060b);

    const pos: number[] = [];
    const phase: number[] = [];
    for (let i = -NX; i <= NX; i++) {
      for (let j = -NY; j <= NY; j++) {
        for (let k = -NZ; k <= NZ; k++) {
          for (const half of [0, 0.5]) {
            if (half && (i === NX || j === NY || k === NZ)) continue;
            pos.push((i + half) * A_FE, (j + half) * A_FE, (k + half) * A_FE);
            phase.push(((i * 7.3 + j * 13.1 + k * 3.7 + half * 5) * 2.399) % 6.283);
          }
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("aPhase", new THREE.Float32BufferAttribute(phase, 1));

    this.uniforms = {
      uTime: { value: 0 },
      uSize: { value: 0.55 }, // drawn ion-core diameter, Å
      uScale: { value: 500 },
      uFog: { value: 0.02 },
      uColor: { value: new THREE.Color(0.5, 0.52, 0.56) },
      uWave: { value: Array.from({ length: MAX_WAVES }, () => new THREE.Vector4()) },
    };
    const core = new THREE.Points(geo, new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader, fragmentShader: coreFragment }));
    const haloUniforms = { ...this.uniforms, uSize: { value: 2.4 } };
    const halo = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({
        uniforms: haloUniforms,
        vertexShader,
        fragmentShader: haloFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    core.frustumCulled = halo.frustumCulled = false;
    this.scene.add(core, halo);
  }

  update(ctx: FrameContext) {
    const u = this.uniforms;
    u.uTime.value = ctx.t;
    u.uScale.value = ctx.height / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));

    // Each recent note is a wave packet running down the channel (+x).
    // Higher notes, shorter waves.
    const waves = u.uWave.value as THREE.Vector4[];
    const recent = ctx.pulses.slice(-MAX_WAVES);
    waves.forEach((w, i) => {
      const p = recent[i];
      if (!p) return w.set(0, 0, 1, 0);
      const lambda = THREE.MathUtils.clamp(14 - (p.note.p - 40) * 0.25, 5, 14);
      w.set(-NX * A_FE + p.age * 26, 0.45 * p.strength + 0.08, lambda, 0);
    });

    // Camera: from outside the block, straight down a channel between rows
    // of atoms (at y = a/2, z = 0, every row is 2 Å away), then turn onto
    // one atom in the channel wall.
    const width = Math.pow(10, ctx.L + 10);
    const end = smoothstep(-8.55, -9.2, ctx.L);
    const target = new THREE.Vector3(0, (A_FE / 2) * (1 - end), 0);
    const dir = new THREE.Vector3(-1, 0.22 * end, 0.05 * end).normalize();
    aim(this.camera, target, dir, width, ctx.aspect);
    u.uFog.value = 1.4 / Math.max(width, 4);
  }
}
