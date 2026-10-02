import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import {
  BLACK_FRONT,
  BLACK_RISE,
  BLACK_WIDTH,
  HIGHEST,
  KEY_BACK,
  KEY_DIP,
  KEY_FRONT,
  KEY_PIVOT_Z,
  LOWEST,
  WHITE_GAP,
  WHITE_PITCH,
  WHITE_THICK,
  WHITE_TOP,
  isBlack,
  keyX,
} from "./layout";
import { materials as M } from "./materials";

const PIVOT_Y = WHITE_TOP - WHITE_THICK;
/** Key rotation at full depression; front of a white key drops KEY_DIP. */
export const KEY_ANGLE = KEY_DIP / (KEY_FRONT - KEY_PIVOT_Z);

function boxAt(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, radius = 0) {
  const geo = radius
    ? new RoundedBoxGeometry(x1 - x0, y1 - y0, z1 - z0, 2, radius)
    : new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  geo.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return geo.index ? geo.toNonIndexed() : geo;
}

/**
 * A white key: a full-width head at the front and a narrower stem behind,
 * notched around its black neighbours so pressed black keys sink cleanly.
 */
function whiteKeyGeometry(p: number): THREE.BufferGeometry {
  const cx = keyX(p);
  const half = (WHITE_PITCH - WHITE_GAP) / 2;
  const blackGap = 0.0012;
  let left = cx - half;
  let right = cx + half;
  if (p > LOWEST && isBlack(p - 1)) left = keyX(p - 1) + BLACK_WIDTH / 2 + blackGap;
  if (p < HIGHEST && isBlack(p + 1)) right = keyX(p + 1) - BLACK_WIDTH / 2 - blackGap;
  const notch = BLACK_FRONT + 0.003;
  const y0 = PIVOT_Y;
  const y1 = WHITE_TOP;
  const head = boxAt(cx - half, cx + half, y0, y1, notch, KEY_FRONT, 0.0012);
  const stem = boxAt(left, right, y0, y1 - 0.0004, KEY_BACK, notch + 0.001);
  return mergeGeometries([head, stem])!;
}

function blackKeyGeometry(p: number): THREE.BufferGeometry {
  const cx = keyX(p);
  const top = WHITE_TOP + BLACK_RISE;
  const geo = new RoundedBoxGeometry(BLACK_WIDTH + 0.002, top - PIVOT_Y, BLACK_FRONT - KEY_BACK, 2, 0.0015);
  // Taper: narrower on top, and the front face slopes back slightly.
  const pos = geo.attributes.position;
  const h = (top - PIVOT_Y) / 2;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const k = (y + h) / (2 * h); // 0 bottom .. 1 top
    pos.setX(i, pos.getX(i) * (1 - 0.22 * k));
    if (pos.getZ(i) > 0) pos.setZ(i, pos.getZ(i) - 0.006 * k);
  }
  geo.computeVertexNormals();
  geo.translate(cx, (top + PIVOT_Y) / 2, (BLACK_FRONT + KEY_BACK) / 2);
  return geo;
}

export interface Keyboard {
  group: THREE.Group;
  keys: THREE.Object3D[]; // indexed by pitch - LOWEST, each rotates about x
}

export function buildKeyboard(): Keyboard {
  const group = new THREE.Group();
  const keys: THREE.Object3D[] = [];
  for (let p = LOWEST; p <= HIGHEST; p++) {
    const black = isBlack(p);
    const geo = black ? blackKeyGeometry(p) : whiteKeyGeometry(p);
    // Move the geometry so the pivot group sits on the balance rail.
    geo.translate(0, -PIVOT_Y, -KEY_PIVOT_Z);
    const mesh = new THREE.Mesh(geo, black ? M.ebony : M.ivory);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const pivot = new THREE.Group();
    pivot.position.set(0, PIVOT_Y, KEY_PIVOT_Z);
    pivot.add(mesh);
    group.add(pivot);
    keys.push(pivot);
  }
  return { group, keys };
}
