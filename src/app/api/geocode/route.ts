import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Downtown Toronto viewbox used to bias and bound results. */
const VIEWBOX = "-79.425,43.685,-79.350,43.628";
const UA = "toronto-exposure-router/0.1 (GatewayHacks 2026 project)";

export interface Hit { name: string; detail: string; lon: number; lat: number }

const cache = new Map<string, { at: number; hits: Hit[] }>();
const TTL = 30 * 60_000;

function shorten(display: string): { name: string; detail: string } {
  const parts = display.split(",").map((s) => s.trim());
  return { name: parts[0] ?? display, detail: parts.slice(1, 4).join(", ") };
}

async function nominatim(path: string, params: Record<string, string>): Promise<unknown> {
  const url = `https://nominatim.openstreetmap.org/${path}?${new URLSearchParams({ format: "jsonv2", ...params })}`;
  const res = await fetch(url, { headers: { "user-agent": UA, "accept-language": "en" }, next: { revalidate: 1800 } });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  return res.json();
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q");
  const lon = url.searchParams.get("lon"), lat = url.searchParams.get("lat");
  const key = q ? `q:${q.toLowerCase()}` : `r:${lon},${lat}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return NextResponse.json({ ok: true, hits: hit.hits, cached: true });

  try {
    let hits: Hit[] = [];
    if (q && q.trim().length >= 2) {
      const j = (await nominatim("search", { q: q.trim(), limit: "6", viewbox: VIEWBOX, bounded: "1", countrycodes: "ca" })) as { display_name: string; lon: string; lat: string }[];
      hits = j.map((r) => ({ ...shorten(r.display_name), lon: +r.lon, lat: +r.lat }));
      if (hits.length === 0) {
        const j2 = (await nominatim("search", { q: `${q.trim()}, Toronto`, limit: "6", countrycodes: "ca" })) as { display_name: string; lon: string; lat: string }[];
        hits = j2.map((r) => ({ ...shorten(r.display_name), lon: +r.lon, lat: +r.lat }));
      }
    } else if (lon && lat) {
      const j = (await nominatim("reverse", { lon, lat, zoom: "18" })) as { display_name?: string; lon: string; lat: string };
      if (j.display_name) hits = [{ ...shorten(j.display_name), lon: +lon, lat: +lat }];
    } else {
      return NextResponse.json({ ok: false, error: "pass q, or lon and lat" }, { status: 400 });
    }
    cache.set(key, { at: Date.now(), hits });
    return NextResponse.json({ ok: true, hits });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}
