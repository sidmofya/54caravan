import { PianoScene } from "./scene";
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

async function main() {
  const perf: Performance = await (await fetch("notes.json")).json();
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
