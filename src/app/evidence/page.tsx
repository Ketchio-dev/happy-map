import { readFileSync } from "node:fs";
import path from "node:path";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface ScenarioSummary { pairs: number; failed: number; median_outdoor_reduction: number | null; mean_outdoor_reduction: number; median_sun_reduction: number | null; median_time_increase: number | null; share_with_any_outdoor_reduction: number; median_baseline_outdoor_m: number | null; median_route_outdoor_m: number | null; median_stairs_baseline: number | null; median_stairs_route: number | null }
interface Eval { meta: { n: number; area: string; bbox: number[]; generated: string }; summary: Record<string, ScenarioSummary> }
interface Outages { summary: { logging: { first: string; last: string; hoursCovered: number; snapshotsWithChange: number }; distinctAlerts: number; elevatorAlerts: number; escalatorAlerts: number; elevatorUnplanned: number; elevatorOngoingNow: number; stationsWithElevatorOutage: number; byStation: Record<string, number>; medianElevatorOutageAgeHours: number | null }; alerts: { id: string; station: string; type: string; code: string | null; planned: string; unplanned: boolean; causeDesc: string | null; observedHours: number; sinceFeedStartHours: number | null; ongoing: boolean; header: string }[] }

interface Sidewalks { generated: string; source: string; roadway_km_before: number; sidewalk_present_km: number; no_sidewalk_confirmed_km: number; outside_inventory_km: number; roadway_km_after: number; edges_checked: number }
interface Impact { meta: { n: number; usable: number; generated: string; outagesThrough: string }; impact: Record<string, { trips_using_station: number; share_of_trips: number; trips_no_route: number; trips_longer: number; median_added_min: number | null; outages_logged: number; breakdowns_logged: number; outage_hours_logged: number }> }

function load<T>(file: string): T | null { try { return JSON.parse(readFileSync(path.join(process.cwd(), "research", file), "utf8")) as T; } catch { return null; } }
// The outage summary is recomputed and committed by the logger on the VPS every time the
// TTC feed changes, so the live page reads it from the repository rather than from the
// copy frozen at deploy time. The bundled copy is the fallback.
const RAW = "https://raw.githubusercontent.com/Ketchio-dev/happy-map/main/research/";
async function loadLive<T>(file: string): Promise<T | null> {
  try {
    const r = await fetch(RAW + file, { next: { revalidate: 600 } });
    if (r.ok) return (await r.json()) as T;
  } catch { /* offline or rate-limited: fall through */ }
  return load<T>(file);
}
const pct = (x: number | null | undefined, sign = true) => x === null || x === undefined ? "—" : `${sign && x > 0 ? "+" : ""}${Math.round(x * 100)}%`;
const LABELS: Record<string, string> = { cold: "Indoor first", heat_jul15_14h: "Shade first, July 15 14:00", heat_sep15_12h: "Shade first, Sept 15 12:00", stepfree: "Step-free" };

