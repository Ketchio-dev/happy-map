#!/usr/bin/env node
// Summarizes logged TTC elevator/escalator alerts (data/ttc-alerts/*.jsonl) → research/outages-summary.json
// Reconstructs alert lifetimes from snapshot lines (changed=true) + heartbeats; unplanned vs planned; per-station counts.
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "data/ttc-alerts");
const files = (await readdir(DIR)).filter(f => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).sort();
const seen = new Map(); // id -> { first, last, station, type, code, planned, causeDesc, header }
let snapshots = 0, firstT = null, lastT = null, lastActive = null;
for (const f of files) {
  const lines = (await readFile(path.join(DIR, f), "utf8")).split("\n").filter(Boolean);
  for (const line of lines) {
    const rec = JSON.parse(line); const t = rec.t; firstT ??= t; lastT = t;
    if (rec.same) { if (lastActive) for (const id of lastActive) seen.get(id).last = t; continue; }
    snapshots++;
    const ids = new Set();
    for (const a of rec.accessibility) {
      ids.add(a.id);
      const station = (a.header ?? "").split(":")[0].trim();
      if (!seen.has(a.id)) seen.set(a.id, { id: a.id, first: t, last: t, feedStart: a.start, station, type: a.type, code: a.code, planned: a.planned, causeDesc: a.causeDesc, header: a.header });
      else seen.get(a.id).last = t;
    }
    lastActive = ids;
  }
}
const hours = (a, b) => (new Date(b) - new Date(a)) / 3.6e6;
const alerts = [...seen.values()].map(a => ({ ...a, observedHours: +hours(a.first, a.last).toFixed(2), sinceFeedStartHours: a.feedStart ? +hours(a.feedStart, a.last).toFixed(1) : null, ongoing: a.last === lastT }));
const elev = alerts.filter(a => a.type === "Elevator");
const byStation = {}; for (const a of elev) byStation[a.station] = (byStation[a.station] || 0) + 1;
const summary = {
  logging: { first: firstT, last: lastT, hoursCovered: +hours(firstT, lastT).toFixed(2), snapshotsWithChange: snapshots },
  distinctAlerts: alerts.length, elevatorAlerts: elev.length, escalatorAlerts: alerts.length - elev.length,
  elevatorUnplanned: elev.filter(a => a.planned !== "Planned").length,
  elevatorOngoingNow: elev.filter(a => a.ongoing).length,
  stationsWithElevatorOutage: Object.keys(byStation).length, byStation,
  medianElevatorOutageAgeHours: (() => { const xs = elev.map(a => a.sinceFeedStartHours).filter(x => x !== null).sort((a, b) => a - b); return xs.length ? xs[Math.floor(xs.length / 2)] : null; })(),
};
await writeFile(path.join(ROOT, "research/outages-summary.json"), JSON.stringify({ summary, alerts }, null, 1));
console.log(JSON.stringify(summary, null, 1));
