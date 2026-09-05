import type { Graph } from "./graph";
import { nearestNode, stationNodesFor } from "./graph";
import { edgeCost, type Mode } from "./router";

/** Where can this person get to, and with how much of the trip outdoors? */
export interface ReachRequest {
  from: [number, number];
  /** total time budget, minutes (5–30) */
  maxMin: number;
  /** outdoor-time budget, minutes; null for no cap */
  maxOutdoorMin: number | null;
  mode: Mode;
  hourBucket?: string;
  /** stations closed to step-free riders right now; blocked only when mode.mobility */
  blockedStations?: string[];
}
/** grid cells reached: [lon, lat, seconds, outdoorSeconds] */
export type Cell = [number, number, number, number];
export interface ReachResult { ok: true; cells: Cell[]; lost: Cell[]; cellM: number; cellDeg: [number, number]; maxS: number; area_km2: number; lost_km2: number; unconstrained_km2: number; ms: number; origin: [number, number] }
export interface ReachError { ok: false; error: string }

const BUCKET_S = 60;          // outdoor budget is tracked to the minute
const CELL_LAT = 0.0008;      // ≈ 89 m
const CELL_LON = 0.0011;      // ≈ 89 m at 43.7° N

class MinHeap {
  private k: number[] = []; private v: number[] = [];
  get size() { return this.k.length; }
  push(key: number, val: number) { this.k.push(key); this.v.push(val); let i = this.k.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (this.k[p] <= this.k[i]) break; this.swap(i, p); i = p; } }
  pop(): [number, number] { const top: [number, number] = [this.k[0], this.v[0]]; const lk = this.k.pop()!, lv = this.v.pop()!; if (this.k.length) { this.k[0] = lk; this.v[0] = lv; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < this.k.length && this.k[l] < this.k[m]) m = l; if (r < this.k.length && this.k[r] < this.k[m]) m = r; if (m === i) break; this.swap(i, m); i = m; } } return top; }
  private swap(i: number, j: number) { [this.k[i], this.k[j]] = [this.k[j], this.k[i]]; [this.v[i], this.v[j]] = [this.v[j], this.v[i]]; }
}

/** Budgeted Dijkstra: a label is (node, minutes already spent outdoors). A label is dropped
 *  when the same node was reached no later with no more outdoor time — that dominance check
 *  keeps the state space near the plain node count. Returns best time and the outdoor
 *  seconds of that best label, per reached node. */
function explore(g: Graph, src: number, mode: Mode, bucket: number, maxS: number, maxOutS: number, blocked?: Set<number>) {
  const K = Math.floor(maxOutS / BUCKET_S) + 1;
  const best = new Map<number, Float64Array>();   // node -> best time per outdoor bucket (float64: a float32 round-off made labels look stale)
  const outAt = new Map<number, Float32Array>();  // node -> outdoor seconds per bucket
  const heap = new MinHeap();
  const label = (node: number, b: number) => node * K + b;
  const get = (node: number) => { let a = best.get(node); if (!a) { a = new Float64Array(K).fill(Infinity); best.set(node, a); outAt.set(node, new Float32Array(K)); } return a; };
  get(src)[0] = 0; heap.push(0, label(src, 0));
  while (heap.size) {
    const [t, lb] = heap.pop();
    const u = Math.floor(lb / K), b = lb - u * K;
    const bu = get(u);
    if (t > bu[b]) continue;                       // stale
    let dominated = false; for (let k = 0; k < b; k++) if (bu[k] <= t) { dominated = true; break; }
    if (dominated) continue;
    const ou = outAt.get(u)![b];
    const adj = g.adj[u];
    for (let k = 0; k < adj.length; k++) {
      const ei = adj[k]; const e = g.edges[ei];
      const v = e.a === u ? e.b : e.a;
      if (blocked?.has(v)) continue;
      const c = edgeCost(g, ei, u, mode, bucket);
      if (!isFinite(c)) continue;
      const nt = t + c; if (nt > maxS) continue;
      const outdoor = e.shelter === 0 && !e.transit && e.hw !== "station_link" ? c : 0;
      const no = ou + outdoor; if (no > maxOutS) continue;
      const nb = Math.min(K - 1, Math.floor(no / BUCKET_S));
      const bv = get(v);
      if (nt >= bv[nb]) continue;
      let dom = false; for (let q = 0; q <= nb; q++) if (bv[q] <= nt) { dom = true; break; }
      if (dom) continue;
      bv[nb] = nt; outAt.get(v)![nb] = no; heap.push(nt, label(v, nb));
    }
  }
  const reached = new Map<number, [number, number]>(); // node -> [time, outdoor]
  for (const [node, arr] of best) { let bt = Infinity, bo = 0; const oa = outAt.get(node)!; for (let k = 0; k < K; k++) if (arr[k] < bt) { bt = arr[k]; bo = oa[k]; } if (isFinite(bt)) reached.set(node, [bt, bo]); }
  return reached;
}

function toCells(g: Graph, reached: Map<number, [number, number]>): Map<string, Cell> {
  const cells = new Map<string, Cell>();
  for (const [node, [t, o]] of reached) {
    const [lon, lat] = g.nodes[node];
    const key = `${Math.floor(lon / CELL_LON)},${Math.floor(lat / CELL_LAT)}`;
    const cur = cells.get(key);
    if (!cur || t < cur[2]) cells.set(key, [(Math.floor(lon / CELL_LON) + 0.5) * CELL_LON, (Math.floor(lat / CELL_LAT) + 0.5) * CELL_LAT, Math.round(t), Math.round(o)]);
  }
  return cells;
}

export function reach(g: Graph, req: ReachRequest): ReachResult | ReachError {
  const t0 = performance.now();
  const src = nearestNode(g, req.from, 400, { skipSteps: !!req.mode.mobility });
  if (src < 0) return { ok: false, error: "origin is outside the covered area" };
  const maxS = Math.min(30, Math.max(5, req.maxMin)) * 60;
  const maxOutS = req.maxOutdoorMin === null ? maxS : Math.min(maxS, Math.max(0, req.maxOutdoorMin) * 60);
  const bucket = req.hourBucket ? (g.sunBucket.get(req.hourBucket) ?? -1) : -1;
  const mode: Mode = { mobility: req.mode.mobility, walkOnly: req.mode.walkOnly, speed: req.mode.speed };
  const blocked = new Set<number>();
  if (mode.mobility) for (const name of req.blockedStations ?? []) for (const n of stationNodesFor(g, name)) blocked.add(n);
  const constrained = toCells(g, explore(g, src, mode, bucket, maxS, maxOutS, blocked.size ? blocked : undefined));
  // the same budget with no outdoor cap and no closed stations: what the constraints cost
  const free = toCells(g, explore(g, src, mode, bucket, maxS, maxS));
  const lost: Cell[] = []; for (const [k, c] of free) if (!constrained.has(k)) lost.push(c);
  const cellKm2 = (CELL_LAT * 111_320) * (CELL_LON * 111_320 * Math.cos(req.from[1] * Math.PI / 180)) / 1e6;
  return { ok: true, cells: [...constrained.values()], lost, cellM: Math.round(CELL_LAT * 111_320), cellDeg: [CELL_LON, CELL_LAT], maxS, area_km2: +(constrained.size * cellKm2).toFixed(2), lost_km2: +(lost.length * cellKm2).toFixed(2), unconstrained_km2: +(free.size * cellKm2).toFixed(2), ms: Math.round(performance.now() - t0), origin: g.nodes[src] };
}
