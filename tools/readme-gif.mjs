#!/usr/bin/env node
// A short walkthrough for the README: the four strategies on one trip, the Live tab, and a
// replayed moment from the outage log → research/screens/demo.gif. Needs the dev server
// (BASE) and ffmpeg. Frames are plain screenshots, so headless Chrome is fine here.
import { chromium } from "playwright";
import { mkdir, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE ?? "http://localhost:3123";
const TMP = path.join(ROOT, "data", "gif-frames");
await rm(TMP, { recursive: true, force: true }); await mkdir(TMP, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 780 }, deviceScaleFactor: 1 });
const settle = async () => { await page.evaluate(() => new Promise((res) => { const m = window.__map; if (!m) return res(); m.once("idle", res); m.triggerRepaint(); setTimeout(res, 6000); })); await page.waitForTimeout(900); };
let n = 0;
const frame = async () => { await settle(); await page.screenshot({ path: path.join(TMP, `f${String(n++).padStart(2, "0")}.png`) }); };
const go = async (url) => { await page.goto(BASE + url, { waitUntil: "domcontentloaded" }); await page.waitForFunction(() => !!window.__map, null, { timeout: 20000 }); await page.getByText("Fastest", { exact: true }).first().waitFor({ timeout: 30000 }); await page.waitForTimeout(1500); };
const trip = "from=-79.37910,43.64350,Scotiabank%20Arena&to=-79.38060,43.65440,CF%20Toronto%20Eaton%20Centre&hour=d0715_h14";
await go(`/?${trip}&mode=fastest`); await frame();
for (const s of ["Indoor first", "Shade first", "Step-free"]) { await page.locator("button", { hasText: s }).first().click(); await page.waitForTimeout(1600); await frame(); }
await page.getByRole("tab", { name: "Live" }).click(); await page.waitForTimeout(1200); await page.evaluate(() => document.querySelector("aside").scrollTo(0, 99999)); await frame();
await go(`/?from=-79.38060,43.64530,Union%20Station&to=-79.38640,43.67080,Bloor-Yonge%20Station&mode=stepfree&walk=0&at=2026-09-03T09:02:04Z`); await frame();
await browser.close();
const out = path.join(ROOT, "research", "screens", "demo.gif");
// one frame every 1.8 s, 960 px wide, a full 256-colour palette shared by all frames (128 lost the Line 1 yellow)
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", "1/1.8", "-i", path.join(TMP, "f%02d.png"), "-vf", "scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=256:stats_mode=full[p];[b][p]paletteuse=dither=sierra2_4a", "-loop", "0", out]);
await rm(TMP, { recursive: true, force: true });
console.log("wrote", out, `${n} frames`);
