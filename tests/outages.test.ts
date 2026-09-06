import { describe, expect, it } from "vitest";
import { activeAt, busiest, timeline, type LoggedAlert } from "@/lib/outages";

const T = (h: number) => Date.parse("2026-09-03T00:00:00Z") + h * 3.6e6;
const mk = (id: string, type: string, start: number, end: number | null, feedStart: number | null = start): LoggedAlert => ({
  id, station: id, type, code: null, planned: "Planned", unplanned: false, cause: null, causeDesc: null, header: `${id}: x`,
  first: new Date(T(start)).toISOString(), feedStart: feedStart === null ? null : new Date(T(feedStart)).toISOString(), end: end === null ? null : new Date(T(end)).toISOString(), ongoing: end === null,
});
const alerts = [mk("A", "Elevator", 2, 6), mk("B", "Elevator", 4, null), mk("C", "Escalator", 1, 3), mk("D", "Elevator", 5, 10, 3)];

describe("activeAt", () => {
  it("uses the feed-reported start and the first poll that dropped the alert", () => {
    expect(activeAt(alerts, T(1.5)).map((a) => a.id)).toEqual(["C"]);
    expect(activeAt(alerts, T(3.5)).map((a) => a.id)).toEqual(["A", "D"]);
    expect(activeAt(alerts, T(5.5)).map((a) => a.id)).toEqual(["A", "B", "D"]);
    expect(activeAt(alerts, T(6)).map((a) => a.id)).toEqual(["B", "D"]); // end is exclusive
    expect(activeAt(alerts, T(100)).map((a) => a.id)).toEqual(["B"]); // ongoing never ends
  });
});

describe("timeline and busiest", () => {
  it("counts elevators only and changes only at starts and ends", () => {
    const tl = timeline(alerts, T(0), T(12));
    expect(tl[0]).toEqual([T(0), 0]);
    // D's feed-reported start (3) counts, not the poll that first saw it (5)
    expect(tl.find(([t]) => t === T(3))?.[1]).toBe(2);
    expect(tl.find(([t]) => t === T(4))?.[1]).toBe(3);
    expect(tl.find(([t]) => t === T(5))).toBeUndefined();
    expect(tl.find(([t]) => t === T(6))?.[1]).toBe(2);
    expect(tl[tl.length - 1]).toEqual([T(12), 1]);
    expect(tl.map(([t]) => t)).toEqual([...tl.map(([t]) => t)].sort((a, b) => a - b));
  });
  it("picks the earliest instant with the most elevators out", () => {
    expect(busiest(alerts, T(0), T(12))).toEqual({ t: T(4), n: 3 });
  });
});
