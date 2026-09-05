import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import summary from "../../../research/outages-summary.json";
import impactFile from "../../../research/outage-impact.json";
import { color } from "../theme";

interface Alert { station: string; type: string; first: string; end: string | null; feedStart: string | null; unplanned: boolean }
const impact = (impactFile as { impact: Record<string, { share_of_trips: number; trips_longer: number; median_added_min: number | null }> }).impact;
const data = summary as { summary: { logging: { first: string; last: string; hoursCovered: number }; elevatorAlerts: number; stationsWithElevatorOutage: number }; alerts: Alert[] };

// Every logged elevator outage as a bar on a shared time axis, revealed by a sweeping playhead.
export const OutageTimeline = ({ durationInFrames }: { durationInFrames: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { logging } = data.summary;
  const t0 = Date.parse(logging.first), t1 = Date.parse(logging.last);
  const elev = data.alerts.filter((a) => a.type === "Elevator");
  const stations = Array.from(new Set(elev.map((a) => a.station)));
  const left = 400, right = 1430, top = 275, rowH = Math.min(26, 560 / stations.length);
  const x = (iso: string) => left + ((Math.max(Date.parse(iso), t0) - t0) / (t1 - t0)) * (right - left);
  const head = interpolate(frame, [fps * 0.4, durationInFrames * 0.85], [left, right], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const a = spring({ frame, fps, config: { damping: 200 } });
  const days = [];
  for (let d = new Date(t0); d.getTime() < t1; d.setUTCDate(d.getUTCDate() + 1)) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
    if (m.getTime() < t1) days.push(m);
  }
  return (
    <AbsoluteFill style={{ background: color.ground, padding: "110px 120px 0", opacity: a }}>
      <div style={{ fontSize: 30, color: color.muted, letterSpacing: 0.5, textTransform: "uppercase" }}>TTC elevator outages, logged every 5 minutes</div>
      <div style={{ fontSize: 60, fontWeight: 600, color: color.ink, letterSpacing: -1.5, marginTop: 6 }}>
        {data.summary.elevatorAlerts} alerts · {data.summary.stationsWithElevatorOutage} stations · {Math.round(logging.hoursCovered)} h
      </div>
      <svg width={1920} height={1000} style={{ position: "absolute", left: 0, top: 0 }}>
        {days.map((d) => (
          <g key={d.toISOString()}>
            <line x1={x(d.toISOString())} x2={x(d.toISOString())} y1={top - 20} y2={top + stations.length * rowH} stroke={color.line} strokeWidth={1.5} />
            <text x={x(d.toISOString()) + 8} y={top - 28} fontSize={22} fill={color.muted}>{d.toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" })}</text>
          </g>
        ))}
        {stations.map((s, i) => (
          <text key={s} x={left - 18} y={top + i * rowH + rowH * 0.7} fontSize={Math.min(22, rowH * 0.75)} fill={color.inkSoft} textAnchor="end">{s}</text>
        ))}
        {elev.map((al, i) => {
          const xs = x(al.first), xe = x(al.end ?? logging.last);
          if (xs > head) return null;
          const w = Math.max(3, Math.min(xe, head) - xs);
          const row = stations.indexOf(al.station);
          return <rect key={i} x={xs} y={top + row * rowH + rowH * 0.2} width={w} height={rowH * 0.6} rx={3} fill={al.unplanned ? color.alert : color.muted} opacity={al.unplanned ? 0.95 : 0.55} />;
        })}
        <line x1={head} x2={head} y1={top - 20} y2={top + stations.length * rowH} stroke={color.ink} strokeWidth={2} />
        {Object.entries(impact).filter(([s]) => stations.includes(s)).sort((a, b) => b[1].trips_longer - a[1].trips_longer).slice(0, 3).map(([s, v]) => {
          const row = stations.indexOf(s);
          const show = interpolate(frame, [durationInFrames * 0.86, durationInFrames * 0.86 + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          return <text key={s} x={right + 14} y={top + row * rowH + rowH * 0.72} fontSize={22} fontWeight={600} fill={color.alert} opacity={show}>{`${Math.round(v.share_of_trips * 100)} % of step-free trips · +${v.median_added_min?.toFixed(0)} min when out`}</text>;
        })}
      </svg>
      <div style={{ position: "absolute", left: 120, bottom: 200, display: "flex", gap: 36, fontSize: 26, color: color.inkSoft }}>
        <span><span style={{ display: "inline-block", width: 26, height: 14, background: color.alert, borderRadius: 3, marginRight: 10 }} />breakdown</span>
        <span><span style={{ display: "inline-block", width: 26, height: 14, background: color.muted, opacity: 0.55, borderRadius: 3, marginRight: 10 }} />scheduled work</span>
      </div>
    </AbsoluteFill>
  );
};
