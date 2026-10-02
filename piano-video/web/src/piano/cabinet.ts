import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { CABINET, KEYBOARD_LEFT, KEYBOARD_WIDTH, KEY_FRONT, NAME_BOARD_Z, WHITE_THICK, WHITE_TOP } from "./layout";
import { materials as M, slab } from "./materials";

const HALF = CABINET.width / 2;
const T = CABINET.sideThickness;
const KEYBED_TOP = WHITE_TOP - WHITE_THICK;
const ARM_TOP = 0.79;

/** Side silhouette in (z, y): upper case, the curve down into the arm, the arm, the base. */
function sideShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(CABINET.back, 0);
  s.lineTo(0.05, 0);
  s.lineTo(0.05, 0.64);
  s.lineTo(KEY_FRONT + 0.02, 0.64);
  s.lineTo(KEY_FRONT + 0.02, ARM_TOP - 0.012);
  s.quadraticCurveTo(KEY_FRONT + 0.02, ARM_TOP, KEY_FRONT + 0.008, ARM_TOP);
  s.lineTo(0.1, ARM_TOP);
  s.quadraticCurveTo(0.0, ARM_TOP, 0.0, 0.9);
  s.lineTo(0.0, CABINET.height);
  s.lineTo(CABINET.back, CABINET.height);
  s.closePath();
  return s;
}

function sidePanel(x: number): THREE.Mesh {
  const geo = new THREE.ExtrudeGeometry(sideShape(), {
    depth: T,
    bevelEnabled: true,
    bevelThickness: 0.003,
    bevelSize: 0.003,
    bevelSegments: 3,
    curveSegments: 24,
  });
  // Shape x -> world z, shape y -> world y, extrusion -> world -x.
  geo.rotateY(-Math.PI / 2);
  const m = new THREE.Mesh(geo, M.lacquer);
  m.position.x = x;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function rounded(w: number, h: number, d: number, r: number, mat: THREE.Material, x: number, y: number, z: number) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export interface Cabinet {
  group: THREE.Group;
  pedals: THREE.Object3D[]; // soft, middle, sustain
}

export function buildCabinet(): Cabinet {
  const g = new THREE.Group();
  const inner = HALF - T;

  g.add(sidePanel(HALF), sidePanel(-inner));

  // Lid, closed, with a small overhang at the front.
  g.add(rounded(CABINET.width + 0.012, 0.026, 0.335, 0.005, M.lacquer, 0, CABINET.height + 0.013, -0.135));
  // Back and the inside of the case.
  g.add(slab(-HALF, HALF, 0, CABINET.height, CABINET.back - 0.012, CABINET.back, M.lacquerInside));

  // Keybed, key slip and the blocks either side of the keyboard.
  g.add(slab(-inner, inner, 0.64, KEYBED_TOP, -0.16, KEY_FRONT + 0.02, M.lacquer));
  g.add(rounded(2 * inner, 0.05, 0.026, 0.004, M.lacquer, 0, 0.684, KEY_FRONT + 0.013));
  const blockW = inner - (KEYBOARD_WIDTH / 2 + 0.002);
  for (const side of [-1, 1]) {
    const cx = side * (KEYBOARD_WIDTH / 2 + 0.002 + blockW / 2);
    g.add(rounded(blockW, ARM_TOP - 0.64, KEY_FRONT + 0.03, 0.008, M.lacquer, cx, (ARM_TOP + 0.64) / 2, (KEY_FRONT + 0.03) / 2 - 0.0));
  }

  // Name board behind the keys; the fallboard is folded away.
  g.add(rounded(KEYBOARD_WIDTH + 0.004, 0.034, 0.03, 0.004, M.lacquer, 0, WHITE_TOP + 0.017, NAME_BOARD_Z - 0.015));
  // Dark keyframe gap visible between key backs and the name board.
  g.add(slab(KEYBOARD_LEFT, -KEYBOARD_LEFT, KEYBED_TOP, KEYBED_TOP + 0.001, -0.16, KEY_FRONT, M.shadow));

  // Lower front: knee board, toe rail, legs on toe blocks, casters.
  g.add(slab(-inner, inner, 0.075, 0.64, 0.02, 0.045, M.lacquer));
  g.add(slab(-HALF, HALF, 0, 0.075, 0.0, 0.06, M.lacquer));
  for (const side of [-1, 1]) {
    const x = side * (HALF - 0.05);
    g.add(rounded(0.05, 0.6, 0.05, 0.004, M.lacquer, x, 0.34, KEY_FRONT - 0.035));
    g.add(rounded(0.055, 0.05, 0.3, 0.006, M.lacquer, x, 0.03, 0.17));
    const caster = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.016, 16), M.rubber);
    caster.rotation.z = Math.PI / 2;
    caster.position.set(x, 0.006, 0.28);
    g.add(caster);
  }

  // Pedals: a dark slot in the knee board and three brass levers.
  g.add(slab(-0.11, 0.11, 0.05, 0.088, 0.044, 0.047, M.shadow));
  const pedals: THREE.Object3D[] = [];
  for (const x of [-0.068, 0, 0.068]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.068, 0.04);
    const lever = rounded(0.026, 0.011, 0.12, 0.004, M.brass, 0, 0, 0.06);
    const toe = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.011, 24, 1, false, 0, Math.PI), M.brass);
    toe.position.set(0, 0, 0.118);
    toe.rotation.y = -Math.PI / 2;
    toe.castShadow = true;
    pivot.add(lever, toe);
    g.add(pivot);
    pedals.push(pivot);
  }

  return { group: g, pedals };
}
