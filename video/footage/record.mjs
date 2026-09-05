// Records the live app for the video. Run from the repo root: node video/footage/record.mjs <name>
//
// Headed on purpose: headless Chrome's screencast drops MapLibre's base map (routes and
// labels survive, tiles do not) under every GL flag tried, while a real GPU records it all.
// A Chrome window appears for the length of the recording.
//
// The viewport is 1280x720 CSS pixels at 1.5x, so the UI is legible in a 1080p frame.
// Every click is logged with its time and position (in 1920x1080 video pixels) to
// src/generated/<name>.footage.json; the composition uses those to place scenes and to
// draw a cursor.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, "../public/footage");
const RAW = path.join(OUT, "raw");
const GEN = path.resolve(HERE, "../src/generated");
const SITE = process.env.HM_URL ?? "https://happy-map-ashy.vercel.app/";
const SCALE = 1.5;
const name = process.argv[2] ?? "test";
mkdirSync(RAW, { recursive: true }); mkdirSync(GEN, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: false });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 720 }, deviceScaleFactor: SCALE, colorScheme: "light",
  recordVideo: { dir: RAW, size: { width: 1920, height: 1080 } },
});
const page = await ctx.newPage();
const t0 = Date.now();
const marks = [];
const now = () => (Date.now() - t0) / 1000;
const el = (label) => page.getByText(label, { exact: true }).first();
const pause = (s) => page.waitForTimeout(s * 1000);
async function click(label) {
  const box = await el(label).boundingBox();
  const x = (box.x + box.width / 2) * SCALE, y = (box.y + box.height / 2) * SCALE;
  await page.mouse.move(x / SCALE, y / SCALE, { steps: 12 });
  await pause(0.25);
  marks.push({ t: +now().toFixed(2), label, x: Math.round(x), y: Math.round(y) });
  await el(label).click();
  console.log(`${now().toFixed(1)}s click ${label}`);
}

await page.goto(SITE, { waitUntil: "load" });
await el("Indoor first").waitFor({ timeout: 60_000 });
marks.push({ t: +now().toFixed(2), label: "loaded", x: 0, y: 0 });
console.log(`${now().toFixed(1)}s loaded`);
await pause(4);
await click("Fastest"); await pause(3.2);
await click("Indoor first"); await pause(3.2);
await click("Toronto General"); await pause(4.2);
await click("Step-free"); await pause(3.2);
await click("Shade first"); await pause(3.2);
await click("Live"); await pause(4);
await click("Route"); await pause(2);
const video = page.video();
await ctx.close();
const webm = await video.path();
await browser.close();

const mp4 = path.join(OUT, `${name}.mp4`);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", webm, "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-r", "30", "-an", mp4]);
renameSync(webm, path.join(RAW, `${name}.webm`));
writeFileSync(path.join(GEN, `${name}.footage.json`), JSON.stringify({ file: `footage/${name}.mp4`, marks }, null, 1));
console.log(mp4);
