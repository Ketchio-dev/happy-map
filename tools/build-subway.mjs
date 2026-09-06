#!/usr/bin/env node
// Extracts the TTC subway network (stations + inter-station travel times) from GTFS → data/subway.json
import { readFile, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import readline from "node:readline";
import path from "node:path";
import { CITY, GTFS as G, SUBWAY_JSON, OSM_LINES } from "./city.mjs";

const csv = (txt) => { const [h, ...rows] = txt.trim().split(/\r?\n/); const cols = h.split(","); return rows.map(r => { const v = r.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map(x => x.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"')); return Object.fromEntries(cols.map((c, i) => [c, v[i] ?? ""])); }); };
// route_type 1 is the subway; 0 is light rail (Lines 5 and 6), which this GTFS lists as
// routes but does not schedule, so their stations and tracks come from OpenStreetMap below.
const routes = csv(await readFile(path.join(G, "routes.txt"), "utf8")).filter(r => r.route_type === "1" || (r.route_type === "0" && /^Line \d/.test(r.route_long_name)));
const routeIds = new Set(routes.map(r => r.route_id));
console.log("subway routes:", routes.map(r => `${r.route_id}:${r.route_long_name}`).join(" | "));
const trips = csv(await readFile(path.join(G, "trips.txt"), "utf8")).filter(t => routeIds.has(t.route_id));
const tripRoute = new Map(trips.map(t => [t.trip_id, t.route_id]));
const tripShape = new Map(trips.map(t => [t.trip_id, t.shape_id]));

// Track geometry, so a subway leg follows the line instead of cutting across the city.
const shapes = new Map(); // shape_id -> [[lon,lat], ...]
{
  const rl2 = readline.createInterface({ input: createReadStream(path.join(G, "shapes.txt")) });
  let head = null;
  const want = new Set([...tripShape.values()].filter(Boolean));
  for await (const line of rl2) {
    if (!head) { head = line.split(","); continue; }
    const v = line.split(",");
    const id = v[head.indexOf("shape_id")];
    if (!want.has(id)) continue;
    if (!shapes.has(id)) shapes.set(id, []);
    shapes.get(id).push([+v[head.indexOf("shape_pt_sequence")], +v[head.indexOf("shape_pt_lon")], +v[head.indexOf("shape_pt_lat")]]);
  }
  for (const pts of shapes.values()) pts.sort((a, b) => a[0] - b[0]);
  console.log(`shapes loaded: ${shapes.size}`);
}
const near = (pts, p) => { let bi = 0, bd = Infinity; for (let i = 0; i < pts.length; i++) { const d = (pts[i][1] - p[0]) ** 2 + (pts[i][2] - p[1]) ** 2; if (d < bd) { bd = d; bi = i; } } return bi; };
// pick one representative trip per (route, direction, shape) → the longest one; then read stop_times only for those
const byKey = new Map();
for (const t of trips) { const k = `${t.route_id}|${t.direction_id}`; if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(t.trip_id); }
const wanted = new Set([...byKey.values()].flat());
const stopTimes = new Map(); // trip_id -> [{seq, stop, arr}]
const rl = readline.createInterface({ input: createReadStream(path.join(G, "stop_times.txt")) });
let header = null;
for await (const line of rl) {
  if (!header) { header = line.split(","); continue; }
  const v = line.split(","); const trip = v[0]; if (!wanted.has(trip)) continue;
  const rec = Object.fromEntries(header.map((c, i) => [c, v[i]]));
  if (!stopTimes.has(trip)) stopTimes.set(trip, []);
  const [h, m, s] = rec.arrival_time.split(":").map(Number);
  stopTimes.get(trip).push({ seq: +rec.stop_sequence, stop: rec.stop_id, t: h * 3600 + m * 60 + s });
}
const stops = new Map(csv(await readFile(path.join(G, "stops.txt"), "utf8")).map(s => [s.stop_id, s]));
// stations: group platform stops by parent_station or by normalized name
// STM suffixes Laval stations with their fare zone ("Montmorency -Zone B"); TTC suffixes platforms
const norm = (n) => n.replace(/\s*-\s*Zone\s+\w+$/i, "").replace(/^Station /i, "").replace(/ Station.*$/i, "").replace(/ - (Northbound|Southbound|Eastbound|Westbound) Platform.*$/i, "").replace(/\s+Platform.*$/i, "").trim();
const stationOf = (stopId) => { const s = stops.get(stopId); if (!s) return null; const key = s.parent_station || norm(s.stop_name); return key; };
const stations = new Map(); // key -> {name, lat, lon, wc, stopIds:Set}
const edges = new Map();    // "a|b|line" -> time samples
const edgeShape = new Map(); // "a|b|line" -> a trip and the two stops, used to slice the track
for (const [trip, list] of stopTimes) {
  list.sort((x, y) => x.seq - y.seq);
  const line = tripRoute.get(trip);
  for (let i = 0; i < list.length; i++) {
    const s = stops.get(list[i].stop); const key = stationOf(list[i].stop); if (!key) continue;
    if (!stations.has(key)) stations.set(key, { key, name: norm(s.stop_name), lat: 0, lon: 0, n: 0, wc: s.wheelchair_boarding, stopIds: new Set(), lines: new Set() });
    const st = stations.get(key); st.lat += +s.stop_lat; st.lon += +s.stop_lon; st.n++; st.stopIds.add(list[i].stop); st.lines.add(line);
    if (i > 0) { const ka = stationOf(list[i-1].stop); if (!ka || ka === key) continue; const dt = list[i].t - list[i-1].t; const ek = [ka, key].sort().join("|") + "|" + line; if (!edges.has(ek)) edges.set(ek, []); edges.get(ek).push(dt); if (!edgeShape.has(ek)) edgeShape.set(ek, { trip, from: list[i-1].stop, to: list[i].stop }); }
  }
}
// --- lines with no GTFS trips: stations and track from the OSM route relation (tools/fetch-osm-lines.mjs) ---
// Running times are estimated from track length, since no schedule is published for them.
const ESTIMATE = { "5": { mps: 9, dwell: 30 }, "6": { mps: 7, dwell: 20 } }; // cruise speed between stops, dwell per stop
const normStation = (n) => n.replace(/ Station$/i, "").replace(/[.'’]/g, "").replace(/[-–—/]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
const byNormName = new Map([...stations.values()].map(s => [normStation(s.name), s]));
const scheduled = new Set([...stations.values()].flatMap(s => [...s.lines]));
// FORCE_OSM_LINES=5,6 rebuilds those lines from OSM even though GTFS schedules them (to exercise the fallback)
for (const l of (process.env.FORCE_OSM_LINES ?? "").split(",").filter(Boolean)) { scheduled.delete(l); for (const st of stations.values()) st.lines.delete(l); for (const k of [...edges.keys()]) if (k.endsWith(`|${l}`)) { edges.delete(k); edgeShape.delete(k); } }
const osmNote = [];
let osmFiles = [];
try { osmFiles = (await import("node:fs")).readdirSync(OSM_LINES).filter(f => f.endsWith(".json")); } catch { /* no OSM lines */ }
for (const f of osmFiles) {
  const els = JSON.parse(await readFile(path.join(OSM_LINES, f), "utf8")).elements;
  const nodeById = new Map(els.filter(e => e.type === "node").map(e => [e.id, e]));
  const wayById = new Map(els.filter(e => e.type === "way").map(e => [e.id, e]));
  const rels = els.filter(e => e.type === "relation" && e.tags?.ref && routes.some(r => r.route_id === e.tags.ref));
  const seenRef = new Set();
  for (const rel of rels) {
    const line = rel.tags.ref;
    if (scheduled.has(line) || seenRef.has(line)) continue; // GTFS already covers it, or the other direction did
    seenRef.add(line);
    const est = ESTIMATE[line] ?? { mps: 10, dwell: 25 };
    // PTv2: stop positions come first in member order, then the track ways
    const stops = rel.members.filter(m => m.type === "node" && /stop/.test(m.role ?? "stop") && nodeById.get(m.ref)?.tags?.name).map(m => nodeById.get(m.ref));
    const track = chainWays(rel.members.filter(m => m.type === "way").map(m => wayById.get(m.ref)).filter(Boolean));
    const keys = [];
    for (const n of stops) {
      const name = n.tags.name.replace(/ Station$/i, "");
      let st = byNormName.get(normStation(name));
      if (!st) { st = { key: `osm:${line}:${name}`, name, lat: +n.lat, lon: +n.lon, n: 1, wc: "1", stopIds: new Set(), lines: new Set(), estimated: true }; stations.set(st.key, st); byNormName.set(normStation(name), st); }
      st.lines.add(line);
      if (keys[keys.length - 1] !== st.key) keys.push(st.key);
    }
    for (let i = 1; i < keys.length; i++) {
      const A = stations.get(keys[i - 1]), B = stations.get(keys[i]);
      const a = [A.lon / A.n, A.lat / A.n], b = [B.lon / B.n, B.lat / B.n];
      let geom = null, len = hav(a, b);
      if (track.length > 1) { let i1 = nearPt(track, a), i2 = nearPt(track, b); if (i1 > i2) [i1, i2] = [i2, i1]; const slice = track.slice(i1, i2 + 1); if (slice.length > 1) { geom = slice.map(p => [Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5]); len = 0; for (let k = 1; k < slice.length; k++) len += hav(slice[k - 1], slice[k]); } }
      const ek = [A.key, B.key].sort().join("|") + "|" + line;
      edges.set(ek, [Math.round(len / est.mps + est.dwell)]);
      if (geom) edgeShape.set(ek, { geom });
    }
    osmNote.push(`${rel.tags.name}: ${keys.length} stations, times estimated at ${est.mps} m/s + ${est.dwell} s dwell`);
    console.log(`OSM line ${line}: ${keys.length} stations from relation ${rel.id}, track ${track.length} points`);
  }
}
function hav(a, b) { const R = 6371008.8; const dLat = (b[1] - a[1]) * Math.PI / 180, dLon = (b[0] - a[0]) * Math.PI / 180; const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * Math.PI / 180) * Math.cos(b[1] * Math.PI / 180) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); }
function nearPt(pts, p) { let bi = 0, bd = Infinity; for (let i = 0; i < pts.length; i++) { const d = (pts[i][0] - p[0]) ** 2 + (pts[i][1] - p[1]) ** 2; if (d < bd) { bd = d; bi = i; } } return bi; }
/** orient and concatenate way geometries into one polyline by matching endpoints */
function chainWays(ways) {
  const out = [];
  const same = (p, q) => Math.abs(p[0] - q[0]) < 1e-6 && Math.abs(p[1] - q[1]) < 1e-6;
  for (const w of ways) {
    let g = (w.geometry ?? []).map(p => [p.lon, p.lat]); if (g.length < 2) continue;
    if (out.length) { const last = out[out.length - 1]; if (same(last, g[g.length - 1])) g = g.reverse(); else if (!same(last, g[0])) { const dA = (last[0] - g[0][0]) ** 2 + (last[1] - g[0][1]) ** 2, dB = (last[0] - g[g.length - 1][0]) ** 2 + (last[1] - g[g.length - 1][1]) ** 2; if (dB < dA) g = g.reverse(); } }
    for (const p of g) if (!out.length || !same(out[out.length - 1], p)) out.push(p);
  }
  return out;
}

const out = {
  meta: { built: new Date().toISOString(), city: CITY, source: CITY === "toronto" ? "TTC GTFS via Toronto Open Data; Lines 5 and 6 stations and track from OpenStreetMap route relations" : `${CITY} GTFS`, estimated: osmNote },
  lines: routes.map(r => ({ id: r.route_id, name: r.route_long_name, color: r.route_color })),
  stations: [...stations.values()].map(s => ({ key: s.key, name: s.name, lat: +(s.lat / s.n).toFixed(6), lon: +(s.lon / s.n).toFixed(6), wheelchair_boarding: s.wc, stopIds: [...s.stopIds], lines: [...s.lines], ...(s.estimated ? { source: "osm" } : {}) })),
  edges: [...edges.entries()].map(([k, ts]) => {
    const [a, b, line] = k.split("|"); ts.sort((x, y) => x - y);
    let geom = null;
    const meta = edgeShape.get(k);
    if (meta?.geom) return { a, b, line, time_s: ts[0], geom: meta.geom, estimated: true };
    const pts = meta && shapes.get(tripShape.get(meta.trip));
    if (pts && pts.length > 1) {
      const s1 = stops.get(meta.from), s2 = stops.get(meta.to);
      if (s1 && s2) {
        let i1 = near(pts, [+s1.stop_lon, +s1.stop_lat]), i2 = near(pts, [+s2.stop_lon, +s2.stop_lat]);
        if (i1 > i2) [i1, i2] = [i2, i1];
        const slice = pts.slice(i1, i2 + 1).map((p) => [Math.round(p[1] * 1e5) / 1e5, Math.round(p[2] * 1e5) / 1e5]);
        if (slice.length > 1) geom = slice;
      }
    }
    return { a, b, line, time_s: ts[Math.floor(ts.length / 2)], geom };
  }),
};
await writeFile(SUBWAY_JSON, JSON.stringify(out, null, 0));
console.log(`stations ${out.stations.length}, edges ${out.edges.length}`);
console.log(out.stations.slice(0, 80).map(s => `${s.name}(${s.lines.join("/")},wc=${s.wheelchair_boarding})`).join(", "));
