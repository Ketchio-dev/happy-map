#!/usr/bin/env node
// Downloads downtown-Toronto pedestrian network + transit entrances from OpenStreetMap (Overpass).
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// south, west, north, east
const BBOX = process.env.BBOX ?? "43.630,-79.420,43.680,-79.355";
const q = `
[out:json][timeout:180];
(
  way["highway"~"^(footway|pedestrian|path|steps|corridor|living_street|residential|unclassified|tertiary|secondary|primary|service|cycleway)$"]["foot"!="no"](${BBOX});
  way["highway"="elevator"](${BBOX});
  node["highway"="elevator"](${BBOX});
  node["railway"~"^(subway_entrance|station)$"](${BBOX});
  node["entrance"](${BBOX});
  node["highway"="steps"](${BBOX});
  node["barrier"](${BBOX});
);
out body geom;
`;
const res = await fetch("https://overpass-api.de/api/interpreter", { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "gatewayhacks-exposure-router/0.1" } });
if (!res.ok) { console.error("Overpass HTTP", res.status, await res.text()); process.exit(1); }
const j = await res.json();
await mkdir(path.join(ROOT, "data", "raw"), { recursive: true });
const out = path.join(ROOT, "data", "raw", "osm-downtown.json");
await writeFile(out, JSON.stringify(j));
const ways = j.elements.filter(e => e.type === "way"), nodes = j.elements.filter(e => e.type === "node");
const cnt = (pred) => ways.filter(pred).length;
console.log(`saved ${out}: ${j.elements.length} elements (${ways.length} ways, ${nodes.length} nodes)`);
console.log("ways by highway:", Object.entries(ways.reduce((m, w) => (m[w.tags.highway] = (m[w.tags.highway] || 0) + 1, m), {})).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(" "));
console.log(`tunnel=${cnt(w => w.tags.tunnel === "yes")} indoor=${cnt(w => w.tags.indoor)} covered=${cnt(w => w.tags.covered === "yes")} steps=${cnt(w => w.tags.highway === "steps")} wheelchair-tagged=${cnt(w => w.tags.wheelchair)} level-tagged=${cnt(w => w.tags.level)}`);
console.log("nodes:", Object.entries(nodes.reduce((m, n) => { const k = n.tags?.railway ?? n.tags?.highway ?? (n.tags?.entrance ? "entrance" : n.tags?.barrier ? "barrier" : "other"); m[k] = (m[k] || 0) + 1; return m; }, {})).map(([k, v]) => `${k}=${v}`).join(" "));
