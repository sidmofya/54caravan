import { JourneyFilm } from "./journey/film";
import { LEVEL_FACTORIES } from "./journey/levels";
import { PianoScene } from "./scene";
import { SongFilm } from "./song/film";
import { StoryFilm } from "./story/film";
import { PortraitFilm, SHOTS } from "./story/portrait";
import type { Performance } from "./timeline";

declare global {
  interface Window {
    renderAt?: (t: number) => void;
    pianoReady?: boolean;
    pianoInfo?: { duration: number; shots: { kind: string; start: number; end: number }[] };
  }
}

const params = new URLSearchParams(location.search);
const renderMode = params.has("render");

/** Cut 2, the dive. Render mode only: fixed size, driven frame by frame. */
async function journey(perf: Performance) {
  const canvas = document.querySelector<HTMLCanvasElement>("#stage")!;
  const w = Number(params.get("w") ?? 1920);
  const h = Number(params.get("h") ?? 1080);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  document.body.classList.add("render", "journey");
  const film = new JourneyFilm(canvas, document.querySelector("#frame")!, perf, w, h, LEVEL_FACTORIES);
  window.renderAt = (t) => film.renderAt(t);
  (window as unknown as { __film: JourneyFilm }).__film = film;
  window.pianoInfo = { duration: perf.duration, shots: [] };
  film.renderAt(Number(params.get("t") ?? 0));
  window.pianoReady = true;
}

/** Look-development stills of the pianist; `t` picks the shot. */
function portrait() {
  const canvas = document.querySelector<HTMLCanvasElement>("#stage")!;
  const w = Number(params.get("w") ?? 1920);
  const h = Number(params.get("h") ?? 1080);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  document.body.classList.add("render");
  const film = new PortraitFilm(canvas, w, h);
  window.renderAt = (t) => film.renderAt(t);
  (window as unknown as { __film: PortraitFilm }).__film = film;
  window.pianoInfo = { duration: SHOTS.length, shots: [] };
  film.renderAt(Number(params.get("t") ?? 0));
  window.pianoReady = true;
}

/** The pianist's scene; render time is performance time of the data given. */
function story(perf: Performance) {
  const canvas = document.querySelector<HTMLCanvasElement>("#stage")!;
  const w = Number(params.get("w") ?? 1920);
  const h = Number(params.get("h") ?? 1080);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  document.body.classList.add("render");
  const film = new StoryFilm(canvas, perf, Number(params.get("offset") ?? 60));
  film.setSize(w, h);
  window.renderAt = (t) => film.renderAt(t);
  (window as unknown as { __film: StoryFilm }).__film = film;
  window.pianoInfo = { duration: perf.duration, shots: [] };
  film.renderAt(Number(params.get("t") ?? 0));
  window.pianoReady = true;
}

/** 1:00 to the end: verse 2, chorus 2 in the atom, her scene and the outro. */
function song(perf: Performance) {
  const canvas = document.querySelector<HTMLCanvasElement>("#stage")!;
  const w = Number(params.get("w") ?? 1920);
  const h = Number(params.get("h") ?? 1080);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  document.body.classList.add("render");
  const film = new SongFilm(canvas, document.querySelector("#frame")!, perf, w, h, Number(params.get("offset") ?? 60));
  window.renderAt = (t) => film.renderAt(t);
  (window as unknown as { __film: SongFilm }).__film = film;
  window.pianoInfo = { duration: perf.duration, shots: film.sections.map((s) => ({ kind: s.name, start: s.start, end: s.end })) };
  film.renderAt(Number(params.get("t") ?? 0));
  window.pianoReady = true;
}

async function main() {
  if (params.get("film") === "portrait") return portrait();
  const data = params.get("data");
  const perf: Performance = await (await fetch(data ? `${data}/notes.json` : "notes.json")).json();
  if (params.get("film") === "journey") return journey(perf);
  if (params.get("film") === "story") return story(perf);
  if (params.get("film") === "song") return song(perf);

  const canvas = document.querySelector<HTMLCanvasElement>("#stage")!;
  const scene = new PianoScene(canvas, perf, { antialias: params.get("aa") !== "0" });

  if (renderMode) {
    // Frame-exact output for the video renderer: fixed size, no audio clock.
    const w = Number(params.get("w") ?? 1920);
    const h = Number(params.get("h") ?? 1080);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    scene.setSize(w, h);
    document.body.classList.add("render");
    window.renderAt = (t) => scene.renderAt(t);
    (window as unknown as { __scene: PianoScene }).__scene = scene;
    window.pianoInfo = { duration: perf.duration, shots: scene.director.shots };
    scene.renderAt(Number(params.get("t") ?? 0));
    window.pianoReady = true;
    return;
  }

  const audio = document.querySelector<HTMLAudioElement>("#audio")!;
  const scrub = document.querySelector<HTMLInputElement>("#scrub")!;
  const info = document.querySelector<HTMLElement>("#info")!;
  const play = document.querySelector<HTMLButtonElement>("#play")!;
  scrub.max = String(perf.duration);

  const resize = () => scene.setSize(canvas.clientWidth, canvas.clientHeight);
  addEventListener("resize", resize);
  resize();

  play.onclick = () => (audio.paused ? audio.play() : audio.pause());
  audio.onplay = () => (play.textContent = "Pause");
  audio.onpause = () => (play.textContent = "Play");
  scrub.oninput = () => (audio.currentTime = Number(scrub.value));

  const frame = () => {
    const t = Math.min(audio.currentTime, perf.duration);
    if (audio.currentTime >= perf.duration && !audio.paused) audio.pause();
    scene.renderAt(t);
    if (document.activeElement !== scrub) scrub.value = String(t);
    info.textContent = `${t.toFixed(2)} s · ${scene.director.shotName(t)}`;
    requestAnimationFrame(frame);
  };
  frame();
}

main();
