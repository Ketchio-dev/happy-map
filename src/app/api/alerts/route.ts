import { NextResponse } from "next/server";
import { coordsFor, type AccessibilityAlert } from "@/lib/alerts";
import { cityOf } from "@/lib/cities";
import { fetchStm } from "@/lib/adapters/stm";

export const runtime = "nodejs";
const URL_ALERTS = "https://alerts.ttc.ca/api/alerts/live-alerts";
export type { AccessibilityAlert };
interface RawAlert { id: string; routeType?: string; elevatorCode?: string | null; escalatorCode?: string | null; headerText?: string; effectDesc?: string; severity?: string; cause?: string | null; causeDescription?: string | null; alertType?: string; stops?: string[]; activePeriod?: { start?: string }; targetRemoval?: string | null; lastUpdated?: string }


export async function GET(req: Request) {
  const city = cityOf(new URL(req.url).searchParams.get("city"));
  try {
    if (city.alerts === "stm") {
      const { alerts, fetched } = await fetchStm();
      const placed = alerts.map((a) => { const c = coordsFor(a.station, city.id); return { ...a, lat: c?.[1] ?? null, lon: c?.[0] ?? null }; });
      return NextResponse.json({ ok: true, city: city.id, feedUpdated: fetched, fetched, elevators: placed.filter((a) => a.type === "Elevator"), escalators: placed.filter((a) => a.type !== "Elevator") });
    }
    const res = await fetch(URL_ALERTS, { next: { revalidate: 60 }, headers: { "user-agent": "toronto-exposure-router/0.1" } });
    if (!res.ok) throw new Error(`TTC feed HTTP ${res.status}`);
    const j = (await res.json()) as { lastUpdated: string; accessibility?: RawAlert[] };
    const alerts: AccessibilityAlert[] = (j.accessibility ?? []).map((a) => {
      const station = (a.headerText ?? "").split(":")[0].trim(); const c = coordsFor(station);
      return { id: a.id, type: a.routeType ?? "", code: a.elevatorCode ?? a.escalatorCode ?? null, station, lat: c?.[1] ?? null, lon: c?.[0] ?? null, header: a.headerText ?? "", effect: a.effectDesc ?? "", severity: a.severity ?? "", cause: a.cause ?? null, causeDesc: a.causeDescription ?? null, planned: a.alertType ?? "", stops: a.stops ?? [], start: a.activePeriod?.start ?? null, targetRemoval: a.targetRemoval ?? null, updated: a.lastUpdated ?? "" };
    });
    return NextResponse.json({ ok: true, city: city.id, feedUpdated: j.lastUpdated, fetched: new Date().toISOString(), elevators: alerts.filter((a) => a.type === "Elevator"), escalators: alerts.filter((a) => a.type !== "Elevator") });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}
