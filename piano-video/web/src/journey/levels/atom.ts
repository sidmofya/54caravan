// 10⁻¹⁰ m: one iron atom, in picometres.
//
// Iron's 26 electrons as probability clouds: [Ar] 3d⁶ 4s². Each orbital is
// sampled from a hydrogen-like wavefunction of the right shape, scaled so
// its outermost peak sits at iron's real orbital radius. The nucleus at the
// centre is far too small to see. Each note lifts an electron, which falls
// back and gives off a photon.

import * as THREE from "three";
import { rng } from "../../rng";
import type { Choreography } from "../choreography";
import { aim, glowTexture, smoothstep, type FrameContext, type Level } from "../level";

type Angular = (x: number, y: number, z: number) => number; // |Y|² shape, max 1, on the unit sphere

interface Orbital {
  name: string;
  n: number;
  l: number;
  radial: (r: number) => number; // hydrogen R_nl(r), r in Bohr radii, unnormalised
  rmax: number; // iron's orbital radius (outermost peak), pm
  angular: Angular;
  count: number;
  color: [number, number, number];
  size: number; // point size as a fraction of rmax
  gain: number; // brightness
}

const s: Angular = () => 1;
const px: Angular = (x) => x * x;
const py: Angular = (_x, y) => y * y;
const pz: Angular = (_x, _y, z) => z * z;
const dxy: Angular = (x, y) => 4 * x * x * y * y;
const dxz: Angular = (x, _y, z) => 4 * x * x * z * z;
const dyz: Angular = (_x, y, z) => 4 * y * y * z * z;
const dx2y2: Angular = (x, y) => (x * x - y * y) ** 2;
const dz2: Angular = (_x, _y, z) => (3 * z * z - 1) ** 2 / 4;

const R10 = (r: number) => Math.exp(-r);
const R20 = (r: number) => (2 - r) * Math.exp(-r / 2);
const R21 = (r: number) => r * Math.exp(-r / 2);
const R30 = (r: number) => (27 - 18 * r + 2 * r * r) * Math.exp(-r / 3);
const R31 = (r: number) => r * (6 - r) * Math.exp(-r / 3);
const R32 = (r: number) => r * r * Math.exp(-r / 3);
const R40 = (r: number) => (192 - 144 * r + 24 * r * r - r ** 3) * Math.exp(-r / 4);

const WHITE: [number, number, number] = [1, 0.95, 0.85];
const GOLD: [number, number, number] = [1, 0.8, 0.45];
const TEAL: [number, number, number] = [0.3, 0.85, 0.85];
const AMBER: [number, number, number] = [1, 0.55, 0.2];
const BLUE: [number, number, number] = [0.3, 0.5, 1];

const ORBITALS: Orbital[] = [
  { name: "1s", n: 1, l: 0, radial: R10, rmax: 2, angular: s, count: 3000, color: WHITE, size: 0.05, gain: 1.3 },
  { name: "2s", n: 2, l: 0, radial: R20, rmax: 9, angular: s, count: 3000, color: GOLD, size: 0.045, gain: 0.9 },
  { name: "2px", n: 2, l: 1, radial: R21, rmax: 8, angular: px, count: 2200, color: GOLD, size: 0.045, gain: 0.9 },
  { name: "2py", n: 2, l: 1, radial: R21, rmax: 8, angular: py, count: 2200, color: GOLD, size: 0.045, gain: 0.9 },
  { name: "2pz", n: 2, l: 1, radial: R21, rmax: 8, angular: pz, count: 2200, color: GOLD, size: 0.045, gain: 0.9 },
  { name: "3s", n: 3, l: 0, radial: R30, rmax: 27, angular: s, count: 3500, color: TEAL, size: 0.04, gain: 0.7 },
  { name: "3px", n: 3, l: 1, radial: R31, rmax: 28, angular: px, count: 3000, color: TEAL, size: 0.04, gain: 0.7 },
  { name: "3py", n: 3, l: 1, radial: R31, rmax: 28, angular: py, count: 3000, color: TEAL, size: 0.04, gain: 0.7 },
  { name: "3pz", n: 3, l: 1, radial: R31, rmax: 28, angular: pz, count: 3000, color: TEAL, size: 0.04, gain: 0.7 },
  { name: "3dxy", n: 3, l: 2, radial: R32, rmax: 32, angular: dxy, count: 5000, color: AMBER, size: 0.035, gain: 1.0 },
  { name: "3dxz", n: 3, l: 2, radial: R32, rmax: 32, angular: dxz, count: 5000, color: AMBER, size: 0.035, gain: 1.0 },
  { name: "3dyz", n: 3, l: 2, radial: R32, rmax: 32, angular: dyz, count: 5000, color: AMBER, size: 0.035, gain: 1.0 },
  { name: "3dx2y2", n: 3, l: 2, radial: R32, rmax: 32, angular: dx2y2, count: 5000, color: AMBER, size: 0.035, gain: 1.0 },
  { name: "3dz2", n: 3, l: 2, radial: R32, rmax: 32, angular: dz2, count: 5000, color: AMBER, size: 0.035, gain: 1.0 },
  { name: "4s", n: 4, l: 0, radial: R40, rmax: 122, angular: s, count: 18000, color: BLUE, size: 0.035, gain: 0.35 },
];

