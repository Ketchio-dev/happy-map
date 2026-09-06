#!/usr/bin/env node
// Route relations for transit lines the GTFS lists but does not schedule (TTC Lines 5 and 6):
// stop positions in order plus the track ways → data/raw/osm-lines/ttc-lrt.json.
// build-subway.mjs merges them with estimated running times.
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BBOX = process.env.BBOX ?? "43.6,-79.65,43.8,-79.15";
const NETWORK = process.env.NETWORK ?? "TTC";
const REFS = process.env.REFS ?? "5|6";
const query = `[out:json][timeout:180];
relation["route"~"^(light_rail|subway|tram)$"]["network"="${NETWORK}"]["ref"~"^(${REFS})$"](${BBOX})->.r;
.r out body;
node(r.r)->.n; .n out body;
way(r.r)->.w; .w out geom;`;
const res = await fetch("https://overpass-api.de/api/interpreter", { method: "POST", body: "data=" + encodeURIComponent(query), headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "happy-map/0.1 (GatewayHacks project)" } });
if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
const j = await res.json();
const dir = path.join(ROOT, "data/raw/osm-lines"); await mkdir(dir, { recursive: true });
await writeFile(path.join(dir, `${NETWORK.toLowerCase()}-lrt.json`), JSON.stringify(j));
console.log(`relations: ${j.elements.filter((e) => e.type === "relation").map((e) => e.tags?.name).join(" | ")}`);
