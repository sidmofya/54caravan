// 10⁻² m: one hammer meeting its three strings, in millimetres.
//
// The scene's origin is the strike point on the middle string. Time here is
// the slowed physical clock (ms since impact): the felt presses in, the
// strings give, and a cloud of felt fibre and dust squeezes out.

import * as THREE from "three";
import { hammerParts } from "../../piano/action";
import { HAMMER, HAMMER_PITCH, STRING_Z, strikeAngle, stringRadius } from "../../piano/layout";
import { rng } from "../../rng";
import type { Choreography } from "../choreography";
import { aim, glowTexture, pulseEnergy, reflectMetals, smoothstep, type FrameContext, type Level } from "../level";
import { proceduralMaterial } from "../shaders";
import { SIDE_DIR, strikePoint } from "./piano";

const MM = 1000;
/** Felt-string contact time for this soft strike, ms. */
export const CONTACT_MS = 4.5;
/** Spacing of a tenor note's three unison strings, mm. */
const UNISON = 3.4;

/** How far the strings are pushed back and the felt compressed, mm, at physical time p (ms). */
export function strikeMotion(p: number) {
  const inContact = p > 0 && p < CONTACT_MS;
  const s = inContact ? Math.sin((Math.PI * p) / CONTACT_MS) : 0;
  const after = Math.max(p - CONTACT_MS, 0);
  // The string keeps vibrating after the hammer leaves (A3: 4.5 ms period).
  const ring = p > CONTACT_MS ? 0.55 * Math.sin((2 * Math.PI * after) / 4.54) * Math.exp(-after / 60) : 0;
  const stringBack = 0.85 * s + ring;
  const compression = 0.38 * s;
  const rebound = 0.6 * after; // hammer flies back off the string, mm
  return { stringBack, compression, hammerBack: inContact ? stringBack + compression : -rebound };
}

/**
 * The camera picks up from the piano's side view (SIDE_DIR), then swings
 * round behind the strings, into the gap between strings and plate, to look
 * out at the felt slamming into them. It closes on the felt between the
 * first two strings, where the felt bulges around the wire.
 */
const BEHIND_DIR = new THREE.Vector3(0.3, 0.15, -1).normalize();
const GAP_TARGET = new THREE.Vector3(-UNISON + 0.85, 0, -0.1);

function woodMaterial() {
  return proceduralMaterial(
    { color: 0xb88a5a, roughness: 0.6 },
    /* glsl */ `
      // Maple: fine growth rings running along the moulding, and pores.
      vec3 q = vObj * vec3(0.9, 0.25, 0.9);
      float ring = fract((vObj.z * 0.55 + vObj.x * 0.08 + fbm(q * 0.6) * 1.8) * 1.4);
      float late = smoothstep(0.55, 0.95, ring);
      float pores = smoothstep(0.62, 0.8, vnoise(vObj * vec3(14.0, 1.2, 14.0)));
      albedo *= mix(1.08, 0.72, late) * (1.0 - 0.25 * pores) * (0.92 + 0.16 * fbm(vObj * 3.0));
      rough = mix(0.5, 0.75, late);
    `,
  );
}

/** GLSL for matted wool: curly fibres ~15-30 µm across, from warped ridge noise (vObj in mm). */
export const FELT_GLSL = /* glsl */ `
  vec3 q = vObj;
  vec3 w = vec3(fbm(q * 5.0), fbm(q * 5.0 + 5.2), fbm(q * 5.0 + 9.1));
  vec3 a = (q + w * 0.12) * 60.0;
  vec3 b = (q + w * 0.2) * 32.0 + 3.0;
  float r1 = 1.0 - abs(2.0 * vnoise(a) - 1.0);
  float r2 = 1.0 - abs(2.0 * vnoise(b) - 1.0);
  // Fade the finest fibres where they would shimmer below a pixel.
  float fine = clamp(1.5 - length(fwidth(a)) * 1.2, 0.0, 1.0);
  float coarse = clamp(1.5 - length(fwidth(b)) * 1.2, 0.0, 1.0);
  float fibres = max(pow(r1, 5.0) * fine, pow(r2, 5.0) * 0.85 * coarse);
  // Shadowed gaps between fibres, lighter where fibres pile up.
  float depth = smoothstep(0.15, 0.85, fbm(q * 14.0 + w));
  float mottle = fbm(q * 1.5) - 0.5;
  float far = 1.0 - max(fine, coarse);
  albedo *= mix(0.55 + 0.3 * depth, 1.15, fibres) * (1.0 - 0.25 * far) + 0.12 * mottle + 0.2 * far;
`;

