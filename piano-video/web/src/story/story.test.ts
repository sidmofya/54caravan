import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import * as THREE from "three";
import { Timeline, type Performance } from "../timeline";
import { Pianist } from "./body";
import { whiteIndex } from "./fingering";
import { Path, Walk } from "./motion";
import { breakFingering, Performer, PLACES, STORY } from "./performer";
import { FINGERS, SIDES, fingertip } from "./rig";
import { buildStool, STOOL } from "./stool";

const OFFSET = 60;
const perf: Performance = JSON.parse(readFileSync(new URL("../../../data/60-209/notes.json", import.meta.url), "utf8"));
const fingering = breakFingering(perf.notes, OFFSET);
const timeline = new Timeline({ ...perf, notes: fingering.adjust(perf.notes) });
const pianist = new Pianist();
const stool = buildStool();
const room = { door: new THREE.Object3D(), spill: new THREE.SpotLight() };
const performer = new Performer(pianist, stool, { timeline, room }, fingering, OFFSET);
const FPS = 30;
const frames = (a: number, b: number) => Array.from({ length: Math.round((b - a) * FPS) }, (_, i) => a + i / FPS);

test("every note of the break gets a hand and a finger", () => {
  const inBreak = perf.notes.filter((n) => n.on + OFFSET >= STORY.play && n.on + OFFSET < STORY.playEnd);
  assert.ok(inBreak.length > 80, `only ${inBreak.length} notes in the break`);
  assert.equal(fingering.strikes.length, inBreak.length);
  for (const s of fingering.strikes) {
    assert.ok(s.finger >= 0 && s.finger <= 4);
    assert.ok(s.release > s.note.on, "a finger lets go after the note sounds");
  }
});

test("no finger holds two keys at once", () => {
  for (const side of SIDES) {
    for (let f = 0; f < 5; f++) {
      const mine = fingering.strikes.filter((s) => s.hand === side && s.finger === f).sort((a, b) => a.down - b.down);
      for (let i = 1; i < mine.length; i++) {
        assert.ok(mine[i - 1].release <= mine[i].down + 1e-6, `${side}${f} still on ${mine[i - 1].note.p} when ${mine[i].note.p} goes down`);
      }
    }
  }
});

test("hand stretches stay human: at most an octave under one hand", () => {
  for (const side of SIDES) {
    const mine = fingering.strikes.filter((s) => s.hand === side);
    for (const s of mine) {
      const held = mine.filter((o) => o.down <= s.down && o.release > s.down);
      const ws = held.map((o) => whiteIndex(o.note.p));
      assert.ok(Math.max(...ws) - Math.min(...ws) <= 7, `${side} spans ${ws.join(",")} at ${s.down.toFixed(2)}`);
    }
  }
});

test("left hand stays left of the right hand", () => {
  for (const t of frames(STORY.play - OFFSET, STORY.playEnd - OFFSET)) {
    assert.ok(fingering.centre("L", t) < fingering.centre("R", t) - 2, `hands cross at ${t + OFFSET}`);
  }
});

test("each fingertip is on its key surface as the key goes down", () => {
  // Posed by the real choreography. Octaves stretch the hand to its limit,
  // so a few of those land a little short; everything else lands on the key.
  const misses = fingering.strikes.map((s) => {
    const t = s.down + 0.004;
    performer.pose(t + OFFSET);
    const tip = fingertip(pianist.rig.hand[s.hand].fingers[s.finger], FINGERS[s.finger]);
    const key = performer.fingering.goals(s.hand, t, (p) => timeline.key(p, t))[s.finger];
    const goal = key.contact.clone().add(new THREE.Vector3(0, FINGERS[s.finger].radius * 0.8 + key.lift, s.finger === 0 ? 0.002 : 0.004));
    return { s, d: tip.distanceTo(goal) };
  });
  const close = misses.filter((m) => m.d < 0.005).length / misses.length;
  assert.ok(close >= 0.93, `only ${(close * 100).toFixed(1)}% of strikes land within 5 mm`);
  for (const { s, d } of misses) {
    assert.ok(d < 0.015, `${s.hand}${s.finger} on ${s.note.p} misses by ${(d * 1000).toFixed(1)} mm at ${(s.down + OFFSET).toFixed(2)}`);
  }
});

test("planted feet don't slide while she walks", () => {
  const walk = new Walk({ path: new Path([[-2.95, 1.95], [-1.3, 1.35], [-0.46, 0.74]]), t0: 1, t1: 4, first: "R" });
  for (const side of SIDES) {
    let prev: THREE.Vector3 | null = null;
    for (const t of frames(0.5, walk.done + 0.5)) {
      const moving = walk.steps.some((s) => s.side === side && t > s.lift - 0.16 && t < s.land + 0.13);
      const a = walk.foot(side, t).ankle;
      if (!moving && prev) assert.ok(a.distanceTo(prev) < 0.002, `${side} foot slides ${a.distanceTo(prev)} at ${t}`);
      prev = moving ? null : a;
    }
  }
});

test("no part of her jumps between frames", () => {
  const joints = () => {
    const r = pianist.rig;
    return {
      hips: r.hips.getWorldPosition(new THREE.Vector3()),
      head: r.head.getWorldPosition(new THREE.Vector3()),
      footL: r.foot.L.getWorldPosition(new THREE.Vector3()),
      footR: r.foot.R.getWorldPosition(new THREE.Vector3()),
      handL: r.hand.L.hand.getWorldPosition(new THREE.Vector3()),
      handR: r.hand.R.hand.getWorldPosition(new THREE.Vector3()),
    };
  };
  let prev: ReturnType<typeof joints> | null = null;
  for (const t of frames(STORY.door + 0.3, STORY.gone - 0.05)) {
    performer.pose(t);
    const now = joints();
    if (prev) {
      for (const k of Object.keys(now) as (keyof typeof now)[]) {
        // Hands may leap across the keyboard and a swinging foot moves at
        // about three times walking speed; the body itself never jumps.
        const limit = k.startsWith("hand") || k.startsWith("foot") ? 0.12 : 0.06;
        const d = now[k].distanceTo(prev[k]);
        assert.ok(d < limit, `${k} jumps ${(d * 100).toFixed(1)} cm at ${t.toFixed(2)}`);
      }
    }
    prev = now;
  }
});

test("the stool is on the floor at its place before she sits, and stays there", () => {
  for (const t of [STORY.round, STORY.sit, STORY.play, STORY.leave, STORY.gone + 1]) {
    performer.pose(t);
    assert.ok(Math.abs(stool.position.y) < 1e-6, `stool off the floor at ${t}`);
    assert.ok(stool.position.distanceTo(PLACES.stool) < 1e-6);
  }
  performer.pose(STORY.play + 2);
  const hips = pianist.rig.thigh.L.getWorldPosition(new THREE.Vector3());
  assert.ok(hips.y > STOOL.seatHeight + 0.05 && hips.y < STOOL.seatHeight + 0.15, `sitting at ${hips.y.toFixed(3)}`);
});

test("she is out of sight well before the last note", () => {
  performer.pose(STORY.gone + 0.1);
  assert.equal(pianist.rig.root.visible, false);
  assert.ok(STORY.gone < OFFSET + perf.duration - 8);
});
