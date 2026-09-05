#!/usr/bin/env node
// Computes per-edge sun-exposure fractions (0 = fully shaded, 1 = full sun) for outdoor edges of data/graph.json
// using Toronto 3D Massing building heights + sun position. Writes edge.sun = { d0715_h08: 0.4, ... } back into graph.json.
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as shp from "shapefile";
import Flatbush from "flatbush";
import { sunPosition } from "./solar.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [S, W, N, E] = (process.env.BBOX ?? "43.575,-79.640,43.860,-79.115").split(",").map(Number);
const PAD_LAT = 0.006, PAD_LON = 0.008;
const CENTER = { lat: (S + N) / 2, lon: (W + E) / 2 };
// reference days (local Toronto time, EDT = UTC-4 in July/Sept): summer design day + a September day for judging-time demos
const DAYS = [{ tag: "d0715", y: 2026, m: 7, d: 15, utcOff: 4 }, { tag: "d0915", y: 2026, m: 9, d: 15, utcOff: 4 }];
const HOURS = [8, 10, 12, 14, 16, 18];

const merc2ll = ([x, y]) => [x / 6378137 * 180 / Math.PI, (2 * Math.atan(Math.exp(y / 6378137)) - Math.PI / 2) * 180 / Math.PI];
const t0 = Date.now();
const src = await shp.open(path.join(ROOT, "data/raw/massing/3DMassingShapefile_2025_WGS84.shp"), path.join(ROOT, "data/raw/massing/3DMassingShapefile_2025_WGS84.dbf"));
const bld = []; let n = 0;
for (;;) { const r = await src.read(); if (r.done) break; n++; const f = r.value; const p = f.properties; if (p.LATITUDE < S - PAD_LAT || p.LATITUDE > N + PAD_LAT || p.LONGITUDE < W - PAD_LON || p.LONGITUDE > E + PAD_LON) continue; let h = p.AVG_HEIGHT > 0 ? p.AVG_HEIGHT : (p.HEIGHT_MSL - p.SURF_ELEV); if (!(h >= 2)) continue; const rings = f.geometry.type === "Polygon" ? [f.geometry.coordinates[0]] : f.geometry.coordinates.map(c => c[0]); for (const ring of rings) { const ll = ring.map(merc2ll); let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9; for (const [x, y] of ll) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; } bld.push({ ring: ll, h, minX, minY, maxX, maxY }); } }
console.log(`buildings: ${n} read, ${bld.length} polygons in padded bbox, max height ${bld.reduce((m, b) => (b.h > m ? b.h : m), 0).toFixed(0)} m (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
const index = new Flatbush(bld.length); for (const b of bld) index.add(b.minX, b.minY, b.maxX, b.maxY); index.finish();
const pip = (x, y, ring) => { let inside = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]; if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside; } return inside; };

const g = JSON.parse(await readFile(path.join(ROOT, "data/graph.json"), "utf8"));
if (g.meta.format !== 2) throw new Error("expected graph format 2 from tools/build-graph.mjs");
// rebuild each edge's full geometry: the file stores only interior points
const geomOf = (e) => [g.nodes[e[0]], ...(e[7] || []), g.nodes[e[1]]];
const mPerDegLat = 111_320, mPerDegLon = 111_320 * Math.cos(CENTER.lat * Math.PI / 180);
const hav = (a, b) => Math.hypot((b[0] - a[0]) * mPerDegLon, (b[1] - a[1]) * mPerDegLat);
const suns = [];
for (const day of DAYS) for (const h of HOURS) { const date = new Date(Date.UTC(day.y, day.m - 1, day.d, h + day.utcOff, 0, 0)); const pos = sunPosition(date, CENTER.lat, CENTER.lon); suns.push({ key: `${day.tag}_h${String(h).padStart(2, "0")}`, alt: pos.altitude, bearing: pos.azimuth }); }
console.log("sun positions:", suns.map(s => `${s.key}: alt ${(s.alt * 180 / Math.PI).toFixed(0)}° brg ${((s.bearing * 180 / Math.PI + 360) % 360).toFixed(0)}°`).join(" | "));

function shadedAt(p, sun) {
  if (sun.alt <= 0.02) return true; // night / twilight: no sun
  const tanAlt = Math.tan(sun.alt);
  const dmax = Math.min(450, 320 / tanAlt);
  const ex = Math.sin(sun.bearing), ny = Math.cos(sun.bearing);
  for (let s = 3; s <= dmax; s += 5) {
    const qx = p[0] + ex * s / mPerDegLon, qy = p[1] + ny * s / mPerDegLat;
    const need = s * tanAlt; let hit = false;
    index.search(qx, qy, qx, qy, (i) => { const b = bld[i]; if (b.h >= need && pip(qx, qy, b.ring)) { hit = true; return false; } return false; });
    if (hit) return true;
  }
  return false;
}
// Street trees as canopies: a sphere of radius r at height hc whose ground shadow under a given
// sun is an ellipse. Canopies are not opaque, so a point under one keeps a quarter of the sun.
// Source: City of Toronto Street Tree Data (DBH in cm); crown size and height are scaled from DBH.
const TREES = path.join(ROOT, "data/raw/trees/street-trees-4326.geojson");
const CANOPY_SUN = 0.25;
const shadow = []; // per sun bucket: { idx, cx, cy, a, b, ux, uy, rmaxDegX, rmaxDegY }
if (existsSync(TREES)) {
  const tj = JSON.parse(await readFile(TREES, "utf8"));
  const trees = [];
  for (const f of tj.features) {
    const dbh = +f.properties?.DBH_TRUNK; if (!(dbh > 0) || !f.geometry) continue;
    const c = f.geometry.type === "MultiPoint" ? f.geometry.coordinates[0] : f.geometry.coordinates;
    if (!c || c[1] < S - PAD_LAT || c[1] > N + PAD_LAT || c[0] < W - PAD_LON || c[0] > E + PAD_LON) continue;
    const r = Math.min(8, Math.max(1.2, 0.07 * dbh + 0.8)), h = Math.min(22, Math.max(4, 0.25 * dbh + 4));
    trees.push({ x: c[0], y: c[1], r, hc: Math.max(2.5, h - r) });
  }
  console.log(`trees: ${tj.features.length} read, ${trees.length} with a trunk size in the bbox (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  for (const sun of suns) {
    if (sun.alt <= 0.02) { shadow.push(null); continue; }
    const tanAlt = Math.tan(sun.alt), sinAlt = Math.sin(sun.alt);
    const ux = -Math.sin(sun.bearing), uy = -Math.cos(sun.bearing); // ground direction away from the sun
    const n = trees.length, cx = new Float64Array(n), cy = new Float64Array(n), a = new Float32Array(n), b = new Float32Array(n);
    const idx = new Flatbush(n); let rmax = 0;
    for (let i = 0; i < n; i++) {
      const t = trees[i], d = t.hc / tanAlt;
      cx[i] = t.x + ux * d / mPerDegLon; cy[i] = t.y + uy * d / mPerDegLat;
      a[i] = t.r / sinAlt; b[i] = t.r; if (a[i] > rmax) rmax = a[i];
      idx.add(cx[i] - a[i] / mPerDegLon, cy[i] - a[i] / mPerDegLat, cx[i] + a[i] / mPerDegLon, cy[i] + a[i] / mPerDegLat);
    }
    idx.finish();
    shadow.push({ idx, cx, cy, a, b, ux, uy });
  }
  console.log(`tree shadows indexed for ${shadow.filter(Boolean).length} buckets (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
function underCanopy(p, j) {
  const S = shadow[j]; if (!S) return false;
  let hit = false;
  S.idx.search(p[0], p[1], p[0], p[1], (i) => {
    const dx = (p[0] - S.cx[i]) * mPerDegLon, dy = (p[1] - S.cy[i]) * mPerDegLat;
    const u = dx * S.ux + dy * S.uy, v = -dx * S.uy + dy * S.ux;
    if ((u * u) / (S.a[i] * S.a[i]) + (v * v) / (S.b[i] * S.b[i]) <= 1) { hit = true; return false; }
    return false;
  });
  return hit;
}
function samples(geom) { const pts = []; let total = 0; for (let i = 1; i < geom.length; i++) total += hav(geom[i - 1], geom[i]); const nS = Math.max(2, Math.min(6, Math.round(total / 12))); for (let k = 0; k < nS; k++) { const target = total * (k + 0.5) / nS; let acc = 0; for (let i = 1; i < geom.length; i++) { const seg = hav(geom[i - 1], geom[i]); if (acc + seg >= target || i === geom.length - 1) { const f = seg ? Math.min(1, (target - acc) / seg) : 0; pts.push([geom[i - 1][0] + (geom[i][0] - geom[i - 1][0]) * f, geom[i - 1][1] + (geom[i][1] - geom[i - 1][1]) * f]); break; } acc += seg; } } return pts; }

// One byte per bucket per edge, packed into a single base64 blob. Storing this as JSON
// arrays cost several times more and has to be parsed twice on every cold start.
const NB = suns.length;
const bytes = new Uint8Array(g.edges.length * NB);
const outdoorFlag = new Uint8Array(g.edges.length);
let done = 0, outdoorCount = 0;
for (let i = 0; i < g.edges.length; i++) {
  const e = g.edges[i];
  if (e[4] !== 0) continue;
  outdoorCount++;
  const pts = samples(geomOf(e));
  outdoorFlag[i] = 1;
  suns.forEach((s, j) => { let sh = 0; for (const p of pts) { if (shadedAt(p, s)) sh++; else if (underCanopy(p, j)) sh += 1 - CANOPY_SUN; } bytes[i * NB + j] = Math.round((1 - sh / pts.length) * 255); });
  if (++done % 20000 === 0) console.log(`  ${done} edges (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
g.sunKeys = suns.map((s) => s.key);
g.sunBytes = Buffer.from(bytes).toString("base64");
g.meta.shade = { computed: new Date().toISOString(), source: shadow.length ? "Toronto 3D Massing 2025 + Street Tree Data canopies + NOAA solar position" : "Toronto 3D Massing 2025 + NOAA solar position" };
await writeFile(path.join(ROOT, "data/graph.json"), JSON.stringify(g));
const avg = (j) => { let t = 0; for (let i = 0; i < g.edges.length; i++) if (outdoorFlag[i]) t += bytes[i * NB + j]; return (t / outdoorCount / 255).toFixed(2); };
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s over ${outdoorCount} outdoor edges. mean sun fraction:`, suns.map((s, j) => `${s.key}=${avg(j)}`).join(" "));
console.log(`file ${(JSON.stringify(g).length / 1e6).toFixed(1)} MB`);
