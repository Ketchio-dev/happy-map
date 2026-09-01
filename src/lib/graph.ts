import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import Flatbush from "flatbush";

export type Wc = "yes" | "no" | "limited" | "unk";
export interface Edge {
  a: number; b: number; len: number; hw: string;
  shelter: 0 | 1 | 2; steps: 0 | 1; elev: 0 | 1; wc: Wc; lit: 0 | 1;
  level: string | null; name: string | null; sidewalk: string | null;
  geom: [number, number][]; wid: number;
  /** sun-exposure fraction (0 = fully shaded, 1 = full sun) keyed by day/hour bucket, added by tools/compute-shade.mjs */
  sun?: Record<string, number>;
  /** transit edges: fixed travel time and line id; station links: fixed access time */
  time_s?: number; transit?: string; station?: string;
}
export interface NodeAttr { elev?: 1; barrier?: string; wc?: Wc; kerb?: string | null }
export interface Poi { id: number; lon: number; lat: number; kind: string; name: string | null; wc: Wc; level: string | null; ref: string | null; station: string | null; graphNode: number | null }
export interface GraphFile { meta: Record<string, unknown>; nodes: [number, number][]; edges: Edge[]; nodeAttr: Record<string, NodeAttr>; pois: Poi[] }
export interface Station { key: string; name: string; lat: number; lon: number; wheelchair_boarding: string; stopIds: string[]; lines: string[]; node: number }
export interface SubwayFile { lines: { id: string; name: string; color: string }[]; stations: Omit<Station, "node">[]; edges: { a: string; b: string; line: string; time_s: number }[] }

export interface Graph extends GraphFile {
  adj: Int32Array[];      // node -> edge indices
  index: Flatbush;        // spatial index over pedestrian nodes (stations excluded)
  stations: Station[];
  stationByName: Map<string, Station[]>;
  lines: SubwayFile["lines"];
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
  const g = JSON.parse(readFileSync(path.join(dir, "graph.json"), "utf8")) as GraphFile;
  const sub = JSON.parse(readFileSync(path.join(dir, "subway.json"), "utf8")) as SubwayFile;

  const pedCount = g.nodes.length;
  const index = new Flatbush(pedCount);
  for (const [lon, lat] of g.nodes) index.add(lon, lat, lon, lat);
  index.finish();

  // --- append subway stations as nodes, linked to nearby subway entrances (or nearest pedestrian node) ---
  const stations: Station[] = [];
  const stationByName = new Map<string, Station[]>();
  const [S, W, N, E] = [43.630 - 0.01, -79.420 - 0.01, 43.680 + 0.01, -79.355 + 0.01];
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
      g.edges.push({ a: node, b: l.node, len: Math.round(l.d), hw: "station_link", shelter: 2, steps: 0, elev: 0, wc: linkWc, lit: 1, level: null, name: `${s.name} Station`, sidewalk: null, geom: [[s.lon, s.lat], g.nodes[l.node]], wid: -1, time_s: Math.round(l.d / 1.0) + 120, station: s.name });
    }
  }
  const byKey = new Map(stations.map((s) => [s.key, s]));
  // in-station transfers between GTFS station records that are one physical complex
  const byName = (n: string) => stations.find((s) => normName(s.name) === normName(n));
  for (const [a, b] of [["Bloor", "Yonge"]]) {
    const A = byName(a), B = byName(b); if (!A || !B) continue;
    g.edges.push({ a: A.node, b: B.node, len: Math.round(haversine([A.lon, A.lat], [B.lon, B.lat])), hw: "transfer", shelter: 2, steps: 0, elev: 0, wc: "yes", lit: 1, level: null, name: `${a}-${b} transfer`, sidewalk: null, geom: [[A.lon, A.lat], [B.lon, B.lat]], wid: -1, time_s: 180, station: `${a}-${b}` });
  }
  for (const e of sub.edges) {
    const A = byKey.get(e.a), B = byKey.get(e.b); if (!A || !B) continue;
    g.edges.push({ a: A.node, b: B.node, len: Math.round(haversine([A.lon, A.lat], [B.lon, B.lat])), hw: "subway", shelter: 2, steps: 0, elev: 0, wc: "yes", lit: 1, level: null, name: sub.lines.find((l) => l.id === e.line)?.name ?? `Line ${e.line}`, sidewalk: null, geom: [[A.lon, A.lat], [B.lon, B.lat]], wid: -1, time_s: e.time_s, transit: e.line });
  }

  const lists: number[][] = Array.from({ length: g.nodes.length }, () => []);
  g.edges.forEach((e, i) => { lists[e.a].push(i); lists[e.b].push(i); });
  const adj = lists.map((l) => Int32Array.from(l));
  cached = { ...g, adj, index, stations, stationByName, lines: sub.lines };
  return cached;
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
  let best = -1, bestD = Infinity;
  for (const i of cand) {
    if (opts?.skipSteps && g.adj[i].length > 0 && Array.from(g.adj[i]).every((ei) => g.edges[ei].steps)) continue;
    const d = haversine(p, g.nodes[i]);
    if (d < bestD) { bestD = d; best = i; }
  }
  return bestD <= maxM ? best : -1;
}
