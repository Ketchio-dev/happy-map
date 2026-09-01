import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
const URL_ALERTS = "https://alerts.ttc.ca/api/alerts/live-alerts";

export interface AccessibilityAlert { id: string; type: "Elevator" | "Escalator" | string; code: string | null; station: string; lat: number | null; lon: number | null; header: string; effect: string; severity: string; cause: string | null; causeDesc: string | null; planned: string; stops: string[]; start: string | null; targetRemoval: string | null; updated: string }
interface RawAlert { id: string; routeType?: string; elevatorCode?: string | null; escalatorCode?: string | null; headerText?: string; effectDesc?: string; severity?: string; cause?: string | null; causeDescription?: string | null; alertType?: string; stops?: string[]; activePeriod?: { start?: string }; targetRemoval?: string | null; lastUpdated?: string }

const ALIASES: Record<string, string> = { "bloor-yonge": "bloor", "yonge-bloor": "bloor", "dundas": "tmu", "sheppard yonge": "sheppard-yonge", "queens park": "queen's park", "vmc": "vaughan metropolitan centre" };
const norm = (s: string) => s.toLowerCase().replace(/\./g, "").replace(/\s+station$/, "").replace(/\s+/g, " ").trim();
let stationCoords: Map<string, [number, number]> | null = null;
function coordsFor(station: string): [number, number] | null {
  if (!stationCoords) {
    stationCoords = new Map();
    try { const sub = JSON.parse(readFileSync(path.join(process.cwd(), "data", "subway.json"), "utf8")) as { stations: { name: string; lat: number; lon: number }[] }; for (const s of sub.stations) stationCoords.set(norm(s.name), [s.lon, s.lat]); } catch { /* no subway file */ }
  }
  const k = norm(station); return stationCoords.get(ALIASES[k] ?? k) ?? null;
}

export async function GET() {
  try {
    const res = await fetch(URL_ALERTS, { next: { revalidate: 60 }, headers: { "user-agent": "toronto-exposure-router/0.1" } });
    if (!res.ok) throw new Error(`TTC feed HTTP ${res.status}`);
    const j = (await res.json()) as { lastUpdated: string; accessibility?: RawAlert[] };
    const alerts: AccessibilityAlert[] = (j.accessibility ?? []).map((a) => {
      const station = (a.headerText ?? "").split(":")[0].trim(); const c = coordsFor(station);
      return { id: a.id, type: a.routeType ?? "", code: a.elevatorCode ?? a.escalatorCode ?? null, station, lat: c?.[1] ?? null, lon: c?.[0] ?? null, header: a.headerText ?? "", effect: a.effectDesc ?? "", severity: a.severity ?? "", cause: a.cause ?? null, causeDesc: a.causeDescription ?? null, planned: a.alertType ?? "", stops: a.stops ?? [], start: a.activePeriod?.start ?? null, targetRemoval: a.targetRemoval ?? null, updated: a.lastUpdated ?? "" };
    });
    return NextResponse.json({ ok: true, feedUpdated: j.lastUpdated, fetched: new Date().toISOString(), elevators: alerts.filter((a) => a.type === "Elevator"), escalators: alerts.filter((a) => a.type !== "Elevator") });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}
