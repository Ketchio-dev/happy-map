#!/usr/bin/env node
// Extracts the TTC subway network (stations + inter-station travel times) from GTFS → data/subway.json
import { readFile, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import readline from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const G = path.join(ROOT, "data/raw/gtfs");

const csv = (txt) => { const [h, ...rows] = txt.trim().split(/\r?\n/); const cols = h.split(","); return rows.map(r => { const v = r.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map(x => x.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"')); return Object.fromEntries(cols.map((c, i) => [c, v[i] ?? ""])); }); };
const routes = csv(await readFile(path.join(G, "routes.txt"), "utf8")).filter(r => r.route_type === "1");
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
const norm = (n) => n.replace(/ Station.*$/i, "").replace(/ - (Northbound|Southbound|Eastbound|Westbound) Platform.*$/i, "").replace(/\s+Platform.*$/i, "").trim();
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
const out = {
  meta: { built: new Date().toISOString(), source: "TTC GTFS via Toronto Open Data" },
  lines: routes.map(r => ({ id: r.route_id, name: r.route_long_name, color: r.route_color })),
  stations: [...stations.values()].map(s => ({ key: s.key, name: s.name, lat: +(s.lat / s.n).toFixed(6), lon: +(s.lon / s.n).toFixed(6), wheelchair_boarding: s.wc, stopIds: [...s.stopIds], lines: [...s.lines] })),
  edges: [...edges.entries()].map(([k, ts]) => {
    const [a, b, line] = k.split("|"); ts.sort((x, y) => x - y);
    let geom = null;
    const meta = edgeShape.get(k);
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
await writeFile(path.join(ROOT, "data/subway.json"), JSON.stringify(out, null, 0));
console.log(`stations ${out.stations.length}, edges ${out.edges.length}`);
console.log(out.stations.slice(0, 80).map(s => `${s.name}(${s.lines.join("/")},wc=${s.wheelchair_boarding})`).join(", "));
