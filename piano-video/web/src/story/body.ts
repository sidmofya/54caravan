// The pianist: a stylised, sculpted woman built in code. She is African,
// with loose natural hair, bare feet, a soft ochre robe over a long cream
// nightdress. Rigid parts ride on the skeleton's joints; cloth and the
// torso are lofts rebuilt each frame so they bend with her.

import * as THREE from "three";
import { rng } from "../rng";
import { proceduralMaterial } from "../journey/shaders";
import { Loft, type Ring } from "./loft";
import { buildRig, DIM, FINGERS, SIDES, sideSign, type Rig, type Side } from "./rig";

export const PALETTE = {
  skin: 0x4a2c1d,
  skinLight: 0x8a5a40, // palms and soles
  lips: 0x3a1f17,
  hair: 0x17110d,
  robe: 0xa8642f, // soft ochre
  robeShade: 0x7a4421,
  nightdress: 0xeee3d0,
};

function skinMaterial() {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.48,
    sheen: 0.5,
    sheenColor: new THREE.Color(0xc08060),
    sheenRoughness: 0.45,
    clearcoat: 0.06,
    clearcoatRoughness: 0.5,
  });
  return m;
}

function clothMaterial(color: number, sheen: number) {
  const c = new THREE.Color(color);
  const m = proceduralMaterial(
    { color: c, roughness: 0.82, side: THREE.DoubleSide },
    /* glsl */ `
      // A soft weave and a few slow folds so the fabric reads as cloth.
      float weave = vnoise(vec3(vUv0 * vec2(160.0, 240.0), 0.0));
      float fold = fbm(vec3(vUv0.x * 9.0, vUv0.y * 3.0, 1.0));
      albedo *= 0.9 + 0.08 * weave + 0.18 * (fold - 0.5);
    `,
  );
  void sheen;
  return m;
}

function hairMaterial() {
  return proceduralMaterial(
    { color: PALETTE.hair, roughness: 0.9 },
    /* glsl */ `
      // Tight coils: high-frequency ridged noise with warm glints.
      vec3 q = vObj * 160.0;
      float coil = 1.0 - abs(2.0 * vnoise(q) - 1.0);
      float coil2 = 1.0 - abs(2.0 * vnoise(q * 2.3 + 7.0) - 1.0);
      float c = pow(coil, 3.0) * 0.6 + pow(coil2, 4.0) * 0.4;
      albedo *= 0.55 + 0.9 * c;
      albedo += vec3(0.05, 0.03, 0.015) * c;
      rough = 0.75 + 0.2 * (1.0 - c);
    `,
  );
}

/** Colour helper for vertex colours. */
const col = (hex: number) => new THREE.Color(hex);

function paint(geo: THREE.BufferGeometry, fn: (p: THREE.Vector3, n: THREE.Vector3) => THREE.Color) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const c = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nor, i);
    const k = fn(p, n);
    c.set([k.r, k.g, k.b], i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(c, 3));
}

const smooth = (e0: number, e1: number, x: number) => {
  const u = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return u * u * (3 - 2 * u);
};
const bump = (x: number, c: number, w: number) => Math.exp(-(((x - c) / w) ** 2));

/**
 * A sculpted head, in the head joint's frame (pivot at the base of the
 * skull, face toward +z). Simplified features: a broad nose, full lips,
 * high cheekbones, closed calm eyes.
 */
