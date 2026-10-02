// A round, adjustable piano stool: four turned legs, a brass height screw
// and a dark buttoned velvet seat. Origin on the floor at its centre.

import * as THREE from "three";
import { proceduralMaterial } from "../journey/shaders";

export const STOOL = { seatHeight: 0.505, seatRadius: 0.17, legSpread: 0.17 };

export function buildStool(): THREE.Group {
  const g = new THREE.Group();
  g.name = "stool";
  const wood = proceduralMaterial(
    { color: 0x3a2214, roughness: 0.38 },
    /* glsl */ `
      float grain = fract((vObj.y * 40.0 + fbm(vObj * 30.0) * 2.0));
      albedo *= 0.85 + 0.25 * smoothstep(0.3, 0.9, grain);
    `,
  );
  const velvet = proceduralMaterial(
    { color: 0x4a1a1f, roughness: 0.95 },
    /* glsl */ `
      float nap = fbm(vObj * 220.0);
      albedo *= 0.8 + 0.35 * nap;
    `,
  );
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a25a, metalness: 0.9, roughness: 0.3 });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };

  // Turned legs: a lathe profile, splayed slightly outward.
  const profile = [
    [0.014, 0], [0.016, 0.02], [0.013, 0.06], [0.018, 0.12], [0.012, 0.2], [0.014, 0.28],
    [0.021, 0.3], [0.014, 0.32], [0.017, 0.36], [0.02, 0.38],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const legGeo = new THREE.LatheGeometry(profile, 20);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const leg = add(legGeo, wood, Math.cos(a) * STOOL.legSpread, 0, Math.sin(a) * STOOL.legSpread);
    leg.rotation.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12);
    // A brass ferrule at each foot.
    add(new THREE.CylinderGeometry(0.016, 0.017, 0.022, 16), brass, Math.cos(a) * STOOL.legSpread, 0.011, Math.sin(a) * STOOL.legSpread);
  }
  // Stretcher ring between the legs.
  const ring = add(new THREE.TorusGeometry(STOOL.legSpread * 0.88, 0.008, 8, 48), wood, 0, 0.16, 0);
  ring.rotation.x = Math.PI / 2;
  // Apron, height screw and seat.
  add(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 48), wood, 0, 0.405, 0);
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 20), brass, 0, 0.445, 0);
  add(new THREE.CylinderGeometry(0.175, 0.178, 0.018, 48), wood, 0, 0.474, 0);
  // The velvet cushion: a domed lathe with a button at the centre.
  const cushion = [
    [0.0, 0.0], [0.168, 0.0], [0.176, 0.008], [0.172, 0.022], [0.15, 0.03], [0.08, 0.036], [0.0, 0.032],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  add(new THREE.LatheGeometry(cushion, 48), velvet, 0, 0.482, 0);
  add(new THREE.SphereGeometry(0.008, 12, 8), velvet, 0, 0.514, 0);
  return g;
}
