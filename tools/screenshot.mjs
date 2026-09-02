#!/usr/bin/env node
// Renders the app in headless Chromium and saves screenshots → research/screens/*.png
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE ?? "http://localhost:3123";
const OUT = path.join(ROOT, "research/screens"); await mkdir(OUT, { recursive: true });
const shots = [
  { name: "indoor-union-eaton", preset: "Eaton Centre", strategy: "Indoor first", walkOnly: true },
  { name: "shade-union-hospital", preset: "Toronto General", strategy: "Shade first", walkOnly: true },
  { name: "stepfree-union-bloor", preset: "Bloor-Yonge", strategy: "Step-free", walkOnly: false },
  { name: "fastest-union-eaton", preset: "Eaton Centre", strategy: "Fastest", walkOnly: true },
  { name: "live-tab", preset: "Bloor-Yonge", tab: "Live" },
  { name: "about-tab", preset: "Eaton Centre", tab: "About" },
  { name: "search-open", preset: "Eaton Centre", search: "CN Tower" },
  { name: "dark-indoor", preset: "Eaton Centre", strategy: "Indoor first", walkOnly: true, style: "dark" },
  { name: "wide-scarborough-union", preset: "Scarborough", strategy: "Fastest", walkOnly: false },
  { name: "evidence", url: "/evidence" },
  { name: "mobile-indoor", preset: "Eaton Centre", strategy: "Indoor first", walkOnly: true, viewport: { width: 390, height: 844 } },
];
setTimeout(() => { console.error("watchdog: giving up after 120s"); process.exit(2); }, 120_000).unref();
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
for (const s of shots) {
  const page = await browser.newPage({ viewport: s.viewport ?? { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  page.on("console", (m) => { if (m.type() === "error") console.error("console:", m.text().slice(0, 200)); });
  console.log("goto", s.name);
  await page.goto(BASE + (s.url ?? "/"), { waitUntil: "domcontentloaded", timeout: 30_000 });
  if (s.preset) {
    await page.waitForFunction(() => !!window.__map, null, { timeout: 20_000 }).catch(() => console.error("no __map after 20s"));
    await page.evaluate(() => new Promise((res) => { const m = window.__map; if (!m || m.loaded()) return res(); m.once("idle", res); setTimeout(res, 15_000); }));
    await page.getByRole("button", { name: s.preset, exact: true }).click();
    await page.waitForTimeout(1400);
    if (s.walkOnly !== undefined) { await page.locator("button", { hasText: s.walkOnly ? "Walk only" : "Walk + subway" }).first().click(); await page.waitForTimeout(1400); }
    if (s.strategy) { await page.locator("button", { hasText: s.strategy }).first().click(); await page.waitForTimeout(1500); }
    if (s.tab) { await page.locator("nav button", { hasText: s.tab }).first().click(); await page.waitForTimeout(800); }
    if (s.style) { await page.locator("button", { hasText: s.style }).first().click(); await page.waitForTimeout(2500); }
    if (s.search) { await page.getByRole("button", { name: /Scotiabank Arena/ }).last().click(); await page.waitForTimeout(400); await page.keyboard.type(s.search, { delay: 40 }); await page.waitForTimeout(2600); }
    await page.evaluate(() => new Promise((res) => { const m = window.__map; m.once("idle", res); m.triggerRepaint(); setTimeout(res, 5000); }));
  } else { await page.waitForTimeout(1500); }
  const file = path.join(OUT, `${s.name}.png`); await page.screenshot({ path: file }); console.log("saved", file);
  await page.close();
}
await browser.close();
