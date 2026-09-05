#!/usr/bin/env node
// What does one broken elevator do to step-free trips? For every station that has had an
// elevator outage in the log, route the same random trips step-free with that station
// blocked and compare against the unblocked step-free route. Uses the running app's
// /api/route (walk + subway), so numbers match what users see.
//
//   node tools/outage-impact.mjs        # dev server on :3123; ~15 min for 22 stations
//
// Output: research/outage-impact.json — per station: trips affected, trips left with no
// route, median minutes added, plus how often that station's elevator was out.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API = process.env.API ?? "http://localhost:3123/api/route";
const N = Number(process.env.N ?? 150);
const g = JSON.parse(await readFile(path.join(ROOT, "data/graph.json"), "utf8"));
const out = JSON.parse(await readFile(path.join(ROOT, "research/outages-summary.json"), "utf8"));

// same sampling as evaluate.mjs, over the whole covered city, but longer trips: elevator
// outages matter to people who ride, not to a 900 m walk
const bbox = (process.env.BBOX ?? "43.600,-79.560,43.800,-79.200").split(",").map(Number);
const fw = g.hwTable.indexOf("footway");
const pts = g.edges.filter((e) => e[3] === fw && e[4] === 0).map((e) => g.nodes[e[0]]).filter(([lon, lat]) => lat > bbox[0] && lat < bbox[2] && lon > bbox[1] && lon < bbox[3]);
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const dist = (a, b) => Math.hypot((b[0] - a[0]) * 80_500, (b[1] - a[1]) * 111_320);
const pairs = []; while (pairs.length < N) { const a = pts[Math.floor(rnd() * pts.length)], b = pts[Math.floor(rnd() * pts.length)]; const d = dist(a, b); if (d > 3000 && d < 12000) pairs.push([a, b]); }

const route = (from, to, blockedStations) => fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ from, to, mode: { mobility: true }, blockedStations }) }).then((r) => r.json());
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };

console.log(`baseline: ${N} step-free trips, no outages`);
const base = [];
for (const [from, to] of pairs) base.push(await route(from, to, []));
const usable = base.map((r, i) => (r.ok ? i : -1)).filter((i) => i >= 0);
// which stations each baseline trip actually passes through
const stationsOf = (r) => new Set((r.route?.legs ?? []).map((l) => l.station).filter(Boolean).map((s) => s.replace(/ Station$/, "")));

const stations = Object.entries(out.summary.byStation).sort((a, b) => b[1] - a[1]).map(([s]) => s);
const impact = {};
for (const st of stations) {
  const rides = usable.filter((i) => stationsOf(base[i]).has(st));
  const rows = [];
  for (const i of rides) {
    const r = await route(pairs[i][0], pairs[i][1], [st]);
    rows.push(r.ok ? { lost: false, added_s: r.route.stats.time_s - base[i].route.stats.time_s } : { lost: true, added_s: null });
  }
  const outages = out.alerts.filter((a) => a.type === "Elevator" && a.station === st);
  impact[st] = {
    trips_using_station: rides.length, share_of_trips: +(rides.length / usable.length).toFixed(3),
    trips_no_route: rows.filter((r) => r.lost).length,
    trips_longer: rows.filter((r) => !r.lost && r.added_s > 60).length,
    median_added_min: med(rows.filter((r) => !r.lost).map((r) => r.added_s / 60)),
    outages_logged: outages.length, breakdowns_logged: outages.filter((a) => a.unplanned).length,
    outage_hours_logged: +outages.reduce((s, a) => s + (a.sinceFeedStartHours ?? a.observedHours), 0).toFixed(1),
  };
  console.log(`${st.padEnd(28)} used by ${String(rides.length).padStart(3)} trips · no route ${impact[st].trips_no_route} · longer ${impact[st].trips_longer} · +${impact[st].median_added_min?.toFixed(1) ?? "—"} min · out ${outages.length}x`);
}
const result = { meta: { n: N, usable: usable.length, bbox, generated: new Date().toISOString(), outagesThrough: out.summary.logging.last }, impact };
await writeFile(path.join(ROOT, "research/outage-impact.json"), JSON.stringify(result, null, 1));
console.log("saved research/outage-impact.json");
