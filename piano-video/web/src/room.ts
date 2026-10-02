import * as THREE from "three";
import { materials as M, slab } from "./piano/materials";
import { rng } from "./rng";

// A warm living room like the reference photo: plank floor, cream wall,
// patterned rug, floor lamp, potted plant, a framed picture and a bookcase.


function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext("2d")!);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function floorTexture() {
  const rand = rng(7);
  const tex = canvasTexture(1024, 1024, (c) => {
    const planks = 8;
    const pw = 1024 / planks;
    for (let i = 0; i < planks; i++) {
      for (let seg = 0; seg < 3; seg++) {
        const y0 = ((seg + (i % 2) * 0.5) / 3) * 1024 - (i % 2 ? 170 : 0);
        const tone = 0.78 + rand() * 0.3;
        c.fillStyle = `rgb(${Math.round(112 * tone)},${Math.round(62 * tone)},${Math.round(34 * tone)})`;
        c.fillRect(i * pw, y0, pw, 1024 / 3 + 2);
        c.strokeStyle = "rgba(30,14,6,0.55)";
        c.lineWidth = 2;
        c.strokeRect(i * pw, y0, pw, 1024 / 3);
        for (let g = 0; g < 14; g++) {
          c.strokeStyle = `rgba(40,18,8,${0.08 + rand() * 0.12})`;
          c.lineWidth = 1 + rand() * 2;
          const x = i * pw + rand() * pw;
          c.beginPath();
          c.moveTo(x, y0);
          c.bezierCurveTo(x + rand() * 12 - 6, y0 + 110, x + rand() * 12 - 6, y0 + 220, x, y0 + 1024 / 3);
          c.stroke();
        }
      }
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(5, 5);
  return tex;
}

function rugTexture() {
  const rand = rng(11);
  return canvasTexture(1024, 768, (c) => {
    c.fillStyle = "#e9e1d0";
    c.fillRect(0, 0, 1024, 768);
    const colors = ["#1f2f4f", "#8c2f2a", "#c79a5a", "#2c4a5e", "#5b2a2e"];
    // Borders
    for (const [inset, col, w] of [
      [10, "#1f2f4f", 26],
      [52, "#8c2f2a", 10],
      [74, "#c79a5a", 6],
    ] as const) {
      c.strokeStyle = col;
      c.lineWidth = w;
      c.strokeRect(inset, inset, 1024 - 2 * inset, 768 - 2 * inset);
    }
    // Field: a dense diamond lattice of small motifs.
    for (let y = 110; y < 660; y += 34) {
      for (let x = 110; x < 920; x += 34) {
        c.fillStyle = colors[Math.floor(rand() * colors.length)];
        c.globalAlpha = 0.55 + rand() * 0.4;
        c.beginPath();
        c.moveTo(x, y - 12);
        c.lineTo(x + 12, y);
        c.lineTo(x, y + 12);
        c.lineTo(x - 12, y);
        c.closePath();
        c.fill();
      }
    }
    c.globalAlpha = 1;
    // Central medallion.
    c.fillStyle = "#1f2f4f";
    c.beginPath();
    c.ellipse(512, 384, 170, 120, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#c79a5a";
    c.beginPath();
    c.ellipse(512, 384, 110, 74, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#8c2f2a";
    c.beginPath();
    c.ellipse(512, 384, 50, 34, 0, 0, Math.PI * 2);
    c.fill();
  });
}

function wallTexture() {
  return canvasTexture(256, 512, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, "#d9cdb8");
    g.addColorStop(1, "#c9b99f");
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 512);
  });
}

function paintingTexture() {
  const rand = rng(3);
  return canvasTexture(512, 360, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 360);
    g.addColorStop(0, "#5d6a63");
    g.addColorStop(0.55, "#a99b72");
    g.addColorStop(1, "#4b4031");
    c.fillStyle = g;
    c.fillRect(0, 0, 512, 360);
    for (let i = 0; i < 160; i++) {
      c.fillStyle = `rgba(${40 + rand() * 60},${50 + rand() * 50},${30 + rand() * 30},0.35)`;
      c.beginPath();
      c.arc(rand() * 512, 180 + rand() * 180, 6 + rand() * 30, 0, Math.PI * 2);
      c.fill();
    }
  });
}

