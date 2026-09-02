#!/usr/bin/env node
// Builds the pedestrian routing graph from data/raw/osm-downtown.json → data/graph.json
// Written in a compact positional form: the file is loaded on every cold start, so keys,
// repeated strings and derivable geometry are all stripped out and rebuilt in src/lib/graph.ts.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BBOX = process.env.BBOX ?? "43.575,-79.640,43.860,-79.115";

const osm = JSON.parse(await readFile(path.join(ROOT, "data/raw/osm-downtown.json"), "utf8"));
// Parking aisles and driveways are a third of the raw network and never a route anyone walks
// between real destinations; named laneways and anything explicitly signed for pedestrians stay.
const isDeadWeight = (t) => t.highway === "service" && ["parking_aisle", "driveway", "drive-through"].includes(t.service) && !t.name && !["yes", "designated"].includes(t.foot);
const ways = osm.elements.filter((e) => e.type === "way" && e.tags?.highway && e.geometry?.length > 1 && !isDeadWeight(e.tags));
const nodesEl = osm.elements.filter((e) => e.type === "node");

const R = 6371008.8;
const hav = (a, b) => { const dLat = (b[1] - a[1]) * Math.PI / 180, dLon = (b[0] - a[0]) * Math.PI / 180; const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * Math.PI / 180) * Math.cos(b[1] * Math.PI / 180) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };
const rnd = (c) => [Math.round(c[0] * 1e5) / 1e5, Math.round(c[1] * 1e5) / 1e5];

const use = new Map();
for (const w of ways) for (const id of w.nodes) use.set(id, (use.get(id) || 0) + 1);
const coord = new Map();
for (const w of ways) w.nodes.forEach((id, i) => coord.set(id, [w.geometry[i].lon, w.geometry[i].lat]));
for (const n of nodesEl) if (!coord.has(n.id)) coord.set(n.id, [n.lon, n.lat]);
const nodeTags = new Map(nodesEl.filter((n) => n.tags).map((n) => [n.id, n.tags]));

function shelterOf(t) {
  if (t.indoor && t.indoor !== "no") return 2;
  if (t.tunnel && t.tunnel !== "no" && t.tunnel !== "building_passage") return 2;
  if (t.highway === "corridor") return 2;
  if (t.covered && t.covered !== "no") return 1;
  if (t.tunnel === "building_passage") return 1;
  if (t.level && /^-\d/.test(t.level)) return 2;
  return 0;
}
const WC = ["unk", "yes", "no", "limited"];
const wcOf = (t) => Math.max(0, WC.indexOf(t.wheelchair ?? "unk"));

// Toronto maps sidewalks as separate footway=sidewalk lines, so a route that follows a road
// way is a route with no mapped sidewalk: you are walking in or beside the traffic lane.
// In winter that is where snowbanks push pedestrians into the road.
const ROAD = new Set(["residential", "unclassified", "tertiary", "secondary", "primary", "living_street", "service"]);
const roadwayOf = (t) => (ROAD.has(t.highway) && t.sidewalk !== "both" && t.sidewalk !== "left" && t.sidewalk !== "right" && t.sidewalk !== "yes" ? 1 : 0);
// unpaved and loose surfaces are worse under snow and impassable for small wheels
const LOOSE = new Set(["gravel", "fine_gravel", "dirt", "ground", "grass", "sand", "unpaved", "pebblestone", "compacted", "cobblestone", "sett", "rocks", "rock", "bare_ground", "grass_paver", "earth", "mud"]);
const looseOf = (t) => (t.surface && LOOSE.has(t.surface) ? 1 : 0);
// steep segments are the ones that ice over; keep the sign, it matters per direction
const inclineOf = (t) => { const m = /^(-?\d+(?:\.\d+)?)\s*%$/.exec(t.incline ?? ""); if (!m) return 0; const v = Math.abs(Number(m[1])); return v >= 8 ? 2 : v >= 4 ? 1 : 0; };

const hwTable = [];
const hwIdx = (h) => { let i = hwTable.indexOf(h); if (i < 0) { i = hwTable.length; hwTable.push(h); } return i; };

