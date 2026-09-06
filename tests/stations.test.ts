import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { normName, gtfsNamesFor } from "@/lib/stations";
import { stationNodesFor } from "@/lib/graph";
import { coordsFor } from "@/lib/alerts";
import { graph } from "./helpers";

describe("normName", () => {
  it("strips the Station suffix, dots, apostrophes and hyphens the same way on both sides", () => {
    expect(normName("St. George Station")).toBe("st george");
    expect(normName("St George")).toBe("st george");
    expect(normName("Queen's Park")).toBe("queens park");
    expect(normName("Sheppard-Yonge")).toBe("sheppard yonge");
    expect(normName("  Bloor–Yonge  ")).toBe("bloor yonge");
  });
});

describe("gtfsNamesFor", () => {
  it("splits the Bloor-Yonge complex into its two GTFS records", () => {
    expect(gtfsNamesFor("Bloor-Yonge")).toEqual(["Bloor", "Yonge"]);
    expect(gtfsNamesFor("Yonge-Bloor Station")).toEqual(["Bloor", "Yonge"]);
  });
  it("passes ordinary names through", () => {
    expect(gtfsNamesFor("Kipling")).toEqual(["Kipling"]);
  });
});

describe("every station the TTC feed has named so far resolves in the graph", () => {
  // Stations the walking graph does not know yet; a failing name that is not in this list
  // is a matching bug, a name in this list that starts resolving should be removed.
  const KNOWN_MISSING = new Set<string>([
    "Scarborough Centre", // Line 3 closed in 2023; the feed still reports its bus-terminal elevators
  ]);
  const summary = JSON.parse(readFileSync("research/outages-summary.json", "utf8")) as { alerts: { station: string; type: string }[] };
  const names = [...new Set(summary.alerts.map((a) => a.station))].filter((n) => n && !KNOWN_MISSING.has(n));
  it("has logged stations to check", () => { expect(names.length).toBeGreaterThan(10); });
  it.each(names)("%s → at least one station node", (name) => {
    expect(stationNodesFor(graph(), name).length).toBeGreaterThan(0);
    expect(coordsFor(name)).not.toBeNull();
  });
  it("returns nothing for a name that is not a station", () => {
    expect(stationNodesFor(graph(), "Nowhere Junction")).toEqual([]);
    expect(coordsFor("Nowhere Junction")).toBeNull();
  });
});
