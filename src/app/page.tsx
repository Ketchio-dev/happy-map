"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamicImport from "next/dynamic";
import type { Leg, Stats } from "@/lib/router";
import type { Place, PlacesFile } from "@/lib/types";
import type { AccessibilityAlert } from "./api/alerts/route";
import type { Weather } from "./api/weather/route";
import type { Hit } from "./api/geocode/route";

const RouteMap = dynamicImport(() => import("@/components/RouteMap"), { ssr: false });

interface RouteOpt { id: string; label: string; hint: string; ok: boolean; error?: string; legs?: Leg[]; stats?: Stats; blockedStations?: string[] }
interface RoutesResp { ok: true; ms: number; baseline: Stats | null; routes: RouteOpt[] }

interface Pt { lon: number; lat: number; label: string }
const P = (lon: number, lat: number, label: string): Pt => ({ lon, lat, label });
const PRESETS: { label: string; from: Pt; to: Pt }[] = [
  { label: "Union → Toronto General Hospital", from: P(-79.3806, 43.6453, "Union Station"), to: P(-79.3878, 43.6588, "Toronto General Hospital") },
  { label: "Scotiabank Arena → Eaton Centre", from: P(-79.3791, 43.6435, "Scotiabank Arena"), to: P(-79.3806, 43.6544, "CF Toronto Eaton Centre") },
  { label: "St Andrew → City Hall", from: P(-79.3846, 43.6476, "St Andrew Station"), to: P(-79.3839, 43.6534, "Toronto City Hall") },
  { label: "Union → Bloor-Yonge", from: P(-79.3806, 43.6453, "Union Station"), to: P(-79.3864, 43.6708, "Bloor-Yonge Station") },
];
const DAYS = [{ id: "d0715", label: "July 15" }, { id: "d0915", label: "Sept 15" }];
const HOURS = [8, 10, 12, 14, 16, 18];
const ICONS: Record<string, string> = { fastest: "⚡", indoor: "❄️", shade: "☀️", stepfree: "♿" };

