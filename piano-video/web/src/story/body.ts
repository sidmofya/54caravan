// The pianist: a stylised, sculpted woman built in code. She is African,
// with loose natural hair, bare feet, a soft ochre robe over a long cream
// nightdress. Rigid parts ride on the skeleton's joints; cloth and the
// torso are lofts rebuilt each frame so they bend with her.

import * as THREE from "three";
import { rng } from "../rng";
import { proceduralMaterial } from "../journey/shaders";
import { Loft, ringPoint, type Ring } from "./loft";
import { buildRig, DIM, FINGERS, SIDES, sideSign, type Rig, type Side } from "./rig";

export const PALETTE = {
  skin: 0x3f281c,
  skinLight: 0x7a5040, // palms and soles
  lips: 0x62352b,
  lipLower: 0x77423a,
  lashes: 0x100a08,
  iris: 0x2a1810,
  sclera: 0xd2c8bb,
  hair: 0x15100c,
  robe: 0x47567a, // soft dusty indigo
  robeShade: 0x36425f,
  nightdress: 0xece2cf,
};

function skinMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.58,
    sheen: 0.35,
    sheenColor: new THREE.Color(0xb07858),
    sheenRoughness: 0.5,
  });
}

function clothMaterial(color: number) {
  return proceduralMaterial(
    { color: new THREE.Color(color), roughness: 0.9, side: THREE.DoubleSide },
    /* glsl */ `
      // A soft brushed weave and a few slow folds so the fabric reads as cloth.
      float weave = vnoise(vec3(vUv0 * vec2(160.0, 240.0), 0.0));
      float fold = fbm(vec3(vUv0.x * 9.0, vUv0.y * 3.0, 1.0));
      albedo *= 0.9 + 0.08 * weave + 0.2 * (fold - 0.5);
    `,
  );
}

