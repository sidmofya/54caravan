// Renders one or two scale scenes, dissolves between them from the centre
// outward, then adds bloom, a radial zoom blur and grain.

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { FullScreenQuad, Pass } from "three/examples/jsm/postprocessing/Pass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import type { Level } from "./level";

const blendShader = {
  uniforms: {
    tOuter: { value: null as THREE.Texture | null },
    tInner: { value: null as THREE.Texture | null },
    uMix: { value: 0 },
    uAspect: { value: 16 / 9 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tOuter;
    uniform sampler2D tInner;
    uniform float uMix;
    uniform float uAspect;
    varying vec2 vUv;
    void main() {
      vec4 a = texture2D(tOuter, vUv);
      vec4 b = texture2D(tInner, vUv);
      // The inner scale blooms from the centre outward, Powers-of-Ten style.
      float r = length((vUv - 0.5) * vec2(uAspect, 1.0)) / (0.5 * uAspect);
      float m = smoothstep(0.0, 0.9, uMix * 1.6 - r * 0.6);
      gl_FragColor = mix(a, b, m);
    }`,
};

class LevelsPass extends Pass {
  private readonly rtOuter: THREE.WebGLRenderTarget;
  private readonly rtInner: THREE.WebGLRenderTarget;
  private readonly quad: FullScreenQuad;
  private readonly material: THREE.ShaderMaterial;
  outer: Level | null = null;
  inner: Level | null = null;
  mix = 0;

  constructor(width: number, height: number) {
    super();
    const opts = { type: THREE.HalfFloatType, samples: 4 };
    this.rtOuter = new THREE.WebGLRenderTarget(width, height, opts);
    this.rtInner = new THREE.WebGLRenderTarget(width, height, opts);
    this.material = new THREE.ShaderMaterial({ ...blendShader, uniforms: THREE.UniformsUtils.clone(blendShader.uniforms) });
    this.material.uniforms.uAspect.value = width / height;
    this.quad = new FullScreenQuad(this.material);
  }

  setSize(width: number, height: number) {
    this.rtOuter.setSize(width, height);
    this.rtInner.setSize(width, height);
    this.material.uniforms.uAspect.value = width / height;
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget) {
    if (!this.outer) return;
    renderer.setRenderTarget(this.rtOuter);
    renderer.clear();
    renderer.render(this.outer.scene, this.outer.camera);
    const showInner = this.inner && this.mix > 0.001;
    if (showInner) {
      renderer.setRenderTarget(this.rtInner);
      renderer.clear();
      renderer.render(this.inner!.scene, this.inner!.camera);
    }
    this.material.uniforms.tOuter.value = this.rtOuter.texture;
    this.material.uniforms.tInner.value = showInner ? this.rtInner.texture : this.rtOuter.texture;
    this.material.uniforms.uMix.value = showInner ? this.mix : 0;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
}

const radialBlurShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uStrength: { value: 0 },
    uSeed: { value: 0 },
    uGrain: { value: 0.035 },
  },
  vertexShader: blendShader.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uStrength;
    uniform float uSeed;
    uniform float uGrain;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uSeed) * 43758.5453); }
    void main() {
      vec2 toCentre = vec2(0.5) - vUv;
      vec4 col = vec4(0.0);
      const int N = 14;
      for (int i = 0; i < N; i++) {
        float k = float(i) / float(N - 1);
        col += texture2D(tDiffuse, vUv + toCentre * uStrength * k);
      }
      col /= float(N);
      // Fine film grain, different every frame but deterministic.
      col.rgb += (hash(vUv * 1000.0) - 0.5) * uGrain * (0.4 + col.rgb);
      gl_FragColor = col;
    }`,
};

export class Compositor {
  private readonly composer: EffectComposer;
  private readonly levels: LevelsPass;
  private readonly bloom: UnrealBloomPass;
  private readonly finish: ShaderPass;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    width: number,
    height: number,
  ) {
    this.composer = new EffectComposer(renderer);
    this.composer.setPixelRatio(1);
    this.composer.setSize(width, height);
    this.levels = new LevelsPass(width, height);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.6, 0.55, 0.82);
    this.finish = new ShaderPass(radialBlurShader);
    this.composer.addPass(this.levels);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.finish);
    this.composer.addPass(new OutputPass());
  }

  render(outer: Level, inner: Level | null, mix: number, frame: { blur: number; seed: number }) {
    this.levels.outer = outer;
    this.levels.inner = inner;
    this.levels.mix = mix;
    const b = inner ? outer.bloom * (1 - mix) + inner.bloom * mix : outer.bloom;
    this.bloom.strength = b;
    this.bloom.enabled = b > 0.01;
    this.finish.uniforms.uStrength.value = frame.blur;
    this.finish.uniforms.uSeed.value = frame.seed;
    this.composer.render();
  }
}
