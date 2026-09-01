#!/usr/bin/env node
// Computes per-edge sun-exposure fractions (0 = fully shaded, 1 = full sun) for outdoor edges of data/graph.json
// using Toronto 3D Massing building heights + sun position. Writes edge.sun = { d0715_h08: 0.4, ... } back into graph.json.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as shp from "shapefile";
import Flatbush from "flatbush";
import { sunPosition } from "./solar.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [S, W, N, E] = "43.630,-79.420,43.680,-79.355".split(",").map(Number);
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
console.log(`buildings: ${n} read, ${bld.length} polygons in padded bbox, max height ${Math.max(...bld.map(b => b.h)).toFixed(0)} m (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
const index = new Flatbush(bld.length); for (const b of bld) index.add(b.minX, b.minY, b.maxX, b.maxY); index.finish();
const pip = (x, y, ring) => { let inside = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]; if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside; } return inside; };

const g = JSON.parse(await readFile(path.join(ROOT, "data/graph.json"), "utf8"));
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
function samples(geom) { const pts = []; let total = 0; for (let i = 1; i < geom.length; i++) total += hav(geom[i - 1], geom[i]); const nS = Math.max(2, Math.min(6, Math.round(total / 12))); for (let k = 0; k < nS; k++) { const target = total * (k + 0.5) / nS; let acc = 0; for (let i = 1; i < geom.length; i++) { const seg = hav(geom[i - 1], geom[i]); if (acc + seg >= target || i === geom.length - 1) { const f = seg ? Math.min(1, (target - acc) / seg) : 0; pts.push([geom[i - 1][0] + (geom[i][0] - geom[i - 1][0]) * f, geom[i - 1][1] + (geom[i][1] - geom[i - 1][1]) * f]); break; } acc += seg; } } return pts; }

let done = 0; const outdoor = g.edges.filter(e => e.shelter === 0);
for (const e of outdoor) {
  const pts = samples(e.geom); const sun = {};
  for (const s of suns) { let sh = 0; for (const p of pts) if (shadedAt(p, s)) sh++; sun[s.key] = Math.round((1 - sh / pts.length) * 100) / 100; }
  e.sun = sun; done++;
  if (done % 5000 === 0) console.log(`  ${done}/${outdoor.length} edges (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
g.meta.shade = { computed: new Date().toISOString(), keys: suns.map(s => s.key), source: "Toronto 3D Massing 2025 + NOAA solar position" };
await writeFile(path.join(ROOT, "data/graph.json"), JSON.stringify(g));
const avg = (k) => (outdoor.reduce((a, e) => a + e.sun[k], 0) / outdoor.length).toFixed(2);
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s. mean sun fraction by bucket:`, suns.map(s => `${s.key}=${avg(s.key)}`).join(" "));
