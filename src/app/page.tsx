"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import dynamicImport from "next/dynamic";
import type { Leg, Stats } from "@/lib/router";
import type { Place, PlacesFile } from "@/lib/types";
import type { AccessibilityAlert } from "./api/alerts/route";
import type { Weather } from "./api/weather/route";
import type { Hit } from "./api/geocode/route";
import { Bolt, Indoor, Sun, Accessible, Swap, Walk, Train, Stairs, Lift, Door } from "@/components/icons";
import { itinerary, type Step } from "@/lib/itinerary";
import type { ReachResult } from "@/lib/reach";

const RouteMap = dynamicImport(() => import("@/components/RouteMap"), { ssr: false });

interface RouteOpt { id: string; label: string; hint: string; ok: boolean; error?: string; legs?: Leg[]; stats?: Stats; blockedStations?: string[] }
interface RoutesResp { ok: true; ms: number; baseline: Stats | null; routes: RouteOpt[] }

export interface Pt { lon: number; lat: number; label: string }
const P = (lon: number, lat: number, label: string): Pt => ({ lon, lat, label });
const PRESETS: { label: string; from: Pt; to: Pt }[] = [
  { label: "Eaton Centre", from: P(-79.3791, 43.6435, "Scotiabank Arena"), to: P(-79.3806, 43.6544, "CF Toronto Eaton Centre") },
  { label: "Toronto General", from: P(-79.3806, 43.6453, "Union Station"), to: P(-79.3878, 43.6588, "Toronto General Hospital") },
  { label: "City Hall", from: P(-79.3846, 43.6476, "St Andrew Station"), to: P(-79.3839, 43.6534, "Toronto City Hall") },
  { label: "Bloor-Yonge", from: P(-79.3806, 43.6453, "Union Station"), to: P(-79.3864, 43.6708, "Bloor-Yonge Station") },
  { label: "Etobicoke", from: P(-79.5252, 43.6449, "Kipling Station"), to: P(-79.3806, 43.6453, "Union Station") },
  { label: "Scarborough", from: P(-79.2634, 43.7325, "Kennedy Station"), to: P(-79.3806, 43.6453, "Union Station") },
];
const DAYS = [{ id: "d0715", label: "July 15" }, { id: "d0915", label: "Sept 15" }];
const HOURS = [8, 10, 12, 14, 16, 18];
// walking pace in m/s; "auto" leaves the router's defaults (1.3, or 1.0 step-free)
const PACES = [["auto", "Auto", null], ["slow", "Slow", 0.9], ["avg", "Average", 1.3], ["brisk", "Brisk", 1.5]] as const;
type PaceId = (typeof PACES)[number][0];
const REACH_MIN = [10, 15, 20, 30] as const;
const REACH_OUT = [2, 5, 10, null] as const;
type Tab = "route" | "reach" | "live" | "about";
const ICON: Record<string, (p: { className?: string }) => React.ReactElement> = { fastest: Bolt, indoor: Indoor, shade: Sun, stepfree: Accessible };

