import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { feltFaceZ, HAMMER, hasDamper, strikeAngle, sectionOf, STRING_Z, BASS_STRING_Z, stringRadius } from "./piano/layout";
import { Timeline, leadTime, type Performance } from "./timeline";

const perf: Performance = JSON.parse(readFileSync(new URL("../../data/notes.json", import.meta.url), "utf8"));
const tl = new Timeline(perf);
const FRAME = 1 / 30;

test("every hammer touches its strings at the note's onset", () => {
  for (const n of perf.notes) {
    const at = tl.key(n.p, n.on);
    assert.ok(at.hammer > 0.999, `pitch ${n.p} at ${n.on}: hammer ${at.hammer}`);
    // One frame earlier it is still in flight, not already at the string.
    const before = tl.key(n.p, n.on - FRAME);
    assert.ok(before.hammer < 0.97, `pitch ${n.p} arrived early (${before.hammer})`);
  }
});

test("strike angle puts the felt on the string surface", () => {
  for (let p = 21; p <= 108; p++) {
    const z = (sectionOf(p) === 0 ? BASS_STRING_Z : STRING_Z) + stringRadius(p);
    const face = feltFaceZ(strikeAngle(p));
    assert.ok(Math.abs(face - z) < 0.001, `pitch ${p}: felt at ${face}, string at ${z}`);
    assert.ok(strikeAngle(p) < HAMMER.rest, `pitch ${p}: strike must swing toward the strings`);
  }
});

test("keys go down before the sound and come back up after release", () => {
  for (const n of perf.notes) {
    assert.equal(tl.key(n.p, n.on).depression, 1);
    assert.ok(tl.key(n.p, n.on - leadTime(n.v) - 0.01).depression <= tl.key(n.p, n.on - 0.01).depression);
  }
  const last = perf.notes.reduce((a, b) => (a.off > b.off ? a : b));
  assert.ok(tl.key(last.p, last.off + 0.5).depression < 0.01);
});

test("dampers lift with the key and fall on release unless the pedal holds them", () => {
  const n = perf.notes.find((m) => hasDamper(m.p) && tl.pedal(m.off + 0.3) === 0 && tl.pedal(m.on) === 0);
  assert.ok(n, "need a note played without pedal");
  assert.ok(tl.key(n.p, n.on).damper > 0.99);
  assert.ok(tl.key(n.p, n.off + 0.3).damper < 0.01);
  assert.ok(tl.key(n.p, n.off + 0.6).amplitude < tl.key(n.p, n.off).amplitude * 0.05);

  const held = perf.notes.find((m) => hasDamper(m.p) && tl.pedal(m.off + 0.1) > 0.99);
  assert.ok(held, "need a note released under the pedal");
  assert.ok(tl.key(held.p, held.off + 0.1).damper > 0.99);
});

test("frames are pure functions of time", () => {
  const t = 5.3;
  const a = tl.key(64, t);
  tl.key(64, 1);
  tl.key(64, 20);
  assert.deepEqual(tl.key(64, t), a);
});
