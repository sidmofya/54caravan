// Render the animation frame by frame in headless Chromium and encode an MP4.
//
//   node render/render.mjs                      full video -> out/while-you-sleep-0-30.mp4
//   node render/render.mjs --stills 1.5,4.6     PNG stills -> out/stills/
//   node render/render.mjs --from 4 --to 8      a partial clip, for quick checks
//   node render/render.mjs --film journey --data 30-60 --audio-start 30
//                                               cut 2 -> out/while-you-sleep-30-60.mp4
//
// Starts its own Vite server with hot reload off, so editing the source
// while a render runs can't reload the page mid-video.

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), "../web/package.json"));
const { chromium } = require("playwright-core");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "out");
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

const { createServer } = require("vite");
const server = await createServer({
  root: join(ROOT, "web"),
  configFile: join(ROOT, "web/vite.config.ts"),
  server: { port: 0, strictPort: false, hmr: false, watch: null },
  logLevel: "warn",
});
await server.listen();
const URL = opt("url", server.resolvedUrls.local[0]);
const FPS = Number(opt("fps", 30));
const W = Number(opt("w", 1920));
const H = Number(opt("h", 1080));
const SCALE = Number(opt("supersample", 1)); // render larger, downscale in ffmpeg
const stills = opt("stills", null);
const FILM = opt("film", "piano");
const DATA = opt("data", null);
const AUDIO_START = Number(opt("audio-start", 0));
const NO_AUDIO = args.includes("--no-audio"); // for pieces joined later under one soundtrack
const query = [`w=${W * SCALE}`, `h=${H * SCALE}`, FILM !== "piano" && `film=${FILM}`, DATA && `data=${DATA}`]
  .filter(Boolean)
  .join("&");

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: W * SCALE, height: H * SCALE } });
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") console.error(`[page ${m.type()}] ${m.text()}`);
});
page.on("pageerror", (e) => console.error(`[page error] ${e.message}`));

await page.goto(`${URL}?render&${query}`);
await page.waitForFunction(() => window.pianoReady === true, null, { timeout: 120_000 });
const info = await page.evaluate(() => window.pianoInfo);
const canvas = page.locator("#frame");

async function frameAt(t) {
  await page.evaluate((time) => window.renderAt(time), t);
  return canvas.screenshot({ type: "png" });
}

mkdirSync(OUT, { recursive: true });

if (stills) {
  const dir = join(OUT, "stills");
  mkdirSync(dir, { recursive: true });
  for (const t of stills.split(",").map(Number)) {
    const png = await frameAt(t);
    const file = join(dir, `${FILM === "piano" ? "" : FILM + "-"}t${t.toFixed(2).padStart(6, "0")}.png`);
    writeFileSync(file, png);
    console.log(file);
  }
  await browser.close();
  await server.close();
  process.exit(0);
}

const from = Number(opt("from", 0));
const to = Number(opt("to", info.duration));
const frames = Math.round((to - from) * FPS);
const whole = `while-you-sleep-${AUDIO_START}-${AUDIO_START + info.duration}.mp4`;
const outFile = opt("out", join(OUT, from === 0 && to === info.duration ? whole : `clip-${FILM}-${from}-${to}.mp4`));
const audio = join(ROOT, "data/source/while-you-sleep.mp3");

const ffmpeg = spawn(
  "ffmpeg",
  [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "image2pipe", "-framerate", String(FPS), "-i", "-",
    ...(NO_AUDIO ? [] : ["-ss", String(AUDIO_START + from), "-t", String(to - from), "-i", audio]),
    ...(SCALE > 1 ? ["-vf", `scale=${W}:${H}:flags=lanczos`] : []),
    "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p",
    ...(NO_AUDIO
      ? ["-an"]
      : ["-af", `afade=t=out:st=${Math.max(to - from - 0.6, 0)}:d=0.6`, "-c:a", "aac", "-b:a", "192k", "-shortest"]),
    "-movflags", "+faststart",
    outFile,
  ],
  { stdio: ["pipe", "inherit", "inherit"] },
);

const started = Date.now();
for (let i = 0; i < frames; i++) {
  const png = await frameAt(from + i / FPS);
  if (!ffmpeg.stdin.write(png)) await new Promise((r) => ffmpeg.stdin.once("drain", r));
  if (i % 30 === 0) {
    const rate = (i + 1) / ((Date.now() - started) / 1000);
    console.log(`frame ${i}/${frames}  ${rate.toFixed(2)} fps  eta ${((frames - i) / rate / 60).toFixed(1)} min`);
  }
}
ffmpeg.stdin.end();
await new Promise((r) => ffmpeg.on("close", r));
await browser.close();
await server.close();
console.log(`wrote ${outFile} in ${((Date.now() - started) / 60000).toFixed(1)} min`);