const nodeIndex = new Map();
const nodeCoords = [];
const idx = (id) => { let i = nodeIndex.get(id); if (i === undefined) { i = nodeCoords.length; nodeIndex.set(id, i); nodeCoords.push(rnd(coord.get(id))); } return i; };

// edge = [a, b, len, hw, shelter, flags, name|0, interiorGeom|0]
// flags bits: 1 steps, 2 elevator, wheelchair << 2 (2 bits), roadway << 4, loose surface << 5, incline class << 6 (2 bits)
const edges = [];
for (const w of ways) {
  const t = w.tags;
  const hw = hwIdx(t.highway), shelter = shelterOf(t);
  const flags = (t.highway === "steps" ? 1 : 0) | (t.highway === "elevator" ? 2 : 0) | (wcOf(t) << 2)
    | (roadwayOf(t) << 4) | (looseOf(t) << 5) | (inclineOf(t) << 6);
  const name = t.name ?? 0;
  let segStart = 0, len = 0, geom = [coord.get(w.nodes[0])];
  for (let i = 1; i < w.nodes.length; i++) {
    const a = coord.get(w.nodes[i - 1]), b = coord.get(w.nodes[i]);
    len += hav(a, b); geom.push(b);
    if (use.get(w.nodes[i]) > 1 || i === w.nodes.length - 1) {
      const interior = geom.slice(1, -1).map(rnd);
      edges.push([idx(w.nodes[segStart]), idx(w.nodes[i]), Math.round(len), hw, shelter, flags, name, interior.length ? interior : 0]);
      segStart = i; len = 0; geom = [b];
    }
  }
}

const pois = nodesEl.filter((n) => n.tags && (n.tags.highway === "elevator" || n.tags.railway === "subway_entrance" || n.tags.railway === "station" || n.tags.entrance))
  .map((n) => ({ lon: Math.round(n.lon * 1e5) / 1e5, lat: Math.round(n.lat * 1e5) / 1e5, kind: n.tags.highway === "elevator" ? "elevator" : n.tags.railway ?? "entrance", name: n.tags.name ?? null, wc: WC[wcOf(n.tags)], graphNode: nodeIndex.get(n.id) ?? null }));

const nodeAttr = {};
for (const [id, i] of nodeIndex) {
  const t = nodeTags.get(id); if (!t) continue;
  if (t.highway === "elevator") nodeAttr[i] = { elev: 1, wc: WC[wcOf(t)] };
  else if (t.barrier && ["kerb", "bollard", "gate", "cycle_barrier", "turnstile"].includes(t.barrier)) nodeAttr[i] = { barrier: t.barrier, wc: WC[wcOf(t)], kerb: t.kerb ?? null };
}

const out = { meta: { built: new Date().toISOString(), source: "OpenStreetMap via Overpass", bbox: BBOX, format: 2 }, hwTable, wcTable: WC, nodes: nodeCoords, edges, nodeAttr, pois };
await mkdir(path.join(ROOT, "data"), { recursive: true });
await writeFile(path.join(ROOT, "data/graph.json"), JSON.stringify(out));
const km = (pred) => Math.round(edges.filter(pred).reduce((s, e) => s + e[2], 0) / 100) / 10;
console.log(`graph: ${nodeCoords.length} nodes, ${edges.length} edges, ${km(() => true)} km`);
console.log(`  indoor/underground ${km((e) => e[4] === 2)} km | covered ${km((e) => e[4] === 1)} km | open ${km((e) => e[4] === 0)} km`);
console.log(`  steps ${edges.filter((e) => e[5] & 1).length} | elevator ${edges.filter((e) => e[5] & 2).length} | wheelchair=no ${edges.filter((e) => ((e[5] >> 2) & 3) === 2).length}`);
console.log(`  no mapped sidewalk ${km((e) => e[5] & 16)} km | loose surface ${km((e) => e[5] & 32)} km | steep ${edges.filter((e) => (e[5] >> 6) & 3).length} segments`);
console.log(`  pois ${pois.length} (elevators ${pois.filter((p) => p.kind === "elevator").length}, entrances ${pois.filter((p) => p.kind === "subway_entrance").length})`);
console.log(`  file ${(JSON.stringify(out).length / 1e6).toFixed(1)} MB`);
