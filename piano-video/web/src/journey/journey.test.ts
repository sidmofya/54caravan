import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { Performance } from "../timeline";
import { BOUNDARIES, Choreography, CUES_30_60, LEVELS } from "./choreography";

const perf: Performance = JSON.parse(readFileSync(new URL("../../../data/30-60/notes.json", import.meta.url), "utf8"));
const ch = new Choreography(perf, { cues: CUES_30_60, startL: 0.59, landL: -0.3 });
const FRAME = 1 / 30;
const frames = Array.from({ length: Math.round(perf.duration * 30) + 1 }, (_, i) => i * FRAME);

test("the featured strike is a real note on its downbeat", () => {
  const bar = perf.downbeats[CUES_30_60.strikeBar];
  assert.ok(perf.notes.includes(ch.strike));
  assert.ok(Math.abs(ch.strike.on - bar) < 0.25, `strike at ${ch.strike.on}, bar at ${bar}`);
});

test("zoom is continuous: no jump between frames bigger than the rush allows", () => {
  for (let i = 1; i < frames.length; i++) {
    const d = Math.abs(ch.L(frames[i]) - ch.L(frames[i - 1]));
    assert.ok(d < 0.45, `L jumps ${d.toFixed(3)} at t=${frames[i].toFixed(2)}`);
  }
});

test("we only go in during the dive and only come out in the rush", () => {
  for (const t of frames) {
    const v = ch.dLdt(t);
    if (t > 0.05 && t < ch.rushStart - 0.05) assert.ok(v <= 1e-6, `zooming out at t=${t.toFixed(2)} (${v})`);
    if (t > ch.rushStart + 0.05 && t < ch.landing - 0.05) assert.ok(v >= -1e-6, `zooming in during the rush at t=${t.toFixed(2)}`);
  }
});

test("the dive reaches the proton, and lands back at piano scale", () => {
  const deepest = Math.min(...frames.map((t) => ch.L(t)));
  assert.ok(deepest < -14.3, `deepest L ${deepest}`);
  assert.equal(ch.blend(ch.L(ch.landing)).outer, "piano");
  assert.equal(ch.blend(deepest).outer, "proton");
});

test("every level appears, in order, and blends stay in range", () => {
  const seen: string[] = [];
  for (const t of frames.filter((t) => t < ch.rushStart)) {
    const b = ch.blend(ch.L(t));
    assert.ok(b.mix >= 0 && b.mix <= 1);
    if (seen[seen.length - 1] !== b.outer) seen.push(b.outer);
  }
  assert.deepEqual(seen, LEVELS);
  assert.equal(BOUNDARIES.length, LEVELS.length - 1);
});

test("time runs real until the strike, crawls in the dive, and is real again on landing", () => {
  const s = ch.strike.on;
  assert.equal(ch.pianoTime(s - 0.5), s - 0.5);
  assert.ok(ch.pianoTime(s + 3) - s < 0.01, "the dive should be in slow motion");
  assert.equal(ch.pianoTime(ch.landing + 0.2), ch.landing + 0.2);
  for (let i = 1; i < frames.length; i++) assert.ok(ch.physMs(frames[i]) >= ch.physMs(frames[i - 1]));
  assert.equal(ch.S(ch.landing + 0.1), 0);
});

test("the felt is still on the string while we look at the contact", () => {
  // Contact lasts 4.5 ms; the contact scene is on screen while L is between its boundaries.
  for (const t of frames.filter((t) => t < ch.rushStart)) {
    if (ch.blend(ch.L(t)).outer === "contact") assert.ok(ch.physMs(t) < 4.5, `contact over at t=${t.toFixed(2)}`);
  }
});
