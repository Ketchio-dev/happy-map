#!/usr/bin/env node
// Screenshots of the deployed site for a review pass: desktop, phone, a shared link,
// the Live tab and /evidence. Run from the repo root: node tools/verify-screens.mjs [baseUrl] [outDir]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const BASE = process.argv[2] ?? "https://happy-map-ashy.vercel.app";
const OUT = process.argv[3] ?? "research/screens/verify";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const shot = async (name, url, viewport, steps = async () => {}) => {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(url, { waitUntil: "load" });
  await page.getByText("Indoor first", { exact: true }).first().waitFor({ timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(5000);
  await steps(page);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`${name}: ${page.url()} ${errors.length ? "ERRORS: " + errors.slice(0, 3).join(" | ") : "ok"}`);
  await page.close();
};
await shot("desktop", `${BASE}/`, { width: 1440, height: 900 });
await shot("shared-link", `${BASE}/?from=-79.52520,43.64490,Kipling%20Station&to=-79.38060,43.64530,Union%20Station&mode=stepfree&hour=d0915_h12&walk=0`, { width: 1440, height: 900 });
await shot("phone", `${BASE}/`, { width: 390, height: 844 });
await shot("live-tab", `${BASE}/`, { width: 1440, height: 900 }, async (p) => { await p.getByText("Live", { exact: true }).first().click(); await p.waitForTimeout(1500); });
await shot("evidence", `${BASE}/evidence`, { width: 1200, height: 2600 });
await browser.close();
