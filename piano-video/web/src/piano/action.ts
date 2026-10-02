import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import {
  BASS_STRING_Z,
  DAMPER_Y,
  HAMMER,
  HIGHEST,
  KEY_COUNT,
  LOWEST,
  SECTIONS,
  SECTION_GAP,
  HAMMER_PITCH,
  STRING_Z,
  WIPPEN,
  bracketXs,
  hammerX,
  hasDamper,
  sectionOf,
  strikeAngle,
  stringRadius,
} from "./layout";
import { stringXAt } from "./strings";
import { materials as M, slab } from "./materials";

const tmp = new THREE.Object3D();
// The hammer rail sits just in front of the resting shanks.
const RAIL_Y = 0.94;
const RAIL = {
  y: RAIL_Y,
  z: HAMMER.pivotZ + (RAIL_Y - HAMMER.pivotY) * Math.tan(HAMMER.rest) + 0.0021 + 0.0106,
};

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, count: number, shadows = true) {
  const m = new THREE.InstancedMesh(geo, mat, count);
  m.castShadow = shadows;
  m.receiveShadow = true;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.frustumCulled = false;
  return m;
}

/** Side profile of the felt in (z, y), striking point at -strikeOffset. */
function feltProfile(): THREE.Shape {
  const h = HAMMER.headHeight / 2;
  const tip = -HAMMER.strikeOffset;
  const s = new THREE.Shape();
  s.moveTo(0.001, h);
  s.bezierCurveTo(-0.009, h, tip + 0.001, 0.008, tip, 0);
  s.bezierCurveTo(tip + 0.001, -0.008, -0.009, -h, 0.001, -h);
  s.closePath();
  return s;
}

function extrudeAcrossX(shape: THREE.Shape, width: number) {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    bevelEnabled: true,
    bevelThickness: 0.0008,
    bevelSize: 0.0008,
    bevelSegments: 2,
    curveSegments: 16,
  });
  // Shape x -> world z, shape y -> world y, extrusion -> world -x; then centre.
  geo.rotateY(-Math.PI / 2);
  geo.translate(width / 2, 0, 0);
  return geo;
}

/** Geometry built in hammer-local space: pivot at the origin, shank along +y. */
function hammerParts() {
  const shank = new THREE.CylinderGeometry(0.0021, 0.0021, HAMMER.shank, 8);
  shank.translate(0, HAMMER.shank / 2, 0);

  const moulding = new RoundedBoxGeometry(HAMMER.width * 0.94, HAMMER.headHeight * 0.8, HAMMER.backDepth, 2, 0.0015);
  moulding.translate(0, 0, HAMMER.backDepth / 2);

  const felt = extrudeAcrossX(feltProfile(), HAMMER.width);
  // A thin white underfelt band, visible on the sides as on real hammers.
  const under = new THREE.Shape();
  const h = HAMMER.headHeight / 2 - 0.004;
  under.moveTo(0.0012, h);
  under.bezierCurveTo(-0.006, h, -0.0105, 0.006, -0.011, 0);
  under.bezierCurveTo(-0.0105, -0.006, -0.006, -h, 0.0012, -h);
  under.closePath();
  const underfelt = extrudeAcrossX(under, HAMMER.width + 0.0006);

  // Mount on the shank tip, tilted so the felt lands square on the strings.
  for (const g of [moulding, felt, underfelt]) {
    g.rotateX(HAMMER.headTilt);
    g.translate(0, HAMMER.shank, 0);
  }

  const butt = new RoundedBoxGeometry(HAMMER.width * 0.9, 0.024, 0.026, 2, 0.002);
  butt.translate(0, 0.004, 0.008);

  const buttFelt = new THREE.BoxGeometry(HAMMER.width * 0.7, 0.008, 0.006);
  buttFelt.translate(0, 0.006, 0.024);
  return { shank, moulding, felt, underfelt, butt, buttFelt };
}

export interface Action {
  group: THREE.Group;
  update(state: (p: number) => { hammer: number; damper: number; depression: number }): void;
}

