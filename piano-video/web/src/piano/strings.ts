import * as THREE from "three";
import {
  BASS_STRING_Z,
  BASS_TILT,
  HAMMER_PITCH,
  HIGHEST,
  LOWEST,
  SECTIONS,
  SPEAKING_TOP,
  STRIKE_Y,
  STRING_BOTTOM,
  STRING_TOP,
  STRING_Z,
  hammerX,
  sectionOf,
  stringCount,
  stringRadius,
} from "./layout";
import { materials as M, slab } from "./materials";

/** x where this note's (centre) string passes height y. Bass strings lean. */
export function stringXAt(p: number, y: number): number {
  const lean = sectionOf(p) === 0 ? Math.tan(BASS_TILT) : 0;
  return hammerX(p) + (STRIKE_Y - y) * lean;
}

interface StringSpec {
  p: number;
  x: number; // at the strike line
  z: number;
  top: number;
  radius: number;
}

function stringSpecs(): StringSpec[] {
  const specs: StringSpec[] = [];
  let n = 0;
  for (let p = LOWEST; p <= HIGHEST; p++) {
    const count = stringCount(p);
    const spacing = sectionOf(p) === 0 ? 0.0046 : 0.0034;
    for (let j = 0; j < count; j++) {
      specs.push({
        p,
        x: hammerX(p) + (j - (count - 1) / 2) * spacing,
        z: sectionOf(p) === 0 ? BASS_STRING_Z : STRING_Z,
        // Tuning pins sit in three staggered rows.
        top: STRING_TOP - (n++ % 3) * 0.017,
        radius: stringRadius(p),
      });
    }
  }
  return specs;
}

const VIB_SCALE = 0.006; // metres of sideways swing at full amplitude, mid-string

/**
 * Strings as instanced cylinders. A vertex shader swings each one sideways
 * by its instance amplitude in a slowed, stylised standing wave (true string
 * frequencies would alias at 30 fps) and adds a faint warm glow.
 */
