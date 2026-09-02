import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import Flatbush from "flatbush";

export type Wc = "yes" | "no" | "limited" | "unk";
export interface Edge {
  a: number; b: number; len: number; hw: string;
  shelter: 0 | 1 | 2; steps: 0 | 1; elev: 0 | 1; wc: Wc;
  name: string | null;
  /** set only on edges added at runtime (station links, subway legs); packed edges resolve
   *  their geometry from the shared point pool via geomOf() */
  geom?: [number, number][];
  /** walking on a road with no mapped sidewalk — beside traffic, and where snowbanks push you into the lane */
  roadway?: 0 | 1;
  /** loose or unpaved surface: worse under snow, impassable for small wheels */
  loose?: 0 | 1;
  /** 0 flat, 1 moderate (4-8%), 2 steep (>=8%) — the segments that ice over */
  incline?: 0 | 1 | 2;
  /** index into the packed sun table, or -1 for edges with no shade data */
  sunRow: number;
  /** transit edges: fixed travel time and line id; station links: fixed access time */
  time_s?: number; transit?: string; station?: string;
}
export interface NodeAttr { elev?: 1; barrier?: string; wc?: Wc; kerb?: string | null }
export interface Poi { id: number; lon: number; lat: number; kind: string; name: string | null; wc: Wc; level: string | null; ref: string | null; station: string | null; graphNode: number | null }
export interface GraphFile { meta: Record<string, unknown>; nodes: [number, number][]; edges: Edge[]; nodeAttr: Record<string, NodeAttr>; pois: Poi[] }
export interface Station { key: string; name: string; lat: number; lon: number; wheelchair_boarding: string; stopIds: string[]; lines: string[]; node: number }
export interface SubwayFile { lines: { id: string; name: string; color: string }[]; stations: Omit<Station, "node">[]; edges: { a: string; b: string; line: string; time_s: number; geom?: [number, number][] | null }[] }

export interface Graph extends GraphFile {
  adj: Int32Array[];      // node -> edge indices
  index: Flatbush;        // spatial index over pedestrian nodes (stations excluded)
  /** size of the connected component each node belongs to; snapping ignores tiny islands */
  compSize: Int32Array;
  stations: Station[];
  stationByName: Map<string, Station[]>;
  lines: SubwayFile["lines"];
  /** shared geometry pool: interior points of packed edges */
  gOff: Uint32Array; gPts: Int32Array;
  /** one byte per bucket per edge, edge-major */
  sunArr: Uint8Array; sunKeys: string[]; sunBucket: Map<string, number>;
}

/** Full geometry for an edge, built on demand. Materialising all of it up front cost
 *  more than a second of cold start for geometry almost none of which is ever read. */
export function geomOf(g: Graph, ei: number): [number, number][] {
  const e = g.edges[ei];
  if (e.geom) return e.geom;
  const out: [number, number][] = [g.nodes[e.a]];
  for (let p = g.gOff[ei]; p < g.gOff[ei + 1]; p++) out.push([g.gPts[p * 2] / 1e6, g.gPts[p * 2 + 1] / 1e6]);
  out.push(g.nodes[e.b]);
  return out;
}

/** Sun exposure for an edge in one day/hour bucket, 0 shaded to 1 full sun. */
export function sunAt(g: Graph, ei: number, bucket: number): number {
  const row = g.edges[ei].sunRow;
  if (row < 0 || bucket < 0 || !g.sunArr.length) return 1;
  return g.sunArr[row * g.sunKeys.length + bucket] / 255;
}

/** TTC alert station names → GTFS station names */
const ALIASES: Record<string, string[]> = { "bloor-yonge": ["Bloor", "Yonge"], "yonge-bloor": ["Bloor", "Yonge"], "dundas": ["TMU"], "sheppard yonge": ["Sheppard-Yonge"], "st. george": ["St George"], "st. andrew": ["St Andrew"], "st. patrick": ["St Patrick"], "st. clair": ["St Clair"], "st. clair west": ["St Clair West"], "queens park": ["Queen's Park"], "vmc": ["Vaughan Metropolitan Centre"] };
export const normName = (s: string) => s.toLowerCase().replace(/\s+station$/i, "").replace(/\s+/g, " ").trim();

