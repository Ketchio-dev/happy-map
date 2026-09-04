#!/usr/bin/env node
// Records one snapshot of the TTC accessibility feed. Appends to data/ttc-alerts/<date>.jsonl
// only when the set of accessibility alerts has changed since the last recorded snapshot.
import { readFile, appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "data", "ttc-alerts");
const URL_ALERTS = "https://alerts.ttc.ca/api/alerts/live-alerts";

const pick = (a) => ({ id: a.id, type: a.routeType, code: a.elevatorCode ?? a.escalatorCode ?? null, planned: a.alertType, stops: a.stops ?? [], header: a.headerText, effect: a.effectDesc, severity: a.severity, cause: a.cause, causeDesc: a.causeDescription, start: a.activePeriod?.start ?? null, end: a.activePeriod?.end ?? null, targetRemoval: a.targetRemoval ?? null, updated: a.lastUpdated });

const res = await fetch(URL_ALERTS, { headers: { "user-agent": `happy-map/0.1 (research logger; ${process.env.LOGGER_SOURCE ?? "actions"})` } });
if (!res.ok) { console.error(`TTC feed HTTP ${res.status}`); process.exit(1); }
const j = await res.json();
const acc = (j.accessibility ?? []).map(pick);
const sig = acc.map((a) => `${a.id}:${a.updated}`).sort().join("|");

await mkdir(OUT_DIR, { recursive: true });
const now = new Date();
const day = now.toISOString().slice(0, 10);
const file = path.join(OUT_DIR, `${day}.jsonl`);

// compare against the newest full snapshot we already have (today's file, else yesterday's)
let lastSig = null;
for (const d of [day, new Date(now.getTime() - 864e5).toISOString().slice(0, 10)]) {
  try {
    const lines = (await readFile(path.join(OUT_DIR, `${d}.jsonl`), "utf8")).trim().split("\n");
    for (let i = lines.length - 1; i >= 0; i--) { const r = JSON.parse(lines[i]); if (r.accessibility) { lastSig = r.accessibility.map((a) => `${a.id}:${a.updated}`).sort().join("|"); break; } }
  } catch { /* no file */ }
  if (lastSig !== null) break;
}

await writeFile(path.join(OUT_DIR, "latest.json"), JSON.stringify({ t: now.toISOString(), feedUpdated: j.lastUpdated, accessibility: acc }, null, 1));
if (sig === lastSig) { console.log(`no change (${acc.length} alerts)`); process.exit(0); }
await appendFile(file, JSON.stringify({ t: now.toISOString(), feedUpdated: j.lastUpdated, total: j.total, nAcc: acc.length, changed: true, source: process.env.LOGGER_SOURCE ?? "actions", accessibility: acc }) + "\n");
console.log(`changed: ${acc.length} alerts recorded`);
