import { describe, expect, it } from "vitest";
import { graph, UNION, OUTSIDE } from "./helpers";
import { reach } from "@/lib/reach";

const g = graph();
describe("reach", () => {
  it("reaches less with an outdoor cap than without, and never more than the free budget", () => {
    const r = reach(g, { from: UNION, maxMin: 10, maxOutdoorMin: 2, mode: { walkOnly: true } });
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.cells.length).toBeGreaterThan(20);
    expect(r.area_km2).toBeLessThanOrEqual(r.unconstrained_km2);
    expect(r.lost_km2).toBeCloseTo(r.unconstrained_km2 - r.area_km2, 1);
    const keys = new Set(r.cells.map((c) => `${c[0]},${c[1]}`));
    for (const c of r.lost) expect(keys.has(`${c[0]},${c[1]}`)).toBe(false);
    for (const c of r.cells) { expect(c[2]).toBeLessThanOrEqual(r.maxS); expect(c[3]).toBeLessThanOrEqual(120 + 1); }
  });
  it("loses nothing when the cap is off and every station is open", () => {
    const r = reach(g, { from: UNION, maxMin: 10, maxOutdoorMin: null, mode: { walkOnly: true } });
    expect(r.ok && r.lost.length).toBe(0);
  });
  it("rejects an origin outside the coverage", () => {
    expect(reach(g, { from: OUTSIDE, maxMin: 10, maxOutdoorMin: null, mode: {} }).ok).toBe(false);
  });
});