function headGeometry(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 96, 72);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const { x, y, z } = v; // unit sphere: y up, z forward
    const front = Math.max(z, 0);
    // Base: narrower jaw and chin, fuller cranium.
    let sx = 0.072 * (1 - 0.28 * smooth(0.1, -0.85, y) * (0.6 + 0.4 * front));
    const sy = 0.112;
    const sz = 0.094 * (1 - 0.18 * smooth(0.0, -0.9, y) * (1 - front));
    // Chin forward a touch, back of head rounder.
    let dz = 0.008 * bump(y, -0.82, 0.15) * front;
    // Cheekbones.
    sx *= 1 + 0.06 * bump(y, -0.05, 0.18) * front;
    // Eye sockets: gentle hollows, with the lids closed and calm.
    const eye = bump(Math.abs(x), 0.36, 0.13) * bump(y, 0.08, 0.08) * front;
    dz -= 0.006 * eye;
    // Brow ridge.
    dz += 0.004 * bump(y, 0.2, 0.06) * bump(x, 0, 0.5) * front;
    // Nose: broad, rounded tip.
    const nose = bump(x, 0, 0.17) * bump(y, -0.2, 0.17) * smooth(0.6, 0.95, z);
    dz += 0.024 * nose * (0.6 + 0.4 * smooth(0.0, -0.3, y));
    const nostrils = bump(Math.abs(x), 0.14, 0.08) * bump(y, -0.32, 0.06) * smooth(0.7, 0.95, z);
    dz += 0.006 * nostrils;
    // Full lips with a soft parting line.
    const lips = bump(x, 0, 0.3) * (bump(y, -0.5, 0.06) + 0.9 * bump(y, -0.6, 0.06)) * smooth(0.7, 0.98, z);
    const parting = bump(x, 0, 0.32) * bump(y, -0.55, 0.012) * smooth(0.8, 0.98, z);
    dz += 0.011 * lips - 0.004 * parting;
    pos.setXYZ(i, x * sx, y * sy + 0.095, z * sz + dz + 0.012);
  }
  geo.computeVertexNormals();
  paint(geo, (p) => {
    // Unit-sphere coordinates recovered from the scaled position.
    const y = (p.y - 0.095) / 0.112;
    const x = p.x / 0.072;
    const lips = bump(x, 0, 0.32) * (bump(y, -0.5, 0.07) + bump(y, -0.6, 0.07));
    const lid = bump(Math.abs(x), 0.36, 0.1) * bump(y, 0.07, 0.025) * (p.z > 0.05 ? 1 : 0);
    const c = col(PALETTE.skin).lerp(col(PALETTE.lips), Math.min(lips * 0.8, 1));
    return c.multiplyScalar(1 - 0.45 * lid);
  });
  return geo;
}

/** Loose natural hair: a full, soft cloud of coils framing the face. */
function hairGeometry(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 72, 54);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  const R = rng(1987);
  const lumps = Array.from({ length: 28 }, () => {
    const d = new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize();
    return { d, s: 0.25 + R() * 0.35, h: 0.03 + R() * 0.05 };
  });
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    let r = 1;
    for (const l of lumps) r += l.h * Math.exp(-(1 - v.dot(l.d)) / (l.s * 0.25));
    // Leave the face open: push the front-lower hair back to a hairline.
    const face = smooth(0.25, 0.75, v.z) * smooth(0.55, -0.1, v.y);
    const x = v.x * 0.155 * r;
    const y = v.y * 0.15 * r;
    const z = v.z * 0.15 * r * (1 - 0.75 * face) - 0.03 * face;
    pos.setXYZ(i, x, y + 0.15, z - 0.012);
  }
  geo.computeVertexNormals();
  return geo;
}

/** A hand's palm, in the wrist joint's frame: fingers along -y, palm toward -z. */
function palmGeometry(thumbSign: number): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 32, 24);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const along = (v.y + 1) / 2; // 0 at the knuckles end, 1 at the wrist
    const w = 0.036 * (1 - 0.18 * along) + 0.004 * Math.max(v.x * thumbSign, 0) * (1 - along);
    pos.setXYZ(i, v.x * w, -DIM.palm / 2 + v.y * DIM.palm * 0.52, v.z * (0.012 + 0.002 * along) - 0.001);
  }
  geo.computeVertexNormals();
  paint(geo, (_p, n) => col(PALETTE.skin).lerp(col(PALETTE.skinLight), smooth(0.1, -0.6, n.z)));
  return geo;
}

