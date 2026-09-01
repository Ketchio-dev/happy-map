import type { Edge, Graph } from "./graph";
import { haversine, nearestNode, stationNodesFor } from "./graph";

export interface Mode { cold?: boolean; heat?: boolean; mobility?: boolean; /** never ride the subway */ walkOnly?: boolean }
export interface RouteRequest { from: [number, number]; to: [number, number]; mode: Mode; hourBucket?: string; blockedNodes?: number[]; /** TTC station names with elevator outages; blocked only in step-free mode */ blockedStations?: string[] }

export interface Leg { coords: [number, number][]; len: number; shelter: 0 | 1 | 2; steps: boolean; elev: boolean; name: string | null; hw: string; sun: number; transit?: string; station?: string; time_s: number }
export interface Stats { distance_m: number; time_s: number; indoor_m: number; covered_m: number; outdoor_m: number; sun_m: number; steps_edges: number; exposure_s: number; transit_s: number; walk_m: number }
export interface RouteResult { legs: Leg[]; stats: Stats; nodePath: number[] }

const WALK_MPS = 1.3;
const MOBILITY_MPS = 1.0;

class MinHeap {
  private k: number[] = []; private v: number[] = [];
  get size() { return this.k.length; }
  push(key: number, val: number) { this.k.push(key); this.v.push(val); let i = this.k.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (this.k[p] <= this.k[i]) break; this.swap(i, p); i = p; } }
  pop(): [number, number] { const top: [number, number] = [this.k[0], this.v[0]]; const lk = this.k.pop()!, lv = this.v.pop()!; if (this.k.length) { this.k[0] = lk; this.v[0] = lv; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < this.k.length && this.k[l] < this.k[m]) m = l; if (r < this.k.length && this.k[r] < this.k[m]) m = r; if (m === i) break; this.swap(i, m); i = m; } } return top; }
  private swap(i: number, j: number) { [this.k[i], this.k[j]] = [this.k[j], this.k[i]]; [this.v[i], this.v[j]] = [this.v[j], this.v[i]]; }
}

/** sun-exposure fraction for an edge: 0 indoors/covered, otherwise from precomputed shade or 1 (worst case) */
export function sunFraction(e: Edge, hourBucket?: string): number {
  if (e.shelter > 0) return 0;
  if (e.sun && hourBucket && e.sun[hourBucket] !== undefined) return e.sun[hourBucket];
  return 1;
}

/** generalized cost in seconds; Infinity = impassable under this mode */
export function edgeCost(g: Graph, ei: number, from: number, mode: Mode, hourBucket?: string): number {
  const e = g.edges[ei];
  const to = e.a === from ? e.b : e.a;
  const speed = mode.mobility ? MOBILITY_MPS : WALK_MPS;
  let t = e.time_s ?? e.len / speed;
  if (e.transit) return mode.walkOnly ? Infinity : t; // riding: indoors, no stairs, no exposure
  if (e.hw === "station_link" && mode.walkOnly) return Infinity;
  if (mode.mobility) {
    if (e.steps) return Infinity;
    if (e.wc === "no") return Infinity;
    const na = g.nodeAttr[String(to)];
    if (na?.barrier === "kerb" && na.kerb === "raised") return Infinity;
    if (na?.wc === "no") return Infinity;
    if (e.wc === "limited") t *= 1.3;
  } else if (e.steps) {
    t *= 1.6; // stairs are slow for everyone
  }
  if (e.elev) t += 45; // wait + ride
  if (mode.cold) {
    // outdoor time is what we are minimizing: weight exposure 2.5x, covered 1.3x
    if (e.shelter === 0) t *= 2.5; else if (e.shelter === 1) t *= 1.3;
  }
  if (mode.heat) {
    const sun = sunFraction(e, hourBucket);
    t *= 1 + 1.8 * sun; // full sun 2.8x, shade 1x
  }
  // gentle preference for lit + named pedestrian ways over service alleys
  if (e.hw === "service") t *= 1.15;
  return t;
}

