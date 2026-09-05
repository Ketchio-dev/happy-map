// Records the live app at 1080p with Playwright and the system Chrome, then re-encodes
// the screencast to H.264 for Remotion. Run from the repo root: node video/footage/record.mjs
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync, renameSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, "../public/footage");
const RAW = path.join(OUT, "raw");
const SITE = process.env.HM_URL ?? "https://happy-map-ashy.vercel.app/";
const name = process.argv[2] ?? "test";
mkdirSync(RAW, { recursive: true });

// Headed on purpose: headless Chrome's screencast drops MapLibre's base map (routes and
// labels survive, tiles do not) under every GL flag tried, while a real GPU records it all.
// A Chrome window appears for the length of the recording.
const browser = await chromium.launch({ channel: "chrome", headless: false });
const ctx = await browser.newContext({
  viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, colorScheme: "light",
  recordVideo: { dir: RAW, size: { width: 1920, height: 1080 } },
});
const page = await ctx.newPage();
const t0 = Date.now();
const mark = (label) => console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s ${label}`);
const card = (label) => page.getByText(label, { exact: true }).first();
const pause = (s) => page.waitForTimeout(s * 1000);

await page.goto(SITE, { waitUntil: "load" });
await card("Indoor first").waitFor({ timeout: 60_000 });
await pause(4); mark("loaded");
await card("Fastest").click(); await pause(3.5); mark("fastest");
await card("Indoor first").click(); await pause(3.5); mark("indoor");
await card("Toronto General").click(); await pause(4.5); mark("preset toronto general");
await card("Step-free").click(); await pause(3.5); mark("step-free");
await card("Shade first").click(); await pause(3.5); mark("shade");
const video = page.video();
await ctx.close();
const webm = await video.path();
await browser.close();

const mp4 = path.join(OUT, `${name}.mp4`);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", webm, "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "30", "-an", mp4]);
renameSync(webm, path.join(RAW, `${name}.webm`));
console.log(mp4);
