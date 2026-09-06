/** Replay of the logged TTC accessibility feed. research/outages-summary.json holds one
 *  record per alert with the start the feed reported and the first poll that no longer
 *  listed it, which is enough to say what was out at any instant since logging began. */
export interface LoggedAlert {
  id: string; station: string; type: string; code: string | null; planned: string; unplanned: boolean;
  cause: string | null; causeDesc: string | null; header: string;
  /** first poll that saw it, feed-reported start, first poll that no longer listed it */
  first: string; feedStart: string | null; end: string | null; ongoing: boolean;
}
export interface OutageSummary { summary: { logging: { first: string; last: string } }; alerts: LoggedAlert[] }

const startOf = (a: LoggedAlert) => Date.parse(a.feedStart ?? a.first);
const endOf = (a: LoggedAlert) => (a.end ? Date.parse(a.end) : Infinity);

/** alerts in effect at instant t (ms since epoch) */
export function activeAt(alerts: LoggedAlert[], t: number): LoggedAlert[] {
  return alerts.filter((a) => startOf(a) <= t && t < endOf(a));
}

/** elevator count over time, one point per change; the scrubber draws this */
export function timeline(alerts: LoggedAlert[], from: number, to: number): [number, number][] {
  const elev = alerts.filter((a) => a.type === "Elevator");
  const marks = new Set<number>([from, to]);
  for (const a of elev) { const s = startOf(a), e = endOf(a); if (s >= from && s <= to) marks.add(s); if (isFinite(e) && e >= from && e <= to) marks.add(e); }
  return [...marks].sort((x, y) => x - y).map((t) => [t, activeAt(elev, t).length]);
}

/** the instant with the most elevators out at once, earliest on ties */
export function busiest(alerts: LoggedAlert[], from: number, to: number): { t: number; n: number } {
  let best = { t: from, n: -1 };
  for (const [t, n] of timeline(alerts, from, to)) if (n > best.n) best = { t, n };
  return best;
}
