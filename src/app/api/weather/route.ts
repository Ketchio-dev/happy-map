import { NextResponse } from "next/server";
import { skyFactor } from "@/lib/sky";
import { cityOf } from "@/lib/cities";

export const runtime = "nodejs";
// Environment and Climate Change Canada GeoMet OGC API — City Page Weather (Toronto). Includes the live `warnings` array.
const urlEccc = (bbox: string) => `https://api.weather.gc.ca/collections/citypageweather-realtime/items?f=json&limit=5&bbox=${bbox}`;

// Cloud cover is not in the ECCC city page, so it comes from Open-Meteo's current conditions.
const urlSky = (lat: number, lon: number) => `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=cloud_cover,is_day&timezone=America%2FToronto`;

export interface Weather { ok: true; fetched: string; station: string; temp: number | null; humidex: number | null; windChill: number | null; condition: string | null; warnings: { type: string; text: string }[]; suggested: { cold: boolean; heat: boolean }; reason: string; /** cloud cover now, percent, or null when Open-Meteo was unreachable */ cloud: number | null; /** share of clear-sky sun reaching the ground now; 1 when unknown (lib/sky.ts) */ sky: number; isDay: boolean | null }

// ECCC wraps most fields as { value: { en, fr } } or { en, fr }
type Bi = { en?: unknown; fr?: unknown } | { value?: unknown } | string | number | null | undefined;
interface Item { properties: { name?: Bi; currentConditions?: { temperature?: Bi; humidex?: Bi; windChill?: Bi; condition?: Bi }; hourlyForecastGroup?: { hourlyForecasts?: { humidex?: Bi; temperature?: Bi }[] }; warnings?: unknown[] } }

const en = (v: Bi): unknown => { if (v && typeof v === "object") { if ("value" in v) return en(v.value as Bi); if ("en" in v) return v.en; } return v; };
const num = (v: Bi): number | null => { const x = en(v); const n = typeof x === "string" ? parseFloat(x) : typeof x === "number" ? x : NaN; return Number.isFinite(n) ? n : null; };
const str = (v: Bi): string | null => { const x = en(v); return typeof x === "string" ? x : null; };

async function sky(lat: number, lon: number): Promise<{ cloud: number | null; isDay: boolean | null }> {
  try {
    const r = await fetch(urlSky(lat, lon), { next: { revalidate: 900 }, headers: { "user-agent": "toronto-exposure-router/0.1" } });
    if (!r.ok) return { cloud: null, isDay: null };
    const j = (await r.json()) as { current?: { cloud_cover?: number; is_day?: number } };
    const c = j.current?.cloud_cover;
    return { cloud: typeof c === "number" && isFinite(c) ? c : null, isDay: typeof j.current?.is_day === "number" ? j.current.is_day === 1 : null };
  } catch { return { cloud: null, isDay: null }; }
}

export async function GET(req: Request) {
  const city = cityOf(new URL(req.url).searchParams.get("city"));
  try {
    const [res, { cloud, isDay }] = await Promise.all([fetch(urlEccc(city.weather.ecccBbox), { next: { revalidate: 300 }, headers: { "user-agent": "toronto-exposure-router/0.1" } }), sky(city.weather.lat, city.weather.lon)]);
    if (!res.ok) throw new Error(`ECCC HTTP ${res.status}`);
    const j = (await res.json()) as { features: Item[] };
    const it = j.features.find((f) => (str(f.properties.name) ?? "").toLowerCase().includes(city.weather.ecccName)) ?? j.features[0];
    if (!it) throw new Error("no Toronto feature");
    const cc = it.properties.currentConditions ?? {};
    const temp = num(cc.temperature);
    const humidex = num(cc.humidex) ?? num(it.properties.hourlyForecastGroup?.hourlyForecasts?.[0]?.humidex);
    const windChill = num(cc.windChill);
    const warnings = (it.properties.warnings ?? []).map((w) => { const o = w as Record<string, Bi>; const text = String(en(o.description) ?? en(o.headline) ?? en(o.event) ?? en(o.type) ?? JSON.stringify(o)); return { type: String(en(o.type) ?? en(o.event) ?? en(o.priority) ?? "warning"), text }; });
    const wtext = warnings.map((w) => w.text.toLowerCase()).join(" | ");
    const heat = /heat|humidex/.test(wtext) || (humidex !== null && humidex >= 35) || (temp !== null && temp >= 30);
    const cold = /cold|winter storm|blizzard|freezing|snowfall/.test(wtext) || (windChill !== null && windChill <= -15) || (temp !== null && temp <= -5);
    const reason = warnings.length ? `Environment Canada: ${warnings.map((w) => w.text).join("; ")}` : heat ? `No warning, but it is ${temp ?? "?"} °C${humidex !== null ? ` (humidex ${humidex})` : ""}` : cold ? `No warning, but it is ${temp ?? "?"} °C${windChill !== null ? ` (wind chill ${windChill})` : ""}` : `No weather warnings in effect for ${city.name}. ${temp ?? "?"} °C now.`;
    const out: Weather = { ok: true, fetched: new Date().toISOString(), station: str(it.properties.name) ?? city.name, temp, humidex, windChill, condition: str(cc.condition), warnings, suggested: { cold, heat }, reason, cloud, sky: skyFactor(cloud), isDay };
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}
