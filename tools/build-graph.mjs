#!/usr/bin/env node
// Builds the pedestrian routing graph from data/raw/osm-downtown.json → data/graph.json
// Edges carry exposure attributes: shelter (0 open, 1 covered, 2 indoor/underground), steps, wheelchair, elevator.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const osm = JSON.parse(await readFile(path.join(ROOT, "data/raw/osm-downtown.json"), "utf8"));
const ways = osm.elements.filter(e => e.type === "way" && e.tags?.highway && e.geometry?.length > 1);
const nodesEl = osm.elements.filter(e => e.type === "node");

const R = 6371008.8;
const hav = (a, b) => { const dLat = (b[1]-a[1])*Math.PI/180, dLon = (b[0]-a[0])*Math.PI/180; const s = Math.sin(dLat/2)**2 + Math.cos(a[1]*Math.PI/180)*Math.cos(b[1]*Math.PI/180)*Math.sin(dLon/2)**2; return 2*R*Math.asin(Math.sqrt(s)); };

// node usage count → junctions
const use = new Map();
for (const w of ways) for (const id of w.nodes) use.set(id, (use.get(id) || 0) + 1);
const coord = new Map();
for (const w of ways) w.nodes.forEach((id, i) => coord.set(id, [w.geometry[i].lon, w.geometry[i].lat]));
for (const n of nodesEl) if (!coord.has(n.id)) coord.set(n.id, [n.lon, n.lat]);
const nodeTags = new Map(nodesEl.filter(n => n.tags).map(n => [n.id, n.tags]));

function shelterOf(t) {
  if (t.indoor && t.indoor !== "no") return 2;
  if (t.tunnel && t.tunnel !== "no") return 2;
  if (t.highway === "corridor") return 2;
  if (t.covered && t.covered !== "no") return 1;
  if (t.tunnel === "building_passage") return 1;
  if (t.level && /^-\d/.test(t.level)) return 2;
  return 0;
}
function wcOf(t) { return t.wheelchair === "yes" ? "yes" : t.wheelchair === "no" ? "no" : t.wheelchair === "limited" ? "limited" : "unk"; }

// id remap for compact output
const nodeIndex = new Map();
const nodeCoords = [];
const idx = (id) => { let i = nodeIndex.get(id); if (i === undefined) { i = nodeCoords.length; nodeIndex.set(id, i); nodeCoords.push(coord.get(id)); } return i; };

const edges = [];
for (const w of ways) {
  const t = w.tags;
  const base = {
    hw: t.highway, shelter: shelterOf(t), steps: t.highway === "steps" ? 1 : 0, elev: t.highway === "elevator" ? 1 : 0,
    wc: wcOf(t), lit: t.lit === "yes" ? 1 : 0, level: t.level ?? null, name: t.name ?? null, sidewalk: t.sidewalk ?? null,
    oneway_foot: null,
  };
  let segStart = 0, len = 0, geom = [coord.get(w.nodes[0])];
  for (let i = 1; i < w.nodes.length; i++) {
    const a = coord.get(w.nodes[i-1]), b = coord.get(w.nodes[i]);
    len += hav(a, b); geom.push(b);
    const isJunction = use.get(w.nodes[i]) > 1 || i === w.nodes.length - 1;
    if (isJunction) {
      edges.push({ a: idx(w.nodes[segStart]), b: idx(w.nodes[i]), len: Math.round(len*10)/10, ...base, geom: geom.map(c => [Math.round(c[0]*1e6)/1e6, Math.round(c[1]*1e6)/1e6]), wid: w.id });
      segStart = i; len = 0; geom = [b];
    }
  }
}

// points of interest: elevators, subway entrances, stations
const pois = nodesEl.filter(n => n.tags && (n.tags.highway === "elevator" || n.tags.railway === "subway_entrance" || n.tags.railway === "station" || n.tags.entrance))
  .map(n => ({ id: n.id, lon: n.lon, lat: n.lat, kind: n.tags.highway === "elevator" ? "elevator" : n.tags.railway ?? "entrance", name: n.tags.name ?? null, wc: wcOf(n.tags), level: n.tags.level ?? null, ref: n.tags.ref ?? null, station: n.tags.station ?? n.tags.subway ?? null, graphNode: nodeIndex.get(n.id) ?? null }));

// node-level attributes for graph nodes (elevator nodes, steps nodes, barriers)
const nodeAttr = {};
for (const [id, i] of nodeIndex) { const t = nodeTags.get(id); if (!t) continue; if (t.highway === "elevator") nodeAttr[i] = { elev: 1, wc: wcOf(t) }; else if (t.barrier && ["kerb","bollard","gate","cycle_barrier","turnstile"].includes(t.barrier)) nodeAttr[i] = { barrier: t.barrier, wc: wcOf(t), kerb: t.kerb ?? null }; }

const out = { meta: { built: new Date().toISOString(), source: "OpenStreetMap via Overpass", bbox: "43.630,-79.420,43.680,-79.355", nodes: nodeCoords.length, edges: edges.length }, nodes: nodeCoords, edges, nodeAttr, pois };
await mkdir(path.join(ROOT, "data"), { recursive: true });
await writeFile(path.join(ROOT, "data/graph.json"), JSON.stringify(out));
const totLen = (pred) => Math.round(edges.filter(pred).reduce((s, e) => s + e.len, 0) / 1000 * 10) / 10;
console.log(`graph: ${nodeCoords.length} nodes, ${edges.length} edges, total ${totLen(() => true)} km`);
console.log(`  indoor/underground ${totLen(e => e.shelter === 2)} km | covered ${totLen(e => e.shelter === 1)} km | open ${totLen(e => e.shelter === 0)} km`);
console.log(`  steps edges ${edges.filter(e => e.steps).length} | elevator edges ${edges.filter(e => e.elev).length} | wheelchair=no ${edges.filter(e => e.wc === "no").length}`);
console.log(`  pois: ${pois.length} (elevators ${pois.filter(p => p.kind === "elevator").length}, subway entrances ${pois.filter(p => p.kind === "subway_entrance").length}, stations ${pois.filter(p => p.kind === "station").length})`);
console.log(`  file size ${(JSON.stringify(out).length / 1e6).toFixed(1)} MB`);