export const ROOM = { halfWidth: 2.6 };
/** The bedroom doorway in the left wall. */
export const DOOR = { z0: 1.55, z1: 2.4, height: 2.04 };
/** The window in the right wall. */
export const WINDOW = { z0: 0.75, z1: 1.85, y0: 0.85, y1: 2.15 };

const trimMat = () => new THREE.MeshStandardMaterial({ color: 0xece6da, roughness: 0.5 });

function buildDoor(group: THREE.Group): THREE.Object3D {
  const x = -ROOM.halfWidth;
  const trim = trimMat();
  // Architrave around the opening, on the room side.
  group.add(slab(x, x + 0.02, 0, DOOR.height + 0.07, DOOR.z0 - 0.07, DOOR.z0, trim));
  group.add(slab(x, x + 0.02, 0, DOOR.height + 0.07, DOOR.z1, DOOR.z1 + 0.07, trim));
  group.add(slab(x, x + 0.02, DOOR.height, DOOR.height + 0.07, DOOR.z0 - 0.07, DOOR.z1 + 0.07, trim));
  // Jamb linings through the wall's thickness.
  group.add(slab(x - 0.12, x, 0, DOOR.height, DOOR.z0 - 0.015, DOOR.z0, trim));
  group.add(slab(x - 0.12, x, 0, DOOR.height, DOOR.z1, DOOR.z1 + 0.015, trim));
  group.add(slab(x - 0.12, x, DOOR.height - 0.015, DOOR.height, DOOR.z0, DOOR.z1, trim));
  // The leaf: a panelled door hinged at z0, swinging into the room.
  const hinge = new THREE.Group();
  hinge.position.set(x + 0.01, 0, DOOR.z0);
  const w = DOOR.z1 - DOOR.z0 - 0.006;
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xe9e2d4, roughness: 0.45 });
  hinge.add(slab(-0.02, 0.02, 0.005, DOOR.height - 0.008, 0.003, w, leafMat));
  for (const [y0, y1] of [[0.18, 0.95], [1.1, 1.88]]) {
    hinge.add(slab(0.02, 0.026, y0, y1, 0.1, w - 0.1, leafMat));
  }
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.028, 16, 12), M.brass);
  knob.position.set(0.05, 1.0, w - 0.07);
  hinge.add(knob);
  group.add(hinge);
  return hinge;
}

function buildHall(group: THREE.Group) {
  // A short hall beyond the door, lit warm: the bedroom light left on.
  const x = -ROOM.halfWidth;
  const hallMat = new THREE.MeshStandardMaterial({ color: 0xd9c2a0, roughness: 0.9, side: THREE.BackSide });
  const hall = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.6, 2.6), hallMat);
  hall.position.set(x - 0.12 - 0.8, 1.3, (DOOR.z0 + DOOR.z1) / 2);
  group.add(hall);
  const glow = new THREE.PointLight(0xffc27a, 3.2, 1.9, 2);
  glow.position.set(x - 0.9, 1.9, (DOOR.z0 + DOOR.z1) / 2 + 0.3);
  group.add(glow);
  // The wedge of light that falls into the room when the door opens.
  const spill = new THREE.SpotLight(0xffc888, 0, 0, 0.42, 0.7, 2);
  spill.position.set(x - 0.9, 1.7, (DOOR.z0 + DOOR.z1) / 2);
  spill.target.position.set(x + 1.6, 0, (DOOR.z0 + DOOR.z1) / 2 - 0.2);
  group.add(spill, spill.target);
  return { spill };
}

