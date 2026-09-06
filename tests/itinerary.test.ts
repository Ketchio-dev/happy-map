import { describe, expect, it } from "vitest";
import { itinerary } from "@/lib/itinerary";
import type { Leg } from "@/lib/router";

const leg = (p: Partial<Leg>): Leg => ({ coords: [[0, 0], [0, 0.001]], len: 100, shelter: 0, steps: false, elev: false, name: null, hw: "footway", sun: 1, roadway: false, time_s: 77, ...p });

describe("itinerary", () => {
  it("merges consecutive legs on the same street and the same cover into one step", () => {
    const s = itinerary([leg({ name: "Bay Street" }), leg({ name: "Bay Street", len: 50, time_s: 38 }), leg({ name: "Bay Street", shelter: 2, len: 60, time_s: 40 })]);
    expect(s.map((x) => x.text)).toEqual(["Walk along Bay Street · outdoors", "Walk along Bay Street · indoors"]);
    expect(s[0].len_m).toBe(150); expect(s[0].time_s).toBe(115);
  });
  it("names the station a ride ends at from the station link that follows it", () => {
    const s = itinerary([
      leg({ hw: "station_link", station: "Union", time_s: 200 }),
      leg({ transit: "1", name: "Line 1 (Yonge-University)", len: 600, time_s: 90 }),
      leg({ transit: "1", name: "Line 1 (Yonge-University)", len: 700, time_s: 100 }),
      leg({ hw: "station_link", station: "Bloor", time_s: 180 }),
      leg({ name: "Bloor Street West" }),
    ]);
    expect(s.map((x) => x.kind)).toEqual(["enter", "ride", "exit", "walk"]);
    expect(s[0].text).toBe("Enter Union Station");
    expect(s[1].text).toBe("Ride Line 1 (Yonge-University) to Bloor");
    expect(s[1].len_m).toBe(1300); expect(s[1].time_s).toBe(190);
    expect(s[2].text).toBe("Leave Bloor Station");
  });
  it("folds a tiny walking fragment into the walk before it", () => {
    const s = itinerary([leg({ name: "Front Street" }), leg({ name: "Some Lane", len: 12, time_s: 9 }), leg({ steps: true, len: 20, time_s: 25 })]);
    expect(s.map((x) => x.kind)).toEqual(["walk", "stairs"]);
    expect(s[0].len_m).toBe(112);
  });
  it("gives stairs and elevators their own lines", () => {
    const s = itinerary([leg({ steps: true, len: 20 }), leg({ steps: true, len: 10 }), leg({ elev: true, len: 0, time_s: 45 })]);
    expect(s.map((x) => x.kind)).toEqual(["stairs", "elevator"]);
    expect(s[0].len_m).toBe(30);
  });
});
