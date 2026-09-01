#!/usr/bin/env node
// Polls TTC live alerts every 60s and appends compact accessibility (elevator/escalator)
// snapshots to data/ttc-alerts/YYYY-MM-DD.jsonl. Also writes latest.json for the app.
import { mkdir, appendFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const URL_ALERTS = "https://alerts.ttc.ca/api/alerts/live-alerts";
const INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 60_000);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "data", "ttc-alerts");

const pick = (a) => ({
  id: a.id,
  type: a.routeType,            // "Elevator" | "Escalator"
  code: a.elevatorCode ?? a.escalatorCode ?? null,
  planned: a.alertType,         // "Planned" | "Unplanned" ...
  stops: a.stops ?? [],
  header: a.headerText,
  effect: a.effectDesc,
  severity: a.severity,
  cause: a.cause,
  causeDesc: a.causeDescription,
  start: a.activePeriod?.start ?? null,
  end: a.activePeriod?.end ?? null,
  targetRemoval: a.targetRemoval ?? null,
  updated: a.lastUpdated,
});

let lastSig = null;
let lastFull = 0;
const HEARTBEAT_MS = 10 * 60_000; // write a full snapshot at least every 10 min even if unchanged

async function tick() {
  const t = new Date();
  try {
    const res = await fetch(URL_ALERTS, { headers: { "user-agent": "gatewayhacks-exposure-router/0.1 (research logger)" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    const acc = (j.accessibility ?? []).map(pick);
    const sig = acc.map(a => `${a.id}:${a.updated}`).sort().join("|");
    const changed = sig !== lastSig;
    const day = t.toISOString().slice(0, 10);
    if (changed || Date.now() - lastFull > HEARTBEAT_MS) {
      const line = JSON.stringify({ t: t.toISOString(), feedUpdated: j.lastUpdated, total: j.total, nAcc: acc.length, changed, accessibility: acc });
      await appendFile(path.join(OUT_DIR, `${day}.jsonl`), line + "\n");
      lastSig = sig; lastFull = Date.now();
    } else {
      await appendFile(path.join(OUT_DIR, `${day}.jsonl`), JSON.stringify({ t: t.toISOString(), feedUpdated: j.lastUpdated, nAcc: acc.length, same: true }) + "\n");
    }
    await writeFile(path.join(OUT_DIR, "latest.json"), JSON.stringify({ t: t.toISOString(), feedUpdated: j.lastUpdated, accessibility: acc }, null, 1));
    process.stderr.write(`${t.toISOString()} ok acc=${acc.length}\n`);
  } catch (e) {
    process.stderr.write(`${t.toISOString()} ERR ${e.message}\n`);
    await appendFile(path.join(OUT_DIR, "errors.log"), `${t.toISOString()} ${e.message}\n`).catch(() => {});
  }
}

await mkdir(OUT_DIR, { recursive: true });
await tick();
setInterval(tick, INTERVAL_MS);
