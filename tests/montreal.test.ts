import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { loadGraph } from "@/lib/graph";
import { plan } from "@/lib/router";
import { CITIES } from "@/lib/cities";

// The second city proves the pipeline is not Toronto-shaped: same graph format, same router,
// same tests. Skipped when data/montreal/ has not been built.
const have = existsSync("data/montreal/graph.bin") && existsSync("data/montreal/subway.json");
describe.skipIf(!have)("montreal", () => {
  const g = loadGraph("montreal");
  const M = CITIES.montreal;
  it("loads the métro with every station inside the walking box linked to the network", () => {
    expect(g.stations.length).toBe(68);
    expect(g.lines.map((l) => l.id).sort()).toEqual(["1", "2", "4", "5"]);
    const [S, W, N, E] = String(g.meta.bbox).split(",").map(Number);
    let inside = 0;
    for (const s of g.stations) {
      if (s.lat < S || s.lat > N || s.lon < W || s.lon > E) continue; // Laval's Montmorency sits just past the west edge: ride-through only
      inside++;
      expect(g.adj[s.node].some((ei) => g.edges[ei].hw === "station_link"), s.name).toBe(true);
    }
    expect(inside).toBeGreaterThanOrEqual(60);
  });
  it("has no sun data, so shade never changes a route and the API hides the shade card", () => {
    expect(g.sunKeys.length).toBe(0);
    expect(M.hasShade).toBe(false);
  });
  it("routes the RÉSO preset indoors when asked", () => {
    const p = M.presets[0];
    const fast = plan(g, { from: [p.from.lon, p.from.lat], to: [p.to.lon, p.to.lat], mode: { walkOnly: true } });
    const indoor = plan(g, { from: [p.from.lon, p.from.lat], to: [p.to.lon, p.to.lat], mode: { cold: true, walkOnly: true } });
    expect(fast.ok && indoor.ok).toBe(true); if (!fast.ok || !indoor.ok) return;
    expect(indoor.route.stats.indoor_m).toBeGreaterThan(800);
    expect(indoor.route.stats.outdoor_m).toBeLessThan(fast.route.stats.outdoor_m / 2);
  });
  it("never enters or leaves the métro through one of the 43 stations without an elevator, step-free", () => {
    const inaccessible = g.stations.filter((s) => s.wheelchair_boarding !== "1");
    expect(inaccessible.length).toBe(43);
    const p = M.presets.find((x) => x.label === "Longueuil")!;
    const r = plan(g, { from: [p.from.lon, p.from.lat], to: [p.to.lon, p.to.lat], mode: { mobility: true } });
    expect(r.ok).toBe(true); if (!r.ok) return;
    const bad = new Set(inaccessible.map((s) => s.node)), station = new Set(g.stations.map((s) => s.node));
    const path = r.route.nodePath;
    // riding through a station is fine; stepping between the street and its platform is not
    for (let i = 0; i < path.length; i++) {
      if (!bad.has(path[i])) continue;
      const prev = path[i - 1], next = path[i + 1];
      expect(prev === undefined || station.has(prev), `enters via node ${path[i]}`).toBe(true);
      expect(next === undefined || station.has(next), `leaves via node ${path[i]}`).toBe(true);
    }
    expect(r.route.stats.time_s).toBeGreaterThan(3600); // the honest answer: over an hour, most of it on foot
  });
});