function phalanxGeometry(len: number, r: number, last: boolean): THREE.BufferGeometry {
  const geo = new THREE.CapsuleGeometry(r, Math.max(len - r * 0.6, 0.001), 6, 14);
  geo.translate(0, -len / 2, 0);
  if (last) {
    // Taper the fingertip a little.
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const t = smooth(-len * 0.4, -len, pos.getY(i));
      pos.setX(i, pos.getX(i) * (1 - 0.18 * t));
      pos.setZ(i, pos.getZ(i) * (1 - 0.25 * t));
    }
    geo.computeVertexNormals();
  }
  paint(geo, (_p, n) => col(PALETTE.skin).lerp(col(PALETTE.skinLight), smooth(0.2, -0.7, n.z) * 0.85));
  return geo;
}

function nailGeometry(len: number, r: number): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 12, 8);
  geo.scale(r * 0.75, len * 0.3, r * 0.3);
  geo.translate(0, -len * 0.62, r * 0.82);
  return geo;
}

/** A bare foot in the foot joint's frame: ankle at the origin, toes toward +z. */
function footGeometry(side: Side): THREE.BufferGeometry {
  const k = sideSign(side);
  const geo = new THREE.SphereGeometry(1, 40, 24);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const along = (v.z + 1) / 2; // heel 0 .. toes 1
    const width = 0.03 + 0.016 * smooth(0.1, 0.75, along) - 0.01 * smooth(0.85, 1, along);
    const height = 0.045 * (1 - 0.65 * smooth(0.25, 1, along)) + 0.012;
    // Arch on the inner side.
    const arch = v.x * -k > 0 ? 0.006 * bump(along, 0.45, 0.2) : 0;
    pos.setXYZ(
      i,
      v.x * width - k * 0.004 * along,
      -DIM.ankle + height + v.y * height - (v.y < 0 ? arch * -v.y : 0),
      -0.05 + along * DIM.footLength,
    );
  }
  geo.computeVertexNormals();
  paint(geo, (_p, n) => col(PALETTE.skin).lerp(col(PALETTE.skinLight), smooth(-0.3, -0.85, n.y)));
  // Toes: five small rounded nubs along the front.
  const toes = [0, 1, 2, 3, 4].map((t) => {
    const r = 0.0105 - t * 0.0011;
    const g = new THREE.SphereGeometry(1, 12, 8);
    g.scale(r, r * 0.8, r * 1.3);
    g.translate(-k * (0.018 - t * 0.0095), -DIM.ankle + 0.012, -0.05 + DIM.footLength - 0.008 - t * 0.0045);
    paint(g, (_p, n) => col(PALETTE.skin).lerp(col(PALETTE.skinLight), smooth(-0.3, -0.85, n.y)));
    return g;
  });
  const merged = mergeAll([geo, ...toes]);
  return merged;
}

function mergeAll(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const prepared = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const total = prepared.reduce((n, g) => n + g.attributes.position.count, 0);
  const out = new THREE.BufferGeometry();
  for (const name of ["position", "normal", "color"]) {
    const arr = new Float32Array(total * 3);
    let o = 0;
    for (const g of prepared) {
      const a = g.attributes[name] as THREE.BufferAttribute;
      arr.set(a.array as Float32Array, o);
      o += a.count * 3;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, 3));
  }
  return out;
}

const tmpV = new THREE.Vector3();
const wp = (o: THREE.Object3D, x = 0, y = 0, z = 0) => o.localToWorld(tmpV.set(x, y, z).clone());
const axis = (o: THREE.Object3D, x: number, y: number, z: number) =>
  new THREE.Vector3(x, y, z).transformDirection(o.matrixWorld);

export class Pianist {
  readonly rig: Rig = buildRig();
  readonly group = new THREE.Group(); // world-space cloth and torso live here
  private readonly torso: Loft;
  private readonly neckLoft: Loft;
  private readonly sleeves: Record<Side, Loft>;
  private readonly forearms: Record<Side, Loft>;
  private readonly calves: Record<Side, Loft>;
  private readonly robeSkirt: Loft;
  private readonly dressSkirt: Loft;
  private readonly belt: Loft;
  readonly skin = skinMaterial();
  /** Same skin for lofted parts, which carry no vertex colours. */
  readonly skinPlain = (() => {
    const m = skinMaterial();
    m.vertexColors = false;
    m.color.set(PALETTE.skin);
    return m;
  })();