function buildWindow(group: THREE.Group) {
  const x = ROOM.halfWidth;
  const trim = trimMat();
  const { z0, z1, y0, y1 } = WINDOW;
  // Frame, glazing bars and sill.
  group.add(slab(x - 0.02, x, y0 - 0.06, y0, z0 - 0.06, z1 + 0.06, trim));
  group.add(slab(x - 0.06, x, y0 - 0.03, y0, z0 - 0.08, z1 + 0.08, trim));
  group.add(slab(x - 0.02, x, y1, y1 + 0.06, z0 - 0.06, z1 + 0.06, trim));
  group.add(slab(x - 0.02, x, y0, y1, z0 - 0.06, z0, trim));
  group.add(slab(x - 0.02, x, y0, y1, z1, z1 + 0.06, trim));
  group.add(slab(x - 0.02, x, y0, y1, (z0 + z1) / 2 - 0.02, (z0 + z1) / 2 + 0.02, trim));
  group.add(slab(x - 0.02, x, (y0 + y1) / 2 - 0.02, (y0 + y1) / 2 + 0.02, z0, z1, trim));
  // The sky outside, a plane a little beyond the glass.
  const sky = new THREE.MeshBasicMaterial({ color: 0x0b1424 });
  const skyPlane = new THREE.Mesh(new THREE.PlaneGeometry(z1 - z0 + 0.4, y1 - y0 + 0.4), sky);
  skyPlane.position.set(x + 0.25, (y0 + y1) / 2, (z0 + z1) / 2);
  skyPlane.rotation.y = -Math.PI / 2;
  group.add(skyPlane);
  // Curtains, drawn back to either side in soft folds.
  const curtainMat = new THREE.MeshStandardMaterial({ color: 0x5e4a3a, roughness: 0.95, side: THREE.DoubleSide });
  for (const [za, zb] of [[z0 - 0.32, z0 + 0.04], [z1 - 0.04, z1 + 0.32]]) {
    const geo = new THREE.PlaneGeometry(zb - za, 2.3, 40, 1);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 55) * 0.025);
    geo.computeVertexNormals();
    const c = new THREE.Mesh(geo, curtainMat);
    c.position.set(x - 0.08, 2.35 - 1.15, (za + zb) / 2);
    c.rotation.y = -Math.PI / 2;
    c.castShadow = true;
    c.receiveShadow = true;
    group.add(c);
  }
  const dawn = new THREE.DirectionalLight(0xbcd0ff, 0);
  dawn.position.set(x + 3, 2.6, (z0 + z1) / 2);
  dawn.target.position.set(-0.5, 0.6, 0.6);
  group.add(dawn, dawn.target);
  return { sky, dawn };
}

export interface Room {
  group: THREE.Group;
  /** The door leaf, hinged on its z = DOOR.z0 edge; rotate about y to open (positive opens into the room). */
  door: THREE.Object3D;
  /** Warm light from the hall, spilling through the open door. */
  spill: THREE.SpotLight;
  /** The sky beyond the window: night to dawn. */
  sky: THREE.MeshBasicMaterial;
  /** Cool morning light through the window, off until dawn. */
  dawn: THREE.DirectionalLight;
}

