import { describe, expect, it } from "vitest";
import { graph, dijkstra, rng, UNION, BLOOR_YONGE, EATON, OUTSIDE } from "./helpers";
import { nearestNode, stationNodesFor, sunAt } from "@/lib/graph";
import { edgeCost, paceOf, plan, search, sunFraction, type Mode } from "@/lib/router";

const g = graph();
const BUCKET = g.sunBucket.get("d0715_h14") ?? -1;
const MODES: Mode[] = [{}, { cold: true }, { heat: true }, { heat: true, sky: 0.3 }, { mobility: true }, { cold: true, mobility: true }, { walkOnly: true }, { speed: 1.5 }, { mobility: true, speed: 0.9 }];

describe("paceOf", () => {
  it("defaults to 1.3 m/s, or 1.0 step-free, and clamps a chosen pace to a walkable range", () => {
    expect(paceOf({})).toBe(1.3);
    expect(paceOf({ mobility: true })).toBe(1.0);
    expect(paceOf({ speed: 1.5 })).toBe(1.5);
    expect(paceOf({ speed: 9 })).toBe(2);
    expect(paceOf({ speed: 0.1 })).toBe(0.5);
  });
});

describe("edgeCost", () => {
  it("never charges less than the plain travel time: every multiplier is >= 1, so the A* heuristic stays admissible", () => {
    for (let i = 0; i < g.edges.length; i += 23) {
      const e = g.edges[i];
      for (const mode of MODES) {
        const c = edgeCost(g, i, e.a, mode, BUCKET);
        const floor = e.transit ? e.time_s! : (e.time_s ?? e.len / paceOf(mode));
        if (isFinite(c)) expect(c, `edge ${i} mode ${JSON.stringify(mode)}`).toBeGreaterThanOrEqual(floor - 1e-9);
      }
    }
  });
  it("keeps every subway leg under the 22 m/s bound the transit heuristic assumes", () => {
    for (const e of g.edges) if (e.transit) expect(e.len / e.time_s!, `${e.name} ${e.a}-${e.b}`).toBeLessThanOrEqual(22);
  });
  it("makes stairs impassable step-free and slower for everyone else", () => {
    const i = g.edges.findIndex((e) => e.steps && !e.transit);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(edgeCost(g, i, g.edges[i].a, { mobility: true }, -1)).toBe(Infinity);
    expect(edgeCost(g, i, g.edges[i].a, {}, -1)).toBeGreaterThan(g.edges[i].len / 1.3 * 1.5);
  });
  it("scales the shade penalty by the sky factor and removes it under sky 0", () => {
    let i = -1;
    for (let k = 0; k < g.edges.length; k++) { const e = g.edges[k]; if (e.shelter === 0 && !e.transit && e.hw !== "station_link" && e.sunRow >= 0 && sunAt(g, k, BUCKET) > 0.5) { i = k; break; } }
    expect(i).toBeGreaterThanOrEqual(0);
    const base = edgeCost(g, i, g.edges[i].a, {}, BUCKET);
    const clear = edgeCost(g, i, g.edges[i].a, { heat: true }, BUCKET);
    const cloudy = edgeCost(g, i, g.edges[i].a, { heat: true, sky: 0.25 }, BUCKET);
    const dark = edgeCost(g, i, g.edges[i].a, { heat: true, sky: 0 }, BUCKET);
    expect(clear).toBeGreaterThan(cloudy);
    expect(cloudy).toBeGreaterThan(base);
    expect(dark).toBeCloseTo(base, 9);
    expect(clear).toBeCloseTo(base * (1 + 1.8 * sunFraction(g, i, BUCKET)), 6);
  });
  it("treats sheltered edges as shade", () => {
    const i = g.edges.findIndex((e) => e.shelter === 2 && !e.transit);
    expect(sunFraction(g, i, BUCKET)).toBe(0);
  });
});

describe("search (A*)", () => {
  const core = [43.64, -79.395, 43.668, -79.37];
  const r = rng(7);
  const pick = () => { for (;;) { const p: [number, number] = [core[1] + r() * (core[3] - core[1]), core[0] + r() * (core[2] - core[0])]; const n = nearestNode(g, p); if (n >= 0) return n; } };
  const pairs = Array.from({ length: 6 }, () => [pick(), pick()] as const).filter(([a, b]) => a !== b);
  it.each(pairs)("matches Dijkstra exactly from node %i to %i in every mode", (src, dst) => {
    for (const mode of [{ walkOnly: true }, { cold: true, walkOnly: true }, { heat: true, walkOnly: true }, { mobility: true }, {}]) {
      const path = search(g, src, dst, mode, BUCKET);
      const ref = dijkstra(g, src, dst, mode, BUCKET);
      if (!path) { expect(ref).toBe(Infinity); continue; }
      let cost = 0, u = src;
      for (const ei of path) { cost += edgeCost(g, ei, u, mode, BUCKET); const e = g.edges[ei]; u = e.a === u ? e.b : e.a; }
      expect(u).toBe(dst);
      expect(cost).toBeCloseTo(ref, 6);
    }
  });
});

describe("plan", () => {
  it("rejects a point outside the covered area", () => {
    const r = plan(g, { from: UNION, to: OUTSIDE, mode: {} });
    expect(r.ok).toBe(false);
  });
  it("routes Union to the Eaton Centre with a sheltered alternative that costs a little time", () => {
    const fast = plan(g, { from: UNION, to: EATON, mode: { walkOnly: true } });
    const indoor = plan(g, { from: UNION, to: EATON, mode: { cold: true, walkOnly: true } });
    expect(fast.ok && indoor.ok).toBe(true);
    if (!fast.ok || !indoor.ok) return;
    expect(indoor.route.stats.outdoor_m).toBeLessThan(fast.route.stats.outdoor_m);
    expect(indoor.route.stats.time_s).toBeGreaterThanOrEqual(fast.route.stats.time_s);
    expect(indoor.baseline.stats.time_s).toBe(fast.route.stats.time_s);
  });
  it("keeps a step-free trip out of a station whose elevator is out", () => {
    const blocked = new Set(stationNodesFor(g, "Bloor-Yonge"));
    expect(blocked.size).toBe(2);
    const open = plan(g, { from: UNION, to: BLOOR_YONGE, mode: { mobility: true } });
    const closed = plan(g, { from: UNION, to: BLOOR_YONGE, mode: { mobility: true }, blockedStations: ["Bloor-Yonge"] });
    expect(open.ok && closed.ok).toBe(true);
    if (!open.ok || !closed.ok) return;
    expect(open.route.nodePath.some((n) => blocked.has(n))).toBe(true);
    expect(closed.route.nodePath.some((n) => blocked.has(n))).toBe(false);
    expect(closed.route.stats.time_s).toBeGreaterThan(open.route.stats.time_s);
    expect(closed.blockedStations).toEqual(["Bloor-Yonge"]);
    expect(closed.route.stats.steps_edges).toBe(0);
  });
  it("reports the sky factor it used", () => {
    const r = plan(g, { from: UNION, to: EATON, mode: { heat: true, sky: 0.4 }, hourBucket: "d0715_h14" });
    expect(r.ok && r.sky).toBe(0.4);
  });
});
