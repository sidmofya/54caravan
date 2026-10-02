// The scene from the door opening to her leaving, as a pure function of
// time. She carries the stool in from the hall, sets it down, steps round
// in front of it, sits and plays the break, then stands, touches the
// piano and walks out, leaving the door ajar.

import * as THREE from "three";
import type { Room } from "../room";
import type { Note, Timeline } from "../timeline";
import type { Pianist } from "./body";
import { Fingering, whiteX } from "./fingering";
import { Path, Walk } from "./motion";
import {
  applyPose,
  blend,
  carryArms,
  keyArms,
  lapArms,
  lerpBody,
  playingFeet,
  relaxedArms,
  restingHand,
  seatRoot,
  seatedBody,
  standingBody,
  withArm,
  type ArmsFn,
  type BodyPose,
  type Pose,
} from "./pose";
import { SIDES, type Side } from "./rig";

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const smooth = (x: number) => {
  const u = Math.min(Math.max(x, 0), 1);
  return u * u * (3 - 2 * u);
};
/** 0 before a, rising to 1 at b. */
const ramp = (t: number, a: number, b: number) => smooth((t - a) / (b - a));

/** Key moments, in song seconds. */
export const STORY = {
  door: 151.6, // the door starts to open
  enter: 152.0, // she steps off from the hall
  arrive: 155.6, // her pelvis stops beside the stool's place
  setDown: 155.85,
  round: 157.4, // steps round to stand in front of the stool
  sit: 158.75,
  seated: 159.6,
  play: 160.4, // the break, her hands on the keys
  playEnd: 187.25,
  rise: 188.2,
  touch: 189.1, // a hand on the piano's lid
  leave: 190.4,
  gone: 197.0, // out of sight down the hall
};

/** Where things stand on the floor. */
export const PLACES = {
  hall: v3(-2.95, 0, 1.95),
  stool: v3(-0.04, 0, 0.74),
  beside: v3(-0.46, 0, 0.74), // the stool's left, where she sets it down from
  front: v3(-0.04, 0, 0.45), // standing in front of the stool, facing the piano
};
const FACE_ROOM = Math.PI / 2; // facing +x, into the room from the hall
const FACE_PIANO = Math.PI;
/** The lid's top near its front edge, where her hand rests. */
const LID = v3(0.14, 1.236, -0.03);

/** Blend posture and gaze toward `other`, keeping the base's feet, root and hips. */
function blendUpper(base: BodyPose, other: BodyPose, u: number): BodyPose {
  const m = lerpBody(base, other, u);
  return { ...m, root: base.root, yaw: base.yaw, hips: base.hips, feet: base.feet, knee: base.knee };
}

/** The break she plays, in performance seconds (song seconds minus `offset`). */
export function breakFingering(notes: Note[], offset: number) {
  return new Fingering(notes, STORY.play - offset, STORY.playEnd - offset);
}

export class Performer {
  private readonly walkIn: Walk;
  private readonly walkRound: Walk;
  private readonly walkOut: Walk;

  constructor(
    readonly pianist: Pianist,
    readonly stool: THREE.Object3D,
    /** The piano's clock and the room's door: a PianoScene, or a stand-in for tests. */
    readonly piano: { timeline: Timeline; room: Pick<Room, "door" | "spill"> },
    readonly fingering: Fingering,
    /** Song time of the performance's zero. */
    readonly offset: number,
  ) {
    const { hall, beside, front } = PLACES;
    this.walkIn = new Walk({
      path: new Path([[hall.x, hall.z], [-2.2, 1.85], [-1.3, 1.35], [-0.85, 0.95], [beside.x, beside.z]]),
      t0: STORY.enter,
      t1: STORY.arrive,
      first: "R",
      stride: 0.55,
      yawStart: FACE_ROOM,
      yawEnd: FACE_ROOM,
      turn: 0.5,
      lean: -0.03, // leaning back a touch against the stool's weight
    });
    this.walkRound = new Walk({
      path: new Path([[beside.x, beside.z], [-0.36, 0.53], [front.x, front.z]]),
      t0: STORY.round,
      t1: STORY.round + 1.05,
      first: "R",
      stride: 0.36,
      yawStart: FACE_ROOM,
      yawEnd: FACE_PIANO,
      turn: 0.3,
      accel: 0.3,
      decel: 0.4,
    });
    this.walkOut = new Walk({
      path: new Path([
        [front.x, front.z], [-0.36, 0.52], [-0.55, 0.85], [-1.1, 1.4], [-1.95, 1.85], [-2.6, 1.95], [-3.0, 1.97], [-3.45, 2.3], [-3.5, 3.05],
      ]),
      t0: STORY.leave,
      t1: STORY.gone - 0.6,
      first: "L",
      stride: 0.58,
      yawStart: FACE_PIANO,
      turn: 0.4,
    });
  }

  /** Door swing (radians) and how much hall light spills in. */
  door(t: number) {
    const open = ramp(t, STORY.door, STORY.door + 1.3);
    return { angle: 1.25 * open, spill: open };
  }

  visible(t: number) {
    return t > STORY.door + 0.2 && t < STORY.gone;
  }