function feltMaterial() {
  return proceduralMaterial({ color: 0xd8c3a6, roughness: 1 }, FELT_GLSL);
}

function steelMaterial(uniforms: { uBack: { value: number } }) {
  const mat = proceduralMaterial(
    { color: 0xd2d6da, metalness: 1, roughness: 0.3 },
    /* glsl */ `
      // Drawing marks: fine grooves running along the wire.
      float g = vnoise(vec3(vObj.x * 28.0, vObj.y * 0.4, vObj.z * 28.0));
      albedo *= 0.85 + 0.25 * g;
      rough = 0.22 + 0.25 * g;
    `,
    uniforms,
    // Pushed back by the hammer, most at the strike point.
    `transformed.z -= uBack * exp(-pow(position.y / 38.0, 2.0));`,
  );
  return mat;
}

export class HammerLevel implements Level {
  readonly id = "hammer" as const;
  readonly unitExp = -3;
  readonly bloom = 0.35;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.01, 1000);
  private readonly hammer = new THREE.Group();
  private readonly pivot: THREE.Vector3;
  private readonly strike: number;
  private readonly stringUniforms = { uBack: { value: 0 } };
  private readonly rim: THREE.DirectionalLight;
  private readonly dust: THREE.Points;
  private readonly dustSeeds: Float32Array; // per particle: x0,y0,z0, vx,vy,vz, t0, size
  private readonly fibres: THREE.InstancedMesh;
  private readonly fibreSeeds: { p0: THREE.Vector3; v: THREE.Vector3; t0: number; axis: THREE.Vector3; spin: number }[] = [];

  constructor(
    private readonly ch: Choreography,
    renderer: THREE.WebGLRenderer,
  ) {
    const p = ch.strike.p;
    const c = strikePoint(p);
    this.strike = strikeAngle(p);
    this.pivot = new THREE.Vector3(0, (HAMMER.pivotY - c.y) * MM, (HAMMER.pivotZ - c.z) * MM);
    this.scene.background = new THREE.Color(0x120d08);
    this.scene.fog = new THREE.Fog(0x120d08, 60, 260);

    // The hammer: shank, maple moulding with its grain, felt, white underfelt.
    const parts = hammerParts(64);
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
      geo.scale(MM, MM, MM);
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = m.receiveShadow = true;
      this.hammer.add(m);
      return m;
    };
    add(parts.shank, woodMaterial());
    add(parts.moulding, woodMaterial());
    add(parts.felt, feltMaterial());
    add(parts.underfelt, new THREE.MeshStandardMaterial({ color: 0xf2ece2, roughness: 1 }));
    this.hammer.position.copy(this.pivot);
    this.scene.add(this.hammer);

    // Neighbours at rest, their noses well forward of the strings.
    for (const k of [-2, -1, 1, 2]) {
      const n = this.hammer.clone();
      n.position.x += k * HAMMER_PITCH * MM;
      n.rotation.x = HAMMER.rest;
      this.scene.add(n);
    }

    // Three unison strings, and the neighbours' strings either side.
    const r = stringRadius(p) * MM;
    const stringZ = (STRING_Z - c.z) * MM;
    const steel = steelMaterial(this.stringUniforms);
    const steelStill = new THREE.MeshStandardMaterial({ color: 0xc9cdd1, metalness: 1, roughness: 0.32 });
    const strGeo = new THREE.CylinderGeometry(r, r, 240, 24, 120);
    for (let j = -1; j <= 1; j++) {
      const s = new THREE.Mesh(strGeo, steel);
      s.position.set(j * UNISON, 0, stringZ);
      s.castShadow = s.receiveShadow = true;
      this.scene.add(s);
      for (const side of [-1, 1]) {
        const n = new THREE.Mesh(strGeo, steelStill);
        n.position.set(j * UNISON + side * HAMMER_PITCH * MM, 0, stringZ);
        n.receiveShadow = true;
        this.scene.add(n);
      }
    }

    // The gold plate behind the strings, out of focus.
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(600, 600),
      new THREE.MeshStandardMaterial({ color: 0xb8914a, metalness: 0.7, roughness: 0.55 }),
    );
    plate.position.z = (-0.212 - c.z) * MM;
    plate.receiveShadow = true;
    this.scene.add(plate);

    // Light: the warm work light from above the keys, a hemisphere fill, and
    // a rim light from behind that makes the dust glitter.
    this.scene.add(new THREE.HemisphereLight(0xffe9cc, 0x2a1a10, 0.5));
    const key = new THREE.DirectionalLight(0xffd9a8, 3.2);
    key.position.set(-40, 120, 140);
    key.castShadow = true;
    key.shadow.mapSize.set(1536, 1536);
    key.shadow.camera.left = key.shadow.camera.bottom = -40;
    key.shadow.camera.right = key.shadow.camera.top = 40;
    key.shadow.camera.near = 10;
    key.shadow.camera.far = 400;
    key.shadow.bias = -0.0005;
    this.scene.add(key);
    this.rim = new THREE.DirectionalLight(0xffc89a, 2.2);
    this.rim.position.set(60, 40, -120);
    this.scene.add(this.rim);

    // Dust: fine felt and wood particles squeezed out of the contact.
    const R = rng(91);
    const N = 1500;
    this.dustSeeds = new Float32Array(N * 8);
    const pos = new Float32Array(N * 3);
    const size = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const o = i * 8;
      const burst = i < N * 0.9;
      if (burst) {
        // Born along the line where felt meets the three strings.
        const x = (R() - 0.5) * 12;
        const y = (R() - 0.5) * 6;
        const ang = R() * Math.PI * 2;
        const speed = 0.25 + R() ** 2 * 2.4; // mm per ms
        // Squeezed out of the felt face toward the strings and past them.
        this.dustSeeds.set([x, y, -0.1 - R() * 0.4, Math.cos(ang) * speed * 0.8, Math.sin(ang) * speed, -(0.25 + R()) * speed * 0.7, R() * 0.6, 0.004 + R() ** 4 * 0.03], o);
      } else {
        // Motes already hanging in the air, catching the light.
        // Motes in the air between strings and plate.
        this.dustSeeds.set([(R() - 0.5) * 60, (R() - 0.5) * 40, -2 - R() * 18, 0, 0, 0, -1, 0.008 + R() ** 3 * 0.04], o);
      }
      size[i] = this.dustSeeds[o + 7];
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    dustGeo.setAttribute("size", new THREE.BufferAttribute(size, 1));
    const dustMat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: glowTexture(64, 1.6) }, uScale: { value: 1 }, uLight: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float size;
        uniform float uScale;
        varying float vFade;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = max(size * uScale / -mv.z, 1.0);
          vFade = clamp(size * uScale / -mv.z, 0.0, 1.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        uniform float uLight;
        varying float vFade;
        void main() {
          float a = texture2D(uMap, gl_PointCoord).a;
          gl_FragColor = vec4(vec3(1.0, 0.86, 0.66) * uLight * 1.4, a * (0.25 + 0.75 * vFade));
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.dust = new THREE.Points(dustGeo, dustMat);
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);

    // Loose wool fibres, crimped, tumbling out with the dust.
    const crimp = new THREE.CatmullRomCurve3(
      Array.from({ length: 9 }, (_, k) => new THREE.Vector3(Math.sin(k * 1.9) * 0.05, k / 8 - 0.5, Math.cos(k * 1.3) * 0.04)),
    );
    const fibreGeo = new THREE.TubeGeometry(crimp, 40, 0.008, 5, false);
    this.fibres = new THREE.InstancedMesh(
      fibreGeo,
      new THREE.MeshStandardMaterial({ color: 0xf2e6d2, roughness: 1, emissive: 0x2a2015 }),
      22,
    );
    for (let i = 0; i < 22; i++) {
      const ang = R() * Math.PI * 2;
      const speed = 0.2 + R() * 1.1;
      this.fibreSeeds.push({
        p0: new THREE.Vector3((R() - 0.5) * 11, (R() - 0.5) * 5, -0.2 - R() * 0.4),
        v: new THREE.Vector3(Math.cos(ang) * speed * 0.7, Math.sin(ang) * speed, -(0.3 + R()) * speed * 0.7),
        t0: R() * 1.5,
        axis: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize(),
        spin: (R() - 0.5) * 3,
      });
    }
    this.fibres.frustumCulled = false;
    this.scene.add(this.fibres);
    reflectMetals(this.scene, renderer, 0.5);
  }

  update(ctx: FrameContext) {
    const p = ctx.physMs;
    const m = strikeMotion(p);
    // Hammer: swings with the felt into the strings, then away.
    this.hammer.rotation.x = this.strike - m.hammerBack / (HAMMER.shank * MM);
    this.stringUniforms.uBack.value = m.stringBack;

    // Particles: drag-limited flight from their birth, in closed form.
    const DRAG = 1.6; // ms
    const pos = this.dust.geometry.attributes.position as THREE.BufferAttribute;
    const s = this.dustSeeds;
    for (let i = 0; i < pos.count; i++) {
      const o = i * 8;
      const born = s[o + 6];
      if (born < 0) {
        // Ambient motes drift on air currents.
        const drift = ctx.t * 0.25;
        pos.setXYZ(i, s[o] + Math.sin(drift + i) * 0.4, s[o + 1] + Math.sin(drift * 0.7 + i * 1.3) * 0.3, s[o + 2]);
        continue;
      }
      const age = Math.max(p - born, 0);
      const k = DRAG * (1 - Math.exp(-age / DRAG));
      const shown = age > 0 ? 1 : 0;
      pos.setXYZ(i, s[o] + s[o + 3] * k, s[o + 1] + s[o + 4] * k, (s[o + 2] + s[o + 5] * k) * shown - (1 - shown) * 1000);
    }
    pos.needsUpdate = true;

    const tmp = new THREE.Object3D();
    this.fibreSeeds.forEach((f, i) => {
      const age = Math.max(p - f.t0, 0);
      const k = DRAG * 1.4 * (1 - Math.exp(-age / (DRAG * 1.4)));
      tmp.position.copy(f.p0).addScaledVector(f.v, k);
      if (age <= 0) tmp.position.z -= 1000;
      tmp.quaternion.setFromAxisAngle(f.axis, 1 + f.spin * k);
      const len = 0.6 + (i % 7) * 0.25;
      tmp.scale.set(len, len, len);
      tmp.updateMatrix();
      this.fibres.setMatrixAt(i, tmp.matrix);
    });
    this.fibres.instanceMatrix.needsUpdate = true;

    // Every note in the music brightens the rim light a touch.
    this.rim.intensity = 2.2 + 3 * pulseEnergy(ctx.pulses);

    // Camera: matches the piano's dive angle at the handover, then swings to
    // the bass side to look along the felt's nose at the nearest string.
    const target = new THREE.Vector3().lerp(GAP_TARGET, smoothstep(-1.6, -2.3, ctx.L));
    const swing = smoothstep(-1.62, -2.15, ctx.L);
    const q = new THREE.Quaternion().setFromUnitVectors(SIDE_DIR, BEHIND_DIR);
    const dir = SIDE_DIR.clone().applyQuaternion(new THREE.Quaternion().slerp(q, swing));
    // A slow drift as we close in, for parallax on the dust.
    const drift = smoothstep(-2.0, -2.9, ctx.L);
    dir.add(new THREE.Vector3(0.05 * drift, 0.06 * drift, 0)).normalize();
    const width = Math.pow(10, ctx.L + 3);
    aim(this.camera, target, dir, width, ctx.aspect);
    (this.dust.material as THREE.ShaderMaterial).uniforms.uScale.value =
      ctx.height / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
  }
}
