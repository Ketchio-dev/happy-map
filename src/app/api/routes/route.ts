import { NextResponse } from "next/server";
import { loadGraph } from "@/lib/graph";
import { plan, type Mode } from "@/lib/router";

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
  let body: { from?: [number, number]; to?: [number, number]; hourBucket?: string; blockedStations?: string[]; walkOnly?: boolean; speed?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 }); }
  const ok = (p: unknown): p is [number, number] => Array.isArray(p) && p.length === 2 && p.every((x) => typeof x === "number" && isFinite(x));
  if (!ok(body.from) || !ok(body.to)) return NextResponse.json({ ok: false, error: "from/to must be [lon, lat]" }, { status: 400 });

  const t0 = performance.now();
  const g = loadGraph();
  const results = STRATEGIES.map((s) => {
    const mode: Mode = { ...s.mode, walkOnly: body.walkOnly, speed: typeof body.speed === "number" && isFinite(body.speed) ? body.speed : undefined };
    const r = plan(g, { from: body.from!, to: body.to!, mode, hourBucket: body.hourBucket, blockedStations: body.blockedStations });
    if (!r.ok) return { id: s.id, label: s.label, hint: s.hint, ok: false as const, error: r.error };
    return { id: s.id, label: s.label, hint: s.hint, ok: true as const, legs: r.route.legs, stats: r.route.stats, blockedStations: r.blockedStations };
  });
  const fastest = results.find((r) => r.id === "fastest");
  return NextResponse.json({ ok: true, ms: Math.round(performance.now() - t0), baseline: fastest?.ok ? fastest.stats : null, routes: results });
}