  /** Pose her, the stool and the door for song time t. */
  pose(t: number) {
    const room = this.piano.room;
    const d = this.door(t);
    room.door.rotation.y = -d.angle;
    room.spill.intensity = 18 * d.spill;

    const on = this.visible(t);
    this.pianist.rig.root.visible = on;
    this.pianist.group.visible = on;
    // The stool comes in with her; before that the room has none.
    this.stool.visible = t > STORY.door;
    if (!on) {
      if (t >= STORY.gone) this.placeStool(PLACES.stool, 0);
      return;
    }
    applyPose(this.pianist, this.choreograph(t));
  }

  private placeStool(at: THREE.Vector3, yaw: number) {
    this.stool.position.copy(at);
    this.stool.quaternion.setFromAxisAngle(v3(0, 1, 0), yaw);
    this.stool.updateMatrixWorld(true);
  }

  /** The stool held in front of her, tilted so its legs swing clear of her knees. */
  private carried(body: BodyPose): { pos: THREE.Vector3; quat: THREE.Quaternion } {
    const yawQ = new THREE.Quaternion().setFromAxisAngle(v3(0, 1, 0), body.yaw);
    const bob = body.hips.y - (0.93 - 0.012);
    const pos = v3(0, 0.6 + bob, 0.45).applyQuaternion(yawQ).add(body.root);
    const quat = yawQ.clone().multiply(new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), -0.35));
    return { pos, quat };
  }

  private carry(body: BodyPose): Pose {
    const c = this.carried(body);
    this.stool.position.copy(c.pos);
    this.stool.quaternion.copy(c.quat);
    this.stool.updateMatrixWorld(true);
    return { body, arms: carryArms(this.stool) };
  }

  private choreograph(t: number): Pose {
    const S = STORY;
    const { beside, front, stool } = PLACES;

    // 1. Carrying the stool in from the hall.
    if (t < S.setDown) {
      const settle = standingBody(beside.x, beside.z, FACE_ROOM);
      return this.carry(blendUpper(this.walkIn.body(t), settle, ramp(t, this.walkIn.done - 0.4, this.walkIn.done)));
    }

    // 2. Setting it down in front of her: bend, lower it to the floor, let go, straighten.
    if (t < S.round) {
      const stand = standingBody(beside.x, beside.z, FACE_ROOM, v3(stool.x, 0.3, stool.z));
      const bent: BodyPose = {
        ...stand,
        hips: v3(0, 0.66, -0.13),
        pelvis: [0.55, 0, 0],
        spine: [0.3, 0, 0],
        chest: [0.15, 0, 0],
        neck: [-0.2, 0, 0],
        head: [0.3, 0, 0],
      };
      const settle = standingBody(beside.x, beside.z, FACE_ROOM);
      stand.lookWeight = bent.lookWeight = 0.6 * ramp(t, S.setDown, S.setDown + 0.3) * (1 - ramp(t, S.round - 0.4, S.round));
      const down = ramp(t, S.setDown, S.setDown + 0.65) * (1 - ramp(t, S.setDown + 0.85, S.round - 0.05));
      const body = lerpBody(stand, bent, down);
      const lower = ramp(t, S.setDown + 0.05, S.setDown + 0.62);
      const c = this.carried(settle);
      const floorQ = new THREE.Quaternion().setFromAxisAngle(v3(0, 1, 0), FACE_ROOM);
      this.stool.position.copy(c.pos.clone().lerp(stool, lower));
      this.stool.quaternion.copy(c.quat.clone().slerp(floorQ, lower));
      this.stool.updateMatrixWorld(true);
      const letGo = ramp(t, S.setDown + 0.68, S.setDown + 1.1);
      return blend({ body, arms: carryArms(this.stool) }, { body, arms: relaxedArms() }, letGo);
    }
    this.placeStool(stool, FACE_ROOM);

    // 3. A step round to stand in front of the stool, facing the piano.
    const standFront = standingBody(front.x, front.z, FACE_PIANO);
    if (t < S.sit) {
      const walking = t < this.walkRound.done;
      const body = blendUpper(this.walkRound.body(t, { lookAhead: 0.8 }), standFront, ramp(t, this.walkRound.done - 0.3, this.walkRound.done + 0.1));
      return { body, arms: relaxedArms(walking ? this.walkRound.swing(t) : undefined) };
    }

    // 4. Sitting down: hips back and down, upper body leaning in, hands to the lap.
    const tucked = standFront.feet;
    const sitting = (feet = tucked): BodyPose => seatedBody({ stool, lean: 0.08, sway: 0, twist: 0, nod: 0.18, feet });
    const halfway: BodyPose = {
      ...standFront,
      root: v3(front.x, 0, (front.z + seatRoot(stool).z) / 2),
      hips: v3(0, 0.8, 0),
      pelvis: [0.22, 0, 0],
      spine: [0.12, 0, 0],
      chest: [0.05, 0, 0],
      neck: [-0.12, 0, 0],
    };
    const sitDown = (u: number) => (u < 0.5 ? lerpBody(standFront, halfway, smooth(u * 2)) : lerpBody(halfway, sitting(), smooth(u * 2 - 1)));
    const settling = t < S.playEnd ? this.feetToPedal(t, S.seated - 0.15) : this.feetToPedal(t, S.playEnd + 0.3, true);

    if (t < S.seated) {
      const body = sitDown((t - S.sit) / (S.seated - S.sit));
      body.feet = settling;
      return blend({ body, arms: relaxedArms() }, { body, arms: lapArms }, ramp(t, S.sit + 0.35, S.seated));
    }

    // 5. Playing the break.
    if (t < S.rise) {
      const play = this.playingBody(t);
      play.feet = settling;
      const w = ramp(t, S.seated, S.play + 0.3) * (1 - ramp(t, S.playEnd, S.playEnd + 0.6));
      const body = lerpBody(sitting(settling), play, w);
      const hands = ramp(t, S.seated + 0.1, S.play + 0.05) * (1 - ramp(t, S.playEnd, S.playEnd + 0.5));
      return blend({ body, arms: lapArms }, { body, arms: this.playingArms(t) }, hands);
    }

    // 6. Standing up, a hand on the piano, then away.
    if (t < S.leave) {
      const u = 1 - (t - S.rise) / (S.touch - S.rise - 0.05);
      const body = u > 0 ? sitDown(u) : standingBody(front.x, front.z, FACE_PIANO);
      body.look = LID.clone();
      body.lookWeight = 0.7 * ramp(t, S.touch - 0.3, S.touch) * (1 - ramp(t, S.leave - 0.5, S.leave));
      const arms = blend({ body, arms: lapArms }, { body, arms: relaxedArms() }, ramp(t, S.rise + 0.2, S.touch - 0.2)).arms;
      const touch = ramp(t, S.touch, S.touch + 0.45) * (1 - ramp(t, S.leave - 0.45, S.leave));
      return { body, arms: withArm(arms, "R", restingHand("R", LID, v3(0, 0, -1), arms), touch) };
    }
    const body = blendUpper(this.walkOut.body(t), standFront, 1 - ramp(t, S.leave, S.leave + 0.4));
    return { body, arms: relaxedArms(this.walkOut.swing(t)) };
  }

  /** Feet from under her to playing: left foot forward, then the right onto the pedal (or back). */
  private feetToPedal(t: number, start: number, back = false) {
    const { stool, front } = PLACES;
    const pedal = this.piano.timeline.pedal(t - this.offset);
    const play = playingFeet(stool, pedal);
    const tucked = standingBody(front.x, front.z, FACE_PIANO).feet;
    const out = {} as Record<Side, (typeof play)["L"]>;
    SIDES.forEach((s, i) => {
      const t0 = start + i * 0.22;
      const u = ramp(t, t0, t0 + 0.3);
      const w = back ? 1 - u : u;
      const ankle = tucked[s].ankle.clone().lerp(play[s].ankle, w);
      ankle.y += 0.035 * Math.sin(Math.PI * w);
      out[s] = { ankle, quat: tucked[s].quat.clone().slerp(play[s].quat, w) };
    });
    return out;
  }

  /** Upper body while playing: leans with the phrase, sways toward where the hands are. */
  private playingBody(t: number): BodyPose {
    const { stool } = PLACES;
    const tr = t - this.offset;
    const rest = { L: this.fingering.rest("L", tr), R: this.fingering.rest("R", tr) };
    // Lean toward the hand that reaches furthest from her centre.
    let x = 0;
    let w = 0;
    let lookX = 0;
    let lookW = 0;
    for (const s of SIDES) {
      const k = 1 - rest[s];
      const off = whiteX(this.fingering.centre(s, tr)) - stool.x;
      const reach = Math.abs(off) + 0.05;
      x += off * reach * k;
      w += reach * k;
      lookX += off * k;
      lookW += k;
    }
    const off = w > 1e-3 ? x / w : 0;
    const handsX = stool.x + (lookW > 0.05 ? lookX / lookW : 0);
    const breathe = Math.sin((2 * Math.PI * (t - STORY.play)) / 4.44);
    const pedal = this.piano.timeline.pedal(tr);
    return seatedBody({
      stool,
      lean: 0.13 + 0.025 * breathe,
      sway: THREE.MathUtils.clamp(-off * 0.5, -0.26, 0.26),
      twist: THREE.MathUtils.clamp(-off * 0.55, -0.32, 0.32),
      // For the far ends of the keyboard she slides along the seat.
      shift: Math.sign(off) * THREE.MathUtils.clamp((Math.abs(off) - 0.3) * 0.5, 0, 0.1),
      nod: 0.3,
      feet: playingFeet(stool, pedal),
      look: v3(handsX, 0.72, 0.28),
    });
  }

  private playingArms(t: number): ArmsFn {
    const tr = t - this.offset;
    const key = (p: number) => this.piano.timeline.key(p, tr);
    let arms = keyArms((s) => this.fingering.goals(s, tr, key));
    for (const s of SIDES) arms = withArm(arms, s, lapArms, this.fingering.rest(s, tr));
    return arms;
  }
}
