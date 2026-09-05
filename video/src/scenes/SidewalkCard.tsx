import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import sw from "../../../research/sidewalks-summary.json";
import { wordAt, type Cue } from "../narration";
import { color } from "../theme";

const ease = (frame: number, fps: number, delay = 0) => spring({ frame: frame - delay, fps, config: { damping: 200, stiffness: 120 } });
const count = (frame: number, fps: number, from: number, to: number, start: number, dur = 1.4) => {
  const p = interpolate(frame, [start * fps, (start + dur) * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return Math.round(to + (from - to) * Math.pow(1 - p, 3));
};

// The map checks itself: the OpenStreetMap flag against the City's sidewalk inventory.
export const SidewalkCard = ({ cue }: { cue: Cue }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tHalf = wordAt(cue, "half", 0.4), tCity = wordAt(cue, "city", 0.62) - 0.1;
  const a = ease(frame, fps);
  const b = ease(frame, fps, Math.round(tHalf * fps));
  const c = ease(frame, fps, Math.round(tCity * fps));
  const km = (n: number) => n.toLocaleString("en-CA");
  const cell = (n: number, label: string, at: number, on: number, tone = color.ink) => (
    <div style={{ opacity: on, transform: `translateY(${(1 - on) * 20}px)`, minWidth: 440 }}>
      <div style={{ fontSize: 120, fontWeight: 600, letterSpacing: -5, color: tone, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{km(count(frame, fps, 0, n, at))}<span style={{ fontSize: 48, fontWeight: 500, marginLeft: 12, color: color.muted }}>km</span></div>
      <div style={{ fontSize: 30, color: color.inkSoft, marginTop: 14 }}>{label}</div>
    </div>
  );
  return (
    <AbsoluteFill style={{ background: color.ground, justifyContent: "center", padding: "0 160px" }}>
      <div style={{ fontSize: 32, color: color.muted, letterSpacing: 0.5, textTransform: "uppercase", opacity: a }}>Roads flagged as sidewalk-less · checked against the City of Toronto inventory</div>
      <div style={{ display: "flex", gap: 90, marginTop: 44, alignItems: "flex-end" }}>
        {cell(sw.roadway_km_before, "flagged by OpenStreetMap", tHalf - 0.2, b, color.muted)}
        {cell(sw.sidewalk_present_km, "has a sidewalk after all", tCity, c)}
        {cell(sw.no_sidewalk_confirmed_km, "confirmed: no sidewalk", tCity + 0.3, c, color.alert)}
      </div>
      <div style={{ fontSize: 28, color: color.muted, marginTop: 60, opacity: c }}>tools/apply-pednet.mjs · the rest lies outside the inventory or on lanes it does not cover</div>
    </AbsoluteFill>
  );
};
