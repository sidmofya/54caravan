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

export interface Room {
  group: THREE.Group;
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
  for (const side of [-1, 1]) {
    const sideWall = new THREE.Mesh(new THREE.PlaneGeometry(8, 3.2), wall.material);
    sideWall.position.set(side * 2.6, 1.6, 3.6);
    sideWall.rotation.y = -side * Math.PI / 2;
    sideWall.receiveShadow = true;
    group.add(sideWall);
  }
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

  return { group };
}
