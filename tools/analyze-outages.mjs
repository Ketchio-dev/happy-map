#!/usr/bin/env node
// Summarizes logged TTC elevator/escalator alerts (data/ttc-alerts/*.jsonl) → research/outages-summary.json
// Reconstructs alert lifetimes from snapshot lines: an alert starts when the feed says it
// did, and ends at the first snapshot that no longer lists it. Snapshots are written only
// when the set changes, so "last seen" would understate every outage by up to a polling gap.
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "data/ttc-alerts");
const files = (await readdir(DIR)).filter(f => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).sort();
// The feed labels every alert "Planned", including door failures; the cause code is what
// actually separates scheduled work from breakdowns.
const UNPLANNED = new Set(["TECHNICAL_PROBLEM", "ACCIDENT"]);
const seen = new Map(); // id -> { first, last, end, station, type, code, cause, causeDesc, header }
let snapshots = 0, firstT = null, lastT = null, lastActive = new Set();
for (const f of files) {
  const lines = (await readFile(path.join(DIR, f), "utf8")).split("\n").filter(Boolean);
  for (const line of lines) {
    const rec = JSON.parse(line); const t = rec.t; firstT ??= t; lastT = t;
    if (rec.same) { for (const id of lastActive) seen.get(id).last = t; continue; }
    snapshots++;
    const ids = new Set();
    for (const a of rec.accessibility) {
      ids.add(a.id);
      const station = (a.header ?? "").split(":")[0].trim();
      if (!seen.has(a.id)) seen.set(a.id, { id: a.id, first: t, last: t, end: null, feedStart: a.start, station, type: a.type, code: a.code, planned: a.planned, cause: a.cause, causeDesc: a.causeDesc, unplanned: UNPLANNED.has(a.cause), header: a.header });
      else seen.get(a.id).last = t;
    }
    for (const id of lastActive) if (!ids.has(id) && !seen.get(id).end) seen.get(id).end = t;
    lastActive = ids;
  }
}
const hours = (a, b) => (new Date(b) - new Date(a)) / 3.6e6;
const alerts = [...seen.values()].map(a => {
  const until = a.end ?? lastT;
  return { ...a, ongoing: a.end === null, observedHours: +hours(a.first, until).toFixed(2), sinceFeedStartHours: a.feedStart ? +hours(a.feedStart, until).toFixed(1) : null };
});
const elev = alerts.filter(a => a.type === "Elevator");
const byStation = {}; for (const a of elev) byStation[a.station] = (byStation[a.station] || 0) + 1;
const median = xs => { const s = xs.filter(x => x !== null).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const summary = {
  logging: { first: firstT, last: lastT, hoursCovered: +hours(firstT, lastT).toFixed(2), snapshotsWithChange: snapshots },
  distinctAlerts: alerts.length, elevatorAlerts: elev.length, escalatorAlerts: alerts.length - elev.length,
  elevatorUnplanned: elev.filter(a => a.unplanned).length,
  elevatorOngoingNow: elev.filter(a => a.ongoing).length,
  stationsWithElevatorOutage: Object.keys(byStation).length, byStation,
  medianElevatorOutageAgeHours: median(elev.map(a => a.sinceFeedStartHours)),
  medianUnplannedElevatorOutageHours: median(elev.filter(a => a.unplanned).map(a => a.sinceFeedStartHours)),
};
await writeFile(path.join(ROOT, "research/outages-summary.json"), JSON.stringify({ summary, alerts }, null, 1));
console.log(JSON.stringify(summary, null, 1));
