import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Director, VERSE_2 } from "../director";
import { Choreography, CUES_CHORUS_2 } from "../journey/choreography";
import { STORY } from "../story/performer";
import type { Performance } from "../timeline";

const OFFSET = 60;
const perf: Performance = JSON.parse(readFileSync(new URL("../../../data/60-209/notes.json", import.meta.url), "utf8"));
const db = perf.downbeats;
const strike = Choreography.featuredNote(perf, db[CUES_CHORUS_2.strikeBar]);
const plunge = strike.on - 1.6;
const ch = new Choreography(perf, { cues: CUES_CHORUS_2, startL: 0.3, landL: 0.4, startTime: plunge });
const frames = (a: number, b: number) => Array.from({ length: Math.round((b - a) * 30) }, (_, i) => a + i / 30);

test("chorus 2 plunges on its downbeat and lands as the door opens", () => {
  assert.ok(Math.abs(strike.on - db[CUES_CHORUS_2.strikeBar]) < 0.25, `plunge strike at ${strike.on + OFFSET}`);
  assert.ok(Math.abs(ch.landing + OFFSET - STORY.door) < 0.05, `lands at ${ch.landing + OFFSET}, door at ${STORY.door}`);
  assert.ok(Math.abs(ch.L(ch.landing) - 0.4) < 1e-6);
});

test("chorus 2's zoom is continuous and stays inside the atom", () => {
  for (const t of frames(plunge, ch.landing)) {
    const d = Math.abs(ch.L(t + 1 / 30) - ch.L(t));
    assert.ok(d < 0.45, `L jumps ${d.toFixed(3)} at ${(t + OFFSET).toFixed(2)}`);
  }
  // From six seconds after the strike until the rush, we are at atomic scale or deeper.
  for (const t of frames(strike.on + 6, ch.rushStart)) {
    assert.ok(ch.L(t) <= -10.0, `L ${ch.L(t).toFixed(2)} at ${(t + OFFSET).toFixed(2)}`);
  }
});

test("the loudest bar looks into the empty atom toward its nucleus", () => {
  const peak = db[CUES_CHORUS_2.peakBar] + 1;
  assert.equal(ch.blend(ch.L(peak)).outer, "nucleus");
  assert.equal(ch.blend(ch.L(db[CUES_CHORUS_2.quietBar] + 1)).outer, "atom");
});

test("verse 2's cuts land just before downbeats and cover the verse", () => {
  const verse = new Director(perf, { plan: VERSE_2, from: 0 });
  assert.equal(verse.shots[0].start, 0);
  for (const s of verse.shots.slice(1)) {
    const nearest = Math.min(...db.map((d) => Math.abs(d - 0.3 - s.start)));
    assert.ok(nearest < 1e-6, `cut at ${s.start + OFFSET} is off the bar grid`);
  }
  const last = verse.shots[verse.shots.length - 1];
  assert.ok(last.end >= plunge, "the verse plan runs until the plunge");
  for (let i = 1; i < verse.shots.length; i++) assert.equal(verse.shots[i].start, verse.shots[i - 1].end);
});