export function buildAction(): Action {
  const group = new THREE.Group();
  const parts = hammerParts();
  const shanks = instanced(parts.shank, M.wood, KEY_COUNT);
  const mouldings = instanced(parts.moulding, M.moulding, KEY_COUNT);
  const felts = instanced(parts.felt, M.felt, KEY_COUNT);
  const underfelts = instanced(parts.underfelt, M.feltUnder, KEY_COUNT, false);
  const butts = instanced(parts.butt, M.wood, KEY_COUNT);
  const buttFelts = instanced(parts.buttFelt, M.greenFelt, KEY_COUNT, false);
  group.add(shanks, mouldings, felts, underfelts, butts, buttFelts);

  // Dampers: a wooden block holding a red felt pad against the strings.
  const damped = [] as number[];
  for (let p = LOWEST; p <= HIGHEST; p++) if (hasDamper(p)) damped.push(p);
  const damperFelt = instanced(new THREE.BoxGeometry(0.0105, 0.02, 0.006), M.redFelt, damped.length);
  const damperBlock = instanced(new RoundedBoxGeometry(0.0105, 0.016, 0.012, 2, 0.0015), M.wood, damped.length);
  const damperWire = instanced(new THREE.CylinderGeometry(0.0007, 0.0007, 0.075, 5), M.steel, damped.length, false);
  group.add(damperFelt, damperBlock, damperWire);

  // Lower action riding on each key: wippen, backcheck, bridle tape.
  const wippens = instanced(new RoundedBoxGeometry(0.0095, 0.016, 0.075, 2, 0.002), M.wood, KEY_COUNT);
  const jacks = instanced(new THREE.BoxGeometry(0.004, 0.08, 0.005), M.wood, KEY_COUNT);
  const backchecks = instanced(new RoundedBoxGeometry(0.0095, 0.014, 0.012, 2, 0.002), M.redFelt, KEY_COUNT);
  const checkWires = instanced(new THREE.CylinderGeometry(0.0008, 0.0008, 0.06, 5), M.steel, KEY_COUNT, false);
  const tapes = instanced(new THREE.BoxGeometry(0.004, 0.012, 0.004), M.greenFelt, KEY_COUNT, false);
  group.add(wippens, jacks, backchecks, checkWires, tapes);

  // Rails and brackets, one span per section.
  for (const s of SECTIONS) {
    const x0 = hammerX(s.first) - HAMMER_PITCH / 2;
    const x1 = hammerX(s.last) + HAMMER_PITCH / 2;
    // Main rail under the hammer butts.
    group.add(slab(x0, x1, HAMMER.pivotY - 0.03, HAMMER.pivotY - 0.012, HAMMER.pivotZ - 0.012, HAMMER.pivotZ + 0.016, M.wood));
    // Wippen rail.
    group.add(slab(x0, x1, WIPPEN.y - 0.03, WIPPEN.y - 0.016, WIPPEN.z - 0.05, WIPPEN.z - 0.03, M.wood));
  }
  // Hammer rail: the long brass bar the shanks rest against.
  const railLen = hammerX(HIGHEST) - hammerX(LOWEST) + HAMMER_PITCH + 2 * SECTION_GAP;
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.0105, railLen, 24), M.brass);
  rail.rotation.z = Math.PI / 2;
  rail.position.set((hammerX(LOWEST) + hammerX(HIGHEST)) / 2, RAIL.y, RAIL.z);
  rail.castShadow = true;
  rail.receiveShadow = true;
  group.add(rail);
  // Brass action brackets at the ends and between sections.
  for (const x of bracketXs()) {
    const bracket = new THREE.Mesh(new RoundedBoxGeometry(0.014, 0.33, 0.02, 2, 0.004), M.brass);
    bracket.position.set(x, 0.88, RAIL.z + 0.003);
    bracket.castShadow = true;
    group.add(bracket);
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.006, 16), M.brass);
    bolt.rotation.x = Math.PI / 2;
    bolt.position.set(x, RAIL.y, RAIL.z + 0.0135);
    group.add(bolt);
  }

  const restRot = new THREE.Euler();
  function update(state: (p: number) => { hammer: number; damper: number; depression: number }) {
    let d = 0;
    for (let p = LOWEST; p <= HIGHEST; p++) {
      const i = p - LOWEST;
      const s = state(p);
      const x = hammerX(p);
      const strike = strikeAngle(p);
      const angle = HAMMER.rest + (strike - HAMMER.rest) * s.hammer;

      tmp.position.set(x, HAMMER.pivotY, HAMMER.pivotZ);
      restRot.set(angle, 0, 0);
      tmp.rotation.copy(restRot);
      tmp.scale.set(1, 1, 1);
      tmp.updateMatrix();
      shanks.setMatrixAt(i, tmp.matrix);
      mouldings.setMatrixAt(i, tmp.matrix);
      felts.setMatrixAt(i, tmp.matrix);
      underfelts.setMatrixAt(i, tmp.matrix);
      butts.setMatrixAt(i, tmp.matrix);
      buttFelts.setMatrixAt(i, tmp.matrix);

      // The back of the key lifts the wippen a few millimetres.
      const lift = s.depression * 0.0068;
      tmp.rotation.set(0, 0, 0);
      tmp.position.set(x, WIPPEN.y + lift, WIPPEN.z);
      tmp.updateMatrix();
      wippens.setMatrixAt(i, tmp.matrix);
      tmp.position.set(x, WIPPEN.y + 0.045 + lift * 1.6, WIPPEN.z - 0.03);
      tmp.updateMatrix();
      jacks.setMatrixAt(i, tmp.matrix);
      tmp.position.set(x, WIPPEN.y + 0.04 + lift, WIPPEN.z + 0.03);
      tmp.updateMatrix();
      checkWires.setMatrixAt(i, tmp.matrix);
      tmp.position.set(x, WIPPEN.y + 0.074 + lift, WIPPEN.z + 0.032);
      tmp.updateMatrix();
      backchecks.setMatrixAt(i, tmp.matrix);
      tmp.position.set(x + 0.003, WIPPEN.y + 0.03 + lift, WIPPEN.z - 0.012);
      tmp.updateMatrix();
      tapes.setMatrixAt(i, tmp.matrix);

      if (hasDamper(p)) {
        const z = (sectionOf(p) === 0 ? BASS_STRING_Z : STRING_Z) + stringRadius(p);
        const dx = stringXAt(p, DAMPER_Y);
        const off = s.damper * 0.008;
        tmp.position.set(dx, DAMPER_Y, z + 0.003 + off);
        tmp.updateMatrix();
        damperFelt.setMatrixAt(d, tmp.matrix);
        tmp.position.set(dx, DAMPER_Y, z + 0.012 + off);
        tmp.updateMatrix();
        damperBlock.setMatrixAt(d, tmp.matrix);
        tmp.position.set(dx, DAMPER_Y - 0.045, z + 0.014 + off * 0.6);
        tmp.updateMatrix();
        damperWire.setMatrixAt(d, tmp.matrix);
        d++;
      }
    }
    for (const m of [shanks, mouldings, felts, underfelts, butts, buttFelts, wippens, jacks, checkWires, backchecks, tapes, damperFelt, damperBlock, damperWire]) {
      m.instanceMatrix.needsUpdate = true;
    }
  }

  update(() => ({ hammer: 0, damper: 0, depression: 0 }));
  return { group, update };
}
