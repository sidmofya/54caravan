// 10⁻⁶ m: inside the wire, in nanometres.
//
// Piano wire is cold-drawn pearlitic steel: colonies a few micrometres
// across, each a stack of alternating plates of soft iron (ferrite) and hard
// iron carbide (cementite), about 100 nm apart and drawn out along the wire.
// Seen etched, like a micrograph: the carbide plates stand proud. We fall
// toward one colony and fly down a ferrite channel between two plates.

import * as THREE from "three";
import { rng } from "../../rng";
import type { Choreography } from "../choreography";
import { aim, pulseEnergy, smoothstep, type FrameContext, type Level } from "../level";
import { NOISE_GLSL } from "../shaders";

const SPACING = 100; // nm between cementite plates
const PLATE_T = 14; // plate thickness, nm
const PLATE_H = 60; // how far plates stand above the etched ferrite, nm
const COLONY = 4200; // half-size of the colony built in 3D, nm
const CELL = 4800; // colony (Voronoi cell) scale, nm

/** The shader's hash22, in JS, to put the origin exactly on a colony's seed point. */
function hash22(x: number, y: number): [number, number] {
  const fr = (v: number) => v - Math.floor(v);
  let a = [fr(x * 0.1031), fr(y * 0.103), fr(x * 0.0973)];
  const d = a[0] * (a[1] + 33.33) + a[1] * (a[2] + 33.33) + a[2] * (a[0] + 33.33);
  a = a.map((v) => v + d);
  return [fr((a[0] + a[1]) * a[2]), fr((a[0] + a[2]) * a[1])];
}
const SEED = hash22(0, 0);

const fieldShader = {
  uniforms: {
    uSpacing: { value: SPACING },
    uPulse: { value: 0 },
    uWave: { value: 0 },
    uLight: { value: new THREE.Vector3(-0.6, 0.45, 0.3).normalize() },
    uBuilt: { value: 0 },
    uSeed: { value: new THREE.Vector2(SEED[0], SEED[1]) },
  },
  vertexShader: /* glsl */ `
    #include <fog_pars_vertex>
    varying vec3 vPos;
    void main() {
      vPos = (modelMatrix * vec4(position, 1.0)).xyz;
      vec4 mvPosition = viewMatrix * vec4(vPos, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`,
  fragmentShader: /* glsl */ `
    uniform float uSpacing;
    uniform float uPulse;
    uniform float uWave;
    uniform vec3 uLight;
    uniform float uBuilt;
    uniform vec2 uSeed;
    varying vec3 vPos;
    #include <fog_pars_fragment>
    ${NOISE_GLSL}
    vec2 hash22(vec2 p) {
      vec3 a = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
      a += dot(a, a.yzx + 33.33);
      return fract((a.xx + a.yz) * a.zy);
    }
    void main() {
      // Colonies: Voronoi cells a few µm across, each with its own plate angle.
      vec2 p = vPos.xz / ${CELL.toFixed(1)} + uSeed; // origin sits on colony (0,0)'s seed
      vec2 ip = floor(p), fp = fract(p);
      float best = 9.0, second = 9.0; vec2 cell = vec2(0.0);
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j));
        vec2 o = hash22(ip + g);
        float d = length(g + o - fp);
        if (d < best) { second = best; best = d; cell = ip + g; } else if (d < second) { second = d; }
      }
      vec2 h = hash22(cell * 1.7 + 3.0);
      // Drawing lines the plates up with the wire (x), give or take.
      float ang = (h.x - 0.5) * 0.9;
      // The colony we fly into lines up with the wire exactly; up close its
      // plates are real 3D geometry standing on a plain ferrite floor.
      bool home = cell == vec2(0.0);
      if (home) ang = 0.0;
      vec2 n = vec2(-sin(ang), cos(ang));
      float spacing = uSpacing * (0.7 + 0.6 * h.y);
      float wobble = home ? 0.0 : fbm(vec3(vPos.xz / 900.0, h.x * 10.0)) * 2.0;
      float s = dot(vPos.xz, n) / spacing + wobble;
      float stripe = abs(fract(s) - 0.5) * 2.0; // 0 on a plate, 1 midway
      float aa = fwidth(s) * 2.0;
      float plate = 1.0 - smoothstep(0.14 - aa, 0.14 + aa, stripe);
      float resolved = clamp(1.0 - fwidth(s) * 1.6, 0.0, 1.0);
      plate = mix(0.14, plate, resolved);
      if (home) plate *= 1.0 - uBuilt;
      // Micrograph palette: steel-blue ferrite, bright carbide edges, dark grain boundaries.
      float boundary = smoothstep(0.06, 0.0, second - best);
      vec3 ferrite = vec3(0.16, 0.19, 0.24) * (0.85 + 0.3 * fbm(vec3(vPos.xz / 1500.0, 2.0)));
      vec3 carbide = vec3(0.86, 0.88, 0.92);
      vec3 col = mix(ferrite, carbide, plate) * (1.0 - 0.6 * boundary);
      col *= 0.9 + 0.2 * vnoise(vec3(vPos.xz / 6.0, 4.0)); // fine etch texture
      // Sideways relief so distant plates still read as ridges.
      col *= 0.8 + 0.4 * dot(normalize(vec3(n.x * (0.5 - stripe), 1.0, n.y * (0.5 - stripe))), uLight) * resolved;
      // A note's wave crossing the steel.
      col += vec3(1.0, 0.75, 0.45) * uPulse * exp(-pow((vPos.x - uWave) / 600.0, 2.0)) * 0.35;
      gl_FragColor = vec4(col, 1.0);
      #include <fog_fragment>
    }`,
};