/** Sample points from |ψ|² for one orbital, deterministically. */
export function sampleOrbital(o: Orbital, R: () => number): Float32Array {
  // Radial: inverse CDF of r²R(r)² on a fine grid (Bohr radii).
  const rMaxGrid = 12 * o.n * o.n;
  const N = 4000;
  const cdf = new Float64Array(N + 1);
  let peak = 0;
  let peakR = 0;
  for (let i = 1; i <= N; i++) {
    const r = (i / N) * rMaxGrid;
    const p = r * r * o.radial(r) ** 2;
    cdf[i] = cdf[i - 1] + p;
    if (p > peak) {
      peak = p;
      peakR = r;
    }
  }
  // Scale so the outermost local maximum lands on iron's orbital radius.
  let outer = peakR;
  for (let i = N - 1; i > 1; i--) {
    const r = (i / N) * rMaxGrid;
    const a = (r - rMaxGrid / N) ** 2 * o.radial(r - rMaxGrid / N) ** 2;
    const b = r * r * o.radial(r) ** 2;
    const c = (r + rMaxGrid / N) ** 2 * o.radial(r + rMaxGrid / N) ** 2;
    if (b >= a && b >= c && b > peak * 0.05) {
      outer = r;
      break;
    }
  }
  const scale = o.rmax / outer;
  const out = new Float32Array(o.count * 3);
  for (let k = 0; k < o.count; k++) {
    const target = R() * cdf[N];
    let lo = 0;
    let hi = N;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] < target) lo = mid;
      else hi = mid;
    }
    const r = ((lo + R()) / N) * rMaxGrid * scale;
    // Angular: rejection sampling on the unit sphere.
    let x = 0;
    let y = 0;
    let z = 0;
    for (;;) {
      z = 2 * R() - 1;
      const phi = R() * Math.PI * 2;
      const rho = Math.sqrt(1 - z * z);
      x = rho * Math.cos(phi);
      y = rho * Math.sin(phi);
      if (R() <= o.angular(x, y, z)) break;
    }
    out.set([x * r, y * r, z * r], k * 3);
  }
  return out;
}

const cloudVertex = /* glsl */ `
  attribute vec3 color;
  attribute float size;
  attribute float shell;
  attribute float orbital;
  uniform float uScale;
  uniform float uOrb[${ORBITALS.length}];
  uniform float uNear;
  uniform float uExcite[4]; // per shell group: 1s2s2p, 3s3p, 3d, 4s
  uniform float uTime;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    // Each shell turns slowly on its own axis.
    float a = uTime * (0.08 + 0.05 * shell);
    mat3 rot = mat3(cos(a), 0.0, -sin(a), 0.0, 1.0, 0.0, sin(a), 0.0, cos(a));
    vec3 p = rot * position;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float px = size * uScale / -mv.z;
    gl_PointSize = clamp(px, 1.0, 18.0);
    float e = shell < 0.5 ? uExcite[0] : shell < 1.5 ? uExcite[1] : shell < 2.5 ? uExcite[2] : uExcite[3];
    vColor = color * (1.0 + 2.5 * e) * uOrb[int(orbital + 0.5)];
    // Tiny points fade rather than flicker; points near the lens fade out of the way.
    vAlpha = clamp(px / 3.0, 0.15, 1.0) * smoothstep(uNear * 0.25, uNear, -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;

const cloudFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(c, c);
    if (r2 > 1.0) discard;
    gl_FragColor = vec4(vColor * pow(1.0 - r2, 2.0) * 0.05 * vAlpha, 1.0);
  }`;

