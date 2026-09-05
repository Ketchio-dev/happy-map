#!/usr/bin/env node
// Accessibility audit of the running app: axe-core rules on desktop and phone layouts,
// each tab, plus a keyboard walk that lists every focus stop and flags unnamed controls.
// Run from the repo root with the dev server up: node tools/a11y-audit.mjs [baseUrl]
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
const BASE = process.argv[2] ?? "http://localhost:3123";
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
let total = 0;
async function audit(name, url, viewport, prep = async () => {}) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "load" });
  await page.getByText("Indoor first", { exact: true }).first().waitFor({ timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await prep(page);
  // the basemap canvas is third-party; everything we author is checked
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"]).exclude(".maplibregl-canvas").analyze();
  console.log(`\n== ${name}: ${r.violations.length} rule violations`);
  for (const v of r.violations) {
    total += v.nodes.length;
    console.log(`  [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length})`);
    for (const n of v.nodes.slice(0, 4)) console.log(`      ${n.target.join(" ")}  ${n.failureSummary?.split("\n")[1]?.trim().slice(0, 110) ?? ""}`);
  }
  await ctx.close();
}
async function keyboardWalk(url) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "load" });
  await page.getByText("Indoor first", { exact: true }).first().waitFor({ timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const stops = [];
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press("Tab");
    const d = await page.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null; const cs = getComputedStyle(e); return { tag: e.tagName.toLowerCase(), name: (e.getAttribute("aria-label") || e.getAttribute("title") || e.textContent || "").trim().slice(0, 40), outline: cs.outlineStyle !== "none" && cs.outlineWidth !== "0px", ring: cs.boxShadow !== "none" }; });
    if (!d) break;
    stops.push(d);
  }
  console.log(`\n== keyboard: ${stops.length} focus stops`);
  const unnamed = stops.filter((s) => !s.name);
  const noRing = stops.filter((s) => !s.outline && !s.ring);
  console.log(`  unnamed: ${unnamed.length}  without visible focus: ${noRing.length}`);
  for (const s of stops) console.log(`  ${s.tag.padEnd(7)} ${s.outline || s.ring ? "◉" : "○"} ${s.name || "(no name)"}`);
  await ctx.close();
}
await audit("desktop route", `${BASE}/`, { width: 1440, height: 900 });
await audit("desktop reach", `${BASE}/?tab=reach`, { width: 1440, height: 900 }, async (p) => { await p.waitForTimeout(2500); });
await audit("desktop live", `${BASE}/`, { width: 1440, height: 900 }, async (p) => { await p.getByText("Live", { exact: true }).first().click(); await p.waitForTimeout(800); });
await audit("desktop about", `${BASE}/`, { width: 1440, height: 900 }, async (p) => { await p.getByText("About", { exact: true }).first().click(); await p.waitForTimeout(500); });
await audit("phone route", `${BASE}/`, { width: 390, height: 844 });
await audit("evidence", `${BASE}/evidence`, { width: 1200, height: 1600 });
await keyboardWalk(`${BASE}/`);
console.log(`\ntotal failing nodes: ${total}`);
await browser.close();
