// Shared GLSL: value noise and fbm, and a helper to inject code into
// three's standard material so procedural surfaces keep its lighting.

import * as THREE from "three";

export const NOISE_GLSL = /* glsl */ `
float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash31(i), hash31(i + vec3(1,0,0)), u.x), mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), u.x), u.y),
    mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), u.x), mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), u.x), u.y),
    u.z);
}
float fbm(vec3 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}
`;

/**
 * A MeshStandardMaterial whose albedo and roughness come from GLSL written
 * against the object-space position `vObj` (in the level's units).
 * `colorCode` must set `vec3 albedo` and may set `float rough`.
 */
export function proceduralMaterial(
  params: THREE.MeshStandardMaterialParameters,
  colorCode: string,
  extraUniforms: Record<string, THREE.IUniform> = {},
  vertexCode = "",
): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial(params);
  // three caches programs by onBeforeCompile's source text, which is the
  // same for every material made here, so key each on its own GLSL.
  const key = colorCode + "|" + vertexCode + "|" + Object.keys(extraUniforms).join(",");
  mat.customProgramCacheKey = () => key;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, extraUniforms);
    const uniformDecl = Object.keys(extraUniforms)
      .map((k) => `uniform ${glslType(extraUniforms[k].value)} ${k};`)
      .join("\n");
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\nvarying vec3 vObj;\nvarying vec2 vUv0;\n${uniformDecl}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\nvObj = position;\nvUv0 = uv;\n${vertexCode}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying vec3 vObj;\nvarying vec2 vUv0;\n${uniformDecl}\n${NOISE_GLSL}`)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>\n{ vec3 albedo = diffuseColor.rgb; float rough = roughness; ${colorCode}\n diffuseColor.rgb = albedo; procRough = rough; }`,
      )
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = procRough;")
      .replace("void main() {", "float procRough;\nvoid main() {");
  };
  return mat;
}

function glslType(v: unknown): string {
  if (typeof v === "number") return "float";
  if (v instanceof THREE.Vector2) return "vec2";
  if (v instanceof THREE.Vector3) return "vec3";
  if (v instanceof THREE.Color) return "vec3";
  return "float";
}
