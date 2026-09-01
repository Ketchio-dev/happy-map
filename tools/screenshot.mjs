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
  { name: "indoor-scotiabank-eaton", preset: 1, strategy: "Indoor first", walkOnly: true },
  { name: "shade-union-hospital", preset: 0, strategy: "Shade first", walkOnly: true },
  { name: "stepfree-union-bloor", preset: 3, strategy: "Step-free", walkOnly: false },
  { name: "fastest-scotiabank-eaton", preset: 1, strategy: "Fastest", walkOnly: true },
  { name: "live-tab", preset: 1, tab: "Live" },
  { name: "search-open", preset: 1, search: "CN Tower" },
  { name: "evidence", url: "/evidence" },
  { name: "mobile-indoor", preset: 1, strategy: "Indoor first", walkOnly: true, viewport: { width: 390, height: 844 } },
];
setTimeout(() => { console.error("watchdog: giving up after 120s"); process.exit(2); }, 120_000).unref();
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
for (const s of shots) {
  const page = await browser.newPage({ viewport: s.viewport ?? { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  page.on("console", (m) => { if (m.type() === "error") console.error("console:", m.text().slice(0, 200)); });
  console.log("goto", s.name);
  await page.goto(BASE + (s.url ?? "/"), { waitUntil: "domcontentloaded", timeout: 30_000 });
  if (s.preset !== undefined) {
    await page.waitForFunction(() => !!window.__map, null, { timeout: 20_000 }).catch(() => console.error("no __map after 20s"));
    await page.evaluate(() => new Promise((res) => { const m = window.__map; if (!m || m.loaded()) return res(); m.once("idle", res); setTimeout(res, 15_000); }));
    await page.locator("button", { hasText: "→" }).nth(s.preset).click();
    await page.waitForTimeout(1200);
    if (s.walkOnly !== undefined) { const cb = page.getByLabel("Walk only, no subway"); if ((await cb.isChecked()) !== s.walkOnly) await cb.setChecked(s.walkOnly); await page.waitForTimeout(1200); }
    if (s.strategy) { await page.locator("button", { hasText: s.strategy }).first().click(); await page.waitForTimeout(1500); }
    if (s.tab) { await page.locator("nav button", { hasText: s.tab }).first().click(); await page.waitForTimeout(800); }
    if (s.search) { await page.getByText("Scotiabank Arena", { exact: false }).first().click(); await page.waitForTimeout(300); await page.keyboard.type(s.search, { delay: 40 }); await page.waitForTimeout(2500); }
    await page.evaluate(() => new Promise((res) => { const m = window.__map; m.once("idle", res); m.triggerRepaint(); setTimeout(res, 5000); }));
  } else { await page.waitForTimeout(1500); }
  const file = path.join(OUT, `${s.name}.png`); await page.screenshot({ path: file }); console.log("saved", file);
  await page.close();
}
await browser.close();
