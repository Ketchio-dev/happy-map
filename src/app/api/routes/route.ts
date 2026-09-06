import { NextResponse } from "next/server";
import { loadGraph } from "@/lib/graph";
import { plan, type Mode } from "@/lib/router";
import { cityOf } from "@/lib/cities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** All strategies computed in one call, so the UI can show them as comparable options. */
export const STRATEGIES = [
  { id: "fastest", label: "Fastest", hint: "shortest time, ignores exposure", mode: {} as Mode },
  { id: "indoor", label: "Indoor first", hint: "PATH, tunnels, covered walkways", mode: { cold: true } as Mode },
  { id: "shade", label: "Shade first", hint: "avoids direct sun at the chosen hour", mode: { heat: true } as Mode },
  { id: "stepfree", label: "Step-free", hint: "no stairs, avoids stations with a broken elevator", mode: { mobility: true } as Mode },
] as const;

export type StrategyId = (typeof STRATEGIES)[number]["id"];

export async function POST(req: Request) {
  let body: { city?: string; from?: [number, number]; to?: [number, number]; hourBucket?: string; blockedStations?: string[]; walkOnly?: boolean; speed?: number; /** sky factor for the shade strategy, 0–1; omitted = clear sky */ sky?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 }); }
  const ok = (p: unknown): p is [number, number] => Array.isArray(p) && p.length === 2 && p.every((x) => typeof x === "number" && isFinite(x));
  if (!ok(body.from) || !ok(body.to)) return NextResponse.json({ ok: false, error: "from/to must be [lon, lat]" }, { status: 400 });

  const t0 = performance.now();
  const city = cityOf(body.city);
  const g = loadGraph(city.id);
  const sky = typeof body.sky === "number" && isFinite(body.sky) ? Math.min(1, Math.max(0, body.sky)) : 1;
  const blocked = (body.blockedStations ?? []).filter((x) => typeof x === "string");
  // a city with no sun data has no shade route worth showing: it would equal the fastest one
  const results = STRATEGIES.filter((s) => city.hasShade || s.id !== "shade").map((s) => {
    const mode: Mode = { ...s.mode, walkOnly: body.walkOnly, speed: typeof body.speed === "number" && isFinite(body.speed) ? body.speed : undefined, sky };
    const r = plan(g, { from: body.from!, to: body.to!, mode, hourBucket: body.hourBucket, blockedStations: blocked });
    if (!r.ok) return { id: s.id, label: s.label, hint: s.hint, ok: false as const, error: r.error };
    // what the outages cost: the same step-free trip with every elevator working
    const open = s.id === "stepfree" && blocked.length ? plan(g, { from: body.from!, to: body.to!, mode, hourBucket: body.hourBucket }) : null;
    return { id: s.id, label: s.label, hint: s.hint, ok: true as const, legs: r.route.legs, stats: r.route.stats, blockedStations: r.blockedStations, withoutOutages: open?.ok ? open.route.stats : undefined };
  });
  const fastest = results.find((r) => r.id === "fastest");
  return NextResponse.json({ ok: true, city: city.id, ms: Math.round(performance.now() - t0), baseline: fastest?.ok ? fastest.stats : null, sky, routes: results });
}
