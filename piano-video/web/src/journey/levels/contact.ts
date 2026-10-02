// 10⁻⁴ m: where felt meets steel, in micrometres.
//
// The string is a steel wall 1.2 mm across, its surface scored with drawing
// marks. Pressed against it, the felt's surface: crimped wool fibres about
// 25 µm thick, each sheathed in overlapping cuticle scales.

import * as THREE from "three";
import { rng } from "../../rng";
import type { Choreography } from "../choreography";
import { aim, pulseEnergy, reflectMetals, smoothstep, type FrameContext, type Level } from "../level";
import { NOISE_GLSL, proceduralMaterial } from "../shaders";

const R_STRING = 590; // µm
const INDENT = 260; // how far the string has pressed into the felt, µm

/** The steel surface's z across x (the wire's axis is at z = -R). */
const steelSurface = (x: number) => (Math.abs(x) < R_STRING ? -R_STRING + Math.sqrt(R_STRING ** 2 - x * x) : -1e4);
/** The felt surface's z: flat at -INDENT, hugging the wire where it presses in. */
const feltSurface = (x: number) => {
  const a = steelSurface(x);
  const b = -INDENT;
  const k = 25; // smooth max, µm
  return Math.max(a, b) + k * Math.log1p(Math.exp(-Math.abs(a - b) / k));
};
/** Where the flat felt meets the wire's flank: the wedge the camera looks into. */
const WEDGE_X = Math.sqrt(R_STRING ** 2 - (R_STRING - INDENT) ** 2);

function woolMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xeadbc4, roughness: 0.55 });
  const key = "wool-cuticle";
  mat.customProgramCacheKey = () => key;
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aS;\nvarying float vS;\nvarying float vAround;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvS = aS;\nvAround = uv.y;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying float vS;\nvarying float vAround;\n${NOISE_GLSL}`)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        // Cuticle scales: ragged rings every ~9 µm along the fibre, edges catching light.
        float ragged = vnoise(vec3(vAround * 7.0, vS * 0.11, 0.0)) * 0.55;
        float ring = fract(vS / 9.0 + ragged);
        float edge = smoothstep(0.82, 0.97, ring);
        diffuseColor.rgb *= 0.82 + 0.3 * edge + 0.08 * vnoise(vec3(vS * 0.05, vAround * 3.0, 1.0));`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        // A little light through the fibre, as wool is translucent.
        "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(0.16, 0.12, 0.08);",
      );
  };
  return mat;
}

/** A crimped wool fibre lying roughly along `dir` across the felt surface. */
function fibreGeometry(R: () => number, length: number, radius: number): THREE.TubeGeometry {
  const pts: THREE.Vector3[] = [];
  const n = 24;
  const crimpWave = 180 + R() * 220; // µm
  const phase = R() * 6.28;
  for (let k = 0; k <= n; k++) {
    const s = (k / n - 0.5) * length;
    pts.push(new THREE.Vector3(s, Math.sin((s / crimpWave) * 6.28 + phase) * 35, Math.cos((s / crimpWave) * 4.1 + phase) * 22));
  }
  const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, radius, 10, false);
  const uv = geo.attributes.uv;
  const aS = new Float32Array(uv.count);
  for (let i = 0; i < uv.count; i++) aS[i] = uv.getX(i) * length;
  geo.setAttribute("aS", new THREE.BufferAttribute(aS, 1));
  return geo;
}

