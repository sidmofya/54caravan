// 10⁻¹³ m: the empty atom and its nucleus, in femtometres.
//
// Past the innermost electrons there is almost nothing: the nucleus is about
// 1/30,000 the width of the atom. We fall through the sparse haze of the 1s
// cloud toward a speck, which grows into iron-56: 26 protons and 30
// neutrons packed into a ball 9 femtometres across, jostling.

import * as THREE from "three";
import { rng } from "../../rng";
import type { Choreography } from "../choreography";
import { aim, glowTexture, pulseEnergy, smoothstep, type FrameContext, type Level } from "../level";

export const NUCLEON_R = 0.88; // fm
const PROTONS = 26;
const NUCLEONS = 56;

/** Pack 56 nucleons into a ball by relaxing random positions; deterministic. */
export function packNucleus(seed = 56): THREE.Vector3[] {
  const R = rng(seed);
  const pts = Array.from({ length: NUCLEONS }, () => {
    const v = new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(6);
    return v;
  });
  const d = 2 * NUCLEON_R * 0.97;
  for (let it = 0; it < 400; it++) {
    for (let i = 0; i < pts.length; i++) {
      // Pull toward the centre, push apart where overlapping.
      pts[i].multiplyScalar(0.985);
      for (let j = i + 1; j < pts.length; j++) {
        const diff = pts[i].clone().sub(pts[j]);
        const len = diff.length();
        if (len < d && len > 1e-6) {
          diff.multiplyScalar(((d - len) / len) * 0.5);
          pts[i].add(diff);
          pts[j].sub(diff);
        }
      }
    }
  }
  return pts;
}

export class NucleusLevel implements Level {
  readonly id = "nucleus" as const;
  readonly unitExp = -15;
  readonly bloom = 0.55;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.001, 1e6);
  readonly positions: THREE.Vector3[];
  readonly isProton: boolean[];
  private readonly nucleons: THREE.InstancedMesh[];
  private readonly glow: THREE.Sprite;
  private readonly haze: THREE.Points;

  constructor(private readonly ch: Choreography) {
    this.scene.background = new THREE.Color(0x010206);
    this.positions = packNucleus();
    const R = rng(26);
    const order = this.positions.map((_, i) => i).sort(() => R() - 0.5);
    this.isProton = this.positions.map((_, i) => order.indexOf(i) < PROTONS);

    const sphere = new THREE.SphereGeometry(NUCLEON_R, 32, 24);
    const protonMat = new THREE.MeshStandardMaterial({ color: 0xff6a3d, emissive: 0x5a1406, roughness: 0.35, metalness: 0.1 });
    const neutronMat = new THREE.MeshStandardMaterial({ color: 0x9fb4d6, emissive: 0x111a2c, roughness: 0.4, metalness: 0.1 });
    this.nucleons = [new THREE.InstancedMesh(sphere, protonMat, PROTONS), new THREE.InstancedMesh(sphere, neutronMat, NUCLEONS - PROTONS)];
    this.scene.add(...this.nucleons);

    // From afar the nucleus is just a speck of light.
    this.glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture(64, 2.5), color: 0xffc890, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.scene.add(this.glow);

    // The thin outer edge of the 1s electron cloud, streaming past as we fall.
    const hz: number[] = [];
    for (let i = 0; i < 5000; i++) {
      // r²e^(-2r/a): sample a Gamma(3) radius, scaled so the peak sits near 2000 fm.
      const r = -Math.log(R() * R() * R()) * 1000;
      const z = 2 * R() - 1;
      const ph = R() * Math.PI * 2;
      const s = Math.sqrt(1 - z * z);
      hz.push(r * s * Math.cos(ph), r * z, r * s * Math.sin(ph));
    }
    const hgeo = new THREE.BufferGeometry();
    hgeo.setAttribute("position", new THREE.Float32BufferAttribute(hz, 3));
    this.haze = new THREE.Points(
      hgeo,
      new THREE.PointsMaterial({ color: 0xbfd6ff, size: 3, sizeAttenuation: false, map: glowTexture(32, 2), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.haze.frustumCulled = false;
    this.scene.add(this.haze);

    this.scene.add(new THREE.HemisphereLight(0xffe2c4, 0x10182a, 0.6));
    const key = new THREE.PointLight(0xfff1dc, 60, 0, 2);
    key.position.set(-8, 10, 12);
    this.scene.add(key);
    const rim = new THREE.PointLight(0x7aa0ff, 40, 0, 2);
    rim.position.set(10, -4, -10);
    this.scene.add(rim);
  }

  /** The proton nearest the camera's line of approach: the one we dive into. */
  targetProton(dir: THREE.Vector3): THREE.Vector3 {
    let best = -Infinity;
    let at = new THREE.Vector3();
    this.positions.forEach((p, i) => {
      if (!this.isProton[i]) return;
      const score = p.dot(dir);
      if (score > best) {
        best = score;
        at = p;
      }
    });
    return at.clone();
  }

  static approach(t: number) {
    return new THREE.Vector3(Math.sin(0.4 + t * 0.05), 0.3, Math.cos(0.4 + t * 0.05)).normalize();
  }

  update(ctx: FrameContext) {
    // Nucleons jostle; each note sets the whole nucleus breathing.
    const breathe = 1 + 0.04 * Math.min(pulseEnergy(ctx.pulses), 1.2) * Math.sin(ctx.t * 9);
    const tmp = new THREE.Object3D();
    const counters = [0, 0];
    this.positions.forEach((p, i) => {
      const k = this.isProton[i] ? 0 : 1;
      const j = (x: number) => 0.12 * Math.sin(ctx.t * (2.3 + (i % 5) * 0.4) + i * x);
      tmp.position.set(p.x * breathe + j(1.1), p.y * breathe + j(2.3), p.z * breathe + j(3.7));
      tmp.updateMatrix();
      this.nucleons[k].setMatrixAt(counters[k]++, tmp.matrix);
    });
    for (const m of this.nucleons) m.instanceMatrix.needsUpdate = true;

    const width = Math.pow(10, ctx.L + 15);
    const dir = NucleusLevel.approach(ctx.t);
    // Close on one proton at the surface as we near the handover.
    const target = new THREE.Vector3().lerp(this.targetProton(dir), smoothstep(-13.3, -14.1, ctx.L));
    aim(this.camera, target, dir, width, ctx.aspect);
    // The speck: a constant few pixels until the nucleus itself resolves.
    this.glow.scale.setScalar(width * 0.02);
    (this.glow.material as THREE.SpriteMaterial).opacity = 1 - smoothstep(-12.6, -13.2, ctx.L);
  }
}
