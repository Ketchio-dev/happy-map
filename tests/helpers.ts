import { loadGraph, type Graph } from "@/lib/graph";
import TinyQueue from "tinyqueue";
import { edgeCost, type Mode } from "@/lib/router";

let g: Graph | null = null;
/** the real packed graph, loaded once per test file */
export const graph = () => (g ??= loadGraph());

export const UNION: [number, number] = [-79.3806, 43.6453];
export const BLOOR_YONGE: [number, number] = [-79.3864, 43.6708];
export const EATON: [number, number] = [-79.3806, 43.6544];
export const OUTSIDE: [number, number] = [-80.5, 44.5];

/** deterministic pseudo-random, so a failing pair is reproducible */
export function rng(seed: number) { let s = seed; return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648; }

/** plain Dijkstra with no heuristic: the reference the A* answer must match */
export function dijkstra(g: Graph, src: number, dst: number, mode: Mode, bucket: number, blocked?: Set<number>): number {
  const dist = new Float64Array(g.nodes.length).fill(Infinity);
  const done = new Uint8Array(g.nodes.length);
  const q = new TinyQueue<[number, number]>([], (a, b) => a[0] - b[0]);
  dist[src] = 0; q.push([0, src]);
  while (q.length) {
    const [d, u] = q.pop()!;
    if (done[u]) continue; done[u] = 1;
    if (u === dst) return d;
    for (const ei of g.adj[u]) {
      const e = g.edges[ei]; const v = e.a === u ? e.b : e.a;
      if (done[v] || blocked?.has(v)) continue;
      const c = edgeCost(g, ei, u, mode, bucket); if (!isFinite(c)) continue;
      if (d + c < dist[v]) { dist[v] = d + c; q.push([d + c, v]); }
    }
  }
  return Infinity;
}
