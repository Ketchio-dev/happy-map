#!/usr/bin/env node
// Records one snapshot of the STM elevator status page. Appends to data/stm-alerts/<date>.jsonl
// only when the set of alerts has changed since the last recorded snapshot; same record
// shape as the TTC log, so tools/analyze-outages.mjs and the replay API read both.
import { readFile, appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseStm, URL_STM, STM_HEADERS } from "./stm-parse.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "data", "stm-alerts");

const res = await fetch(URL_STM, { headers: STM_HEADERS });
if (!res.ok) { console.error(`STM page HTTP ${res.status}`); process.exit(1); }
const now = new Date();
const acc = parseStm(await res.text(), now.toISOString());
const sig = acc.map((a) => a.id).sort().join("|");

await mkdir(OUT_DIR, { recursive: true });
const day = now.toISOString().slice(0, 10);
const file = path.join(OUT_DIR, `${day}.jsonl`);
let lastSig = null;
for (const d of [day, new Date(now.getTime() - 864e5).toISOString().slice(0, 10)]) {
  try {
    const lines = (await readFile(path.join(OUT_DIR, `${d}.jsonl`), "utf8")).trim().split("\n");
    for (let i = lines.length - 1; i >= 0; i--) { const r = JSON.parse(lines[i]); if (r.accessibility) { lastSig = r.accessibility.map((a) => a.id).sort().join("|"); break; } }
  } catch { /* no file */ }
  if (lastSig !== null) break;
}
await writeFile(path.join(OUT_DIR, "latest.json"), JSON.stringify({ t: now.toISOString(), accessibility: acc }, null, 1));
if (sig === lastSig) { console.log(`stm: no change (${acc.length} alerts)`); process.exit(0); }
await appendFile(file, JSON.stringify({ t: now.toISOString(), feedUpdated: now.toISOString(), total: acc.length, nAcc: acc.length, changed: true, source: process.env.LOGGER_SOURCE ?? "local", accessibility: acc }) + "\n");
console.log(`stm: changed, ${acc.length} alerts recorded`);
