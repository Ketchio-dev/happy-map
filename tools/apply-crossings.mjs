#!/usr/bin/env node
// Marks graph nodes that are pedestrian crossings and how protected they are, from the
// OpenStreetMap crossing nodes fetched by fetch-crossings.mjs. Crossing nodes sit where a
// footway meets a road, so they are already graph nodes; they are matched by coordinate.
//   node tools/apply-crossings.mjs   (after build-graph.mjs; before pack-graph.mjs)
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const g = JSON.parse(await readFile(path.join(ROOT, "data/graph.json"), "utf8"));
const xs = JSON.parse(await readFile(path.join(ROOT, "data/raw/osm-crossings.json"), "utf8"));

const classify = (t) => {
  if (t.crossing === "traffic_signals" || t["crossing:signals"] === "yes" || t.highway === "traffic_signals" || t.crossing === "pelican" || t.crossing === "toucan") return "signals";
  if (t.crossing === "marked" || t.crossing === "zebra" || t["crossing:markings"] === "yes" || (t["crossing:markings"] && t["crossing:markings"] !== "no")) return "marked";
  if (t.crossing === "unmarked" || t.crossing === "uncontrolled" || t.crossing === "informal" || t.highway === "crossing") return "unmarked";
  return null;
};
// graph nodes are stored to 1e-5 degrees (about a metre); look at the rounded cell and its
// neighbours so a coordinate that rounds the other way still matches
const key = (lon, lat) => `${Math.round(lon * 1e5)},${Math.round(lat * 1e5)}`;
const byPos = new Map(); g.nodes.forEach((c, i) => byPos.set(key(c[0], c[1]), i));
const find = (lon, lat) => {
  const x = Math.round(lon * 1e5), y = Math.round(lat * 1e5);
  for (const dx of [0, -1, 1]) for (const dy of [0, -1, 1]) { const i = byPos.get(`${x + dx},${y + dy}`); if (i !== undefined) return i; }
  return undefined;
};
const counts = { signals: 0, marked: 0, unmarked: 0, unmatched: 0 };
for (const n of xs) {
  const cls = classify(n.tags); if (!cls) continue;
  const i = find(n.lon, n.lat);
  if (i === undefined) { counts.unmatched++; continue; }
  g.nodeAttr[i] = { ...(g.nodeAttr[i] ?? {}), crossing: cls };
  counts[cls]++;
}
g.meta.crossings = { applied: new Date().toISOString(), ...counts };
await writeFile(path.join(ROOT, "data/graph.json"), JSON.stringify(g));
console.log("crossing nodes marked:", counts);
