import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface ScenarioSummary { pairs: number; failed: number; median_outdoor_reduction: number | null; mean_outdoor_reduction: number; median_sun_reduction: number | null; median_time_increase: number | null; share_with_any_outdoor_reduction: number; median_baseline_outdoor_m: number | null; median_route_outdoor_m: number | null; median_stairs_baseline: number | null; median_stairs_route: number | null }
interface Eval { meta: { n: number; generated: string }; summary: Record<string, ScenarioSummary> }
interface Outages { summary: { logging: { first: string; last: string; hoursCovered: number; snapshotsWithChange: number }; distinctAlerts: number; elevatorAlerts: number; escalatorAlerts: number; elevatorUnplanned: number; elevatorOngoingNow: number; stationsWithElevatorOutage: number; byStation: Record<string, number>; medianElevatorOutageAgeHours: number | null }; alerts: { id: string; station: string; type: string; code: string | null; planned: string; causeDesc: string | null; observedHours: number; sinceFeedStartHours: number | null; ongoing: boolean; header: string }[] }

function load<T>(file: string): T | null { try { return JSON.parse(readFileSync(path.join(process.cwd(), "research", file), "utf8")) as T; } catch { return null; } }
const pct = (x: number | null | undefined, sign = true) => x === null || x === undefined ? "—" : `${sign && x > 0 ? "+" : ""}${Math.round(x * 100)}%`;
const LABELS: Record<string, string> = { cold: "❄️ Cold (prefer indoor)", heat_jul15_14h: "☀️ Heat, July 15 14:00", heat_sep15_12h: "☀️ Heat, Sept 15 12:00", stepfree: "♿ Step-free" };

