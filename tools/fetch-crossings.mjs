#!/usr/bin/env node
// Pedestrian crossing nodes from OpenStreetMap, tile by tile like fetch-osm.mjs, cached in
// data/raw/osm-crossings/. build-graph.mjs reads the merged file to mark which crossings
// have signals, which are only marked, and which are nothing at all.
//   node tools/fetch-crossings.mjs   → data/raw/osm-crossings.json
import { writeFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BBOX = process.env.BBOX ?? "43.575,-79.640,43.860,-79.115";
const COLS = Number(process.env.COLS ?? 7), ROWS = Number(process.env.ROWS ?? 5);
const CACHE = path.join(ROOT, "data", "raw", "osm-crossings");
const ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const query = (bbox) => `[out:json][timeout:300];(node["highway"="crossing"](${bbox});node["crossing"](${bbox});node["highway"="traffic_signals"](${bbox}););out body;`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fetchTile(bbox, label) {
  const file = path.join(CACHE, `${label}.json`);
  try { const cached = JSON.parse(await readFile(file, "utf8")); console.log(`  ${label}: ${cached.length} nodes (cached)`); return cached; } catch { /* not cached */ }
  for (let attempt = 0; attempt < 8; attempt++) {
    const url = ENDPOINTS[attempt % ENDPOINTS.length];
    try {
      const res = await fetch(url, { method: "POST", body: "data=" + encodeURIComponent(query(bbox)), headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "happy-map/0.1 (GatewayHacks project)" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      await writeFile(file, JSON.stringify(j.elements));
      console.log(`  ${label}: ${j.elements.length} nodes`);
      return j.elements;
    } catch (e) {
      const wait = Math.min(60000, 5000 * 2 ** attempt);
      console.log(`  ${label}: attempt ${attempt + 1} failed (${e.message}); waiting ${wait / 1000}s`);
      await sleep(wait);
    }
  }
  throw new Error(`${label}: all attempts failed`);
}
const [S, W, N, E] = BBOX.split(",").map(Number);
await mkdir(CACHE, { recursive: true });
const seen = new Set(), nodes = [];
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
  const s = S + (N - S) * r / ROWS, n = S + (N - S) * (r + 1) / ROWS, w = W + (E - W) * c / COLS, e = W + (E - W) * (c + 1) / COLS;
  const els = await fetchTile(`${s.toFixed(4)},${w.toFixed(4)},${n.toFixed(4)},${e.toFixed(4)}`, `r${r}c${c}`);
  for (const el of els) if (!seen.has(el.id)) { seen.add(el.id); nodes.push({ id: el.id, lat: el.lat, lon: el.lon, tags: el.tags ?? {} }); }
  await sleep(1200);
}
await writeFile(path.join(ROOT, "data", "raw", "osm-crossings.json"), JSON.stringify(nodes));
const kinds = {}; for (const n of nodes) { const k = n.tags.crossing ?? (n.tags.highway === "traffic_signals" ? "traffic_signals(node)" : "untagged"); kinds[k] = (kinds[k] || 0) + 1; }
console.log(`${nodes.length} crossing nodes`, kinds);