  constructor() {
    const r = this.rig;
    const skin = this.skin;
    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    add(r.head, headGeometry(), skin);
    add(r.head, hairGeometry(), hairMaterial());

    for (const s of SIDES) {
      const thumbSign = -sideSign(s);
      const h = r.hand[s];
      add(h.hand, palmGeometry(thumbSign), skin);
      FINGERS.forEach((f, fi) => {
        h.fingers[fi].forEach((j, k) => {
          const radius = f.radius * (1 - 0.1 * k);
          add(j, phalanxGeometry(f.lengths[k], radius, k === 2), skin);
          if (k === 2) add(j, nailGeometry(f.lengths[k], radius), new THREE.MeshPhysicalMaterial({ color: 0x8e6a58, roughness: 0.25, clearcoat: 0.6 }));
        });
      });
      add(r.foot[s], footGeometry(s), skin);
    }

    const robe = clothMaterial(PALETTE.robe, 0.5);
    const dress = clothMaterial(PALETTE.nightdress, 0.6);
    this.torso = new Loft(26, 40, robe);
    this.neckLoft = new Loft(8, 24, this.skinPlain);
    this.belt = new Loft(5, 40, clothMaterial(PALETTE.robeShade, 0.4));
    this.sleeves = { L: new Loft(14, 24, robe), R: new Loft(14, 24, robe) };
    this.forearms = { L: new Loft(8, 18, this.skinPlain), R: new Loft(8, 18, this.skinPlain) };
    this.calves = { L: new Loft(12, 18, this.skinPlain), R: new Loft(12, 18, this.skinPlain) };
    this.robeSkirt = new Loft(26, 48, robe);
    this.dressSkirt = new Loft(30, 48, dress);
    for (const l of [this.torso, this.neckLoft, this.belt, this.robeSkirt, this.dressSkirt, ...Object.values(this.sleeves), ...Object.values(this.forearms), ...Object.values(this.calves)]) {
      this.group.add(l.mesh);
    }
  }

  /** Rebuild the cloth and lofted limbs from the current pose. Call after posing. */
  update() {
    const r = this.rig;
    r.root.updateMatrixWorld(true);
    this.updateTorso();
    for (const s of SIDES) {
      this.updateArm(s);
      this.updateCalf(s);
    }
    this.updateSkirt(this.dressSkirt, 0.79, 0.012, 0.05);
    this.updateSkirt(this.robeSkirt, 0.56, 0.02, 0.075);
  }