function vibratingMaterial(base: THREE.MeshStandardMaterial, uniforms: { uTime: { value: number } }) {
  const mat = base.clone();
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute float aAmp;
        attribute float aFreq;
        attribute float aPhase;
        attribute float aRadius;
        attribute float aSpeakFrom; // local y (0..1 from bottom) of the speaking top
        uniform float uTime;
        varying float vAmp;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        float u = clamp((position.y + 0.5) / aSpeakFrom, 0.0, 1.0);
        float shape = pow(sin(3.14159265 * u), 0.55);
        float swing = aAmp * ${VIB_SCALE.toFixed(5)} * shape * sin(6.2831853 * aFreq * uTime + aPhase);
        transformed.x += swing / aRadius;
        vAmp = aAmp * shape;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vAmp;")
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.72, 0.38) * vAmp * 1.3;`,
      );
  };
  return mat;
}

export interface Strings {
  group: THREE.Group;
  update(t: number, amplitude: (p: number) => number): void;
}

export function buildStrings(): Strings {
  const group = new THREE.Group();
  const uniforms = { uTime: { value: 0 } };
  const specs = stringSpecs();
  const tmp = new THREE.Object3D();

  const meshes: { mesh: THREE.InstancedMesh; specs: StringSpec[]; amp: THREE.InstancedBufferAttribute }[] = [];
  for (const [mat, list] of [
    [M.copper, specs.filter((s) => sectionOf(s.p) === 0)],
    [M.steel, specs.filter((s) => sectionOf(s.p) !== 0)],
  ] as const) {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 5, 28, true);
    const count = list.length;
    const attr = (fn: (s: StringSpec) => number) =>
      new THREE.InstancedBufferAttribute(Float32Array.from(list, fn), 1);
    const amp = attr(() => 0);
    amp.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("aAmp", amp);
    geo.setAttribute("aFreq", attr((s) => 5.5 + (6.5 * (s.p - LOWEST)) / (HIGHEST - LOWEST)));
    geo.setAttribute("aPhase", attr((s) => (s.x * 997) % (2 * Math.PI)));
    geo.setAttribute("aRadius", attr((s) => s.radius));
    geo.setAttribute("aSpeakFrom", attr((s) => (SPEAKING_TOP - STRING_BOTTOM) / (s.top - STRING_BOTTOM)));

    const mesh = new THREE.InstancedMesh(geo, vibratingMaterial(mat as THREE.MeshStandardMaterial, uniforms), count);
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    list.forEach((s, i) => {
      const lean = sectionOf(s.p) === 0 ? BASS_TILT : 0;
      const length = (s.top - STRING_BOTTOM) / Math.cos(lean);
      const midY = (s.top + STRING_BOTTOM) / 2;
      tmp.position.set(s.x + (STRIKE_Y - midY) * Math.tan(lean), midY, s.z);
      tmp.rotation.set(0, 0, lean);
      tmp.scale.set(s.radius, length, s.radius);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
    });
    group.add(mesh);
    meshes.push({ mesh, specs: list, amp });
  }

  // Tuning pins at the top of every string, plus their wound coils.
  const pinGeo = new THREE.CylinderGeometry(0.0032, 0.0032, 0.022, 10);
  pinGeo.rotateX(Math.PI / 2);
  const pins = new THREE.InstancedMesh(pinGeo, M.pin, specs.length);
  const coilGeo = new THREE.TorusGeometry(0.0036, 0.0011, 6, 12);
  const coils = new THREE.InstancedMesh(coilGeo, M.steel, specs.length);
  specs.forEach((s, i) => {
    const lean = sectionOf(s.p) === 0 ? Math.tan(BASS_TILT) : 0;
    const x = s.x + (STRIKE_Y - s.top) * lean;
    tmp.rotation.set(0, 0, 0);
    tmp.scale.set(1, 1, 1);
    tmp.position.set(x, s.top, s.z + 0.006);
    tmp.updateMatrix();
    pins.setMatrixAt(i, tmp.matrix);
    tmp.position.set(x, s.top, s.z + 0.001);
    tmp.updateMatrix();
    coils.setMatrixAt(i, tmp.matrix);
  });
  pins.castShadow = true;
  pins.receiveShadow = true;
  group.add(pins, coils);

  // The gold plate behind the strings, with struts in the section gaps.
  const plateL = hammerX(LOWEST) - 0.07;
  const plateR = hammerX(HIGHEST) + 0.05;
  const plate = slab(plateL, plateR, 0.7, 1.19, -0.235, -0.205, M.plate);
  group.add(plate);
  for (let i = 0; i < SECTIONS.length - 1; i++) {
    const x = hammerX(SECTIONS[i].last) + HAMMER_PITCH / 2 + 0.018;
    // The bass/tenor strut stops above the strike line, where the bass crosses over.
    const bottom = i === 0 ? STRIKE_Y + 0.02 : 0.7;
    group.add(slab(x - 0.011, x + 0.011, bottom, 1.185, -0.205, -0.183, M.plate));
  }
  // Pressure bar with screws, and a red felt strip woven through the strings.
  const tenorL = hammerX(SECTIONS[1].first) - 0.012;
  group.add(slab(tenorL, plateR - 0.03, SPEAKING_TOP - 0.006, SPEAKING_TOP + 0.006, STRING_Z + 0.001, STRING_Z + 0.008, M.steel));
  const screwGeo = new THREE.CylinderGeometry(0.0028, 0.0028, 0.004, 12);
  screwGeo.rotateX(Math.PI / 2);
  const screwXs: number[] = [];
  for (let x = tenorL + 0.02; x < plateR - 0.04; x += 0.042) screwXs.push(x);
  const screws = new THREE.InstancedMesh(screwGeo, M.steel, screwXs.length);
  screwXs.forEach((x, i) => {
    tmp.position.set(x, SPEAKING_TOP, STRING_Z + 0.009);
    tmp.updateMatrix();
    screws.setMatrixAt(i, tmp.matrix);
  });
  group.add(screws);
  group.add(slab(tenorL, plateR - 0.03, SPEAKING_TOP + 0.01, SPEAKING_TOP + 0.022, STRING_Z - 0.004, STRING_Z + 0.004, M.redFelt));
  // Brass agraffe bar for the bass.
  const bassL = stringXAt(LOWEST, SPEAKING_TOP) - 0.02;
  const bassR = stringXAt(SECTIONS[0].last, SPEAKING_TOP) + 0.01;
  group.add(slab(bassL, bassR, SPEAKING_TOP - 0.005, SPEAKING_TOP + 0.005, BASS_STRING_Z - 0.004, BASS_STRING_Z + 0.005, M.brass));

  function update(t: number, amplitude: (p: number) => number) {
    uniforms.uTime.value = t;
    for (const { specs: list, amp } of meshes) {
      for (let i = 0; i < list.length; i++) amp.setX(i, amplitude(list[i].p));
      amp.needsUpdate = true;
    }
  }

  return { group, update };
}
