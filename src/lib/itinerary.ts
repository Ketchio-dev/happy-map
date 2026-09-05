import type { Leg } from "./router";

/** One line of the step list: what to do next, and what it costs. */
export interface Step {
  kind: "walk" | "ride" | "enter" | "exit" | "transfer" | "stairs" | "elevator";
  text: string;
  /** where the walking happens; null for anything that is not a walk */
  shelter: 0 | 1 | 2 | null;
  len_m: number;
  time_s: number;
  line?: string;
}

const SHELTER = ["outdoors", "under cover", "indoors"] as const;
const MIN_WALK_M = 35;

const along = (name: string | null, hw: string) => {
  if (name) return `along ${name}`;
  if (hw === "footway" || hw === "path" || hw === "pedestrian") return "along a path";
  if (hw === "corridor") return "through a corridor";
  if (hw === "steps") return "";
  return "";
};

/** Turns the legs of a route into a short list of moves a person can follow or hear.
 *  Consecutive legs on the same street and the same kind of cover are one step; tiny
 *  fragments fold into their neighbours; stations and stairs always get their own line. */
export function itinerary(legs: Leg[]): Step[] {
  const out: Step[] = [];
  const last = () => out[out.length - 1];
  const stationOf = (s?: string) => (s ?? "").replace(/ Station$/, "");
  for (let i = 0; i < legs.length; i++) {
    const l = legs[i];
    if (l.transit) {
      const line = l.name ?? `Line ${l.transit}`;
      const prev = last();
      if (prev?.kind === "ride" && prev.line === l.transit) { prev.len_m += l.len; prev.time_s += l.time_s; continue; }
      // the stop we get off at is named by the station link that follows the ride
      let j = i; while (j < legs.length && legs[j].transit === l.transit) j++;
      const off = stationOf(legs[j]?.station) || "the next station";
      out.push({ kind: "ride", text: `Ride ${line} to ${off}`, shelter: null, len_m: l.len, time_s: l.time_s, line: l.transit });
      continue;
    }
    if (l.hw === "station_link") {
      const st = stationOf(l.station);
      const entering = !!legs[i + 1]?.transit || legs[i + 1]?.hw === "transfer";
      out.push({ kind: entering ? "enter" : "exit", text: entering ? `Enter ${st} Station` : `Leave ${st} Station`, shelter: null, len_m: l.len, time_s: l.time_s });
      continue;
    }
    if (l.hw === "transfer") {
      // the transfer happens where the last ride ended
      const where = [...out].reverse().find((s) => s.kind === "ride")?.text.replace(/^.* to /, "") ?? stationOf(l.station);
      out.push({ kind: "transfer", text: `Change lines at ${where}`, shelter: null, len_m: l.len, time_s: l.time_s });
      continue;
    }
    if (l.elev) {
      const prev = last();
      if (prev?.kind === "elevator") { prev.time_s += l.time_s; continue; }
      out.push({ kind: "elevator", text: "Take the elevator", shelter: null, len_m: 0, time_s: l.time_s });
      continue;
    }
    if (l.steps) {
      const prev = last();
      if (prev?.kind === "stairs") { prev.len_m += l.len; prev.time_s += l.time_s; continue; }
      out.push({ kind: "stairs", text: "Stairs", shelter: null, len_m: l.len, time_s: l.time_s });
      continue;
    }
    const prev = last();
    const sameStreet = prev?.kind === "walk" && prev.shelter === l.shelter && (l.name === null || prev.text.endsWith(along(l.name, l.hw)) || prev.text.endsWith("Walk"));
    if (sameStreet && prev) {
      prev.len_m += l.len; prev.time_s += l.time_s;
      if (l.name && (prev.text.endsWith("Walk") || prev.text.endsWith("along a path"))) prev.text = `Walk ${along(l.name, l.hw)}`.trim();
      continue;
    }
    out.push({ kind: "walk", text: `Walk ${along(l.name, l.hw)}`.trim(), shelter: l.shelter, len_m: l.len, time_s: l.time_s });
  }
  // fold walking fragments shorter than a few car lengths into the walk before them
  const folded: Step[] = [];
  for (const s of out) {
    const p = folded[folded.length - 1];
    if (s.kind === "walk" && s.len_m < MIN_WALK_M && p?.kind === "walk") { p.len_m += s.len_m; p.time_s += s.time_s; if (p.shelter !== s.shelter) p.shelter = p.len_m > s.len_m ? p.shelter : s.shelter; continue; }
    folded.push(s);
  }
  for (const s of folded) if (s.kind === "walk") s.text = `${s.text} · ${SHELTER[s.shelter ?? 0]}`;
  return folded;
}
