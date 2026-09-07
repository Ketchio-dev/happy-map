// Footage for the final cut. Run from the repo root: node video/footage/record-final.mjs [name]
// Same mechanics as record.mjs (headed Chrome, 1280x720 at 1.5x, every click logged as a
// mark), but the tour follows video/script/final.md: the Sept 2 replay, the four cards,
// shade and the sky toggle, the no-sidewalk layer, the replay scrubber, Montréal, evidence.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, "../public/footage");
const RAW = path.join(OUT, "raw");
const GEN = path.resolve(HERE, "../src/generated");
const SITE = (process.env.HM_URL ?? "https://happy-map-ashy.vercel.app").replace(/\/$/, "");
const SCALE = 1.5;
const name = process.argv[2] ?? "final";
mkdirSync(RAW, { recursive: true }); mkdirSync(GEN, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: false });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 720 }, deviceScaleFactor: SCALE, colorScheme: "light", timezoneId: "America/Toronto",
  recordVideo: { dir: RAW, size: { width: 1920, height: 1080 } },
});
const page = await ctx.newPage();
const t0 = Date.now();
const marks = [];
const now = () => (Date.now() - t0) / 1000;
const pause = (s) => page.waitForTimeout(s * 1000);
const mark = (label, x = 0, y = 0) => { marks.push({ t: +now().toFixed(2), label, x: Math.round(x), y: Math.round(y) }); console.log(`${now().toFixed(1)}s ${label}`); };
async function clickLoc(loc, label) {
  await loc.scrollIntoViewIfNeeded();
  const box = await loc.boundingBox();
  const x = (box.x + box.width / 2) * SCALE, y = (box.y + box.height / 2) * SCALE;
  await page.mouse.move(x / SCALE, y / SCALE, { steps: 12 });
  await pause(0.25);
  mark(label, x, y);
  await loc.click();
}
const click = (text, label = text) => clickLoc(page.getByText(text, { exact: true }).first(), label);
const clickButton = (name, label = name) => clickLoc(page.getByRole("button", { name, exact: true }).first(), label);
const clickTab = (name, label = name) => clickLoc(page.getByRole("tab", { name, exact: true }), label);
async function open(url, ready = "Fastest") {
  await page.goto(SITE + url, { waitUntil: "load" });
  if (ready) await page.getByText(ready, { exact: true }).first().waitFor({ timeout: 60_000 });
  await page.waitForFunction(() => !!window.__map, null, { timeout: 30_000 }).catch(() => {});
  await page.evaluate(() => new Promise((res) => { const m = window.__map; if (!m || m.loaded()) return res(); m.once("idle", res); setTimeout(res, 8000); }));
}

// 1. the Sept 2 morning: Live tab in replay, then the step-free card
await open("/?at=2026-09-02T12:00:00Z&mode=stepfree&walk=0&tab=live&from=-79.38060,43.64530,Union%20Station&to=-79.38640,43.67080,Bloor-Yonge%20Station", "Back to live");
await pause(1.5); mark("replay-sep2"); await pause(4);
await clickTab("Route"); await pause(4);

// 2. live, the four cards on the Eaton Centre trip
await open("/");
mark("loaded"); await pause(2.5);
await click("Fastest"); await pause(2.4);
await click("Indoor first"); await pause(4);

// 3. shade and the sky toggle
await click("Toronto General"); await pause(2.5);
await click("Shade first"); await pause(3);
const hour = page.getByRole("slider", { name: "Hour of day" });
await hour.scrollIntoViewIfNeeded();
{ const b = await hour.boundingBox(); const y = b.y + b.height / 2; await page.mouse.move(b.x + b.width * 0.55, y, { steps: 10 }); await page.mouse.down(); mark("Hour drag", (b.x + b.width * 0.55) * SCALE, y * SCALE); await page.mouse.move(b.x + b.width * 0.98, y, { steps: 30 }); await page.mouse.up(); }
await pause(2.2);
await clickButton("Clear", "Sky"); await pause(1.6);
await clickButton("Live", "Sky live"); await pause(2);

// 4. the no-sidewalk layer
await clickButton("No sidewalk"); await pause(3);
await clickButton("No sidewalk", "No sidewalk off"); await pause(1);

// 5. the replay scrubber
await clickTab("Live"); await pause(2);
const slider = page.getByRole("slider", { name: "Moment in the outage log" });
await slider.scrollIntoViewIfNeeded(); await pause(0.6);
{ const b = await slider.boundingBox(); const y = b.y + b.height / 2; await page.mouse.move(b.x + b.width * 0.98, y, { steps: 10 }); await page.mouse.down(); mark("Replay drag", (b.x + b.width * 0.98) * SCALE, y * SCALE); await page.mouse.move(b.x + b.width * 0.3, y, { steps: 60 }); await page.mouse.up(); }
await pause(3.5);

// 6. Montréal
await open("/?city=montreal");
mark("montreal"); await pause(3);
await click("Indoor first", "RÉSO"); await pause(4);

// 7. evidence
await open("/evidence", "Evidence");
mark("evidence"); await pause(1);
for (let i = 0; i < 14; i++) { await page.mouse.wheel(0, 90); await pause(0.35); }
await pause(1.5);

const video = page.video();
await ctx.close();
const webm = await video.path();
await browser.close();

const mp4 = path.join(OUT, `${name}.mp4`);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", webm, "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-r", "30", "-an", mp4]);
renameSync(webm, path.join(RAW, `${name}.webm`));
writeFileSync(path.join(GEN, `${name}.footage.json`), JSON.stringify({ file: `footage/${name}.mp4`, marks }, null, 1));
console.log(mp4);