export function dijkstra(g: Graph, src: number, dst: number, mode: Mode, hourBucket?: string, blocked?: Set<number>): number[] | null {
  const n = g.nodes.length;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const prevEdge = new Int32Array(n).fill(-1);
  const heap = new MinHeap();
  dist[src] = 0; heap.push(0, src);
  while (heap.size) {
    const [d, u] = heap.pop();
    if (d > dist[u]) continue;
    if (u === dst) break;
    const adj = g.adj[u];
    for (let k = 0; k < adj.length; k++) {
      const ei = adj[k]; const e = g.edges[ei];
      const v = e.a === u ? e.b : e.a;
      if (blocked?.has(v)) continue;
      const c = edgeCost(g, ei, u, mode, hourBucket);
      if (!isFinite(c)) continue;
      const nd = d + c;
      if (nd < dist[v]) { dist[v] = nd; prev[v] = u; prevEdge[v] = ei; heap.push(nd, v); }
    }
  }
  if (!isFinite(dist[dst])) return null;
  const path: number[] = []; // edge indices in order
  for (let v = dst; v !== src; v = prev[v]) path.push(prevEdge[v]);
  return path.reverse();
}

export function assemble(g: Graph, src: number, edgePath: number[], mode: Mode, hourBucket?: string): RouteResult {
  const legs: Leg[] = []; const nodePath = [src];
  const stats: Stats = { distance_m: 0, time_s: 0, indoor_m: 0, covered_m: 0, outdoor_m: 0, sun_m: 0, steps_edges: 0, exposure_s: 0, transit_s: 0, walk_m: 0 };
  const speed = mode.mobility ? MOBILITY_MPS : WALK_MPS;
  let cur = src;
  for (const ei of edgePath) {
    const e = g.edges[ei];
    const forward = e.a === cur;
    const coords = forward ? e.geom : [...e.geom].reverse();
    cur = forward ? e.b : e.a; nodePath.push(cur);
    const sun = sunFraction(e, hourBucket);
    const t = e.time_s ?? e.len / speed * (e.steps ? 1.6 : 1) + (e.elev ? 45 : 0);
    legs.push({ coords, len: e.len, shelter: e.shelter, steps: !!e.steps, elev: !!e.elev, name: e.name, hw: e.hw, sun, transit: e.transit, station: e.station, time_s: Math.round(t) });
    stats.distance_m += e.len;
    stats.time_s += t;
    if (e.transit) { stats.transit_s += t; continue; }
    if (e.hw !== "station_link") stats.walk_m += e.len;
    if (e.shelter === 2) stats.indoor_m += e.len; else if (e.shelter === 1) stats.covered_m += e.len; else { stats.outdoor_m += e.len; stats.exposure_s += t; }
    stats.sun_m += e.len * sun;
    if (e.steps) stats.steps_edges++;
  }
  for (const k of Object.keys(stats) as (keyof Stats)[]) stats[k] = Math.round(stats[k]);
  return { legs, stats, nodePath };
}

export interface PlanResult { ok: true; route: RouteResult; baseline: RouteResult; snapped: { from: [number, number]; to: [number, number] }; blockedStations: string[] } 
export interface PlanError { ok: false; error: string }

export function plan(g: Graph, req: RouteRequest): PlanResult | PlanError {
  const src = nearestNode(g, req.from, 400, { skipSteps: !!req.mode.mobility });
  const dst = nearestNode(g, req.to, 400, { skipSteps: !!req.mode.mobility });
  if (src < 0 || dst < 0) return { ok: false, error: "origin or destination is outside the covered downtown area" };
  const blocked = new Set<number>(req.blockedNodes ?? []);
  if (req.mode.mobility) for (const name of req.blockedStations ?? []) for (const n of stationNodesFor(g, name)) blocked.add(n);
  const blockedSet = blocked.size ? blocked : undefined;
  const baseMode: Mode = { mobility: req.mode.mobility, walkOnly: req.mode.walkOnly }; // fastest feasible route, no exposure weighting
  const basePath = dijkstra(g, src, dst, baseMode, req.hourBucket, blockedSet);
  if (!basePath) return { ok: false, error: req.mode.mobility ? "no step-free route found between these points" : "no route found" };
  const path = (req.mode.cold || req.mode.heat) ? dijkstra(g, src, dst, req.mode, req.hourBucket, blockedSet) ?? basePath : basePath;
  return { ok: true, route: assemble(g, src, path, req.mode, req.hourBucket), baseline: assemble(g, src, basePath, baseMode, req.hourBucket), snapped: { from: g.nodes[src], to: g.nodes[dst] }, blockedStations: req.mode.mobility ? (req.blockedStations ?? []) : [] };
}

export { haversine };