export class ContactLevel implements Level {
  readonly id = "contact" as const;
  readonly unitExp = -6;
  readonly bloom = 0.3;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.1, 1e5);
  private readonly sheen: { uSheen: { value: number }; uSheenY: { value: number } };
  private readonly rim: THREE.DirectionalLight;

  constructor(
    private readonly ch: Choreography,
    renderer: THREE.WebGLRenderer,
  ) {
    this.scene.background = new THREE.Color(0x0b0806);
    this.scene.fog = new THREE.FogExp2(0x0b0806, 0.00028);

    // The steel string: its axis runs along y, its surface touches the felt at the origin.
    this.sheen = { uSheen: { value: 0 }, uSheenY: { value: 0 } };
    const steel = proceduralMaterial(
      { color: 0xc9cdd2, metalness: 1, roughness: 0.3 },
      /* glsl */ `
        // Drawing marks: grooves a few µm apart running along the wire, with scratches.
        float a = atan(vObj.x, vObj.z) * ${R_STRING.toFixed(1)};
        float g = vnoise(vec3(a * 0.35, vObj.y * 0.004, 0.0));
        float g2 = vnoise(vec3(a * 1.6, vObj.y * 0.02, 3.0));
        float scratch = smoothstep(0.93, 1.0, vnoise(vec3(a * 0.05 + vObj.y * 0.03, vObj.y * 0.002, 7.0)));
        albedo *= 0.8 + 0.18 * g + 0.1 * g2 - 0.25 * scratch;
        rough = 0.18 + 0.3 * g2 + 0.3 * scratch;
        // Each note sends a band of light along the wire.
        albedo += vec3(1.0, 0.78, 0.5) * uSheen * exp(-pow((vObj.y - uSheenY) / 140.0, 2.0)) * 0.6;
      `,
      this.sheen,
    );
    const string = new THREE.Mesh(new THREE.CylinderGeometry(R_STRING, R_STRING, 12000, 160, 60), steel);
    string.position.set(0, 0, -R_STRING);
    string.receiveShadow = true;
    this.scene.add(string);

    // The felt bulk behind the surface fibres.
    const bulk = new THREE.Mesh(
      new THREE.PlaneGeometry(9000, 9000, 120, 120),
      proceduralMaterial(
        { color: 0xb59c7e, roughness: 1 },
        /* glsl */ `
          vec3 q = vObj * 0.001; // to mm
          vec3 w = vec3(fbm(q * 40.0), fbm(q * 40.0 + 5.2), 0.0);
          float r = 1.0 - abs(2.0 * vnoise((q + w * 0.02) * 60.0) - 1.0);
          albedo *= 0.5 + 0.6 * pow(r, 4.0);
        `,
      ),
    );
    // Shape the bulk into the groove the string presses into it.
    const bp = bulk.geometry.attributes.position;
    for (let i = 0; i < bp.count; i++) bp.setZ(i, feltSurface(bp.getX(i)) + 90);
    bulk.geometry.computeVertexNormals();
    bulk.material.side = THREE.DoubleSide;
    bulk.receiveShadow = true;
    this.scene.add(bulk);

    // Surface fibres: a dozen shapes, placed many times across the felt.
    const R = rng(311);
    const wool = woolMaterial();
    const shapes = Array.from({ length: 12 }, () => fibreGeometry(R, 1400 + R() * 2600, 10 + R() * 5));
    const dummy = new THREE.Object3D();
    for (const geo of shapes) {
      const count = 16;
      const mesh = new THREE.InstancedMesh(geo, wool, count);
      for (let i = 0; i < count; i++) {
        const x = (R() - 0.5) * 6000;
        const y = (R() - 0.5) * 6000;
        // Fibres pile in layers; near the string they're pressed flat into the groove.
        const lift = R() * 80;
        dummy.position.set(x, y, feltSurface(x) + lift);
        dummy.rotation.set((R() - 0.5) * 0.3, (R() - 0.5) * 0.3, R() * Math.PI);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
    // Fibres running across the contact, following the felt into the wedge
    // and vanishing under the steel.
    for (let i = 0; i < 14; i++) {
      const y0 = (i - 6.5) * 140 + (R() - 0.5) * 60;
      const slope = (R() - 0.5) * 0.25;
      const phase = R() * 6.28;
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 40; k++) {
        const x = -400 + k * 60;
        pts.push(new THREE.Vector3(x, y0 + x * slope + Math.sin(x / 70 + phase) * 18, feltSurface(x) - 9 - Math.max(0, Math.sin(x / 90 + phase)) * 8));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const geo = new THREE.TubeGeometry(curve, 200, 11 + R() * 3, 10, false);
      const uv = geo.attributes.uv;
      const aS = new Float32Array(uv.count);
      const len = curve.getLength();
      for (let j = 0; j < uv.count; j++) aS[j] = uv.getX(j) * len;
      geo.setAttribute("aS", new THREE.BufferAttribute(aS, 1));
      const m = new THREE.Mesh(geo, wool);
      m.castShadow = m.receiveShadow = true;
      this.scene.add(m);
    }

    this.scene.add(new THREE.HemisphereLight(0xffe7c8, 0x1a120a, 0.35));
    const key = new THREE.DirectionalLight(0xffd8a8, 3);
    key.position.set(-3000, 2500, -4000);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera;
    sc.left = sc.bottom = -2500;
    sc.right = sc.top = 2500;
    sc.near = 100;
    sc.far = 20000;
    key.shadow.bias = -0.0004;
    this.scene.add(key);
    this.rim = new THREE.DirectionalLight(0xa8c4ff, 1.4);
    this.rim.position.set(4000, -1000, -1500);
    this.scene.add(this.rim);
    reflectMetals(this.scene, renderer, 0.6);
  }

  update(ctx: FrameContext) {
    // Camera: from behind the strings and off to the side, closing on the
    // wedge where the felt meets the wire's flank, along its bisector.
    const width = Math.pow(10, ctx.L + 6);
    const u = smoothstep(-2.75, -4.1, ctx.L);
    const target = new THREE.Vector3(
      THREE.MathUtils.lerp(WEDGE_X + 500, WEDGE_X + 25, u),
      THREE.MathUtils.lerp(0, 60, u),
      THREE.MathUtils.lerp(-INDENT, -INDENT - 10, u),
    );
    const dir = new THREE.Vector3(THREE.MathUtils.lerp(0.45, 0.88, u), THREE.MathUtils.lerp(0.25, 0.22, u), THREE.MathUtils.lerp(-1, -0.47, u)).normalize();
    aim(this.camera, target, dir, width, ctx.aspect);

    // The newest note's light runs along the wire.
    const latest = ctx.pulses.length ? ctx.pulses[ctx.pulses.length - 1] : null;
    this.sheen.uSheen.value = Math.min(pulseEnergy(ctx.pulses) * 1.5, 1.5);
    this.sheen.uSheenY.value = latest ? -3000 + latest.age * 4500 : 0;
    this.rim.intensity = 1.4 + pulseEnergy(ctx.pulses);
  }
}
