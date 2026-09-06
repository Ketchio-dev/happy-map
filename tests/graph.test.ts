import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { graph, UNION, OUTSIDE } from "./helpers";
import { nearestNode, haversine } from "@/lib/graph";

describe("graph.bin", () => {
  const buf = readFileSync("data/graph.bin");
  const headerLen = buf.readUInt32LE(0);
  const h = JSON.parse(buf.toString("utf8", 4, 4 + headerLen).replace(/\0+$/, "")) as { counts: { N: number; E: number; pts: number }; sections: Record<string, { off: number; len: number }> };
  it("starts every section on an 8-byte boundary, so typed-array views are legal", () => {
    expect((4 + headerLen) % 8).toBe(0);
    for (const [name, s] of Object.entries(h.sections)) expect((4 + headerLen + s.off) % 8, name).toBe(0);
  });
  it("has section lengths that agree with the counts in the header", () => {
    const { N, E, pts } = h.counts;
    expect(h.sections.nodes.len).toBe(N * 8);
    expect(h.sections.ea.len).toBe(E * 4);
    expect(h.sections.eflags.len).toBe(E * 2);
    expect(h.sections.gOff.len).toBe((E + 1) * 4);
    expect(h.sections.gPts.len).toBe(pts * 8);
  });
  it("ends exactly where the last section ends", () => {
    const last = Object.values(h.sections).reduce((m, s) => Math.max(m, s.off + s.len), 0);
    expect(buf.length - (4 + headerLen) - last).toBeLessThan(8);
  });
});

describe("loaded graph", () => {
  const g = graph();
  it("is the size the README says", () => {
    expect(g.nodes.length).toBeGreaterThan(340_000);
    expect(g.edges.length).toBeGreaterThan(490_000);
    expect(g.stations.length).toBeGreaterThanOrEqual(70);
  });
  it("references only real nodes from every edge, with self-loops (OSM ways that close on themselves) a rarity", () => {
    const n = g.nodes.length; let loops = 0, seen = 0;
    for (let i = 0; i < g.edges.length; i += 97) { const e = g.edges[i]; expect(e.a).toBeLessThan(n); expect(e.b).toBeLessThan(n); if (e.a === e.b) loops++; seen++; }
    expect(loops / seen).toBeLessThan(0.005);
  });
  it("gives every packed edge a length no shorter than the straight line between its ends", () => {
    for (let i = 0; i < g.edges.length; i += 131) { const e = g.edges[i]; if (e.transit) continue; expect(e.len + 2).toBeGreaterThanOrEqual(haversine(g.nodes[e.a], g.nodes[e.b])); }
  });
  it("links every station inside the coverage box to the walking network", () => {
    const [S, W, N, E] = String(g.meta.bbox).split(",").map(Number);
    for (const s of g.stations) {
      if (s.lat < S || s.lat > N || s.lon < W || s.lon > E) continue;
      expect(g.adj[s.node].some((ei) => g.edges[ei].hw === "station_link"), s.name).toBe(true);
    }
  });
  it("snaps onto a big connected component, not a private island", () => {
    const n = nearestNode(g, UNION);
    expect(n).toBeGreaterThanOrEqual(0);
    expect(g.compSize[n]).toBeGreaterThanOrEqual(200);
    expect(nearestNode(g, OUTSIDE)).toBe(-1);
  });
});
