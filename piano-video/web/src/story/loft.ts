// A tube of rings recomputed every frame: cloth and limbs that bend with
// the skeleton without a skinned mesh. Each ring is an ellipse (optionally
// shaped) in a frame given by a centre and two axes.

import * as THREE from "three";

export interface Ring {
  center: THREE.Vector3;
  xAxis: THREE.Vector3; // unit, ring's "width" direction
  zAxis: THREE.Vector3; // unit, ring's "depth" direction
  rx: number;
  rz: number;
  /** Optional per-angle radius multiplier, angle 0 = +x, π/2 = +z. */
  shape?: (theta: number) => number;
  /** Optional per-angle offset along zAxis (for a bust, a sag). */
  offset?: (theta: number) => number;
}

export class Loft {
  readonly mesh: THREE.Mesh;
  private readonly pos: THREE.BufferAttribute;

  constructor(
    readonly rings: number,
    readonly segments: number,
    material: THREE.Material,
    opts: { capStart?: boolean; capEnd?: boolean } = {},
  ) {
    const verts = rings * (segments + 1);
    const geo = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(verts * 3), 3);
    this.pos.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("position", this.pos);
    const uv = new Float32Array(verts * 2);
    const index: number[] = [];
    for (let r = 0; r < rings; r++) {
      for (let s = 0; s <= segments; s++) {
        const i = r * (segments + 1) + s;
        uv[i * 2] = s / segments;
        uv[i * 2 + 1] = r / (rings - 1);
        if (r < rings - 1 && s < segments) {
          const a = i;
          const b = i + segments + 1;
          index.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
    }
    void opts;
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geo.setIndex(index);
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
  }

  update(ringAt: (r: number, v: number) => Ring) {
    const p = this.pos;
    const tmp = new THREE.Vector3();
    for (let r = 0; r < this.rings; r++) {
      const ring = ringAt(r, r / (this.rings - 1));
      for (let s = 0; s <= this.segments; s++) {
        const th = (s / this.segments) * Math.PI * 2;
        const k = ring.shape ? ring.shape(th) : 1;
        const off = ring.offset ? ring.offset(th) : 0;
        tmp
          .copy(ring.center)
          .addScaledVector(ring.xAxis, Math.cos(th) * ring.rx * k)
          .addScaledVector(ring.zAxis, Math.sin(th) * ring.rz * k + off);
        p.setXYZ(r * (this.segments + 1) + s, tmp.x, tmp.y, tmp.z);
      }
    }
    p.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
  }
}
