#!/usr/bin/env node
// Evidence: for N random downtown origin/destination pairs, compare exposure-aware routes against the fastest route.
// Uses the running app's /api/route so numbers match what users see. Output: research/eval-<date>.json + console summary.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API = process.env.API ?? "http://localhost:3123/api/route";
const N = Number(process.env.N ?? 200);
const g = JSON.parse(await readFile(path.join(ROOT, "data/graph.json"), "utf8"));
// candidate points: ends of named footways/sidewalks in the PATH-dense core + wider downtown
// sample across the whole covered area, not just the PATH core
const core = (process.env.CORE ?? "43.600,-79.560,43.800,-79.200").split(",").map(Number);
const fw = g.hwTable.indexOf("footway");
const pts = g.edges.filter(e => e[3] === fw && e[4] === 0).map(e => g.nodes[e[0]]).filter(([lon, lat]) => lat > core[0] && lat < core[2] && lon > core[1] && lon < core[3]);
let seed = 42; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const dist = (a, b) => Math.hypot((b[0] - a[0]) * 80_500, (b[1] - a[1]) * 111_320);
const pairs = []; while (pairs.length < N) { const a = pts[Math.floor(rnd() * pts.length)], b = pts[Math.floor(rnd() * pts.length)]; const d = dist(a, b); if (d > 600 && d < 4000) pairs.push([a, b]); }
const scenarios = [
  { name: "cold", mode: { cold: true } },
  { name: "heat_jul15_14h", mode: { heat: true }, hourBucket: "d0715_h14" },
  { name: "heat_sep15_12h", mode: { heat: true }, hourBucket: "d0915_h12" },
  { name: "stepfree", mode: { mobility: true } },
];
const results = [];
for (const [i, [from, to]] of pairs.entries()) {
  const row = { i, from, to };
  for (const sc of scenarios) {
    const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ from, to, mode: sc.mode, hourBucket: sc.hourBucket }) }).then(r => r.json());
    row[sc.name] = r.ok ? { route: r.route.stats, baseline: r.baseline.stats } : { error: r.error };
  }
  results.push(row);
  if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${N}`);
}
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const summary = {};
for (const sc of scenarios) {
  const ok = results.map(r => r[sc.name]).filter(x => !x.error);
  const pct = (f) => ok.map(f).filter(Number.isFinite);
  const outdoorRed = pct(x => x.baseline.outdoor_m ? 1 - x.route.outdoor_m / x.baseline.outdoor_m : NaN);
  const sunRed = pct(x => x.baseline.sun_m ? 1 - x.route.sun_m / x.baseline.sun_m : NaN);
  const detour = pct(x => x.baseline.time_s ? x.route.time_s / x.baseline.time_s - 1 : NaN);
  summary[sc.name] = { pairs: ok.length, failed: results.length - ok.length,
    median_outdoor_reduction: med(outdoorRed), mean_outdoor_reduction: outdoorRed.reduce((a, b) => a + b, 0) / (outdoorRed.length || 1),
    median_sun_reduction: med(sunRed), median_time_increase: med(detour), share_with_any_outdoor_reduction: outdoorRed.filter(x => x > 0.05).length / (outdoorRed.length || 1),
    median_baseline_outdoor_m: med(ok.map(x => x.baseline.outdoor_m)), median_route_outdoor_m: med(ok.map(x => x.route.outdoor_m)),
    median_stairs_baseline: med(ok.map(x => x.baseline.steps_edges)), median_stairs_route: med(ok.map(x => x.route.steps_edges)) };
}
await mkdir(path.join(ROOT, "research"), { recursive: true });
const label = process.env.LABEL ?? "core";
const out = path.join(ROOT, "research", `eval-${label}.json`);
await writeFile(out, JSON.stringify({ meta: { n: N, area: label, bbox: core, generated: new Date().toISOString() }, summary, results }, null, 1));
console.log(JSON.stringify(summary, null, 1)); console.log("saved", out);