export function buildRoom(): Room {
  const group = new THREE.Group();
  const wallZ = -0.325;

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 10),
    new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.42, metalness: 0 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = 3;
  floor.receiveShadow = true;
  group.add(floor);

  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 3.2),
    new THREE.MeshStandardMaterial({ map: wallTexture(), roughness: 0.92 }),
  );
  wall.position.set(0, 1.6, wallZ);
  wall.receiveShadow = true;
  group.add(wall);
  // Side walls and ceiling close the room, so no shot looks into a void.
  // The left wall has the bedroom door; the right wall a window.
  const wallPiece = (side: number, z0: number, z1: number, y0: number, y1: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(z1 - z0, y1 - y0), wall.material);
    m.position.set(side * ROOM.halfWidth, (y0 + y1) / 2, (z0 + z1) / 2);
    m.rotation.y = -side * Math.PI / 2;
    m.receiveShadow = true;
    group.add(m);
  };
  wallPiece(-1, -0.4, DOOR.z0, 0, 3.2);
  wallPiece(-1, DOOR.z1, 7.6, 0, 3.2);
  wallPiece(-1, DOOR.z0, DOOR.z1, DOOR.height, 3.2);
  wallPiece(1, -0.4, WINDOW.z0, 0, 3.2);
  wallPiece(1, WINDOW.z1, 7.6, 0, 3.2);
  wallPiece(1, WINDOW.z0, WINDOW.z1, 0, WINDOW.y0);
  wallPiece(1, WINDOW.z0, WINDOW.z1, WINDOW.y1, 3.2);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(6, 8), new THREE.MeshStandardMaterial({ color: 0xe8e0d2, roughness: 1 }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, 3.2, 3.6);
  group.add(ceiling);
  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.2), wall.material);
  backWall.position.set(0, 1.6, 7.6);
  backWall.rotation.y = Math.PI;
  group.add(backWall);
  group.add(slab(-5, 5, 0, 0.11, wallZ, wallZ + 0.016, M.lacquer)); // skirting

  const rug = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 0.008, 1.8),
    new THREE.MeshStandardMaterial({ map: rugTexture(), roughness: 1 }),
  );
  rug.position.set(-1.1, 0.004, 1.25);
  rug.rotation.y = 0.12;
  rug.receiveShadow = true;
  group.add(rug);

  // Framed picture above the piano, left of centre.
  const frame = slab(-1.25, -0.55, 1.62, 2.12, wallZ, wallZ + 0.035, M.brass);
  group.add(frame);
  const art = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.42), new THREE.MeshStandardMaterial({ map: paintingTexture(), roughness: 0.8 }));
  art.position.set(-0.9, 1.87, wallZ + 0.036);
  group.add(art);

  // Floor lamp, back left, with a glowing shade.
  const lampX = -1.18;
  const lampZ = -0.1;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.025, 32), M.brass);
  base.position.set(lampX, 0.012, lampZ);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.45, 12), M.brass);
  pole.position.set(lampX, 0.73, lampZ);
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.17, 0.24, 0.32, 40, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0xf4e6c8,
      emissive: 0xffd9a0,
      emissiveIntensity: 1.6,
      side: THREE.DoubleSide,
      roughness: 0.9,
    }),
  );
  shade.position.set(lampX, 1.5, lampZ);
  group.add(base, pole, shade);

  // Potted plant at front left.
  const rand = rng(21);
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.17, 0.13, 0.32, 40),
    new THREE.MeshPhysicalMaterial({ color: 0x2c4f8c, roughness: 0.25, clearcoat: 1 }),
  );
  pot.position.set(-1.25, 0.16, 0.42);
  pot.castShadow = true;
  group.add(pot);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f5a2a, roughness: 0.55, side: THREE.DoubleSide });
  // A pointed leaf: a flattened sphere stretched and narrowed at one end.
  const leafGeo = new THREE.SphereGeometry(1, 14, 8);
  const lp = leafGeo.attributes.position;
  for (let i = 0; i < lp.count; i++) {
    const x = lp.getX(i);
    lp.setZ(i, lp.getZ(i) * (1 - 0.55 * Math.max(x, 0)));
  }
  leafGeo.computeVertexNormals();
  for (let i = 0; i < 46; i++) {
    const h = 0.45 + rand() * 0.95;
    const a = rand() * Math.PI * 2;
    const r = 0.06 + rand() * 0.28 * (h / 1.4);
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    leaf.scale.set(0.085, 0.005, 0.038);
    leaf.position.set(-1.25 + Math.cos(a) * r, h, 0.42 + Math.sin(a) * r);
    leaf.rotation.set(rand() * 0.8 - 0.4, -a, 0.3 + rand() * 0.5);
    leaf.castShadow = true;
    group.add(leaf);
  }

  // Bookcase on the right.
  const shelfMat = new THREE.MeshStandardMaterial({ color: 0x4a2c1a, roughness: 0.5 });
  const bx0 = 0.98;
  const bx1 = 1.62;
  group.add(slab(bx0, bx0 + 0.025, 0, 1.9, wallZ, 0.02, shelfMat), slab(bx1 - 0.025, bx1, 0, 1.9, wallZ, 0.02, shelfMat));
  group.add(slab(bx0, bx1, 0, 1.9, wallZ, wallZ + 0.01, shelfMat));
  const bookColors = [0x1f3550, 0x6e2a26, 0xd8d0bf, 0x2f4a3a, 0x8a6a3c, 0x222222, 0xb8b2a4];
  for (const y of [0.05, 0.5, 0.95, 1.4]) {
    group.add(slab(bx0, bx1, y - 0.025, y, wallZ, 0.02, shelfMat));
    let x = bx0 + 0.03;
    while (x < bx1 - 0.06) {
      const w = 0.018 + rand() * 0.03;
      const h = 0.24 + rand() * 0.14;
      const book = slab(x, x + w, y, y + h, wallZ + 0.03, -0.02 + rand() * 0.02, new THREE.MeshStandardMaterial({
        color: bookColors[Math.floor(rand() * bookColors.length)],
        roughness: 0.7,
      }));
      group.add(book);
      x += w + 0.002;
    }
  }

  const door = buildDoor(group);
  const { spill } = buildHall(group);
  const { sky, dawn } = buildWindow(group);
  return { group, door, spill, sky, dawn };
}
