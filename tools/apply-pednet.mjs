#!/usr/bin/env node
// Corrects the "no mapped sidewalk" flag with the City of Toronto's Pedestrian Network
// (pednet), whose SIDEWALK_DESCRIPTION says, per road segment, whether a sidewalk exists.
// OpenStreetMap only tells us whether a sidewalk was *mapped*; the City tells us whether
// one is *there*. Runs after build-graph.mjs (and compute-shade.mjs), before pack-graph.mjs.
//
//   node tools/apply-pednet.mjs        # needs data/raw/pednet/pednet-4326.geojson
//
// Edge flag bit 4 (roadway, no sidewalk) is cleared where the City has a sidewalk on at
// least one side, kept where it says there is none, and left as OSM had it where the
// inventory has no answer (outside city limits, or no road within 15 m). Bit 8 records
// that the inventory was consulted. Writes research/sidewalks-summary.json.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Flatbush from "flatbush";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const g = JSON.parse(await readFile(path.join(ROOT, "data/graph.json"), "utf8"));
const ped = JSON.parse(await readFile(path.join(ROOT, "data/raw/pednet/pednet-4326.geojson"), "utf8"));

const classify = (d) => {
  if (!d || !d.trim() || /^(Not applicable|N\/A|City walkway|Recreational Trail)$/i.test(d.trim())) return null;
  if (/^No sidewalk on either side$|^Laneway without any sidewalks$|^Roadway under development$/.test(d.trim())) return "none";
  if (/sidewalk/i.test(d)) return "some";      // both sides, one side, partial, laneway with sidewalk, under development with some sidewalk
  return null;
};

// explode pednet into straight segments with a class
const seg = []; // [x1, y1, x2, y2, cls]
for (const f of ped.features) {
  const cls = classify(f.properties.SIDEWALK_DESCRIPTION);
  if (!cls || !f.geometry) continue;
  const lines = f.geometry.type === "MultiLineString" ? f.geometry.coordinates : [f.geometry.coordinates];
  for (const line of lines) for (let i = 1; i < line.length; i++) seg.push([line[i - 1][0], line[i - 1][1], line[i][0], line[i][1], cls]);
}
const index = new Flatbush(seg.length);
for (const s of seg) index.add(Math.min(s[0], s[2]), Math.min(s[1], s[3]), Math.max(s[0], s[2]), Math.max(s[1], s[3]));
index.finish();

const MAX_D = 15, MAX_ANGLE = 35 * Math.PI / 180;
const MY = 111_320, mx = (lat) => 111_320 * Math.cos(lat * Math.PI / 180);
function pointSegDist(px, py, s, kx) {
  const ax = s[0] * kx, ay = s[1] * MY, bx = s[2] * kx, by = s[3] * MY, x = px * kx, y = py * MY;
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}
const angleBetween = (ux, uy, vx, vy) => { const a = Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)); return Math.min(a, Math.PI - a); };

// nearest roughly parallel City segment to a point on the OSM edge heading (dx, dy)
function lookup(p, dir) {
  const kx = mx(p[1]);
  const dLon = MAX_D / kx, dLat = MAX_D / MY;
  let best = null, bestD = Infinity;
  for (const i of index.search(p[0] - dLon, p[1] - dLat, p[0] + dLon, p[1] + dLat)) {
    const s = seg[i];
    const a = angleBetween(dir[0], dir[1], (s[2] - s[0]) * kx, (s[3] - s[1]) * MY);
    if (a > MAX_ANGLE) continue;
    const d = pointSegDist(p[0], p[1], s, kx);
    if (d < bestD && d <= MAX_D) { bestD = d; best = s[4]; }
  }
  return best;
}

let before = 0, cleared = 0, confirmed = 0, unknown = 0, edgesTouched = 0;
for (const e of g.edges) {
  if (!(e[5] & 16)) continue;
  before += e[2];
  const pts = [g.nodes[e[0]], ...(e[7] || []), g.nodes[e[1]]];
  // sample three points along the way, vote by nearest match
  const votes = { some: 0, none: 0 };
  const n = pts.length;
  for (const f of n > 2 ? [0.25, 0.5, 0.75] : [0.5]) {
    const i = Math.min(n - 2, Math.floor(f * (n - 1)));
    const a = pts[i], b = pts[i + 1];
    const p = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const cls = lookup(p, [(b[0] - a[0]) * mx(p[1]), (b[1] - a[1]) * MY]);
    if (cls) votes[cls]++;
  }
  if (!votes.some && !votes.none) { unknown += e[2]; continue; }
  edgesTouched++;
  e[5] |= 256;
  if (votes.some >= votes.none) { e[5] &= ~16; cleared += e[2]; } else confirmed += e[2];
}
const km = (m) => +(m / 1000).toFixed(0);
const summary = {
  generated: new Date().toISOString(),
  source: "City of Toronto Open Data, Pedestrian Network (pednet), SIDEWALK_DESCRIPTION",
  roadway_km_before: km(before),
  sidewalk_present_km: km(cleared),
  no_sidewalk_confirmed_km: km(confirmed),
  outside_inventory_km: km(unknown),
  roadway_km_after: km(confirmed + unknown),
  edges_checked: edgesTouched,
};
console.log(summary);
await writeFile(path.join(ROOT, "data/graph.json"), JSON.stringify(g));
await writeFile(path.join(ROOT, "research/sidewalks-summary.json"), JSON.stringify(summary, null, 1));
console.log("graph.json updated; now run node tools/pack-graph.mjs");
