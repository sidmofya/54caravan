// Cut 2: a Powers-of-Ten dive from the piano into one hammer strike, down
// to a proton, and back out to the keys.

import * as THREE from "three";
import type { CameraPose } from "../director";
import { createRenderer, type PianoScene } from "../scene";
import type { Performance } from "../timeline";
import { Choreography, CUES_30_60, type AtomCues, type LevelId, type SectionCues } from "./choreography";
import { Compositor } from "./compositor";
import type { FrameContext, Level } from "./level";
import { PianoLevel, startL, type PianoShots } from "./levels/piano";
import { Readout } from "./readout";

/** A dive set somewhere in the song: which bars, and the shots either side of it. */
export interface JourneySection {
  cues: SectionCues | AtomCues;
  /** The dive opens on this camera pose, at this performance time. */
  start: CameraPose;
  startTime: number;
  /** The camera once landed, by time. */
  after: (t: number) => CameraPose;
  /** The song's piano scene, shared rather than built again. */
  piano?: PianoScene;
}

export type LevelFactory = (ctx: { renderer: THREE.WebGLRenderer; ch: Choreography; perf: Performance }) => Level;

/** A stand-in for scales not built yet: a dark frame with the level's name. */
class Placeholder implements Level {
  readonly unitExp = 0;
  readonly bloom = 0;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 10);
  constructor(readonly id: LevelId) {
    this.scene.background = new THREE.Color(0x101418);
  }
  update(ctx: FrameContext) {
    this.camera.aspect = ctx.aspect;
    this.camera.updateProjectionMatrix();
  }
}

export class JourneyFilm {
  readonly renderer: THREE.WebGLRenderer;
  readonly ch: Choreography;
  readonly levels = new Map<LevelId, Level>();
  private readonly compositor: Compositor;
  private readonly readout: Readout;
  private aspect: number;
  private readonly height: number;

  constructor(
    target: HTMLCanvasElement | THREE.WebGLRenderer,
    overlay: HTMLElement,
    private readonly perf: Performance,
    width: number,
    height: number,
    factories: Partial<Record<LevelId, LevelFactory>> = {},
    section?: JourneySection,
  ) {
    this.aspect = width / height;
    this.height = height;
    if (target instanceof THREE.WebGLRenderer) {
      this.renderer = target;
    } else {
      // Antialiasing happens in the multisampled render targets instead.
      this.renderer = createRenderer(target, false);
      this.renderer.setSize(width, height, false);
    }

    const cues = section?.cues ?? CUES_30_60;
    const landing = perf.downbeats[cues.landBar];
    const shots: PianoShots = section ? { start: section.start, after: section.after } : PianoLevel.cut2Shots(perf, landing);
    this.ch = new Choreography(perf, {
      cues,
      startL: startL(this.aspect, shots.start),
      landL: PianoLevel.landL(shots, landing, this.aspect),
      startTime: section?.startTime,
    });

    this.levels.set("piano", new PianoLevel(this.renderer, perf, this.ch, shots, section?.piano));
    for (const [id, make] of Object.entries(factories) as [LevelId, LevelFactory][]) {
      this.levels.set(id, make({ renderer: this.renderer, ch: this.ch, perf }));
    }
    this.compositor = new Compositor(this.renderer, width, height);
    this.readout = new Readout(overlay);
  }

  private level(id: LevelId): Level {
    let l = this.levels.get(id);
    if (!l) {
      l = new Placeholder(id);
      this.levels.set(id, l);
    }
    return l;
  }

  frameContext(t: number): FrameContext {
    const ch = this.ch;
    return {
      t,
      L: ch.L(t),
      dLdt: ch.dLdt(t),
      S: ch.S(t),
      physMs: ch.physMs(t),
      pulses: ch.pulses(t),
      aspect: this.aspect,
      height: this.height,
      diving: t < ch.rushStart,
      vocal: this.perf.vocalEnv?.[Math.round(t * 30)] ?? 0,
    };
  }

  /**
   * Draw an ordinary scene through the same post-processing as the dive
   * (multisampling, tone mapping, grain), so a film that cuts between the
   * two has one consistent look.
   */
  renderView(scene: THREE.Scene, camera: THREE.PerspectiveCamera, t: number) {
    const view: Level = { id: "piano", unitExp: 0, bloom: 0, scene, camera, update: () => {} };
    this.compositor.render(view, null, 0, { blur: 0, seed: (t * 30) % 97 });
  }

  /** Update only the scale readout, for frames another film draws. */
  readoutAt(t: number) {
    const b = this.ch.blend(this.ch.L(t));
    this.readout.update(this.ch, t, b.inner && b.mix > 0.5 ? b.inner : b.outer);
  }

  renderAt(t: number) {
    const ctx = this.frameContext(t);
    const b = this.ch.blend(ctx.L);
    const outer = this.level(b.outer);
    const inner = b.inner && b.mix > 0.001 ? this.level(b.inner) : null;
    outer.update(ctx);
    inner?.update(ctx);
    // Streak toward the centre in proportion to zoom speed; strongest in the rush.
    const blur = Math.min(Math.abs(ctx.dLdt) * 0.011, 0.14);
    this.compositor.render(outer, inner, b.mix, { blur, seed: (t * 30) % 97 });
    this.readout.update(this.ch, t, b.inner && b.mix > 0.5 ? b.inner : b.outer);
  }
}
