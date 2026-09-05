import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { color } from "../theme";

const ease = (frame: number, fps: number, delay = 0) => spring({ frame: frame - delay, fps, config: { damping: 200, stiffness: 120 } });

export const Title = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = ease(frame, fps);
  const b = ease(frame, fps, 8);
  return (
    <AbsoluteFill style={{ background: color.ground, justifyContent: "center", alignItems: "flex-start", padding: "0 220px" }}>
      <div style={{ fontSize: 132, fontWeight: 600, letterSpacing: -5, color: color.ink, opacity: a, transform: `translateY(${(1 - a) * 30}px)` }}>happy map</div>
      <div style={{ fontSize: 44, color: color.inkSoft, marginTop: 10, opacity: b, transform: `translateY(${(1 - b) * 20}px)` }}>
        exposure-aware routing across Toronto
      </div>
    </AbsoluteFill>
  );
};

// The four exposures, one label at a time, over the map footage.
export const Layers = ({ durationInFrames }: { durationInFrames: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const items = ["Minutes outdoors", "Metres in direct sun", "Stairs and kerbs", "Elevator out right now"];
  const step = durationInFrames / (items.length + 0.6);
  return (
    <AbsoluteFill style={{ alignItems: "flex-end", padding: "120px 120px 0 0" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {items.map((label, i) => {
          const s = ease(frame, fps, Math.round(i * step));
          return (
            <div key={label} style={{
              opacity: s, transform: `translateX(${(1 - s) * 40}px)`, background: color.surface, color: color.ink,
              border: `1.5px solid ${color.line}`, borderRadius: 14, padding: "18px 30px", fontSize: 40, fontWeight: 500,
              boxShadow: "0 8px 30px rgba(23,21,15,0.12)", alignSelf: "flex-end",
            }}>{label}</div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// Fastest vs indoor: the headline number counts down from 800 m to 16 m.
export const NumberCard = ({ durationInFrames }: { durationInFrames: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = ease(frame, fps);
  const p = interpolate(frame, [fps * 0.9, fps * 2.6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const m = Math.round(800 - (800 - 16) * (1 - Math.pow(1 - p, 3)));
  const c = ease(frame, fps, Math.round(fps * 2.8));
  const lab = { fontSize: 34, color: color.muted, letterSpacing: 0.5, textTransform: "uppercase" as const };
  return (
    <AbsoluteFill style={{ background: color.ground, justifyContent: "center", alignItems: "center" }}>
      <div style={{ opacity: a, transform: `translateY(${(1 - a) * 24}px)`, textAlign: "center" }}>
        <div style={lab}>Scotiabank Arena → Eaton Centre · outdoors</div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 40, marginTop: 8 }}>
          <div style={{ fontSize: 90, color: color.muted, textDecoration: "line-through", fontVariantNumeric: "tabular-nums" }}>800 m</div>
          <div style={{ fontSize: 260, fontWeight: 600, letterSpacing: -10, color: color.ink, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{m} m</div>
        </div>
        <div style={{ display: "flex", gap: 60, justifyContent: "center", marginTop: 30, opacity: c }}>
          <div style={{ fontSize: 48, color: color.ink }}>−98 % outdoors</div>
          <div style={{ fontSize: 48, color: color.inkSoft }}>+1 min</div>
        </div>
      </div>
      <div style={{ position: "absolute", top: 150, fontSize: 30, color: color.muted, opacity: c }}>indoor first, via PATH · measured by tools/evaluate.mjs</div>
    </AbsoluteFill>
  );
};

export const Outro = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = ease(frame, fps);
  const b = ease(frame, fps, 12);
  return (
    <AbsoluteFill style={{ background: color.ground, justifyContent: "center", alignItems: "center" }}>
      <div style={{ opacity: a, textAlign: "center" }}>
        <div style={{ fontSize: 72, fontWeight: 600, color: color.ink, letterSpacing: -2 }}>happy-map-ashy.vercel.app</div>
        <div style={{ fontSize: 40, color: color.inkSoft, marginTop: 14 }}>github.com/Ketchio-dev/happy-map</div>
      </div>
      <div style={{ position: "absolute", bottom: 90, fontSize: 26, color: color.muted, opacity: b, textAlign: "center", maxWidth: 1200 }}>
        Narration synthesized on my laptop from a 19-second recording of my own voice (Fish Audio S2 Pro). Every number is computed from open and live data.
      </div>
    </AbsoluteFill>
  );
};
