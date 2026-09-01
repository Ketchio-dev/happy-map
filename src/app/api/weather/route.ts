import { NextResponse } from "next/server";

export const runtime = "nodejs";
// Environment and Climate Change Canada GeoMet OGC API — City Page Weather (Toronto). Includes the live `warnings` array.
const URL_ECCC = "https://api.weather.gc.ca/collections/citypageweather-realtime/items?f=json&limit=5&bbox=-79.45,43.60,-79.30,43.80";

export interface Weather { ok: true; fetched: string; station: string; temp: number | null; humidex: number | null; windChill: number | null; condition: string | null; warnings: { type: string; text: string }[]; suggested: { cold: boolean; heat: boolean }; reason: string }

// ECCC wraps most fields as { value: { en, fr } } or { en, fr }
type Bi = { en?: unknown; fr?: unknown } | { value?: unknown } | string | number | null | undefined;
interface Item { properties: { name?: Bi; currentConditions?: { temperature?: Bi; humidex?: Bi; windChill?: Bi; condition?: Bi }; hourlyForecastGroup?: { hourlyForecasts?: { humidex?: Bi; temperature?: Bi }[] }; warnings?: unknown[] } }

const en = (v: Bi): unknown => { if (v && typeof v === "object") { if ("value" in v) return en(v.value as Bi); if ("en" in v) return v.en; } return v; };
const num = (v: Bi): number | null => { const x = en(v); const n = typeof x === "string" ? parseFloat(x) : typeof x === "number" ? x : NaN; return Number.isFinite(n) ? n : null; };
const str = (v: Bi): string | null => { const x = en(v); return typeof x === "string" ? x : null; };

export async function GET() {
  try {
    const res = await fetch(URL_ECCC, { next: { revalidate: 300 }, headers: { "user-agent": "toronto-exposure-router/0.1" } });
    if (!res.ok) throw new Error(`ECCC HTTP ${res.status}`);
    const j = (await res.json()) as { features: Item[] };
    const it = j.features.find((f) => /toronto/i.test(str(f.properties.name) ?? "")) ?? j.features[0];
    if (!it) throw new Error("no Toronto feature");
    const cc = it.properties.currentConditions ?? {};
    const temp = num(cc.temperature);
    const humidex = num(cc.humidex) ?? num(it.properties.hourlyForecastGroup?.hourlyForecasts?.[0]?.humidex);
    const windChill = num(cc.windChill);
    const warnings = (it.properties.warnings ?? []).map((w) => { const o = w as Record<string, Bi>; const text = String(en(o.description) ?? en(o.headline) ?? en(o.event) ?? en(o.type) ?? JSON.stringify(o)); return { type: String(en(o.type) ?? en(o.event) ?? en(o.priority) ?? "warning"), text }; });
    const wtext = warnings.map((w) => w.text.toLowerCase()).join(" | ");
    const heat = /heat|humidex/.test(wtext) || (humidex !== null && humidex >= 35) || (temp !== null && temp >= 30);
    const cold = /cold|winter storm|blizzard|freezing|snowfall/.test(wtext) || (windChill !== null && windChill <= -15) || (temp !== null && temp <= -5);
    const reason = warnings.length ? `Environment Canada: ${warnings.map((w) => w.text).join("; ")}` : heat ? `No warning, but it is ${temp ?? "?"} °C${humidex !== null ? ` (humidex ${humidex})` : ""}` : cold ? `No warning, but it is ${temp ?? "?"} °C${windChill !== null ? ` (wind chill ${windChill})` : ""}` : `No weather warnings in effect for Toronto. ${temp ?? "?"} °C now.`;
    const out: Weather = { ok: true, fetched: new Date().toISOString(), station: str(it.properties.name) ?? "Toronto", temp, humidex, windChill, condition: str(cc.condition), warnings, suggested: { cold, heat }, reason };
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}