export default async function Evidence() {
  const core = load<Eval>("eval-core.json");
  const wide = load<Eval>("eval-wide.json");
  const ev = core ?? wide;
  const out = await loadLive<Outages>("outages-summary.json");
  const sw = load<Sidewalks>("sidewalks-summary.json");
  const imp = load<Impact>("outage-impact.json");
  const impactRows = imp ? Object.entries(imp.impact).filter(([, v]) => v.trips_using_station > 0).sort((a, b) => b[1].trips_longer - a[1].trips_longer).slice(0, 10) : [];
  return (
    <main className="mx-auto max-w-4xl space-y-8 p-6 text-[13.5px] leading-relaxed text-ink-soft">
      <header>
        <Link href="/" className="text-[12px] text-muted hover:text-ink">← back to the map</Link>
        <h1 className="mt-2 text-[26px] font-semibold tracking-[-0.02em] text-ink">Evidence</h1>
        <p className="text-ink-soft">Everything here is computed from open and live data. No human testers were involved; numbers are reproducible with the scripts in <code>tools/</code>.</p>
      </header>

      <section>
        <h2 className="text-lg font-medium">1. How much exposure does the router remove?</h2>
        {ev ? (
          <>
            <p className="mt-1 text-ink-soft">Random trips with both ends on sidewalks, each routed in every mode and compared against the plain fastest route. Run twice: once inside the PATH-dense financial district, once across the whole covered area. Generated {ev.meta.generated.slice(0, 16).replace("T", " ")} UTC.</p>
            {([["Downtown core, where the PATH is", core], ["Across the city, Etobicoke to Scarborough", wide]] as const).filter(([, e]) => e).map(([title, e]) => (
              <div key={title} className="mt-4">
                <h3 className="text-[13px] font-semibold text-ink-soft">{title} <span className="font-normal text-muted">· {e!.meta.n} trips</span></h3>
                <div className="mt-1.5 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="border-b border-line text-left text-muted"><th className="py-1 font-normal">Mode</th><th className="font-normal">Median outdoor distance</th><th className="font-normal">Median direct-sun distance</th><th className="font-normal">Trips improved</th><th className="font-normal">Median extra time</th><th className="font-normal">No route</th></tr></thead>
                    <tbody>
                      {Object.entries(e!.summary).map(([k, sc]) => (
                        <tr key={k} className="border-b border-line"><td className="py-1.5 font-medium">{LABELS[k] ?? k}</td><td>{sc.median_baseline_outdoor_m} m → {sc.median_route_outdoor_m} m ({pct(sc.median_outdoor_reduction === null ? null : -sc.median_outdoor_reduction)})</td><td>{pct(sc.median_sun_reduction === null ? null : -sc.median_sun_reduction)}</td><td>{pct(sc.share_with_any_outdoor_reduction, false)}</td><td>{pct(sc.median_time_increase)}</td><td>{sc.failed}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
            <p className="mt-3 rounded-lg border border-line bg-sunk p-2.5 text-[12.5px] text-ink-soft">The gap between the two tables is the result. Inside the financial district a sheltered alternative usually exists, so indoor routing removes about a third of the outdoor walking. Across the rest of the city it removes almost none, because there is nothing to route onto. Shade routing degrades more gently, since tall buildings cast usable shadows well beyond the PATH.</p>
            <p className="mt-2 text-xs text-muted">Step-free mode never changes exposure by design; its finding is the number of trips with no step-free route at all, and the stations it must avoid when elevators are out.</p>
          </>
        ) : <p className="text-alert">No evaluation file found. Run <code>node tools/evaluate.mjs</code>.</p>}
      </section>

      <section>
        <h2 className="text-lg font-medium">2. TTC elevator outages, as logged</h2>
        {out ? (
          <>
            <p className="mt-1 text-ink-soft">The TTC alerts feed is polled every 5 minutes since {out.summary.logging.first.slice(0, 16).replace("T", " ")} UTC ({out.summary.logging.hoursCovered} h so far). Each alert runs from the start time the feed reports until the first poll that no longer lists it.</p>
            <dl className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              {([["Distinct elevator alerts", out.summary.elevatorAlerts], ["Unplanned", out.summary.elevatorUnplanned], ["Stations affected", out.summary.stationsWithElevatorOutage], ["Out of service right now", out.summary.elevatorOngoingNow], ["Escalator alerts", out.summary.escalatorAlerts], ["Median outage age (h)", out.summary.medianElevatorOutageAgeHours ?? "—"]] as const).map(([k, v]) => (
                <div key={k} className="rounded-lg border border-line bg-surface p-3"><div className="tnum text-2xl font-semibold text-ink">{v}</div><div className="text-xs text-muted">{k}</div></div>
              ))}
            </dl>
            <table className="mt-4 w-full text-xs">
              <thead><tr className="border-b border-line text-left text-muted"><th className="py-1 font-normal">Station</th><th className="font-normal">Unit</th><th className="font-normal">Kind</th><th className="font-normal">Cause</th><th className="font-normal">Duration (h)</th><th className="font-normal">Status</th></tr></thead>
              <tbody>{out.alerts.filter((a) => a.type === "Elevator").sort((a, b) => (b.sinceFeedStartHours ?? 0) - (a.sinceFeedStartHours ?? 0)).map((a) => (
                <tr key={a.id} className="border-b border-line"><td className="py-1">{a.station}</td><td>{a.code}</td><td>{a.unplanned ? "breakdown" : "planned"}</td><td>{a.causeDesc ?? "—"}</td><td>{a.sinceFeedStartHours ?? "—"}</td><td>{a.ongoing ? <span className="text-alert">out now</span> : "restored"}</td></tr>
              ))}</tbody>
            </table>
          </>
        ) : <p className="text-alert">No outage summary found. Run <code>node tools/analyze-outages.mjs</code>.</p>}
      </section>

      <section>
        <h2 className="text-lg font-medium">3. Where OpenStreetMap was wrong about sidewalks</h2>
        {sw ? (
          <>
            <p className="mt-1 text-ink-soft">OpenStreetMap only says whether a sidewalk was mapped. The City of Toronto&apos;s Pedestrian Network says, per road segment, whether one exists. <code>tools/apply-pednet.mjs</code> checks every road the map had flagged as sidewalk-less against the nearest City segment within 15 m.</p>
            <dl className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              {([["Flagged by OpenStreetMap", `${sw.roadway_km_before.toLocaleString()} km`], ["Has a sidewalk after all", `${sw.sidewalk_present_km.toLocaleString()} km`], ["Confirmed: no sidewalk", `${sw.no_sidewalk_confirmed_km.toLocaleString()} km`], ["Not in the inventory", `${sw.outside_inventory_km.toLocaleString()} km`]] as const).map(([k, v]) => (
                <div key={k} className="rounded-lg border border-line bg-surface p-3"><div className="tnum text-2xl font-semibold text-ink">{v}</div><div className="text-xs text-muted">{k}</div></div>
              ))}
            </dl>
            <p className="mt-2 text-xs text-muted">Of the kilometres the inventory does not answer for, 3,530 km lie outside Toronto&apos;s limits and 2,193 km are service roads and lanes inside the city that the inventory does not cover. The router now penalises 6,888 km, not 11,441 km, and 4,553 km of Toronto streets stopped being treated as walking in traffic.</p>
          </>
        ) : <p className="text-alert">No sidewalk summary found. Run <code>node tools/apply-pednet.mjs</code>.</p>}
      </section>

      <section>
        <h2 className="text-lg font-medium">4. What one broken elevator does</h2>
        {imp ? (
          <>
            <p className="mt-1 text-ink-soft">{imp.meta.usable} random step-free trips of 3 to 12 km across the city, walk plus subway. For every station with a logged outage, the same trips are routed again with that station&apos;s elevator out. Nobody is stranded, because the router walks around the gap, but the detours are long. <code>tools/outage-impact.mjs</code>, outages through {imp.meta.outagesThrough.slice(0, 10)}.</p>
            <table className="mt-3 w-full text-xs">
              <thead><tr className="border-b border-line text-left text-muted"><th className="py-1 font-normal">Station</th><th className="font-normal">Trips through it</th><th className="font-normal">Made longer</th><th className="font-normal">Median added</th><th className="font-normal">Outages logged</th><th className="font-normal">Of which breakdowns</th></tr></thead>
              <tbody>{impactRows.map(([st, v]) => (
                <tr key={st} className="border-b border-line"><td className="py-1 font-medium text-ink">{st}</td><td className="tnum">{v.trips_using_station} · {Math.round(v.share_of_trips * 100)}%</td><td className="tnum">{v.trips_longer}</td><td className="tnum">{v.median_added_min === null ? "—" : `+${v.median_added_min.toFixed(0)} min`}</td><td className="tnum">{v.outages_logged}</td><td className="tnum">{v.breakdowns_logged}</td></tr>
              ))}</tbody>
            </table>
          </>
        ) : <p className="text-alert">No impact file found. Run <code>node tools/outage-impact.mjs</code>.</p>}
      </section>

      <section>
        <h2 className="text-lg font-medium">5. Data and method</h2>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-soft">
          <li><strong>Pedestrian graph:</strong> OpenStreetMap ways across the City of Toronto and its margins, 346k nodes and 492k edges covering 24,225 km. Indoor, tunnel, covered and corridor tags mark 95 km of sheltered walking including the PATH; the City&apos;s Pedestrian Network corrects OpenStreetMap&apos;s sidewalk gaps (section 3), leaving 6,888 km of roadway penalised as sidewalk-less; 486 km is loose or unpaved.</li>
          <li><strong>Shade:</strong> City of Toronto 3D Massing (2025) building heights; for each outdoor segment and each hour bucket a ray is cast toward the sun (NOAA solar position) and blocked if a building is tall enough. Trees are not included, so shade is under-estimated.</li>
          <li><strong>Subway:</strong> TTC GTFS (Lines 1, 2, 4), median inter-station times, legs drawn along the recorded track geometry, stations linked to OpenStreetMap entrances. In step-free mode a station is unusable while the TTC feed lists an elevator out of service there.</li>
          <li><strong>Weather:</strong> Environment and Climate Change Canada city page feed; heat or cold warnings switch the default mode.</li>
          <li><strong>Cost model:</strong> indoor mode weights outdoor time ×2.5 and covered ×1.3; shade mode weights outdoor time ×(1 + 1.8 × sun fraction). Roadway with no sidewalk ×1.35, loose surface ×1.15, steep grades up to ×1.24 — each harsher in step-free mode. Stairs ×1.6 for walkers and forbidden in step-free mode. The fastest feasible route is always computed alongside for comparison.</li>
        </ul>
      </section>
    </main>
  );
}
