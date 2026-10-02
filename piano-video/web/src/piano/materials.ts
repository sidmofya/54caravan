import * as THREE from "three";

// Shared materials. Colours are picked to match the reference photo:
// white gloss lacquer, a gold cast-iron plate, beige hammer felt, red felt
// accents, brass hardware and copper-wound bass strings.
export const materials = {
  lacquer: new THREE.MeshPhysicalMaterial({
    color: 0xf6f5f1,
    roughness: 0.22,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
  }),
  lacquerInside: new THREE.MeshStandardMaterial({ color: 0xe9e6df, roughness: 0.6 }),
  plate: new THREE.MeshStandardMaterial({ color: 0xc8a862, metalness: 0.85, roughness: 0.38 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xd2b26a, metalness: 0.95, roughness: 0.22 }),
  steel: new THREE.MeshStandardMaterial({ color: 0xd8dadc, metalness: 1, roughness: 0.28 }),
  pin: new THREE.MeshStandardMaterial({ color: 0xb9bcbf, metalness: 1, roughness: 0.3 }),
  copper: new THREE.MeshStandardMaterial({ color: 0xb8743f, metalness: 0.95, roughness: 0.42 }),
  felt: new THREE.MeshStandardMaterial({ color: 0xcfb69a, roughness: 1 }),
  feltUnder: new THREE.MeshStandardMaterial({ color: 0xf1ebe0, roughness: 1 }),
  moulding: new THREE.MeshStandardMaterial({ color: 0xb58d5e, roughness: 0.55 }),
  redFelt: new THREE.MeshStandardMaterial({ color: 0x8e1b26, roughness: 0.95 }),
  greenFelt: new THREE.MeshStandardMaterial({ color: 0x24604f, roughness: 0.95 }),
  wood: new THREE.MeshStandardMaterial({ color: 0xd9c3a0, roughness: 0.7 }),
  darkWood: new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.6 }),
  ivory: new THREE.MeshStandardMaterial({ color: 0xfbfaf6, roughness: 0.28 }),
  ebony: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.22 }),
  shadow: new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 1 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 }),
};

export function box(
  w: number,
  h: number,
  d: number,
  mat: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Box given by its min/max corners, which reads more naturally for cabinet parts. */
export function slab(
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
  mat: THREE.Material,
): THREE.Mesh {
  return box(x1 - x0, y1 - y0, z1 - z0, mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
}