const fmtM = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`);
const fmtMin = (s: number) => `${Math.max(1, Math.round(s / 60))}`;
const pctLess = (a: number, b: number) => (b === 0 ? null : Math.round(((b - a) / b) * 100));
const ago = (iso: string | null) => {
  if (!iso) return null;
  const h = (Date.now() - Date.parse(iso)) / 3.6e6;
  if (!isFinite(h) || h < 0) return null;
  return h < 1 ? `${Math.max(1, Math.round(h * 60))} min ago` : h < 48 ? `${Math.round(h)} h ago` : `${Math.round(h / 24)} d ago`;
};
const sentence = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase().replace(/^./, (c) => c.toUpperCase());

// A shared link restores the whole question: places, strategy, hour, walk-only.
const ptParam = (v: string | null): Pt | null => { const a = v?.split(","); if (!a || a.length < 2) return null; const lon = +a[0], lat = +a[1]; return isFinite(lon) && isFinite(lat) ? { lon, lat, label: a.slice(2).join(",") || "Dropped pin" } : null; };

export default function Page() {
  return <Suspense><Home /></Suspense>;
}

function Home() {
  const q = useSearchParams();
  // read once: Next mirrors our own replaceState writes back into the search params
  const [urlMode] = useState(() => q.get("mode"));
  const [from, setFrom] = useState<Pt | null>(() => ptParam(q.get("from")) ?? PRESETS[0].from);
  const [to, setTo] = useState<Pt | null>(() => ptParam(q.get("to")) ?? PRESETS[0].to);
  const [pickNext, setPickNext] = useState<"from" | "to">("from");
  const [tab, setTab] = useState<Tab>(() => (["route", "reach", "live", "about"].includes(q.get("tab") ?? "") ? (q.get("tab") as Tab) : "route"));
  const [reachOpts, setReachOpts] = useState<{ min: number; out: number | null; stepFree: boolean }>(() => ({ min: REACH_MIN.find((m) => m === +(q.get("rmin") ?? 0)) ?? 15, out: q.get("rout") === "none" ? null : REACH_OUT.find((o) => o !== null && o === +(q.get("rout") ?? 0)) ?? 5, stepFree: q.get("rsf") === "1" }));
  const [reach, setReach] = useState<ReachResult | null>(null);
  const [selected, setSelected] = useState(urlMode && urlMode in ICON ? urlMode : "indoor");
  const [walkOnly, setWalkOnly] = useState(q.get("walk") !== "0");
  const [pace, setPace] = useState<PaceId>(() => (PACES.some((p) => p[0] === q.get("pace")) ? (q.get("pace") as PaceId) : "auto"));
  const speed = PACES.find((p) => p[0] === pace)?.[2] ?? null;
  const [when, setWhen] = useState(() => { const h = q.get("hour")?.match(/^(d\d{4})_h(\d{2})$/); return h ? { day: h[1], hour: +h[2] } : { day: new Date().getMonth() + 1 >= 6 && new Date().getMonth() + 1 <= 8 ? "d0715" : "d0915", hour: 14 }; });
  const [resp, setResp] = useState<RoutesResp | { ok: false; error: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [alerts, setAlerts] = useState<AccessibilityAlert[]>([]);
  const [escalators, setEscalators] = useState<AccessibilityAlert[]>([]);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [places, setPlaces] = useState<PlacesFile | null>(null);
  const [sheet, setSheet] = useState<"peek" | "full">("full");

  const hourBucket = `${when.day}_h${String(when.hour).padStart(2, "0")}`;
  // keep the address bar shareable
  useEffect(() => {
    if (!from || !to) return;
    const u = new URLSearchParams();
    const enc = (p: Pt) => `${p.lon.toFixed(5)},${p.lat.toFixed(5)},${p.label}`;
    u.set("from", enc(from)); u.set("to", enc(to)); u.set("mode", selected); u.set("hour", hourBucket); if (!walkOnly) u.set("walk", "0"); if (pace !== "auto") u.set("pace", pace);
    if (tab !== "route") u.set("tab", tab);
    if (tab === "reach") { u.set("rmin", String(reachOpts.min)); u.set("rout", reachOpts.out === null ? "none" : String(reachOpts.out)); if (reachOpts.stepFree) u.set("rsf", "1"); }
    window.history.replaceState(null, "", `?${u.toString().replace(/%2C/g, ",")}`);
  }, [from, to, selected, hourBucket, walkOnly, pace, tab, reachOpts]);


  useEffect(() => { fetch("/api/alerts").then((r) => r.json()).then((j) => { if (j.ok) { setAlerts(j.elevators); setEscalators(j.escalators); } }).catch(() => {}); }, []);
  useEffect(() => { fetch("/api/weather").then((r) => r.json()).then((w: Weather | { ok: false }) => { if (w.ok) { setWeather(w); if (urlMode) return; if (w.suggested.heat) setSelected("shade"); else if (w.suggested.cold) setSelected("indoor"); } }).catch(() => {}); }, [urlMode]);
  useEffect(() => { fetch("/data/places.json").then((r) => r.json()).then(setPlaces).catch(() => {}); }, []);

  const outStations = useMemo(() => Array.from(new Set(alerts.filter((a) => /out of service/i.test(a.effect)).map((a) => a.station))), [alerts]);

  // reach: everything within the budgets from the start point
  useEffect(() => {
    if (tab !== "reach" || !from) return;
    const ctl = new AbortController();
    fetch("/api/reach", { method: "POST", body: JSON.stringify({ from: [from.lon, from.lat], maxMin: reachOpts.min, maxOutdoorMin: reachOpts.out, mobility: reachOpts.stepFree, walkOnly, speed: speed ?? undefined, hourBucket, blockedStations: outStations }), signal: ctl.signal })
      .then((r) => r.json()).then((j: ReachResult | { ok: false }) => setReach(j.ok ? j : null)).catch(() => {});
    return () => ctl.abort();
  }, [tab, from, reachOpts, walkOnly, speed, hourBucket, outStations]);

  useEffect(() => {
    if (!from || !to) return;
    const ctl = new AbortController(); setBusy(true);
    fetch("/api/routes", { method: "POST", body: JSON.stringify({ from: [from.lon, from.lat], to: [to.lon, to.lat], hourBucket, blockedStations: outStations, walkOnly, speed: speed ?? undefined }), signal: ctl.signal })
      .then((r) => r.json()).then(setResp).catch(() => {}).finally(() => setBusy(false));
    return () => ctl.abort();
  }, [from, to, hourBucket, outStations, walkOnly, speed]);

  const onPick = useCallback((c: [number, number]) => {
    const pt: Pt = { lon: c[0], lat: c[1], label: "Dropped pin" };
    const set = tab === "reach" || pickNext === "from" ? setFrom : setTo;
    set(pt); if (tab !== "reach") setPickNext(pickNext === "from" ? "to" : "from");
    fetch(`/api/geocode?lon=${c[0]}&lat=${c[1]}`).then((r) => r.json()).then((j: { ok: boolean; hits?: Hit[] }) => {
      const h = j.ok ? j.hits?.[0] : null;
      if (h) set((cur) => (cur && cur.lon === pt.lon && cur.lat === pt.lat ? { ...cur, label: /^\d+$/.test(h.name) ? `${h.name} ${h.detail.split(",")[0]}` : h.name } : cur));
    }).catch(() => {});
  }, [pickNext, tab]);
  const onLocate = useCallback((c: [number, number]) => {
    const pt: Pt = { lon: +c[0].toFixed(6), lat: +c[1].toFixed(6), label: "My location" };
    setFrom(pt); setPickNext("to");
    fetch(`/api/geocode?lon=${pt.lon}&lat=${pt.lat}`).then((r) => r.json()).then((j: { ok: boolean; hits?: Hit[] }) => {
      const h = j.ok ? j.hits?.[0] : null;
      if (h) setFrom((cur) => (cur && cur.lon === pt.lon && cur.lat === pt.lat ? { ...cur, label: /^\d+$/.test(h.name) ? `${h.name} ${h.detail.split(",")[0]}` : h.name } : cur));
    }).catch(() => {});
  }, []);
  const swap = () => { setFrom(to); setTo(from); };

  const routes = resp?.ok ? resp.routes : [];
  const chosen = routes.find((r) => r.id === selected && r.ok) ?? routes.find((r) => r.ok);
  const fastest = routes.find((r) => r.id === "fastest");
  const ghost = chosen && chosen.id !== "fastest" && fastest?.ok ? fastest.legs ?? null : null;
  const visiblePlaces: Place[] = useMemo(() => (!places ? [] : selected === "shade" ? places.cool : selected === "indoor" ? places.warm : []), [places, selected]);
  const outageMarkers = useMemo(() => alerts.filter((a) => a.lat !== null && a.lon !== null).map((a) => ({ lon: a.lon as number, lat: a.lat as number, station: a.station, detail: sentence(a.header.split(":").slice(1).join(":")) })), [alerts]);
  const summary = chosen?.ok && chosen.stats ? `${chosen.label} · ${fmtMin(chosen.stats.time_s)} min` : null;
  const affected = useMemo(() => new Set((chosen?.blockedStations ?? []).map((s) => s.toLowerCase())), [chosen]);
  const steps = useMemo(() => (chosen?.ok && chosen.legs ? itinerary(chosen.legs) : null), [chosen]);

  return (
    <div className="flex h-dvh flex-col-reverse md:flex-row">
      <aside className={`relative flex w-full shrink-0 flex-col overflow-y-auto border-line bg-surface transition-[max-height] duration-300 md:max-h-none md:w-[400px] md:border-r ${sheet === "full" ? "max-h-[62dvh]" : "max-h-[32dvh]"}`}>
        <button onClick={() => setSheet((v) => (v === "full" ? "peek" : "full"))} aria-label="Resize panel" className="sticky top-0 z-30 flex w-full justify-center bg-surface/95 py-1.5 backdrop-blur md:hidden">
          <span className="h-1 w-10 rounded-full bg-line" />
        </button>

        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur">
          <h1 className="text-[15px] font-semibold tracking-[-0.02em]">happy map<span className="ml-1.5 font-normal text-muted">Toronto</span></h1>
          <nav className="-mb-px flex gap-3.5" role="tablist" aria-label="Panels">
            {([["route", "Route"], ["reach", "Reach"], ["live", "Live"], ["about", "About"]] as const).map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} aria-controls={`panel-${id}`} id={`tab-${id}`} onClick={() => setTab(id)} className={`border-b-2 py-2.5 text-[13px] transition ${tab === id ? "border-ink font-semibold" : "border-transparent text-muted hover:text-ink-soft"}`}>{label}</button>
            ))}
          </nav>
        </header>

        {/* what changed, for screen readers: the chosen route in one sentence */}
        <p className="sr-only" aria-live="polite" aria-atomic="true">{busy ? "Computing routes" : chosen?.ok && chosen.stats ? `${chosen.label}: ${fmtMin(chosen.stats.time_s)} minutes, ${fmtM(chosen.stats.distance_m)}, ${chosen.id === "shade" ? `${fmtM(chosen.stats.sun_m)} in sun` : `${fmtM(chosen.stats.outdoor_m)} outdoors`}${chosen.stats.steps_edges ? `, ${chosen.stats.steps_edges} flights of stairs` : ", no stairs"}` : resp && !resp.ok ? resp.error : ""}</p>

        {tab === "route" && (
          <div role="tabpanel" id="panel-route" aria-labelledby="tab-route">
            <div className="space-y-2.5 border-b border-line px-4 py-3">
              <div className="flex rounded-lg bg-sunk p-0.5 text-[12px]">
                {([[false, Train, "Walk + subway"], [true, Walk, "Walk only"]] as const).map(([v, Icon, label]) => {
                  const best = v === walkOnly ? chosen?.stats : null;
                  return (
                    <button key={label} onClick={() => setWalkOnly(v)} aria-pressed={walkOnly === v}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 transition ${walkOnly === v ? "bg-surface font-medium shadow-[0_1px_2px_rgba(0,0,0,0.07)]" : "text-muted hover:text-ink-soft"}`}>
                      <Icon className="h-3.5 w-3.5" />{label}
                      {best && <span className="tnum text-muted">{fmtMin(best.time_s)} min</span>}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
                <span className="pr-0.5 text-muted">Pace</span>
                {PACES.map(([id, label, mps]) => (
                  <button key={id} onClick={() => setPace(id)} aria-pressed={pace === id} title={mps ? `${mps} m/s` : "1.3 m/s, or 1.0 m/s step-free"}
                    className={`h-6 rounded-full px-2 transition ${pace === id ? "bg-sunk font-medium ring-1 ring-ink" : "text-ink-soft hover:text-ink"}`}>{label}</button>
                ))}
              </div>

              <div className="flex items-stretch gap-2">
                <div className="relative flex-1 rounded-lg border border-line">
                  <span aria-hidden className="absolute left-[17px] top-[27px] h-4 border-l border-dotted border-line" />
                  <PlaceInput dot="#146c36" placeholder="Start — or click the map" value={from} active={pickNext === "from"} onFocus={() => setPickNext("from")} onChange={setFrom} />
                  <div className="mx-2.5 h-px bg-line" />
                  <PlaceInput dot="#b91c1c" placeholder="Destination — or click the map" value={to} active={pickNext === "to"} onFocus={() => setPickNext("to")} onChange={setTo} />
                </div>
                <button onClick={swap} title="Swap start and destination" className="shrink-0 self-center rounded-lg border border-line p-2 text-muted transition hover:bg-sunk hover:text-ink"><Swap className="h-4 w-4" /></button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="pr-0.5 text-[11px] text-muted">Try</span>
                {PRESETS.map((p) => {
                  const on = from?.label === p.from.label && to?.label === p.to.label;
                  return (
                    <button key={p.label} onMouseDown={(e) => e.preventDefault()} onClick={() => { setFrom(p.from); setTo(p.to); }} aria-pressed={on} aria-label={`${p.from.label} to ${p.to.label}`}
                      className={`h-7 whitespace-nowrap rounded-full px-2.5 text-[11.5px] transition ${on ? "bg-sunk font-medium ring-1 ring-ink" : "bg-sunk text-ink-soft hover:text-ink"}`}>
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="divide-y divide-line">
              {resp && !resp.ok && <p className="px-4 py-3 text-[13px] text-alert">{resp.error}</p>}
              {routes.map((r) => {
                const on = chosen?.id === r.id;
                const base = resp?.ok ? resp.baseline : null;
                const metric = r.id === "shade" ? "sun_m" : "outdoor_m";
                const less = r.ok && r.stats && base ? pctLess(r.stats[metric], base[metric]) : null;
                const Icon = ICON[r.id];
                return (
                  <button key={r.id} onClick={() => r.ok && setSelected(r.id)} disabled={!r.ok} aria-pressed={on} title={r.ok ? r.hint : r.error}
                    className={`block w-full py-3 pr-4 text-left transition ${on ? "border-l-[3px] border-ink bg-sunk pl-[13px]" : "border-l-[3px] border-transparent pl-[13px] hover:bg-sunk/60"} ${r.ok ? "" : "opacity-45"}`}>
                    <span className="flex items-center gap-2">
                      <span className={`grid w-5 shrink-0 place-items-center ${on ? "text-ink" : "text-muted"}`}><Icon className="h-4 w-4" /></span>
                      <span className={`text-[14px] font-semibold ${on ? "text-ink" : "text-ink-soft"}`}>{r.label}</span>
                      {r.id === "indoor" && r.ok && (r.stats?.indoor_m ?? 0) > 200 && <span className="rounded bg-surface px-1.5 py-px text-[10px] font-medium text-ink-soft ring-1 ring-line">PATH</span>}
                    </span>
                    {r.ok && r.stats ? (
                      <>
                        <div className="mt-1 flex items-baseline gap-1 pl-7">
                          <span className="tnum text-[32px] font-semibold leading-none tracking-[-0.045em]">{fmtMin(r.stats.time_s)}</span>
                          <span className="text-[13px] text-muted">min</span>
                          <span className="tnum ml-2 text-[13px] text-muted">{fmtM(r.stats.distance_m)}</span>
                        </div>
                        <div className="tnum mt-1.5 pl-7 text-[13px] text-ink-soft">
                          <span className="font-semibold text-ink">{r.id === "shade" ? `${fmtM(r.stats.sun_m)} in sun` : `${fmtM(r.stats.outdoor_m)} outdoors`}</span>
                          {less !== null && less > 2 && r.id !== "fastest" && <span className="text-[#146c36]"> · {less}% less than fastest</span>}
                          {r.stats.indoor_m > 0 && <> · {fmtM(r.stats.indoor_m)} indoor</>}
                          {r.stats.roadway_m > 0 && <> · {fmtM(r.stats.roadway_m)} no sidewalk</>}
                          {r.stats.steps_edges > 0 ? <> · {r.stats.steps_edges} stairs</> : r.id === "stepfree" ? <> · no stairs</> : null}
                          {r.stats.transit_s > 0 && <> · {fmtMin(r.stats.transit_s)} min riding</>}
                        </div>
                        {r.id === "stepfree" && (r.blockedStations?.length ?? 0) > 0 && (
                          <div className="mt-1 pl-7 text-[12px] text-alert">Skips {r.blockedStations!.slice(0, 3).join(", ")}{r.blockedStations!.length > 3 ? ` +${r.blockedStations!.length - 3}` : ""} — elevator out</div>
                        )}
                      </>
                    ) : <div className="mt-1 pl-7 text-[12.5px] text-alert">{r.error}</div>}
                  </button>
                );
              })}
            </div>

            {selected === "shade" && (
              <div className="border-t border-line px-4 py-3 text-[12px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">Sun position</span>
                  <select value={when.day} onChange={(e) => setWhen((w) => ({ ...w, day: e.target.value }))} className="rounded-md border border-line bg-surface px-1.5 py-0.5">{DAYS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select>
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-muted">
                  <span className="tnum">8:00</span>
                  <input type="range" min={0} max={HOURS.length - 1} value={HOURS.indexOf(when.hour)} onChange={(e) => setWhen((w) => ({ ...w, hour: HOURS[+e.target.value] }))} className="flex-1 accent-[#17150f]" />
                  <strong className="tnum w-11 text-right text-ink">{when.hour}:00</strong>
                </div>
              </div>
            )}
            {steps && chosen && <StepList steps={steps} label={chosen.label} />}
            <Legend busy={busy} ms={resp?.ok ? resp.ms : null} />
          </div>
        )}

        {tab === "reach" && (
          <div role="tabpanel" id="panel-reach" aria-labelledby="tab-reach" className="px-4 py-3">
            <div className="flex items-center gap-2 text-[13px]"><span className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-[#146c36]" /><span className="truncate font-medium">{from?.label ?? "Click the map to set a start"}</span></div>
            <p className="mt-0.5 text-[11px] text-muted">Click the map to move the start</p>
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11.5px]">
              <span className="w-[86px] text-muted">Minutes</span>
              {REACH_MIN.map((m) => <button key={m} onClick={() => setReachOpts((o) => ({ ...o, min: m }))} aria-pressed={reachOpts.min === m} className={`h-6 rounded-full px-2.5 transition ${reachOpts.min === m ? "bg-sunk font-medium ring-1 ring-ink" : "text-ink-soft hover:text-ink"}`}>{m}</button>)}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11.5px]">
              <span className="w-[86px] text-muted">Outdoors, max</span>
              {REACH_OUT.map((o) => <button key={String(o)} onClick={() => setReachOpts((v) => ({ ...v, out: o }))} aria-pressed={reachOpts.out === o} className={`h-6 rounded-full px-2.5 transition ${reachOpts.out === o ? "bg-sunk font-medium ring-1 ring-ink" : "text-ink-soft hover:text-ink"}`}>{o === null ? "no cap" : `${o} min`}</button>)}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11.5px]">
              <span className="w-[86px] text-muted">Rider</span>
              <button onClick={() => setReachOpts((v) => ({ ...v, stepFree: false }))} aria-pressed={!reachOpts.stepFree} className={`h-6 rounded-full px-2.5 transition ${!reachOpts.stepFree ? "bg-sunk font-medium ring-1 ring-ink" : "text-ink-soft hover:text-ink"}`}>Anyone</button>
              <button onClick={() => setReachOpts((v) => ({ ...v, stepFree: true }))} aria-pressed={reachOpts.stepFree} className={`h-6 rounded-full px-2.5 transition ${reachOpts.stepFree ? "bg-sunk font-medium ring-1 ring-ink" : "text-ink-soft hover:text-ink"}`}>Step-free</button>
            </div>
            {reach && (
              <div className="mt-4">
                <div className="flex items-baseline gap-1"><span className="tnum text-[32px] font-semibold leading-none tracking-[-0.045em]">{reach.area_km2.toFixed(1)}</span><span className="text-[13px] text-muted">km² reachable</span></div>
                <div className="tnum mt-1.5 text-[13px] text-ink-soft">{reach.unconstrained_km2.toFixed(1)} km² with no outdoor cap and every elevator working</div>
                {reach.lost_km2 > 0 && <div className="tnum mt-0.5 text-[13px] text-alert">{reach.lost_km2.toFixed(1)} km² lost{reachOpts.stepFree && outStations.length ? ` · ${outStations.length} station${outStations.length > 1 ? "s" : ""} with the elevator out` : ""}</div>}
                <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-muted">
                  <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 rounded-sm bg-ink/60" />reachable, darker is closer</span>
                  <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 rounded-sm bg-[#a8331f]/40" />lost to the cap or an outage</span>
                </div>
                <div className="tnum mt-2 text-[10.5px] text-muted">{`${reach.cells.length + reach.lost.length} cells of ${reach.cellM} m in ${reach.ms} ms`}</div>
              </div>
            )}
          </div>
        )}

        {tab === "live" && (
          <div role="tabpanel" id="panel-live" aria-labelledby="tab-live">
            {summary && <div className="border-b border-line px-4 py-2.5 text-[12.5px] text-ink-soft">Showing <span className="font-semibold text-ink">{summary}</span>{from && to ? <> · {from.label} → {to.label}</> : null}</div>}
            <div className="px-4 pb-1 pt-3">
              <h2 className="text-[13px] font-semibold">Elevators out of service <span className="tnum font-normal text-muted">{alerts.length}</span></h2>
              <p className="mt-0.5 text-[11px] text-muted">TTC alerts · live</p>
            </div>
            <ul className="divide-y divide-line">
              {alerts.map((a) => <AlertRow key={a.id} a={a} onRoute={affected.has(a.station.toLowerCase())} />)}
              {alerts.length === 0 && <li className="px-4 py-3 text-[13px] text-muted">Every elevator is reporting in service.</li>}
            </ul>
            <div className="px-4 pb-1 pt-4">
              <h2 className="text-[13px] font-semibold">Escalators out of service <span className="tnum font-normal text-muted">{escalators.length}</span></h2>
              <p className="mt-0.5 text-[11px] text-muted">stairs instead · shown, not routed around</p>
            </div>
            <ul className="divide-y divide-line">
              {escalators.map((a) => <AlertRow key={a.id} a={a} onRoute={false} />)}
              {escalators.length === 0 && <li className="px-4 py-3 text-[13px] text-muted">Every escalator is reporting in service.</li>}
            </ul>
          </div>
        )}

        {tab === "about" && (
          <div role="tabpanel" id="panel-about" aria-labelledby="tab-about" className="space-y-3 px-4 py-4 text-[13px] leading-relaxed text-ink-soft">
            <p>A broken elevator, an icy block, or 300 m of open sun is an inconvenience for some people and a barrier for others. Routing apps optimise for time and treat all of it as walking.</p>
            <p>happy map costs a trip by <span className="font-semibold text-ink">exposure</span>: minutes outdoors, metres in direct sun, stairs, blocks with no sidewalk, and stations whose elevator is out right now.</p>
            <div className="rounded-lg border border-line p-3">
              <div className="text-[12px] font-semibold text-ink">150 random trips, downtown core</div>
              <ul className="mt-1.5 space-y-1 text-[12.5px]">
                {([[Indoor, "Indoor first", "32% less outdoor distance, 7.6% more time"], [Sun, "Shade first", "47% less distance in direct sun, 6.0% more time"], [Accessible, "Step-free", "8 trips had no step-free route at all"]] as const).map(([Icon, k, v]) => (
                  <li key={k} className="flex items-start gap-2"><Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" /><span><span className="font-medium text-ink">{k}</span> — {v}</span></li>
                ))}
              </ul>
              <p className="mt-2 text-[11.5px] text-muted">Across the whole city the indoor gain falls to nothing: sheltered walking barely exists outside the financial district. Shade routing holds up better, and counting the City&apos;s 685,000 street trees doubled its city-wide effect from 5% to 10% less sun. OpenStreetMap had no sidewalk on 47% of the network; checked against the City&apos;s sidewalk inventory, 4,553 km of that has a sidewalk after all and 1,165 km truly has none. Where the elevator matters most: with Bloor-Yonge&apos;s out, 1 in 4 step-free trips gets 30 minutes longer.</p>
            </div>
            <a href="/evidence" className="inline-block rounded-lg bg-ink px-3 py-2 text-[13px] font-medium text-white">Evidence and method</a>
            <p className="text-[11px] text-muted">OpenStreetMap · City of Toronto 3D Massing, Heat Relief Network, TTC GTFS · TTC live alerts · Environment and Climate Change Canada.</p>
          </div>
        )}
        <div className="h-16 shrink-0" />
      </aside>

      <main className="relative min-h-0 flex-1" aria-label="Map">
        <RouteMap from={from ? [from.lon, from.lat] : null} to={tab === "reach" || !to ? null : [to.lon, to.lat]} legs={tab === "reach" ? null : chosen?.legs ?? null} ghostLegs={tab === "reach" ? null : ghost}
          badge={tab !== "reach" && chosen?.ok && chosen.stats ? `${chosen.label} · ${fmtMin(chosen.stats.time_s)} min` : null}
          weather={weather} outages={outageMarkers} places={tab === "reach" ? [] : visiblePlaces} onPick={onPick} onLocate={onLocate} reach={tab === "reach" ? reach : null} />
      </main>
    </div>
  );
}

