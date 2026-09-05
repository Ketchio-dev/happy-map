#!/usr/bin/env node
// Roads the City of Toronto's inventory confirms have no sidewalk (edge flag bits 4 and 8),
// as a GeoJSON layer the map can show. Run after apply-pednet.mjs:
//   node tools/export-no-sidewalk.mjs → public/data/no-sidewalk.geojson
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const g = JSON.parse(await readFile(path.join(ROOT, "data/graph.json"), "utf8"));
const r5 = (c) => [Math.round(c[0] * 1e5) / 1e5, Math.round(c[1] * 1e5) / 1e5];
const features = []; let km = 0;
for (const e of g.edges) {
  if (!(e[5] & 16) || !(e[5] & 256)) continue;
  km += e[2] / 1000;
  features.push({ type: "Feature", properties: { hw: g.hwTable[e[3]], name: e[6] || null }, geometry: { type: "LineString", coordinates: [g.nodes[e[0]], ...(e[7] || []), g.nodes[e[1]]].map(r5) } });
}
await mkdir(path.join(ROOT, "public/data"), { recursive: true });
const out = path.join(ROOT, "public/data/no-sidewalk.geojson");
await writeFile(out, JSON.stringify({ type: "FeatureCollection", meta: { source: "OpenStreetMap roads × City of Toronto Pedestrian Network SIDEWALK_DESCRIPTION", km: Math.round(km), generated: new Date().toISOString() }, features }));
console.log(`${features.length} segments, ${km.toFixed(0)} km → ${out} (${(Buffer.byteLength(JSON.stringify(features)) / 1e6).toFixed(1)} MB)`);