export class PearliteLevel implements Level {
  readonly id = "pearlite" as const;
  readonly unitExp = -9;
  readonly bloom = 0.25;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.1, 1e7);
  private readonly field: THREE.ShaderMaterial;
  private readonly plates: THREE.InstancedMesh;
  private readonly plateUniforms = { uWaveX: { value: 0 }, uAmp: { value: 0 } };

  constructor(private readonly ch: Choreography) {
    this.scene.background = new THREE.Color(0x07090c);
    this.scene.fog = new THREE.FogExp2(0x07090c, 0);

    this.field = new THREE.ShaderMaterial({
      ...fieldShader,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, fieldShader.uniforms]),
      fog: true,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(400000, 400000), this.field);
    plane.rotation.x = -Math.PI / 2;
    this.scene.add(plane);

    // The colony in 3D: cementite plates standing on the ferrite floor.
    const R = rng(77);
    const count = Math.floor((2 * COLONY) / SPACING);
    const geo = new THREE.BoxGeometry(1, 1, 1, 120, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0xd8dde6, metalness: 0.25, roughness: 0.38 });
    const uniforms = this.plateUniforms;
    mat.customProgramCacheKey = () => "cementite";
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uWaveX;\nuniform float uAmp;")
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
          vec4 wp = instanceMatrix * vec4(position, 1.0);
          // Plates curl a little along their length, and ripple as a note passes.
          float bend = 7.0 * sin(wp.x / 420.0 + instanceMatrix[3].z * 0.013);
          float ripple = uAmp * exp(-pow((wp.x - uWaveX) / 700.0, 2.0)) * sin(wp.x / 140.0);
          transformed.z += (bend + ripple) / max(length(instanceMatrix[2].xyz), 1e-3);
          transformed.y += ripple * 0.6 / max(length(instanceMatrix[1].xyz), 1e-3);
          #endif`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\n" + NOISE_GLSL)
        .replace(
          "#include <color_fragment>",
          // Etched carbide: faintly pitted, banded where the plate grew.
          "#include <color_fragment>\ndiffuseColor.rgb *= 0.82 + 0.25 * vnoise(vViewPosition * 0.15) + 0.08 * sin(vViewPosition.y * 0.9);",
        );
    };
    this.plates = new THREE.InstancedMesh(geo, mat, count * 2);
    const dummy = new THREE.Object3D();
    let n = 0;
    for (let k = 0; k < count; k++) {
      const z = (k - count / 2 + 0.5) * SPACING;
      // Some plates break, leaving two shorter pieces.
      const broken = R() < 0.25;
      const pieces = broken ? 2 : 1;
      for (let piece = 0; piece < pieces; piece++) {
        const len = broken ? COLONY * (0.6 + R() * 0.5) : 2 * COLONY;
        const x = broken ? (piece === 0 ? -COLONY + len / 2 : COLONY - len / 2) : 0;
        dummy.position.set(x, PLATE_H / 2, z);
        dummy.scale.set(len, PLATE_H * (0.85 + R() * 0.3), PLATE_T * (0.8 + R() * 0.4));
        dummy.updateMatrix();
        this.plates.setMatrixAt(n++, dummy.matrix);
      }
    }
    this.plates.count = n;
    this.plates.visible = false;
    this.plates.castShadow = true;
    this.plates.receiveShadow = true;
    this.scene.add(this.plates);

    this.scene.add(new THREE.HemisphereLight(0xb8c8e8, 0x101418, 0.9));
    const key = new THREE.DirectionalLight(0xfff0dc, 2.6);
    key.position.set(-6000, 4500, 3000);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera;
    sc.left = sc.bottom = -COLONY;
    sc.right = sc.top = COLONY;
    sc.near = 100;
    sc.far = 30000;
    key.shadow.bias = -0.0005;
    this.scene.add(key);
    const warm = new THREE.DirectionalLight(0xffb070, 0.8);
    warm.position.set(5000, 1500, -2000);
    this.scene.add(warm);
  }

  update(ctx: FrameContext) {
    // The newest note sends a ripple along the wire.
    const energy = pulseEnergy(ctx.pulses);
    const latest = ctx.pulses.length ? ctx.pulses[ctx.pulses.length - 1] : null;
    const waveX = latest ? -6000 + latest.age * 7000 : -1e6;
    this.field.uniforms.uPulse.value = Math.min(energy * 1.4, 1.4);
    this.field.uniforms.uWave.value = waveX;
    this.plateUniforms.uWaveX.value = waveX;
    this.plateUniforms.uAmp.value = Math.min(energy, 1) * 6;

    // Real plates take over from painted stripes once they're well resolved.
    const built = smoothstep(-5.2, -5.5, ctx.L);
    this.field.uniforms.uBuilt.value = built;
    this.plates.visible = built > 0;
    this.plates.scale.y = Math.max(built, 0.001);
    // Haze hides the far edges of the built colony.
    (this.scene.fog as THREE.FogExp2).density = 0.3 / Math.pow(10, ctx.L + 9);

    // Camera: fall toward the colony, then level out and fly along the
    // ferrite channel between two plates.
    const width = Math.pow(10, ctx.L + 9);
    const u = smoothstep(-4.1, -7.9, ctx.L);
    const down = new THREE.Vector3(0.3, 0.88, 0.38).normalize();
    const mid = new THREE.Vector3(-0.55, 0.62, 0.25).normalize();
    const along = new THREE.Vector3(-0.97, 0.16, 0.03).normalize();
    const a = smoothstep(0, 0.55, u);
    const b = smoothstep(0.5, 1, u);
    const dir = down.clone().lerp(mid, a).lerp(along, b).normalize();
    const target = new THREE.Vector3(THREE.MathUtils.lerp(1500, 0, a), THREE.MathUtils.lerp(0, 8, b), 0);
    aim(this.camera, target, dir, width, ctx.aspect);
  }
}
