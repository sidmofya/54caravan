// The rest of the song, 1:00 to the end, as one film on one renderer and
// one piano room:
//
//   verse 2      the piano plays itself; shots cut 1 didn't use
//   chorus 2     a quick plunge into the iron atom, a stay there with the
//                singing, and a rush back out that lands as the door opens
//   the break    she comes in with the stool, sits and plays
//   outro        she leaves; the piano plays on alone into the dawn
//
// Render time is performance time of the 60-209 data; `offset` makes it
// song time where the story needs it.

import * as THREE from "three";
import { Director, VERSE_2 } from "../director";
import { Choreography, CUES_CHORUS_2 } from "../journey/choreography";
import { JourneyFilm } from "../journey/film";
import { LEVEL_FACTORIES } from "../journey/levels";
import { createRenderer } from "../scene";
import { StoryFilm } from "../story/film";
import type { Performance } from "../timeline";

const EXPOSURE = 1.05;
/** The plunge opens this long before its hammer strikes. */
const LEAD_IN = 1.6;

export interface SongSection {
  name: "verse" | "chorus" | "story";
  start: number; // performance seconds
  end: number;
}

export class SongFilm {
  readonly renderer: THREE.WebGLRenderer;
  readonly story: StoryFilm;
  readonly verse: Director;
  readonly journey: JourneyFilm;
  readonly sections: SongSection[];

  constructor(
    canvas: HTMLCanvasElement,
    overlay: HTMLElement,
    readonly perf: Performance,
    width: number,
    height: number,
    readonly offset: number,
  ) {
    this.renderer = createRenderer(canvas, true);
    this.renderer.setSize(width, height, false);
    this.story = new StoryFilm(this.renderer, perf, offset);
    this.story.setSize(width, height);
    this.verse = new Director(perf, { plan: VERSE_2, from: 0 });

    const strike = Choreography.featuredNote(perf, perf.downbeats[CUES_CHORUS_2.strikeBar]);
    const plunge = strike.on - LEAD_IN;
    this.journey = new JourneyFilm(this.renderer, overlay, perf, width, height, LEVEL_FACTORIES, {
      cues: CUES_CHORUS_2,
      start: this.verse.pose(plunge),
      startTime: plunge,
      after: (t) => this.story.director.pose(t + offset),
      piano: this.story.piano,
    });
    const landing = this.journey.ch.landing;
    this.sections = [
      { name: "verse", start: 0, end: plunge },
      { name: "chorus", start: plunge, end: landing },
      { name: "story", start: landing, end: perf.duration },
    ];
  }

  section(t: number): SongSection {
    return this.sections.find((s) => t < s.end) ?? this.sections[this.sections.length - 1];
  }

  renderAt(t: number) {
    const section = this.section(t);
    const song = t + this.offset;
    // The readout names the scales only while we are inside them.
    document.body.classList.toggle("journey", section.name === "chorus" || (section.name === "story" && t < section.start + 3));
    this.journey.readoutAt(t);

    if (section.name === "story") {
      this.journey.renderView(this.story.piano.scene, this.story.prepare(t), t);
      return;
    }
    // Before her scene the room waits: door shut, nobody there.
    this.story.performer.pose(song);
    this.renderer.toneMappingExposure = EXPOSURE;
    if (section.name === "chorus") {
      this.journey.renderAt(t);
      return;
    }
    const piano = this.story.piano;
    piano.pose(t);
    const pose = this.verse.pose(t);
    const cam = piano.camera;
    cam.position.copy(pose.position);
    cam.lookAt(pose.target);
    if (cam.fov !== pose.fov) {
      cam.fov = pose.fov;
      cam.updateProjectionMatrix();
    }
    this.journey.renderView(piano.scene, cam, t);
  }
}
