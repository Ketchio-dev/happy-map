import { describe, expect, it } from "vitest";
import { skyFactor } from "@/lib/sky";

describe("skyFactor", () => {
  it("is 1 under a clear sky and when cloud cover is unknown", () => {
    expect(skyFactor(0)).toBe(1);
    expect(skyFactor(null)).toBe(1);
    expect(skyFactor(undefined)).toBe(1);
    expect(skyFactor(NaN)).toBe(1);
  });
  it("keeps a quarter of the sun under full overcast (Kasten–Czeplak)", () => {
    expect(skyFactor(100)).toBeCloseTo(0.25, 3);
  });
  it("falls monotonically and stays within [0.25, 1]", () => {
    let prev = 1;
    for (let c = 0; c <= 100; c += 5) { const f = skyFactor(c); expect(f).toBeLessThanOrEqual(prev); expect(f).toBeGreaterThanOrEqual(0.25); prev = f; }
  });
  it("barely reacts to thin cloud", () => {
    expect(skyFactor(30)).toBeGreaterThan(0.98);
    expect(skyFactor(150)).toBeCloseTo(0.25, 3);
  });
});