let cached: Graph | null = null;

const R = 6371008.8;
export function haversine(a: [number, number], b: [number, number]): number {
  const dLat = ((b[1] - a[1]) * Math.PI) / 180, dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a[1] * Math.PI) / 180) * Math.cos((b[1] * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function loadGraph(): Graph {
  if (cached) return cached;
  const dir = path.join(process.cwd(), "data");
  const sub = JSON.parse(readFileSync(path.join(dir, "subway.json"), "utf8")) as SubwayFile;
  const g = readPacked(readFileSync(path.join(dir, "graph.bin")));

  const pedCount = g.nodes.length;
  const index = new Flatbush(pedCount);
  for (const [lon, lat] of g.nodes) index.add(lon, lat, lon, lat);
  index.finish();

  // --- append subway stations as nodes, linked to nearby subway entrances (or nearest pedestrian node) ---
  const stations: Station[] = [];
  const stationByName = new Map<string, Station[]>();
  // stations outside the walking graph's own bbox can be ridden through but not entered
  const [S, W, N, E] = String(g.meta.bbox ?? "43.575,-79.640,43.860,-79.115").split(",").map(Number);
  const entrances = g.pois.filter((p) => p.kind === "subway_entrance" && p.graphNode !== null);
  for (const s of sub.stations) {
    const node = g.nodes.length; g.nodes.push([s.lon, s.lat]);
    const st: Station = { ...s, node }; stations.push(st);
    const key = normName(s.name); stationByName.set(key, [...(stationByName.get(key) ?? []), st]);
    if (s.lat < S || s.lat > N || s.lon < W || s.lon > E) continue; // outside walking coverage: reachable only by train
    const wc: Wc = s.wheelchair_boarding === "1" ? "yes" : "no";
    let links = entrances.filter((p) => haversine([p.lon, p.lat], [s.lon, s.lat]) < 260).map((p) => ({ node: p.graphNode as number, d: haversine([p.lon, p.lat], [s.lon, s.lat]), wc: p.wc }));
    if (links.length === 0) { const near = nearestPed(g, index, [s.lon, s.lat], 400); if (near >= 0) links = [{ node: near, d: haversine(g.nodes[near], [s.lon, s.lat]), wc: "unk" }]; }
    for (const l of links) {
      // entrance explicitly not wheelchair-accessible → link unusable in step-free mode even if the station is
      const linkWc: Wc = wc === "no" ? "no" : l.wc === "no" ? "no" : wc;
      g.edges.push({ a: node, b: l.node, len: Math.round(l.d), hw: "station_link", shelter: 2, steps: 0, elev: 0, wc: linkWc, name: `${s.name} Station`, geom: [[s.lon, s.lat], g.nodes[l.node]], sunRow: -1, time_s: Math.round(l.d) + 120, station: s.name });
    }
  }
  const byKey = new Map(stations.map((s) => [s.key, s]));
  // in-station transfers between GTFS station records that are one physical complex
  const byName = (n: string) => stations.find((s) => normName(s.name) === normName(n));
  for (const [a, b] of [["Bloor", "Yonge"]]) {
    const A = byName(a), B = byName(b); if (!A || !B) continue;
    g.edges.push({ a: A.node, b: B.node, len: Math.round(haversine([A.lon, A.lat], [B.lon, B.lat])), hw: "transfer", shelter: 2, steps: 0, elev: 0, wc: "yes", name: `${a}-${b} transfer`, geom: [[A.lon, A.lat], [B.lon, B.lat]], sunRow: -1, time_s: 180, station: `${a}-${b}` });
  }
  for (const e of sub.edges) {
    const A = byKey.get(e.a), B = byKey.get(e.b); if (!A || !B) continue;
    g.edges.push({ a: A.node, b: B.node, len: Math.round(haversine([A.lon, A.lat], [B.lon, B.lat])), hw: "subway", shelter: 2, steps: 0, elev: 0, wc: "yes", name: sub.lines.find((l) => l.id === e.line)?.name ?? `Line ${e.line}`, geom: shapeFor(e, A, B), sunRow: -1, time_s: e.time_s, transit: e.line });
  }

  const lists: number[][] = Array.from({ length: g.nodes.length }, () => []);
  g.edges.forEach((e, i) => { lists[e.a].push(i); lists[e.b].push(i); });
  const adj = lists.map((l) => Int32Array.from(l));
  cached = { ...g, adj, index, compSize: componentSizes(g, adj), stations, stationByName, lines: sub.lines, sunBucket: new Map(g.sunKeys.map((k, i) => [k, i])) };
  return cached;
}

/** OSM contains small islands of private or indoor paths that connect to nothing;
 *  snapping a trip endpoint onto one makes the whole route unroutable. */
function componentSizes(g: GraphFile, adj: Int32Array[]): Int32Array {
  const n = g.nodes.length, comp = new Int32Array(n).fill(-1), size = new Int32Array(n);
  let c = 0;
  for (let s = 0; s < n; s++) {
    if (comp[s] >= 0) continue;
    const members: number[] = [s]; comp[s] = c;
    for (let k = 0; k < members.length; k++) {
      const u = members[k];
      for (const ei of adj[u]) { const e = g.edges[ei]; const v = e.a === u ? e.b : e.a; if (comp[v] < 0) { comp[v] = c; members.push(v); } }
    }
    for (const m of members) size[m] = members.length;
    c++;
  }
  return size;
}

interface PackHeader {
  meta: Record<string, unknown>; hwTable: string[]; wcTable: Wc[]; sunKeys: string[];
  counts: { N: number; E: number; NB: number; pts: number };
  nodeAttr: Record<string, NodeAttr>;
  pois: { lon: number; lat: number; kind: string; name: string | null; wc: Wc; graphNode: number | null }[];
  sections: Record<string, { off: number; len: number }>;
}

/** Reads data/graph.bin: a small JSON header followed by typed-array sections.
 *  Nothing here parses coordinates — the arrays are views over the file buffer. */
interface Packed extends GraphFile { gOff: Uint32Array; gPts: Int32Array; sunArr: Uint8Array; sunKeys: string[] }

function readPacked(buf: Buffer): Packed {
  const headerLen = buf.readUInt32LE(0);
  // the header is padded with NULs so the sections land on 8-byte boundaries
  const h = JSON.parse(buf.toString("utf8", 4, 4 + headerLen).replace(/\0+$/, "")) as PackHeader;
  const base = 4 + headerLen;
  const ab = buf.buffer as ArrayBuffer;
  const view = <T>(name: string, Ctor: new (b: ArrayBuffer, off: number, len: number) => T, bytesPer: number): T => {
    const s = h.sections[name];
    return new Ctor(ab, buf.byteOffset + base + s.off, s.len / bytesPer);
  };
  const { N, E, NB } = h.counts;
  const nodesRaw = view("nodes", Int32Array, 4);
  const ea = view("ea", Int32Array, 4), eb = view("eb", Int32Array, 4), elen = view("elen", Uint32Array, 4);
  const ehw = view("ehw", Uint8Array, 1), eshelter = view("eshelter", Uint8Array, 1), eflags = view("eflags", Uint16Array, 2);
  const gOff = view("gOff", Uint32Array, 4), gPts = view("gPts", Int32Array, 4);
  const nOff = view("nOff", Uint32Array, 4), names = view("names", Uint8Array, 1);
  const sun = view("sun", Uint8Array, 1);
  const dec = new TextDecoder();

  const nodes: [number, number][] = new Array(N);
  for (let i = 0; i < N; i++) nodes[i] = [nodesRaw[i * 2] / 1e6, nodesRaw[i * 2 + 1] / 1e6];

  const edges: Edge[] = new Array(E);
  for (let i = 0; i < E; i++) {
    const flags = eflags[i], shelter = eshelter[i] as 0 | 1 | 2;
    edges[i] = {
      a: ea[i], b: eb[i], len: elen[i], hw: h.hwTable[ehw[i]], shelter,
      steps: (flags & 1) as 0 | 1, elev: ((flags >> 1) & 1) as 0 | 1, wc: h.wcTable[(flags >> 2) & 3] ?? "unk",
      name: nOff[i + 1] > nOff[i] ? dec.decode(names.subarray(nOff[i], nOff[i + 1])) : null,
      roadway: ((flags >> 4) & 1) as 0 | 1, loose: ((flags >> 5) & 1) as 0 | 1, incline: ((flags >> 6) & 3) as 0 | 1 | 2,
      sunRow: NB && shelter === 0 && sun.length ? i : -1,
    };
  }
  return { meta: h.meta, nodes, edges, nodeAttr: h.nodeAttr, pois: h.pois.map((p, i) => ({ id: i, ...p, level: null, ref: null, station: null })), gOff, gPts, sunArr: sun, sunKeys: h.sunKeys };
}

/** the recorded track, oriented from A to B; falls back to a straight hop if GTFS has no shape */
function shapeFor(e: SubwayFile["edges"][number], A: Station, B: Station): [number, number][] {
  const g = e.geom;
  if (!g || g.length < 2) return [[A.lon, A.lat], [B.lon, B.lat]];
  const d2 = (p: [number, number], s: Station) => (p[0] - s.lon) ** 2 + (p[1] - s.lat) ** 2;
  return d2(g[0], A) <= d2(g[g.length - 1], A) ? g : [...g].reverse();
}

function nearestPed(g: GraphFile, index: Flatbush, p: [number, number], maxM: number): number {
  const [lon, lat] = p; const dLat = maxM / 111_320, dLon = maxM / (111_320 * Math.cos((lat * Math.PI) / 180));
  let best = -1, bestD = Infinity;
  for (const i of index.search(lon - dLon, lat - dLat, lon + dLon, lat + dLat)) { const d = haversine(p, g.nodes[i]); if (d < bestD) { bestD = d; best = i; } }
  return bestD <= maxM ? best : -1;
}

/** resolve a TTC alert station name (e.g. "Bloor-Yonge") to graph station nodes */
export function stationNodesFor(g: Graph, alertStation: string): number[] {
  const key = normName(alertStation);
  const names = ALIASES[key] ?? [alertStation];
  return names.flatMap((n) => g.stationByName.get(normName(n)) ?? []).map((s) => s.node);
}

/** nearest pedestrian graph node to a lon/lat, or -1 if farther than maxM */
export function nearestNode(g: Graph, p: [number, number], maxM = 400, opts?: { skipSteps?: boolean }): number {
  const [lon, lat] = p;
  const dLat = maxM / 111_320, dLon = maxM / (111_320 * Math.cos((lat * Math.PI) / 180));
  const cand = g.index.search(lon - dLon, lat - dLat, lon + dLon, lat + dLat);
  const MIN_COMPONENT = 200;
  let best = -1, bestD = Infinity, fallback = -1, fallbackD = Infinity;
  for (const i of cand) {
    if (opts?.skipSteps && g.adj[i].length > 0 && Array.from(g.adj[i]).every((ei) => g.edges[ei].steps)) continue;
    const d = haversine(p, g.nodes[i]);
    if (d < fallbackD) { fallbackD = d; fallback = i; }
    if (g.compSize[i] >= MIN_COMPONENT && d < bestD) { bestD = d; best = i; }
  }
  if (best >= 0 && bestD <= maxM) return best;
  return fallbackD <= maxM ? fallback : -1;
}