  /** Torso rings, each riding on a spine joint (in its frame). */
  private updateTorso() {
    const r = this.rig;
    // [joint, y in joint frame, half-width, half-depth, forward bulge]
    const profile: [THREE.Object3D, number, number, number, number][] = [
      [r.hips, -0.07, 0.178, 0.122, 0.0],
      [r.hips, 0.0, 0.17, 0.115, 0.004],
      [r.spine, 0.0, 0.152, 0.105, 0.006],
      [r.spine, 0.07, 0.142, 0.1, 0.006],
      [r.chest, 0.0, 0.148, 0.106, 0.012],
      [r.chest, 0.06, 0.158, 0.112, 0.03],
      [r.chest, 0.11, 0.164, 0.108, 0.03],
      [r.chest, 0.16, 0.172, 0.096, 0.012],
      [r.chest, 0.2, 0.188, 0.082, 0.0],
      [r.chest, 0.228, 0.12, 0.066, 0.0],
      [r.chest, 0.24, 0.06, 0.05, 0.0],
    ];
    const n = this.torso.rings;
    this.torso.update((i) => {
      const f = (i / (n - 1)) * (profile.length - 1);
      const a = Math.floor(f);
      const b = Math.min(a + 1, profile.length - 1);
      const u = f - a;
      const pa = profile[a];
      const pb = profile[b];
      const ca = wp(pa[0], 0, pa[1], 0);
      const cb = wp(pb[0], 0, pb[1], 0);
      const center = ca.lerp(cb, u);
      const xAxis = axis(pa[0], 1, 0, 0).lerp(axis(pb[0], 1, 0, 0), u).normalize();
      const zAxis = axis(pa[0], 0, 0, 1).lerp(axis(pb[0], 0, 0, 1), u).normalize();
      const bulge = THREE.MathUtils.lerp(pa[4], pb[4], u);
      return {
        center,
        xAxis,
        zAxis,
        rx: THREE.MathUtils.lerp(pa[2], pb[2], u),
        rz: THREE.MathUtils.lerp(pa[3], pb[3], u),
        // Bust and back: more forward fullness on the front.
        offset: (th) => bulge * Math.max(Math.sin(th), 0) ** 2 * (1 - 0.6 * Math.cos(th) ** 2),
        shape: (th) => 1 + 0.04 * Math.cos(2 * th),
      } satisfies Ring;
    });
    // Belt: a soft band tied at the waist.
    this.belt.update((i, v) => {
      const c = wp(r.spine, 0, -0.005 + v * 0.035, 0);
      return { center: c, xAxis: axis(r.spine, 1, 0, 0), zAxis: axis(r.spine, 0, 0, 1), rx: 0.157, rz: 0.11 };
    });
    // Neck: from inside the collar to under the jaw.
    this.neckLoft.update((i, v) => {
      const a = wp(r.neck, 0, -0.02, 0);
      const b = wp(r.head, 0, 0.03, 0.01);
      return {
        center: a.lerp(b, v),
        xAxis: axis(r.neck, 1, 0, 0),
        zAxis: axis(r.neck, 0, 0, 1),
        rx: 0.047 - 0.006 * v,
        rz: 0.05 - 0.005 * v,
      };
    });
  }

  /** Robe sleeve over shoulder and elbow to mid-forearm; bare forearm to the wrist. */
  private updateArm(s: Side) {
    const r = this.rig;
    const up = r.upperArm[s];
    const fo = r.foreArm[s];
    const pts = [wp(up, 0, 0.03, 0), wp(up, 0, -DIM.upperArm * 0.5, 0), wp(fo, 0, 0, 0), wp(fo, 0, -DIM.foreArm * 0.55, 0)];
    const radii = [0.066, 0.056, 0.052, 0.07];
    const curve = new THREE.CatmullRomCurve3(pts);
    const frames = curve.computeFrenetFrames(this.sleeves[s].rings - 1, false);
    this.sleeves[s].update((i, v) => {
      const k = Math.min(Math.floor(v * 3), 2);
      const u = v * 3 - k;
      const rad = THREE.MathUtils.lerp(radii[k], radii[k + 1], u) * (1 + 0.15 * smooth(0.8, 1, v));
      // Sleeve drapes: looser on the underside.
      return {
        center: curve.getPointAt(v),
        xAxis: frames.normals[i],
        zAxis: frames.binormals[i],
        rx: rad,
        rz: rad * 0.92,
      };
    });
    this.forearms[s].update((i, v) => {
      const c = wp(fo, 0, -DIM.foreArm * (0.45 + 0.55 * v), 0);
      return { center: c, xAxis: axis(fo, 1, 0, 0), zAxis: axis(fo, 0, 0, 1), rx: 0.026 - 0.006 * v, rz: 0.022 - 0.006 * v };
    });
  }

  /** Bare calf and ankle below the hem. */
  private updateCalf(s: Side) {
    const r = this.rig;
    const sh = r.shin[s];
    this.calves[s].update((i, v) => {
      const c = wp(sh, 0, -DIM.shin * (0.25 + 0.75 * v), 0);
      const calf = bump(v, 0.25, 0.3);
      return {
        center: c,
        xAxis: axis(sh, 1, 0, 0),
        zAxis: axis(sh, 0, 0, 1),
        rx: 0.031 + 0.014 * calf - 0.008 * v,
        rz: 0.033 + 0.016 * calf - 0.008 * v,
        offset: (th) => -0.008 * calf * Math.max(-Math.sin(th), 0),
      };
    });
  }

