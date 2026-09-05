import { NextResponse } from "next/server";
import { loadGraph } from "@/lib/graph";
import { reach } from "@/lib/reach";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Everything reachable from one point within a time budget and an outdoor-time budget. */
export async function POST(req: Request) {
  let body: { from?: [number, number]; maxMin?: number; maxOutdoorMin?: number | null; mobility?: boolean; walkOnly?: boolean; speed?: number; hourBucket?: string; blockedStations?: string[] };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 }); }
  const ok = (p: unknown): p is [number, number] => Array.isArray(p) && p.length === 2 && p.every((x) => typeof x === "number" && isFinite(x));
  if (!ok(body.from)) return NextResponse.json({ ok: false, error: "from must be [lon, lat]" }, { status: 400 });
  const num = (x: unknown, d: number) => (typeof x === "number" && isFinite(x) ? x : d);
  const r = reach(loadGraph(), {
    from: body.from, maxMin: num(body.maxMin, 15), maxOutdoorMin: body.maxOutdoorMin === null || body.maxOutdoorMin === undefined ? null : num(body.maxOutdoorMin, 5),
    mode: { mobility: !!body.mobility, walkOnly: !!body.walkOnly, speed: typeof body.speed === "number" ? body.speed : undefined },
    hourBucket: body.hourBucket, blockedStations: body.blockedStations,
  });
  return NextResponse.json(r, { status: r.ok ? 200 : 422 });
}
