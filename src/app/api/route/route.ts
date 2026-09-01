import { NextResponse } from "next/server";
import { loadGraph } from "@/lib/graph";
import { plan, type RouteRequest } from "@/lib/router";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: RouteRequest;
  try { body = (await req.json()) as RouteRequest; } catch { return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 }); }
  const ok = (p: unknown): p is [number, number] => Array.isArray(p) && p.length === 2 && p.every((x) => typeof x === "number" && isFinite(x));
  if (!ok(body?.from) || !ok(body?.to)) return NextResponse.json({ ok: false, error: "from/to must be [lon, lat]" }, { status: 400 });
  const t0 = performance.now();
  const g = loadGraph();
  const res = plan(g, { from: body.from, to: body.to, mode: body.mode ?? {}, hourBucket: body.hourBucket, blockedNodes: body.blockedNodes, blockedStations: body.blockedStations });
  return NextResponse.json({ ...res, ms: Math.round(performance.now() - t0) }, { status: res.ok ? 200 : 422 });
}
