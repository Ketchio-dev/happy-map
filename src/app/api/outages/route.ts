import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { activeAt, busiest, timeline, type LoggedAlert, type OutageSummary } from "@/lib/outages";
import { coordsFor, type AccessibilityAlert } from "@/lib/alerts";

export const runtime = "nodejs";

// The logger on the VPS recomputes and commits this file whenever the feed changes, so the
// live copy is read from the repository; the copy frozen into the deploy is the fallback.
const RAW = "https://raw.githubusercontent.com/Ketchio-dev/happy-map/main/research/outages-summary.json";
async function loadSummary(): Promise<OutageSummary | null> {
  try { const r = await fetch(RAW, { next: { revalidate: 600 } }); if (r.ok) return (await r.json()) as OutageSummary; } catch { /* offline: fall through */ }
  try { return JSON.parse(readFileSync(path.join(process.cwd(), "research", "outages-summary.json"), "utf8")) as OutageSummary; } catch { return null; }
}

/** a logged alert in the shape the map already draws live alerts in */
function toAlert(a: LoggedAlert): AccessibilityAlert {
  const c = coordsFor(a.station);
  return { id: a.id, type: a.type, code: a.code, station: a.station, lat: c?.[1] ?? null, lon: c?.[0] ?? null, header: a.header, effect: "Out of service", severity: "", cause: a.cause, causeDesc: a.causeDesc, planned: a.planned, stops: [], start: a.feedStart ?? a.first, targetRemoval: null, updated: a.first };
}

export interface OutagesReplay { ok: true; at: string; range: { first: string; last: string }; busiest: { at: string; elevators: number }; timeline: [number, number][]; elevators: AccessibilityAlert[]; escalators: AccessibilityAlert[] }

/** GET /api/outages?at=<ISO> — what the TTC feed listed at that instant, from the log. */
export async function GET(req: Request) {
  const sum = await loadSummary();
  if (!sum) return NextResponse.json({ ok: false, error: "no outage log available" }, { status: 503 });
  const first = Date.parse(sum.summary.logging.first), last = Date.parse(sum.summary.logging.last);
  const atParam = new URL(req.url).searchParams.get("at");
  let at = atParam ? Date.parse(atParam) : last;
  if (!isFinite(at)) return NextResponse.json({ ok: false, error: "at must be an ISO 8601 instant" }, { status: 400 });
  // links carry whole seconds; an alert that began within that second counts as in effect
  at = Math.min(last, Math.max(first, Math.floor(at / 1000) * 1000 + 999));
  const active = activeAt(sum.alerts, at);
  const b = busiest(sum.alerts, first, last);
  const out: OutagesReplay = {
    ok: true, at: new Date(at).toISOString(), range: { first: sum.summary.logging.first, last: sum.summary.logging.last },
    busiest: { at: new Date(b.t).toISOString(), elevators: b.n }, timeline: timeline(sum.alerts, first, last),
    elevators: active.filter((a) => a.type === "Elevator").map(toAlert), escalators: active.filter((a) => a.type !== "Elevator").map(toAlert),
  };
  return NextResponse.json(out);
}