export default function Evidence() {
  const evalFile = (() => { try { return readdirSync(path.join(process.cwd(), "research")).filter((f) => /^eval-.*\.json$/.test(f)).sort().pop() ?? null; } catch { return null; } })();
  const ev = evalFile ? load<Eval>(evalFile) : null;
  const out = load<Outages>("outages-summary.json");
  return (
    <main className="mx-auto max-w-4xl space-y-8 p-6 text-sm text-zinc-800">
      <header>
        <Link href="/" className="text-xs text-blue-700 hover:underline">← back to the map</Link>
        <h1 className="mt-2 text-2xl font-semibold">Evidence</h1>
        <p className="text-zinc-600">Everything here is computed from open and live data. No human testers were involved; numbers are reproducible with the scripts in <code>tools/</code>.</p>
      </header>

      <section>
        <h2 className="text-lg font-medium">1. How much exposure does the router remove?</h2>
        {ev ? (
          <>
            <p className="mt-1 text-zinc-600">{ev.meta.n} random downtown trips (0.5–2.5 km, origin and destination on sidewalks in the PATH-dense core), each routed in every mode and compared against the plain fastest route. Generated {ev.meta.generated.slice(0, 16).replace("T", " ")} UTC.</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="border-b border-zinc-300 text-left text-zinc-500"><th className="py-1 font-normal">Mode</th><th className="font-normal">Trips</th><th className="font-normal">Median outdoor distance</th><th className="font-normal">Median direct-sun distance</th><th className="font-normal">Trips with less outdoor time</th><th className="font-normal">Median extra time</th><th className="font-normal">No route</th></tr></thead>
                <tbody>
                  {Object.entries(ev.summary).map(([k, s]) => (
                    <tr key={k} className="border-b border-zinc-100"><td className="py-1.5 font-medium">{LABELS[k] ?? k}</td><td>{s.pairs}</td><td>{s.median_baseline_outdoor_m} m → {s.median_route_outdoor_m} m ({pct(s.median_outdoor_reduction === null ? null : -s.median_outdoor_reduction)})</td><td>{pct(s.median_sun_reduction === null ? null : -s.median_sun_reduction)}</td><td>{pct(s.share_with_any_outdoor_reduction, false)}</td><td>{pct(s.median_time_increase)}</td><td>{s.failed}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-zinc-500">Step-free mode never changes exposure by design; its finding is the number of trips with no step-free route at all, and the stations it must avoid when elevators are out.</p>
          </>
        ) : <p className="text-red-700">No evaluation file found. Run <code>node tools/evaluate.mjs</code>.</p>}
      </section>

      <section>
        <h2 className="text-lg font-medium">2. TTC elevator outages, as logged</h2>
        {out ? (
          <>
            <p className="mt-1 text-zinc-600">The TTC alerts feed is polled every 60 s since {out.summary.logging.first.slice(0, 16).replace("T", " ")} UTC ({out.summary.logging.hoursCovered} h so far). Each distinct alert is tracked from first sight to last sight.</p>
            <dl className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              {([["Distinct elevator alerts", out.summary.elevatorAlerts], ["Unplanned", out.summary.elevatorUnplanned], ["Stations affected", out.summary.stationsWithElevatorOutage], ["Out of service right now", out.summary.elevatorOngoingNow], ["Escalator alerts", out.summary.escalatorAlerts], ["Median outage age (h)", out.summary.medianElevatorOutageAgeHours ?? "—"]] as const).map(([k, v]) => (
                <div key={k} className="rounded-lg border border-zinc-200 bg-white p-3"><div className="text-2xl font-semibold">{v}</div><div className="text-xs text-zinc-500">{k}</div></div>
              ))}
            </dl>
            <table className="mt-4 w-full text-xs">
              <thead><tr className="border-b border-zinc-300 text-left text-zinc-500"><th className="py-1 font-normal">Station</th><th className="font-normal">Unit</th><th className="font-normal">Planned?</th><th className="font-normal">Cause</th><th className="font-normal">Age since feed start (h)</th><th className="font-normal">Status</th></tr></thead>
              <tbody>{out.alerts.filter((a) => a.type === "Elevator").sort((a, b) => (b.sinceFeedStartHours ?? 0) - (a.sinceFeedStartHours ?? 0)).map((a) => (
                <tr key={a.id} className="border-b border-zinc-100"><td className="py-1">{a.station}</td><td>{a.code}</td><td>{a.planned}</td><td>{a.causeDesc ?? "—"}</td><td>{a.sinceFeedStartHours ?? "—"}</td><td>{a.ongoing ? <span className="text-red-700">out now</span> : "restored"}</td></tr>
              ))}</tbody>
            </table>
          </>
        ) : <p className="text-red-700">No outage summary found. Run <code>node tools/analyze-outages.mjs</code>.</p>}
      </section>

      <section>
        <h2 className="text-lg font-medium">3. Data and method</h2>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-zinc-700">
          <li><strong>Pedestrian graph:</strong> OpenStreetMap ways in downtown Toronto (32.9k nodes, 48.3k edges); indoor / tunnel / covered / corridor tags mark 38.8 km of sheltered walking including the PATH.</li>
          <li><strong>Shade:</strong> City of Toronto 3D Massing (2025) building heights; for each outdoor segment and each hour bucket a ray is cast toward the sun (NOAA solar position) and blocked if a building is tall enough. Trees are not included, so shade is under-estimated.</li>
          <li><strong>Subway:</strong> TTC GTFS (Lines 1, 2, 4) with median inter-station times; stations linked to OSM subway entrances. In step-free mode a station is unusable while the TTC feed lists an elevator out of service there.</li>
          <li><strong>Weather:</strong> Environment and Climate Change Canada city page feed; heat or cold warnings switch the default mode.</li>
          <li><strong>Cost model:</strong> cold mode weights outdoor time ×2.5 and covered ×1.3; heat mode weights outdoor time ×(1 + 1.8 × sun fraction). Stairs ×1.6 for walkers, forbidden in step-free mode. The fastest feasible route is always computed alongside for comparison.</li>
        </ul>
      </section>
    </main>
  );
}