  /** Point and direction along a leg, `d` metres down from the hip joint. */
  private legAt(s: Side, d: number) {
    const r = this.rig;
    const hip = wp(r.thigh[s]);
    const knee = wp(r.shin[s]);
    const ankle = wp(r.foot[s]);
    const toKnee = knee.clone().sub(hip).normalize();
    const toAnkle = ankle.clone().sub(knee).normalize();
    const point = d <= DIM.thigh ? hip.clone().addScaledVector(toKnee, d) : knee.clone().addScaledVector(toAnkle, d - DIM.thigh);
    const dir = toKnee.clone().lerp(toAnkle, smooth(DIM.thigh - 0.09, DIM.thigh + 0.09, d)).normalize();
    return { point, dir };
  }

  /** A skirt that follows both legs: rings enclose the two leg paths. */
  private updateSkirt(loft: Loft, length: number, ease0: number, ease1: number) {
    const r = this.rig;
    const legR = (d: number) => THREE.MathUtils.lerp(0.088, 0.05, smooth(0, DIM.thigh, d)) - 0.012 * smooth(DIM.thigh, DIM.thigh + DIM.shin, d);
    const up = axis(r.hips, 0, 1, 0);
    loft.update((i, v) => {
      const d = v * length;
      const L = this.legAt("L", d);
      const R = this.legAt("R", d);
      const center = L.point.clone().add(R.point).multiplyScalar(0.5);
      const dir = L.dir.clone().add(R.dir).normalize();
      const across = L.point.clone().sub(R.point);
      const spread = across.length();
      const xAxis = across.lengthSq() > 1e-8 ? across.normalize() : axis(r.hips, 1, 0, 0);
      // Lift the top ring to meet the torso, and keep the axes square to the skirt's path.
      const zAxis = new THREE.Vector3().crossVectors(xAxis, dir).normalize();
      // Point the ring's +z forward when standing and up when sitting.
      if (zAxis.dot(axis(r.hips, 0, 0, 1).add(up)) < 0) zAxis.negate();
      if (v < 0.02) center.addScaledVector(up, 0.02);
      const ease = THREE.MathUtils.lerp(ease0, ease1, Math.pow(v, 1.4));
      const lr = legR(d);
      // Where the legs run forward (sitting), the cloth drapes: flatter
      // underneath, hanging a little between the knees.
      const horiz = 1 - Math.abs(dir.dot(new THREE.Vector3(0, 1, 0)));
      return {
        center,
        xAxis,
        zAxis,
        rx: spread / 2 + lr + ease,
        rz: lr + ease * 0.85,
        // Flatter underneath where the cloth lies along the thighs.
        offset: (th) => {
          const sn = Math.sin(th);
          return sn < 0 ? -sn * 0.5 * (lr + ease) * horiz : 0;
        },
        shape: (th) => 1 + 0.035 * Math.sin(th * 7 + v * 5) * v,
      };
    });
  }

  /** A neutral standing pose: arms relaxed, feet under the hips. */
  standingPose() {
    const r = this.rig;
    r.root.updateMatrixWorld(true);
    for (const s of SIDES) {
      const k = sideSign(s);
      r.upperArm[s].quaternion.setFromEuler(new THREE.Euler(0.06, 0, k * 0.1));
      r.foreArm[s].quaternion.setFromEuler(new THREE.Euler(-0.22, 0, 0));
      // Palms toward the thighs, fingers softly curled.
      r.hand[s].hand.quaternion.setFromEuler(new THREE.Euler(0, k * Math.PI / 2, 0));
      FINGERS.forEach((f, fi) => {
        const chain = r.hand[s].fingers[fi];
        const thumb = fi === 0;
        const spread = f.splay * -sideSign(s);
        chain[0].quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), spread).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), thumb ? 0.2 : 0.25));
        chain[1].quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), thumb ? 0.15 : 0.35);
        chain[2].quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), thumb ? 0.1 : 0.25);
      });
      r.thigh[s].quaternion.identity();
      r.shin[s].quaternion.identity();
      r.foot[s].quaternion.setFromEuler(new THREE.Euler(0, k * 0.08, 0));
    }
    r.root.updateMatrixWorld(true);
  }
}