export class AtomLevel implements Level {
  readonly id = "atom" as const;
  readonly unitExp = -12;
  readonly bloom = 0.35;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.001, 1e6);
  private readonly uniforms: Record<string, THREE.IUniform>;
  private readonly photons: THREE.Points;
  private readonly core: THREE.Sprite;
  private readonly cloud: THREE.Points;

  constructor(private readonly ch: Choreography) {
    this.scene.background = new THREE.Color(0x020309);
    const R = rng(2026);
    const pos: number[] = [];
    const col: number[] = [];
    const size: number[] = [];
    const shell: number[] = [];
    const orbIndex: number[] = [];
    ORBITALS.forEach((o, oi) => {
      const pts = sampleOrbital(o, R);
      const group = o.n <= 2 ? 0 : o.name.startsWith("3d") ? 2 : o.n === 3 ? 1 : 3;
      for (let k = 0; k < o.count; k++) {
        pos.push(pts[k * 3], pts[k * 3 + 1], pts[k * 3 + 2]);
        col.push(o.color[0] * o.gain, o.color[1] * o.gain, o.color[2] * o.gain);
        size.push(o.rmax * o.size);
        shell.push(group);
        orbIndex.push(oi);
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute("size", new THREE.Float32BufferAttribute(size, 1));
    geo.setAttribute("shell", new THREE.Float32BufferAttribute(shell, 1));
    geo.setAttribute("orbital", new THREE.Float32BufferAttribute(orbIndex, 1));
    this.uniforms = {
      uScale: { value: 500 },
      uExcite: { value: [0, 0, 0, 0] },
      uTime: { value: 0 },
      uOrb: { value: ORBITALS.map((o) => (o.name === "3dxy" ? 1.8 : o.name.startsWith("3d") ? 0.55 : 1)) },
      uNear: { value: 1 },
    };
    const cloud = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: cloudVertex,
        fragmentShader: cloudFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    cloud.frustumCulled = false;
    this.scene.add(cloud);
    this.cloud = cloud;

    // The nucleus: far too small to see, marked by a pinprick of light.
    this.core = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture(64, 3), color: 0xffd9a0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.scene.add(this.core);

    // Photons: a short bright dash flying out each time a note excites an electron.
    const photonGeo = new THREE.BufferGeometry();
    photonGeo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(8 * 3 * 6), 3));
    this.photons = new THREE.Points(
      photonGeo,
      new THREE.PointsMaterial({ color: 0xfff0d0, size: 6, sizeAttenuation: false, map: glowTexture(32, 2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.photons.frustumCulled = false;
    this.scene.add(this.photons);
  }

  update(ctx: FrameContext) {
    const u = this.uniforms;
    u.uTime.value = ctx.t;
    u.uScale.value = ctx.height / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));

    // Notes excite the outer shells: low notes the 4s haze, high notes the 3d lobes.
    const ex = [0, 0, 0, 0];
    for (const p of ctx.pulses) {
      const g = p.note.p < 50 ? 3 : p.note.p < 60 ? 2 : 1;
      ex[g] += p.strength * Math.exp(-p.age / 0.5);
    }
    u.uExcite.value = ex.map((e) => Math.min(e, 1.2) * 0.4);
    // Each note lights one orbital, so its shape flashes out of the haze:
    // the d cloverleaves for mid notes, p dumbbells high, 4s low.
    const gains = ORBITALS.map((o) => (o.name === "3dxy" ? 1.8 : o.name.startsWith("3d") ? 0.55 : 1));
    for (const p of ctx.pulses) {
      const pick = p.note.p < 48 ? 14 : p.note.p < 62 ? 9 + (p.note.p % 5) : 6 + (p.note.p % 3);
      gains[pick] += 4 * p.strength * Math.exp(-p.age / 0.6);
    }
    // A slow tour: one orbital at a time brightens so its shape stands out.
    const TOUR = [9, 13, 12, 7, 10, 3];
    const step = ctx.t / 0.85;
    const k = Math.floor(step);
    const env = Math.sin(Math.PI * (step - k)) ** 2;
    gains[TOUR[((k % TOUR.length) + TOUR.length) % TOUR.length]] += 2.6 * env;
    // The singing swells the whole cloud: brighter and a touch larger on each phrase.
    const voice = Math.min(ctx.vocal, 1.2);
    u.uOrb.value = gains.map((g) => g * (0.8 + 0.45 * voice));
    this.cloud.scale.setScalar(1 + 0.06 * voice);

    // Photon dashes: each recent note sends one outward, along a direction set by its pitch.
    const pos = this.photons.geometry.attributes.position as THREE.BufferAttribute;
    const recent = ctx.pulses.slice(-6);
    for (let i = 0; i < 6; i++) {
      const p = recent[i];
      for (let k = 0; k < 8; k++) {
        const idx = i * 8 + k;
        if (!p || p.age > 1.6) {
          pos.setXYZ(idx, 1e7, 1e7, 1e7);
          continue;
        }
        const th = p.note.p * 2.399;
        const ph = Math.acos(((p.note.p * 0.618) % 2) - 1);
        const dir = new THREE.Vector3(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th));
        const r = 40 + p.age * 260 - k * 6;
        pos.setXYZ(idx, dir.x * r, dir.y * r, dir.z * r);
      }
    }
    pos.needsUpdate = true;

    // Camera: drift round the atom while falling toward its centre.
    const width = Math.pow(10, ctx.L + 12);
    const orbit = 0.6 + ctx.t * 0.12;
    const tilt = 0.35 - 0.2 * smoothstep(-9.2, -11.8, ctx.L);
    const dir = new THREE.Vector3(Math.sin(orbit) * Math.cos(tilt), Math.sin(tilt), Math.cos(orbit) * Math.cos(tilt));
    aim(this.camera, new THREE.Vector3(), dir, width, ctx.aspect);
    u.uNear.value = this.camera.position.length() * 0.45;
    this.core.scale.setScalar(width * 0.012);
  }
}