function hairMaterial() {
  return proceduralMaterial(
    { color: PALETTE.hair, roughness: 0.9 },
    /* glsl */ `
      // Tight coils: high-frequency ridged noise with warm glints.
      vec3 q = vObj * 170.0;
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

/** Where the eyes sit on the unit sphere the head is sculpted from. */
const EYE = { x: 0.37, y: 0.07 };

/** Facial features as weights at a unit-sphere direction (y up, z forward). */
function features(x: number, y: number, z: number) {
  const front = Math.max(z, 0);
  const face = smooth(0.6, 0.95, z);
  const eye = bump(Math.abs(x), EYE.x, 0.14) * bump(y, EYE.y, 0.085) * front;
  const brow = bump(y, 0.2, 0.06) * bump(Math.abs(x), 0.3, 0.3) * front;
  // Nose: a low bridge widening to a broad, rounded tip with full wings.
  const along = THREE.MathUtils.clamp((0.1 - y) / 0.32, 0, 1);
  const nose = (0.15 + 0.85 * along * along) * smooth(-0.42, -0.2, y) * smooth(0.16, 0.04, y) * bump(x, 0, 0.11 + 0.08 * along) * face;
  const wings = bump(Math.abs(x), 0.15, 0.07) * bump(y, -0.27, 0.08) * smooth(0.7, 0.95, z);
  // Fill between the nose and the upper lip, so no dark hollow sits there.
  const philtrum = bump(x, 0, 0.2) * bump(y, -0.38, 0.07) * face;
  const upperLip = bump(x, 0, 0.32) * bump(y, -0.46, 0.065) * smooth(0.7, 0.98, z);
  const lowerLip = bump(x, 0, 0.29) * bump(y, -0.58, 0.055) * smooth(0.7, 0.98, z);
  const seam = bump(x, 0, 0.3) * bump(y, -0.525, 0.012) * smooth(0.8, 0.98, z);
  return { front, eye, brow, nose, wings, philtrum, upperLip, lowerLip, seam };
}

/** The head's surface for a unit-sphere direction, in the head joint's frame. */
function headPoint(x: number, y: number, z: number): THREE.Vector3 {
  const f = features(x, y, z);
  // A rounded jaw and chin, a full cranium, soft high cheekbones.
  let sx = 0.076 * (1 - 0.15 * smooth(0.05, -0.95, y) * (0.5 + 0.5 * f.front));
  sx *= 1 + 0.09 * bump(y, -0.12, 0.22) * f.front;
  const sy = 0.107;
  const sz = 0.096 * (1 - 0.15 * smooth(0.0, -0.9, y) * (1 - f.front));
  let dz = 0.006 * bump(y, -0.84, 0.14) * f.front;
  dz += -0.009 * f.eye + 0.005 * f.brow + 0.023 * f.nose + 0.009 * f.wings + 0.007 * f.philtrum;
  dz += 0.013 * f.upperLip + 0.014 * f.lowerLip - 0.002 * f.seam;
  return new THREE.Vector3(x * sx, y * sy + 0.095, z * sz + dz + 0.012);
}

/**
 * A sculpted head, in the head joint's frame (pivot at the base of the
 * skull, face toward +z). Simplified features: a broad nose, full lips,
 * soft cheekbones; the eyes are separate meshes set into the sockets.
 */
function headGeometry(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 112, 84);
  const pos = geo.attributes.position;
  const unit: THREE.Vector3[] = [];
  for (let i = 0; i < pos.count; i++) {
    const u = new THREE.Vector3().fromBufferAttribute(pos, i);
    unit.push(u);
    pos.setXYZ(i, ...headPoint(u.x, u.y, u.z).toArray());
  }
  geo.computeVertexNormals();
  let i = 0;
  paint(geo, () => {
    const u = unit[i++];
    const f = features(u.x, u.y, u.z);
    // The upper lip a little darker, the lower one warmer and lighter.
    const c = col(PALETTE.skin)
      .lerp(col(PALETTE.lips), smooth(0.35, 0.8, f.upperLip) * 0.85)
      .lerp(col(PALETTE.lipLower), smooth(0.3, 0.8, f.lowerLip) * 0.85);
    // A touch of warmth on the cheeks, shadow in the lip line.
    c.lerp(col(0x5a3424), 0.25 * bump(Math.abs(u.x), 0.45, 0.2) * bump(u.y, -0.2, 0.2) * f.front);
    return c.multiplyScalar(1 - 0.3 * f.seam);
  });
  return geo;
}

/** One eye: ball, iris and lids, placed in its socket (head frame). k = +1 her left. */
function eyeGroup(k: number): THREE.Group {
  const R = 0.0122;
  const g = new THREE.Group();
  const dir = new THREE.Vector3(k * EYE.x, EYE.y, 0).setZ(Math.sqrt(1 - EYE.x ** 2 - EYE.y ** 2));
  const surface = headPoint(dir.x, dir.y, dir.z);
  g.position.copy(surface).add(new THREE.Vector3(-k * 0.001, 0, -R + 0.0035));

  const ball = new THREE.SphereGeometry(R, 32, 24);
  ball.rotateX(Math.PI / 2); // poles along z, so the iris is a clean cap
  paint(ball, (p) => {
    const a = Math.acos(THREE.MathUtils.clamp(p.z / R, -1, 1));
    if (a < 0.2) return col(0x070504);
    if (a < 0.55) return col(PALETTE.iris).multiplyScalar(0.8 + 0.6 * smooth(0.2, 0.55, a));
    return col(PALETTE.sclera).multiplyScalar(0.7 - 0.25 * smooth(0.7, 1.4, a));
  });
  const eyeball = new THREE.Mesh(ball, new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 }));
  // A calm gaze, a little down, converging slightly.
  eyeball.rotation.set(0.2, -k * 0.05, 0);
  g.add(eyeball);

  const lidMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.55, sheen: 0.35, sheenColor: new THREE.Color(0xb07858) });
  // Lids: sphere shells whose edges curve, so the opening is almond-shaped.
  // Elevation of each edge as a function of the angle round from the front.
  const upperEdge = (phi: number) => 0.13 - 0.42 * (1 - Math.sin(phi));
  const lowerEdge = (phi: number) => -0.46 + 0.32 * (1 - Math.sin(phi));
  const lid = (upper: boolean) => {
    const rr = R * 1.1;
    const geo = new THREE.SphereGeometry(rr, 40, 16);
    const pos = geo.attributes.position;
    const p = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      const theta = Math.acos(THREE.MathUtils.clamp(p.y / rr, -1, 1));
      const phi = Math.atan2(p.z, -p.x);
      const edge = Math.PI / 2 - (upper ? upperEdge(phi) : lowerEdge(phi));
      const t2 = upper ? (theta / Math.PI) * edge : edge + (theta / Math.PI) * (Math.PI - edge);
      pos.setXYZ(i, -Math.cos(phi) * Math.sin(t2) * rr, Math.cos(t2) * rr, Math.sin(phi) * Math.sin(t2) * rr);
    }
    geo.computeVertexNormals();
    paint(geo, (q) => {
      const theta = Math.acos(THREE.MathUtils.clamp(q.y / rr, -1, 1));
      const phi = Math.atan2(q.z, -q.x);
      const edge = Math.PI / 2 - (upper ? upperEdge(phi) : lowerEdge(phi));
      // Lashes: a dark line along the upper lid's front edge.
      const lash = upper && q.z > 0 ? bump(theta, edge, 0.12) : 0;
      return col(PALETTE.skin).multiplyScalar(0.9).lerp(col(PALETTE.lashes), lash);
    });
    const m = new THREE.Mesh(geo, lidMat);
    m.castShadow = true;
    return m;
  };
  g.add(lid(true), lid(false));
  return g;
}

const FACE_DIR = new THREE.Vector3(0, -0.62, 0.78).normalize();

/** Loose natural hair: a rounded cloud of coils, sitting high, framing the face. */
function hairGeometry(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 80, 60);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  const R = rng(1987);
  const lumps = Array.from({ length: 34 }, () => {
    const d = new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize();
    return { d, s: 0.2 + R() * 0.3, h: 0.025 + R() * 0.04 };
  });
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    let r = 1;
    for (const l of lumps) r += l.h * Math.exp(-(1 - v.dot(l.d)) / (l.s * 0.25));
    // Leave the face open: the front-lower hair sweeps back to a hairline
    // on the forehead and in front of the ears.
    // An arched opening round the face: a cone about a direction forward and down.
    const face = smooth(0.8, 0.9, v.dot(FACE_DIR));
    const x = v.x * 0.132 * r * (1 - 0.12 * face);
    const y = v.y * 0.138 * r;
    const z = v.z * 0.14 * r * (1 - 0.8 * face) - 0.03 * face;
    pos.setXYZ(i, x, y + 0.165, z - 0.022);
  }
  geo.computeVertexNormals();
  return geo;
}

/** A hand's palm, in the wrist joint's frame: fingers along -y, palm toward -z. */
function palmGeometry(thumbSign: number): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 40, 28);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    // A rounded block rather than a disc: squarer cross-section.
    const sx = Math.sign(v.x) * Math.abs(v.x) ** 0.7;
    const sz = Math.sign(v.z) * Math.abs(v.z) ** 0.8;
    const along = (v.y + 1) / 2; // 0 at the knuckles end, 1 at the wrist
    const thumbSide = Math.max(sx * thumbSign, 0);
    const w = 0.037 * (1 - 0.15 * along) + 0.005 * thumbSide * bump(along, 0.55, 0.3);
    // Back of the hand domed; the palm flatter, with the thumb's fleshy base.
    const depth = sz > 0 ? 0.015 + 0.004 * bump(along, 0.45, 0.4) : 0.011 + 0.008 * thumbSide * bump(along, 0.6, 0.25);
    pos.setXYZ(i, sx * w, -DIM.palm / 2 + v.y * DIM.palm * 0.54, sz * depth - 0.002);
  }
  geo.computeVertexNormals();
  paint(geo, (_p, n) => col(PALETTE.skin).lerp(col(PALETTE.skinLight), smooth(0.1, -0.6, n.z)));
  return geo;
}

function phalanxGeometry(len: number, r: number, last: boolean): THREE.BufferGeometry {
  const geo = new THREE.CapsuleGeometry(r, Math.max(len - r * 0.6, 0.001), 8, 16);
  geo.translate(0, -len / 2, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    // Fuller at the knuckle end, slimmer toward the next joint; a flatter pad on the tip.
    const along = THREE.MathUtils.clamp(-pos.getY(i) / len, 0, 1);
    const k = 1.08 - 0.16 * along - (last ? 0.12 * smooth(0.5, 1, along) : 0);
    pos.setX(i, pos.getX(i) * k);
    pos.setZ(i, pos.getZ(i) * k * (pos.getZ(i) < 0 ? 0.92 : 1));
  }
  geo.computeVertexNormals();
  paint(geo, (p, n) => {
    const along = THREE.MathUtils.clamp(-p.y / len, 0, 1);
    // Palm side lighter; a darker crease over each knuckle on the back.
    const c = col(PALETTE.skin).lerp(col(PALETTE.skinLight), smooth(0.2, -0.7, n.z) * 0.8);
    return c.multiplyScalar(1 - 0.22 * bump(along, 0.04, 0.12) * smooth(0, 0.6, n.z));
  });
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

type Profile = [THREE.Object3D, number, number, number, number][];

/** Where the robe's front opening starts above the belt, as a torso profile index. */
const WAIST = 3;

export class Pianist {
  readonly rig: Rig = buildRig();
  readonly group = new THREE.Group(); // world-space cloth and torso live here
  private readonly torso: Loft; // the robe's body, open in a V above the belt
  private readonly dressTop: Loft; // the nightdress seen inside the V
  private readonly chestSkin: Loft; // skin above the nightdress neckline
  private readonly collar: Loft; // the robe's shawl collar along the V and round the neck
  private readonly neckLoft: Loft;
  private readonly sleeves: Record<Side, Loft>;
  private readonly forearms: Record<Side, Loft>;
  private readonly calves: Record<Side, Loft>;
  private readonly robeSkirt: Loft;
  private readonly dressSkirt: Loft;
  private readonly belt: Loft;
  private readonly profile: Profile;
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
    r.head.add(eyeGroup(1), eyeGroup(-1));

    const nail = new THREE.MeshPhysicalMaterial({ color: 0x8e6a58, roughness: 0.3, clearcoat: 0.5 });
    for (const s of SIDES) {
      const thumbSign = -sideSign(s);
      const h = r.hand[s];
      add(h.hand, palmGeometry(thumbSign), skin);
      FINGERS.forEach((f, fi) => {
        h.fingers[fi].forEach((j, k) => {
          const radius = f.radius * (1 - 0.1 * k);
          add(j, phalanxGeometry(f.lengths[k], radius, k === 2), skin);
          if (k === 2) add(j, nailGeometry(f.lengths[k], radius), nail);
        });
      });
      add(r.foot[s], footGeometry(s), skin);
    }

    const robe = clothMaterial(PALETTE.robe);
    const robeShade = clothMaterial(PALETTE.robeShade);
    const dress = clothMaterial(PALETTE.nightdress);
    this.torso = new Loft(30, 48, robe);
    this.dressTop = new Loft(10, 40, dress);
    this.chestSkin = new Loft(10, 32, this.skinPlain);
    this.collar = new Loft(72, 12, robe);
    this.neckLoft = new Loft(8, 24, this.skinPlain);
    this.belt = new Loft(5, 48, robeShade);
    this.sleeves = { L: new Loft(18, 24, robe), R: new Loft(18, 24, robe) };
    this.forearms = { L: new Loft(8, 18, this.skinPlain), R: new Loft(8, 18, this.skinPlain) };
    this.calves = { L: new Loft(12, 18, this.skinPlain), R: new Loft(12, 18, this.skinPlain) };
    this.robeSkirt = new Loft(26, 56, robe);
    this.dressSkirt = new Loft(30, 48, dress);
    for (const l of [
      this.torso, this.dressTop, this.chestSkin, this.collar, this.neckLoft, this.belt, this.robeSkirt, this.dressSkirt,
      ...Object.values(this.sleeves), ...Object.values(this.forearms), ...Object.values(this.calves),
    ]) {
      this.group.add(l.mesh);
    }

    // The belt's knot and its two hanging ends ride on the waist.
    const knotAt = Math.PI / 2 - 0.55;
    const knot = add(r.spine, new THREE.SphereGeometry(1, 20, 14), robeShade);
    knot.scale.set(0.024, 0.02, 0.014);
    knot.position.set(Math.cos(knotAt) * 0.143, 0.016, Math.sin(knotAt) * 0.104 + 0.012);
    for (const [len, tilt, dx] of [[0.27, 0.06, -0.008], [0.23, -0.1, 0.01]]) {
      const end = new THREE.BoxGeometry(0.032, len, 0.006);
      end.translate(0, -len / 2, 0);
      const m = add(r.spine, end, robeShade);
      m.position.copy(knot.position).add(new THREE.Vector3(dx, -0.004, 0.004));
      m.rotation.set(-0.08, -0.5, tilt);
    }

    // The torso's shape: [joint, y in joint frame, half-width, half-depth, forward fullness].
    this.profile = [
      [r.hips, -0.125, 0.158, 0.106, 0.0], // seat: closes the body down to the stool
      [r.hips, -0.08, 0.172, 0.118, 0.0],
      [r.hips, 0.0, 0.162, 0.108, 0.0],
      [r.spine, 0.0, 0.133, 0.094, 0.004], // waist, under the belt
      [r.spine, 0.07, 0.136, 0.097, 0.008],
      [r.chest, 0.0, 0.142, 0.1, 0.016],
      [r.chest, 0.06, 0.15, 0.104, 0.034],
      [r.chest, 0.11, 0.155, 0.103, 0.032],
      [r.chest, 0.16, 0.158, 0.094, 0.01],
      [r.chest, 0.195, 0.16, 0.085, 0.0],
      [r.chest, 0.225, 0.143, 0.07, 0.0],
      [r.chest, 0.246, 0.104, 0.06, 0.0],
      [r.chest, 0.262, 0.064, 0.052, 0.0],
    ];
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
    this.updateSkirt(this.dressSkirt, 0.79, 0.012, 0.05, false);
    this.updateSkirt(this.robeSkirt, 0.62, 0.022, 0.08, true);
  }

  /** The torso ring at fractional profile index f, scaled for inner layers. */
  private torsoRing(f: number, scale = 1): Ring {
    const P = this.profile;
    const a = Math.min(Math.floor(f), P.length - 2);
    const b = a + 1;
    const u = f - a;
    const pa = P[a];
    const pb = P[b];
    const center = wp(pa[0], 0, pa[1], 0).lerp(wp(pb[0], 0, pb[1], 0), u);
    const xAxis = axis(pa[0], 1, 0, 0).lerp(axis(pb[0], 1, 0, 0), u).normalize();
    const zAxis = axis(pa[0], 0, 0, 1).lerp(axis(pb[0], 0, 0, 1), u).normalize();
    const bulge = THREE.MathUtils.lerp(pa[4], pb[4], u) * scale;
    return {
      center,
      xAxis,
      zAxis,
      rx: THREE.MathUtils.lerp(pa[2], pb[2], u) * scale,
      rz: THREE.MathUtils.lerp(pa[3], pb[3], u) * scale,
      // Bust and back: more forward fullness on the front.
      offset: (th) => bulge * Math.max(Math.sin(th), 0) ** 2 * (1 - 0.6 * Math.cos(th) ** 2),
      shape: (th) => 1 + 0.03 * Math.cos(2 * th),
    };
  }

  /** Half-width, in radians, of the robe's front opening at profile index f. */
  private gap(f: number) {
    return 0.82 * Math.pow(smooth(WAIST + 0.4, this.profile.length - 1, f), 0.7);
  }

  private updateTorso() {
    const r = this.rig;
    const top = this.profile.length - 1;
    const front = Math.PI / 2;
    this.torso.update((_i, v) => {
      const f = v * top;
      const g = this.gap(f);
      return { ...this.torsoRing(f), arc: [front + g, front + Math.PI * 2 - g] };
    });
    // Nightdress from the hips to its neckline just above the bust.
    this.dressTop.update((_i, v) => this.torsoRing(WAIST - 1 + v * 6.2, 0.975));
    // Skin from inside the nightdress up to the neck.
    this.chestSkin.update((_i, v) => {
      const f = WAIST + 4.4 + Math.min(v / 0.85, 1) * (top - WAIST - 4.4);
      const ring = this.torsoRing(f, 0.95);
      if (v <= 0.85) return ring;
      const u = (v - 0.85) / 0.15;
      return { ...ring, center: ring.center.lerp(wp(r.neck, 0, 0.02, 0), u), rx: THREE.MathUtils.lerp(ring.rx, 0.04, u), rz: THREE.MathUtils.lerp(ring.rz, 0.042, u), offset: undefined };
    });
    this.updateCollar();
    // Belt: a soft band tied at the waist.
    this.belt.update((_i, v) => ({
      center: wp(r.spine, 0, -0.004 + v * 0.036, 0),
      xAxis: axis(r.spine, 1, 0, 0),
      zAxis: axis(r.spine, 0, 0, 1),
      rx: 0.143,
      rz: 0.104,
      offset: (th) => 0.004 * Math.max(Math.sin(th), 0) ** 2,
    }));
    // Neck: from inside the collar to under the jaw.
    this.neckLoft.update((_i, v) => ({
      center: wp(r.neck, 0, -0.03, 0).lerp(wp(r.head, 0, 0.03, 0.008), v),
      xAxis: axis(r.neck, 1, 0, 0),
      zAxis: axis(r.neck, 0, 0, 1),
      rx: 0.04 - 0.004 * v,
      rz: 0.042 - 0.004 * v,
    }));
  }

  /** A flat band along the V's two edges and round the back of the neck. */
  private updateCollar() {
    const top = this.profile.length - 1;
    const front = Math.PI / 2;
    const f0 = WAIST + 0.5;
    const n = this.collar.rings;
    const edgeN = Math.floor(n * 0.3);
    const backN = n - 2 * edgeN;
    // Sample (profile index, angle) along the path: up one edge, round, down the other.
    const path: [number, number][] = [];
    for (let i = 0; i < edgeN; i++) {
      const f = f0 + (i / edgeN) * (top - f0);
      path.push([f, front + this.gap(f)]);
    }
    const gTop = this.gap(top);
    for (let i = 0; i < backN; i++) path.push([top, front + gTop + (i / (backN - 1)) * (Math.PI * 2 - 2 * gTop)]);
    for (let i = edgeN - 1; i >= 0; i--) {
      const f = f0 + (i / edgeN) * (top - f0);
      path.push([f, front + Math.PI * 2 - this.gap(f)]);
    }
    const pts = path.map(([f, th]) => {
      const ring = this.torsoRing(f);
      const p = ringPoint(ring, th);
      const nrm = ring.xAxis.clone().multiplyScalar(Math.cos(th) / ring.rx).addScaledVector(ring.zAxis, Math.sin(th) / ring.rz).normalize();
      return { p, nrm };
    });
    this.collar.update((i, v) => {
      const a = pts[Math.max(i - 1, 0)].p;
      const b = pts[Math.min(i + 1, n - 1)].p;
      const tangent = b.clone().sub(a).normalize();
      const nrm = pts[i].nrm;
      const width = new THREE.Vector3().crossVectors(nrm, tangent).normalize();
      // Wider round the neck, narrowing to the belt.
      const w = 0.016 + 0.01 * Math.sin(Math.PI * v);
      return { center: pts[i].p.clone().addScaledVector(nrm, 0.004), xAxis: width, zAxis: nrm, rx: w, rz: 0.005 };
    });
  }

  /** Robe sleeve from inside the shoulder to mid-forearm; bare forearm to the wrist. */
  private updateArm(s: Side) {
    const r = this.rig;
    const k = sideSign(s);
    const up = r.upperArm[s];
    const fo = r.foreArm[s];
    const pts = [
      wp(r.chest, k * (DIM.shoulderWidth - 0.065), DIM.shoulderHeight - 0.004, -0.012),
      wp(up, 0, 0.006, 0),
      wp(up, 0, -DIM.upperArm * 0.5, 0),
      wp(fo, 0, 0, 0),
      wp(fo, 0, -DIM.foreArm * 0.55, 0),
    ];
    const radii = [0.036, 0.044, 0.042, 0.042, 0.06];
    const curve = new THREE.CatmullRomCurve3(pts);
    const frames = curve.computeFrenetFrames(this.sleeves[s].rings - 1, false);
    this.sleeves[s].update((i, v) => {
      const seg = Math.min(Math.floor(v * 4), 3);
      const u = v * 4 - seg;
      const rad = THREE.MathUtils.lerp(radii[seg], radii[seg + 1], smooth(0, 1, u));
      return { center: curve.getPointAt(v), xAxis: frames.normals[i], zAxis: frames.binormals[i], rx: rad, rz: rad * 0.94 };
    });
    // The forearm turns toward the hand's orientation at the wrist.
    const hand = r.hand[s].hand;
    this.forearms[s].update((_i, v) => {
      const xAxis = axis(fo, 1, 0, 0).lerp(axis(hand, 1, 0, 0), smooth(0.3, 1, v)).normalize();
      const zAxis = axis(fo, 0, 0, 1).lerp(axis(hand, 0, 0, 1), smooth(0.3, 1, v)).normalize();
      return { center: wp(fo, 0, -DIM.foreArm * (0.45 + 0.55 * v), 0), xAxis, zAxis, rx: 0.027 - 0.006 * v, rz: 0.022 - 0.008 * v };
    });
  }

  /** Bare calf and ankle below the hem. */
  private updateCalf(s: Side) {
    const r = this.rig;
    const sh = r.shin[s];
    this.calves[s].update((_i, v) => {
      const c = wp(sh, 0, -DIM.shin * (0.25 + 0.75 * v), 0);
      const calf = bump(v, 0.25, 0.3);
      return {
        center: c,
        xAxis: axis(sh, 1, 0, 0),
        zAxis: axis(sh, 0, 0, 1),
        rx: 0.031 + 0.012 * calf - 0.008 * v,
        rz: 0.033 + 0.014 * calf - 0.008 * v,
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

  /** A skirt that follows both legs: rings enclose the two leg paths. A robe opens at the front. */
  private updateSkirt(loft: Loft, length: number, ease0: number, ease1: number, open: boolean) {
    const r = this.rig;
    const legR = (d: number) => THREE.MathUtils.lerp(0.088, 0.05, smooth(0, DIM.thigh, d)) - 0.012 * smooth(DIM.thigh, DIM.thigh + DIM.shin, d);
    const up = axis(r.hips, 0, 1, 0);
    loft.update((_i, v) => {
      const d = v * length;
      const L = this.legAt("L", d);
      const R = this.legAt("R", d);
      const center = L.point.clone().add(R.point).multiplyScalar(0.5);
      const dir = L.dir.clone().add(R.dir).normalize();
      const across = L.point.clone().sub(R.point);
      const spread = across.length();
      const xAxis = across.lengthSq() > 1e-8 ? across.normalize() : axis(r.hips, 1, 0, 0);
      const zAxis = new THREE.Vector3().crossVectors(xAxis, dir).normalize();
      // Point the ring's +z forward when standing and up when sitting.
      if (zAxis.dot(axis(r.hips, 0, 0, 1).add(up)) < 0) zAxis.negate();
      if (v < 0.02) center.addScaledVector(up, 0.02);
      const ease = THREE.MathUtils.lerp(ease0, ease1, Math.pow(v, 1.4));
      const lr = legR(d);
      // Where the legs run forward (sitting), the cloth lies flatter underneath.
      const horiz = 1 - Math.abs(dir.dot(new THREE.Vector3(0, 1, 0)));
      const g = open ? 0.1 + 0.42 * Math.pow(v, 1.2) : 0;
      return {
        center,
        xAxis,
        zAxis,
        // Narrower at the very top, so the skirt's open end tucks inside the torso.
        rx: (spread / 2 + lr + ease) * (0.84 + 0.16 * smooth(0, 0.12, v)),
        rz: lr + ease * 0.85,
        offset: (th) => {
          const sn = Math.sin(th);
          return sn < 0 ? -sn * 0.5 * (lr + ease) * horiz : 0;
        },
        shape: (th) => 1 + 0.035 * Math.sin(th * 7 + v * 5) * v,
        arc: open ? [Math.PI / 2 + g, Math.PI * 2.5 - g] : undefined,
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

