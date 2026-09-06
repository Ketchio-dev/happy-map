import { readFileSync } from "node:fs";
import path from "node:path";
import { normName, gtfsNamesFor } from "./stations";

export interface AccessibilityAlert { id: string; type: "Elevator" | "Escalator" | string; code: string | null; station: string; lat: number | null; lon: number | null; header: string; effect: string; severity: string; cause: string | null; causeDesc: string | null; planned: string; stops: string[]; start: string | null; targetRemoval: string | null; updated: string }

let stationCoords: Map<string, [number, number]> | null = null;
/** where to draw an alert: the GTFS station it names, if the graph knows one */
export function coordsFor(station: string): [number, number] | null {
  if (!stationCoords) {
    stationCoords = new Map();
    try { const sub = JSON.parse(readFileSync(path.join(process.cwd(), "data", "subway.json"), "utf8")) as { stations: { name: string; lat: number; lon: number }[] }; for (const s of sub.stations) stationCoords.set(normName(s.name), [s.lon, s.lat]); } catch { /* no subway file */ }
  }
  for (const n of gtfsNamesFor(station)) { const c = stationCoords.get(normName(n)); if (c) return c; }
  return null;
}
