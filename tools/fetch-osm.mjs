#!/usr/bin/env node
// Downloads the pedestrian network + transit access points from OpenStreetMap (Overpass).
// The area is fetched in tiles: one request for the whole city times out.
import { writeFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// south,west,north,east — the City of Toronto plus a margin into Mississauga/Vaughan/Markham
const BBOX = process.env.BBOX ?? "43.575,-79.640,43.860,-79.115";
const COLS = Number(process.env.COLS ?? 7), ROWS = Number(process.env.ROWS ?? 5);
const CACHE = path.join(ROOT, "data", "raw", "osm-tiles");
const ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];

const query = (bbox) => `
[out:json][timeout:900];
(
  way["highway"~"^(footway|pedestrian|path|steps|corridor|living_street|residential|unclassified|tertiary|secondary|primary|service|cycleway)$"]["foot"!="no"](${bbox});
  way["highway"="elevator"](${bbox});
  node["highway"="elevator"](${bbox});
  node["railway"~"^(subway_entrance|station)$"](${bbox});
  node["entrance"](${bbox});
  node["barrier"](${bbox});
);
out body geom;
`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Each tile is cached on disk, so a failed run resumes instead of refetching everything.
async function fetchTile(bbox, label) {
  const file = path.join(CACHE, `${label}.json`);
  try { const cached = JSON.parse(await readFile(file, "utf8")); console.log(`  ${label}: ${cached.length} elements (cached)`); return cached; } catch { /* not cached */ }
  for (let attempt = 0; attempt < 8; attempt++) {
    const url = ENDPOINTS[attempt % ENDPOINTS.length];
    try {
      const res = await fetch(url, { method: "POST", body: "data=" + encodeURIComponent(query(bbox)), headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "happy-map/0.1 (GatewayHacks project)" } });
      if (res.status === 429 || res.status === 504 || res.status === 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      await writeFile(file, JSON.stringify(j.elements));
      console.log(`  ${label}: ${j.elements.length} elements`);
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
const tiles = [];
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
  const s = S + (N - S) * r / ROWS, n = S + (N - S) * (r + 1) / ROWS;
  const w = W + (E - W) * c / COLS, e = W + (E - W) * (c + 1) / COLS;
  tiles.push({ bbox: `${s.toFixed(4)},${w.toFixed(4)},${n.toFixed(4)},${e.toFixed(4)}`, label: `r${r}c${c}` });
}
console.log(`fetching ${tiles.length} tiles over ${BBOX}`);

await mkdir(CACHE, { recursive: true });
const seen = new Set();
const elements = [];
// strictly serial: Overpass rejects concurrent heavy queries from one client
for (const [i, t] of tiles.entries()) {
  const els = await fetchTile(t.bbox, t.label);
  for (const el of els) { const k = `${el.type}${el.id}`; if (!seen.has(k)) { seen.add(k); elements.push(el); } }
  console.log(`  ${elements.length} unique elements after ${i + 1}/${tiles.length} tiles`);
  await sleep(1500);
}

const out = path.join(ROOT, "data", "raw", "osm-downtown.json");
await writeFile(out, JSON.stringify({ elements }));
const ways = elements.filter((e) => e.type === "way"), nodes = elements.filter((e) => e.type === "node");
console.log(`saved ${out}: ${elements.length} elements (${ways.length} ways, ${nodes.length} nodes)`);
console.log("ways by highway:", Object.entries(ways.reduce((m, w) => (m[w.tags.highway] = (m[w.tags.highway] || 0) + 1, m), {})).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(" "));