const fmtM = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`);
const fmtMin = (s: number) => `${Math.max(1, Math.round(s / 60))}`;
const delta = (a: number, b: number) => (b === 0 ? null : Math.round(((a - b) / b) * 100));

export default function Home() {
  const [from, setFrom] = useState<Pt | null>(PRESETS[1].from);
  const [to, setTo] = useState<Pt | null>(PRESETS[1].to);
  const [pickNext, setPickNext] = useState<"from" | "to">("from");
  const [tab, setTab] = useState<"route" | "live" | "about">("route");
  const [sheet, setSheet] = useState<"peek" | "full">("full");
  const [selected, setSelected] = useState("indoor");
  const [walkOnly, setWalkOnly] = useState(false);
  const [when, setWhen] = useState({ day: new Date().getMonth() + 1 >= 6 && new Date().getMonth() + 1 <= 8 ? "d0715" : "d0915", hour: 14 });
  const [resp, setResp] = useState<RoutesResp | { ok: false; error: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [alerts, setAlerts] = useState<AccessibilityAlert[]>([]);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [places, setPlaces] = useState<PlacesFile | null>(null);

  const hourBucket = `${when.day}_h${String(when.hour).padStart(2, "0")}`;

  useEffect(() => { fetch("/api/alerts").then((r) => r.json()).then((j) => j.ok && setAlerts(j.elevators)).catch(() => {}); }, []);
  useEffect(() => { fetch("/api/weather").then((r) => r.json()).then((w: Weather | { ok: false }) => { if (w.ok) { setWeather(w); if (w.suggested.heat) setSelected("shade"); else if (w.suggested.cold) setSelected("indoor"); } }).catch(() => {}); }, []);
  useEffect(() => { fetch("/data/places.json").then((r) => r.json()).then(setPlaces).catch(() => {}); }, []);

  const outStations = useMemo(() => Array.from(new Set(alerts.filter((a) => /out of service/i.test(a.effect)).map((a) => a.station))), [alerts]);

  useEffect(() => {
    if (!from || !to) return;
    const ctl = new AbortController(); setBusy(true);
    fetch("/api/routes", { method: "POST", body: JSON.stringify({ from: [from.lon, from.lat], to: [to.lon, to.lat], hourBucket, blockedStations: outStations, walkOnly }), signal: ctl.signal })
      .then((r) => r.json()).then(setResp).catch(() => {}).finally(() => setBusy(false));
    return () => ctl.abort();
  }, [from, to, hourBucket, outStations, walkOnly]);

  const onPick = useCallback((c: [number, number]) => {
    const pt: Pt = { lon: c[0], lat: c[1], label: "Dropped pin" };
    const set = pickNext === "from" ? setFrom : setTo;
    set(pt); setPickNext(pickNext === "from" ? "to" : "from");
    fetch(`/api/geocode?lon=${c[0]}&lat=${c[1]}`).then((r) => r.json()).then((j: { ok: boolean; hits?: Hit[] }) => {
      const h = j.ok ? j.hits?.[0] : null;
      if (h) set((cur) => (cur && cur.lon === pt.lon && cur.lat === pt.lat ? { ...cur, label: h.name === String(parseInt(h.name)) ? `${h.name} ${h.detail.split(",")[0]}` : h.name } : cur));
    }).catch(() => {});
  }, [pickNext]);
  const swap = () => { setFrom(to); setTo(from); };

  const routes = resp?.ok ? resp.routes : [];
  const chosen = routes.find((r) => r.id === selected && r.ok) ?? routes.find((r) => r.ok);
  const fastest = routes.find((r) => r.id === "fastest");
  const ghost = chosen && chosen.id !== "fastest" && fastest?.ok ? fastest.legs ?? null : null;
  const visiblePlaces: Place[] = useMemo(() => {
    if (!places) return [];
    if (selected === "shade") return places.cool;
    if (selected === "indoor") return places.warm;
    return [];
  }, [places, selected]);
  const outageMarkers = useMemo(() => alerts.filter((a) => a.lat !== null && a.lon !== null).map((a) => ({ lon: a.lon as number, lat: a.lat as number, station: a.station, detail: a.header.split(":").slice(1).join(":").trim() })), [alerts]);
  const badge = chosen?.ok && chosen.stats ? `${ICONS[chosen.id]} ${fmtMin(chosen.stats.time_s)} min` : null;

  return (
    <div className="flex h-dvh flex-col-reverse md:flex-row">
      {/* icon rail */}
      <nav className="flex shrink-0 items-center justify-around border-t border-zinc-200 bg-white px-2 py-1 md:w-[72px] md:flex-col md:justify-start md:gap-1 md:border-r md:border-t-0 md:py-3">
        <div className="hidden md:mb-2 md:block md:h-8 md:w-8 md:rounded-lg md:bg-blue-600 md:text-center md:text-lg md:leading-8 md:text-white">◈</div>
        {([["route", "🧭", "Route"], ["live", "📡", "Live"], ["about", "📊", "Evidence"]] as const).map(([id, icon, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg px-2 py-2 text-[10px] md:w-full md:flex-none ${tab === id ? "bg-blue-50 font-semibold text-blue-700" : "text-zinc-500 hover:bg-zinc-50"}`}>
            <span className="text-base leading-none">{icon}</span>{label}
          </button>
        ))}
      </nav>

      {/* panel */}
      <aside className={`relative flex w-full shrink-0 flex-col overflow-y-auto border-zinc-200 bg-white transition-[max-height] duration-300 md:max-h-none md:w-[392px] md:border-r ${sheet === "full" ? "max-h-[62dvh]" : "max-h-[34dvh]"}`}>
        <button onClick={() => setSheet((v) => (v === "full" ? "peek" : "full"))} aria-label="Resize panel" className="sticky top-0 z-30 flex w-full justify-center bg-white/95 py-1.5 backdrop-blur md:hidden">
          <span className="h-1 w-10 rounded-full bg-zinc-300" />
        </button>
        {tab === "route" && (
          <>
            <div className="hidden items-baseline gap-2 border-b border-zinc-200 px-3 py-2.5 md:flex">
              <h1 className="text-[15px] font-bold tracking-tight text-zinc-900">Exposure-aware routing</h1>
              <span className="text-[11px] text-zinc-500">downtown Toronto</span>
            </div>
            <div className="space-y-2.5 border-b border-zinc-200 p-3">
              <div className="flex items-stretch gap-2">
                <div className="flex-1 space-y-1.5 rounded-xl border border-zinc-300 p-2">
                  <PlaceInput color="#16a34a" placeholder="Choose a start" value={from} active={pickNext === "from"} onFocus={() => setPickNext("from")} onChange={setFrom} />
                  <div className="h-px bg-zinc-200" />
                  <PlaceInput color="#dc2626" placeholder="Choose a destination" value={to} active={pickNext === "to"} onFocus={() => setPickNext("to")} onChange={setTo} />
                </div>
                <button onClick={swap} title="Swap start and destination" className="shrink-0 self-center rounded-full border border-zinc-300 p-2 text-zinc-600 hover:bg-zinc-50">⇅</button>
              </div>
              <p className="px-1 text-[11px] text-zinc-500">Click the map to set the <strong>{pickNext === "from" ? "start" : "destination"}</strong>.</p>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => <button key={p.label} onClick={() => { setFrom(p.from); setTo(p.to); }} className="rounded-full border border-zinc-300 px-2.5 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50">{p.label}</button>)}
              </div>
              <label className="flex items-center gap-2 px-1 text-[12px] text-zinc-700"><input type="checkbox" checked={walkOnly} onChange={(e) => setWalkOnly(e.target.checked)} /> Walk only, no subway</label>
            </div>

            {weather && (
              <div className={`flex items-start gap-2 border-b px-3 py-2 text-[12px] ${weather.warnings.length ? "border-red-200 bg-red-50 text-red-900" : "border-zinc-200 bg-zinc-50 text-zinc-700"}`}>
                <span className="text-base leading-none">{weather.warnings.length ? "⚠️" : "🌡️"}</span>
                <div><strong>{weather.temp ?? "?"} °C</strong>{weather.humidex !== null ? `, humidex ${weather.humidex}` : ""}{weather.condition ? `, ${weather.condition.toLowerCase()}` : ""}<div className="text-[11px] opacity-80">{weather.reason}</div></div>
              </div>
            )}

            <div className="flex-1 divide-y divide-zinc-100">
              {resp && !resp.ok && <p className="p-3 text-[13px] text-red-700">{resp.error}</p>}
              {routes.map((r) => {
                const on = chosen?.id === r.id;
                const base = resp?.ok ? resp.baseline : null;
                // each strategy is judged on the metric it optimises
                const metric = r.id === "shade" ? "sun_m" : "outdoor_m";
                const d = r.ok && r.stats && base ? delta(r.stats[metric], base[metric]) : null;
                const metricLabel = r.id === "shade" ? "in sun" : "outdoors";
                return (
                  <button key={r.id} onClick={() => r.ok && setSelected(r.id)} disabled={!r.ok} className={`block w-full px-3 py-3 text-left transition ${on ? "border-l-4 border-blue-600 bg-blue-50/70 pl-2" : "border-l-4 border-transparent pl-2 hover:bg-zinc-50"} ${r.ok ? "" : "opacity-50"}`}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`text-[13px] font-semibold ${on ? "text-blue-800" : "text-zinc-800"}`}>{ICONS[r.id]} {r.label}</span>
                      {r.id === "stepfree" && r.ok
                        ? <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800">{r.blockedStations?.length ? `avoids ${r.blockedStations.length} station${r.blockedStations.length > 1 ? "s" : ""}` : "no stairs"}</span>
                        : d !== null && r.id !== "fastest" && <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${d < 0 ? "bg-green-100 text-green-800" : "bg-zinc-100 text-zinc-600"}`}>{d > 0 ? "+" : ""}{d}% {metricLabel}</span>}
                    </div>
                    {r.ok && r.stats ? (
                      <>
                        <div className="mt-1 flex items-baseline gap-1.5">
                          <span className="text-2xl font-bold tracking-tight text-zinc-900">{fmtMin(r.stats.time_s)}</span>
                          <span className="text-[13px] text-zinc-600">min</span>
                          <span className="text-zinc-300">·</span><span className="text-[13px] text-zinc-700">{fmtM(r.stats.distance_m)}</span>
                          <span className="text-zinc-300">·</span><span className="text-[13px] font-medium text-zinc-800">{r.id === "shade" ? `${fmtM(r.stats.sun_m)} in sun` : `${fmtM(r.stats.outdoor_m)} outdoors`}</span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-zinc-500">
                          {r.stats.indoor_m > 0 && <>{fmtM(r.stats.indoor_m)} indoor · </>}
                          {r.id === "shade" ? <>{fmtM(r.stats.outdoor_m)} outdoors · </> : r.stats.sun_m > 0 ? <>{fmtM(r.stats.sun_m)} in sun · </> : null}
                          {r.stats.steps_edges > 0 ? `${r.stats.steps_edges} stair sections` : "no stairs"}
                          {r.stats.transit_s > 0 && <> · {fmtMin(r.stats.transit_s)} min on subway</>}
                        </div>
                        <div className="mt-0.5 text-[11px] text-zinc-400">{r.hint}</div>
                      </>
                    ) : <div className="mt-1 text-[12px] text-red-700">{r.error}</div>}
                  </button>
                );
              })}
            </div>

            {selected === "shade" && (
              <div className="border-t border-amber-200 bg-amber-50 p-3 text-[12px]">
                <div className="flex items-center justify-between gap-2"><span className="font-medium text-amber-900">Sun position</span>
                  <select value={when.day} onChange={(e) => setWhen((w) => ({ ...w, day: e.target.value }))} className="rounded border border-amber-300 bg-white px-1.5 py-0.5">{DAYS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select></div>
                <div className="mt-1.5 flex items-center gap-2"><span className="text-amber-800">8:00</span><input type="range" min={0} max={HOURS.length - 1} value={HOURS.indexOf(when.hour)} onChange={(e) => setWhen((w) => ({ ...w, hour: HOURS[+e.target.value] }))} className="flex-1 accent-amber-600" /><strong className="w-11 text-right text-amber-900">{when.hour}:00</strong></div>
                <p className="mt-1 text-[11px] text-amber-800">Shade comes from Toronto 3D building massing and the sun&apos;s position. Blue dots are Heat Relief Network cool spaces.</p>
              </div>
            )}
            {chosen?.ok && chosen.blockedStations && chosen.blockedStations.length > 0 && chosen.id === "stepfree" && (
              <p className="border-t border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-900">Avoiding {chosen.blockedStations.length} station{chosen.blockedStations.length > 1 ? "s" : ""} with an elevator out right now: {chosen.blockedStations.join(", ")}.</p>
            )}
            <Legend busy={busy} ms={resp?.ok ? resp.ms : null} />
          </>
        )}

        {tab === "live" && (
          <div className="space-y-3 p-3 text-[13px]">
            <h2 className="font-semibold text-zinc-800">TTC elevators out of service <span className="text-zinc-400">({alerts.length})</span></h2>
            <ul className="space-y-1.5">
              {alerts.map((a) => (
                <li key={a.id} className="rounded-lg border border-zinc-200 p-2">
                  <div className="flex items-baseline justify-between gap-2"><strong className="text-zinc-800">{a.station}</strong><span className="text-[11px] text-zinc-500">{a.code}</span></div>
                  <div className="text-[11px] text-zinc-600">{a.causeDesc ?? a.cause ?? a.planned}{a.targetRemoval ? ` · until ${a.targetRemoval.slice(0, 10)}` : ""}</div>
                </li>
              ))}
              {alerts.length === 0 && <li className="text-zinc-500">No elevator outages reported.</li>}
            </ul>
            <p className="text-[11px] text-zinc-500">Live from the TTC alerts feed. Step-free routes skip these stations automatically.</p>
          </div>
        )}

        {tab === "about" && (
          <div className="space-y-3 p-3 text-[13px] leading-relaxed text-zinc-700">
            <h2 className="text-base font-semibold text-zinc-900">Why this exists</h2>
            <p>A broken elevator, an icy block, or 300 m of direct sun is an inconvenience for some people and a barrier for others. Routing apps optimise for time and treat all of it as walking.</p>
            <p>This one costs the trip by <strong>exposure</strong>: minutes outdoors in the cold, metres in direct sun, stairs, and stations whose elevator is out at this moment.</p>
            <div className="rounded-lg border border-zinc-200 p-2.5">
              <div className="text-[12px] font-semibold text-zinc-800">Measured over 120 random downtown trips</div>
              <ul className="mt-1 space-y-0.5 text-[12px]">
                <li>Indoor first: <strong>−27 %</strong> outdoor distance for +4.4 % time</li>
                <li>Shade first: <strong>−50 %</strong> direct-sun distance for +4.6 % time</li>
                <li>Step-free: 5 of 120 trips have <strong>no</strong> step-free route</li>
              </ul>
            </div>
            <a href="/evidence" className="inline-block rounded-lg bg-blue-600 px-3 py-2 text-[13px] font-medium text-white">Full evidence and method →</a>
            <p className="text-[11px] text-zinc-500">Data: OpenStreetMap, City of Toronto (3D Massing, Heat Relief Network, GTFS), TTC live alerts, Environment and Climate Change Canada.</p>
          </div>
        )}
      </aside>

      <div className="relative min-h-0 flex-1"><RouteMap from={from ? [from.lon, from.lat] : null} to={to ? [to.lon, to.lat] : null} legs={chosen?.legs ?? null} ghostLegs={ghost} badge={badge} outages={outageMarkers} places={visiblePlaces} onPick={onPick} /></div>
    </div>
  );
}

function PlaceInput({ color, placeholder, value, active, onFocus, onChange }: { color: string; placeholder: string; value: Pt | null; active: boolean; onFocus: () => void; onChange: (p: Pt) => void }) {
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!editing || text.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(() => {
      setLoading(true);
      fetch(`/api/geocode?q=${encodeURIComponent(text)}`).then((r) => r.json()).then((j: { ok: boolean; hits?: Hit[] }) => setHits(j.ok ? j.hits ?? [] : [])).catch(() => setHits([])).finally(() => setLoading(false));
    }, 350);
    return () => clearTimeout(t);
  }, [text, editing]);

  const choose = (h: Hit) => { onChange({ lon: h.lon, lat: h.lat, label: h.name }); setEditing(false); setText(""); setHits([]); };

  return (
    <div className="relative">
      <div className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${active ? "bg-blue-50 ring-1 ring-blue-300" : ""}`}>
        <span className="h-2.5 w-2.5 shrink-0 rounded-full border-2" style={{ borderColor: color }} />
        {editing ? (
          <input autoFocus value={text} onChange={(e) => setText(e.target.value)} onBlur={() => setTimeout(() => setEditing(false), 180)}
            onKeyDown={(e) => { if (e.key === "Enter" && hits[0]) choose(hits[0]); if (e.key === "Escape") setEditing(false); }}
            placeholder="Search a place or address" className="w-full bg-transparent text-[13px] outline-none placeholder:text-zinc-400" />
        ) : (
          <button onClick={() => { onFocus(); setEditing(true); }} className="w-full truncate text-left text-[13px]">
            <span className={value ? "text-zinc-800" : "text-zinc-400"}>{value?.label ?? placeholder}</span>
          </button>
        )}
      </div>
      {editing && (hits.length > 0 || loading) && (
        <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg">
          {loading && hits.length === 0 && <li className="px-3 py-2 text-[12px] text-zinc-400">Searching…</li>}
          {hits.map((h, i) => (
            <li key={i}><button onMouseDown={(e) => e.preventDefault()} onClick={() => choose(h)} className="block w-full px-3 py-1.5 text-left hover:bg-blue-50">
              <div className="truncate text-[13px] text-zinc-800">{h.name}</div><div className="truncate text-[11px] text-zinc-500">{h.detail}</div>
            </button></li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Legend({ busy, ms }: { busy: boolean; ms: number | null }) {
  const items: [string, string][] = [["#2563eb", "indoor"], ["#0ea5e9", "covered"], ["#16a34a", "shaded"], ["#f97316", "exposed"], ["#f2c31c", "subway"], ["#94a3b8", "fastest (dashed)"]];
  return (
    <div className="border-t border-zinc-200 px-3 py-2">
      <div className="flex flex-wrap gap-x-2.5 gap-y-1 text-[10px] text-zinc-600">{items.map(([c, l]) => <span key={l} className="inline-flex items-center gap-1"><span className="inline-block h-1.5 w-3.5 rounded" style={{ background: c }} />{l}</span>)}</div>
      <div className="mt-1 text-[10px] text-zinc-400">{busy ? "computing…" : ms !== null ? `4 routes computed in ${ms} ms` : ""}</div>
    </div>
  );
}