function PlaceInput({ dot, placeholder, value, active, onFocus, onChange }: { dot: string; placeholder: string; value: Pt | null; active: boolean; onFocus: () => void; onChange: (p: Pt) => void }) {
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
      <div className={`m-0.5 flex items-center gap-2.5 rounded-md px-2 py-1.5 ${active ? "ring-2 ring-ink" : ""}`}>
        <span className="h-2.5 w-2.5 shrink-0 rounded-full border-2" style={{ borderColor: dot }} />
        {editing ? (
          <input autoFocus value={text} onChange={(e) => setText(e.target.value)} onBlur={() => setTimeout(() => setEditing(false), 180)}
            onKeyDown={(e) => { if (e.key === "Enter" && hits[0]) choose(hits[0]); if (e.key === "Escape") setEditing(false); }}
            placeholder="Search a place or address" className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted" />
        ) : (
          <button onClick={() => { onFocus(); setEditing(true); }} className="w-full truncate text-left text-[13px]">
            <span className={value ? "" : "text-muted"}>{value?.label ?? placeholder}</span>
          </button>
        )}
      </div>
      {editing && (hits.length > 0 || loading) && (
        <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-lg border border-line bg-surface py-1 shadow-lg">
          {loading && hits.length === 0 && <li className="px-3 py-2 text-[12px] text-muted">Searching…</li>}
          {hits.map((h, i) => (
            <li key={i}><button onMouseDown={(e) => e.preventDefault()} onClick={() => choose(h)} className="block w-full px-3 py-1.5 text-left hover:bg-sunk">
              <div className="truncate text-[13px]">{h.name}</div><div className="truncate text-[11px] text-muted">{h.detail}</div>
            </button></li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AlertRow({ a, onRoute }: { a: AccessibilityAlert; onRoute: boolean }) {
  return (
    <li className={`flex items-start gap-2.5 py-2.5 pr-4 ${onRoute ? "border-l-[3px] border-alert bg-alert-bg pl-[13px]" : "border-l-[3px] border-transparent pl-[13px]"}`}>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium">{a.station}</div>
        <div className="text-[11.5px] text-muted">{sentence(a.causeDesc ?? a.cause ?? a.planned)}{onRoute ? " · on your route" : ""}</div>
      </div>
      <div className="tnum shrink-0 pt-0.5 text-[11px] text-muted">{ago(a.start)}</div>
    </li>
  );
}

/** the route as moves a person can follow or hear; for a screen reader this is the map */
function StepList({ steps, label }: { steps: Step[]; label: string }) {
  const icon = (s: Step) => (s.kind === "ride" ? Train : s.kind === "stairs" ? Stairs : s.kind === "elevator" ? Lift : s.kind === "walk" ? Walk : Door);
  const timed = (s: Step) => s.kind !== "walk" && s.kind !== "stairs";
  return (
    <section className="border-t border-line px-4 py-3" aria-labelledby="steps-heading">
      <h2 id="steps-heading" className="text-[13px] font-semibold">Steps <span className="font-normal text-muted">{label}</span></h2>
      <ol className="mt-2 space-y-1.5">
        {steps.map((s, i) => {
          const Icon = icon(s);
          return (
            <li key={i} className="flex items-start gap-2.5 text-[12.5px]">
              <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
              <span className="min-w-0 flex-1 text-ink-soft">{s.text}</span>
              <span className="tnum shrink-0 text-muted">{timed(s) ? `${fmtMin(s.time_s)} min` : fmtM(s.len_m)}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Legend({ busy, ms }: { busy: boolean; ms: number | null }) {
  const items: [string, string][] = [["#2b5fa8", "indoor"], ["#3d7f96", "covered"], ["#5b4b8a", "shaded"], ["#c2410c", "open sun"], ["#a8a294", "fastest"]];
  const lines: [string, string][] = [["#e5b611", "Line 1"], ["#12823f", "Line 2"], ["#8f2060", "Line 4"]];
  return (
    <div className="border-t border-line px-4 py-2.5">
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-muted">
        {items.map(([c, l]) => <span key={l} className="inline-flex items-center gap-1.5"><span className="inline-block h-1.5 w-4 rounded-full" style={{ background: c }} />{l}</span>)}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-muted">
        {lines.map(([c, l]) => <span key={l} className="inline-flex items-center gap-1.5"><span className="inline-block h-1.5 w-4 rounded-full" style={{ background: c }} />{l}</span>)}
      </div>
      <div className="tnum mt-1 text-[10.5px] text-muted">{busy ? "computing…" : ms !== null ? `four routes in ${ms} ms` : ""}</div>
    </div>
  );
}
