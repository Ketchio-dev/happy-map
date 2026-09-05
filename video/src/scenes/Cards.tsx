import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { wordAt, type Cue } from "../narration";
import { color } from "../theme";

const ease = (frame: number, fps: number, delay = 0) => spring({ frame: frame - delay, fps, config: { damping: 200, stiffness: 120 } });

// Fades a scene in over its first 10 frames and out over its last 10, so cuts dissolve.
export const Fade = ({ children }: { children: React.ReactNode }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const o = Math.min(interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" }), interpolate(frame, [durationInFrames - 10, durationInFrames], [1, 0], { extrapolateLeft: "clamp" }));
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
};

// Cold open: three hurts, each landing on its word.
export const Problem = ({ cue }: { cue: Cue }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const items: [string, string, number][] = [
    ["Cold that bites through a coat.", "cold", 0.28],
    ["Sun with no shade for blocks.", "sun", 0.52],
    ["An elevator that is out, with no warning.", "station", 0.74],
  ];
  return (
    <AbsoluteFill style={{ background: color.ground, justifyContent: "center", padding: "0 220px" }}>
      <div style={{ fontSize: 34, color: color.muted, marginBottom: 36, opacity: ease(frame, fps) }}>Every city has walks that hurt.</div>
      {items.map(([text, word, fb]) => {
        const at = Math.round((wordAt(cue, word, fb) - 0.15) * fps);
        const s = ease(frame, fps, at);
        return (
          <div key={word} style={{ fontSize: 76, fontWeight: 600, letterSpacing: -2.5, lineHeight: 1.15, color: color.ink, opacity: s, transform: `translateY(${(1 - s) * 28}px)`, marginBottom: 18 }}>{text}</div>
        );
      })}
    </AbsoluteFill>
  );
};

export const Title = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = ease(frame, fps);
  const b = ease(frame, fps, 8);
  return (
    <AbsoluteFill style={{ background: color.ground, justifyContent: "center", alignItems: "flex-start", padding: "0 220px" }}>
      <div style={{ fontSize: 140, fontWeight: 600, letterSpacing: -6, color: color.ink, opacity: a, transform: `translateY(${(1 - a) * 30}px)`, lineHeight: 1 }}>happy map</div>
      <div style={{ fontSize: 44, color: color.inkSoft, marginTop: 26, opacity: b, transform: `translateY(${(1 - b) * 20}px)` }}>
        routes costed by exposure, not only by time
      </div>
    </AbsoluteFill>
  );
};

// Small provenance pill over the map while the narration says "on open data".
export const Provenance = ({ cue }: { cue: Cue }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = ease(frame, fps, Math.round(wordAt(cue, "open", 0.45) * fps));
  return (
    <AbsoluteFill style={{ alignItems: "flex-end", padding: "90px 60px 0 0" }}>
      <div style={{ opacity: s, transform: `translateY(${(1 - s) * -16}px)`, background: color.surface, border: `1.5px solid ${color.line}`, borderRadius: 12, padding: "14px 22px", fontSize: 26, color: color.inkSoft, boxShadow: "0 8px 30px rgba(23,21,15,0.12)" }}>
        OpenStreetMap · City of Toronto open data · TTC live alerts · Environment Canada
      </div>
    </AbsoluteFill>
  );
};

// The four exposures, one label at a time, each on its word.
export const Layers = ({ cue }: { cue: Cue }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const items: [string, string, number][] = [["Minutes outdoors", "minutes", 0.02], ["Metres in direct sun", "metres", 0.27], ["Stairs, kerbs, missing sidewalks", "stairs", 0.52], ["Elevator out right now", "subway", 0.72]];
  return (
    <AbsoluteFill style={{ alignItems: "flex-end", padding: "90px 60px 0 0" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {items.map(([label, word, fb]) => {
          const s = ease(frame, fps, Math.round((wordAt(cue, word, fb) - 0.1) * fps));
          return (
            <div key={label} style={{ opacity: s, transform: `translateX(${(1 - s) * 40}px)`, background: color.surface, color: color.ink, border: `1.5px solid ${color.line}`, borderRadius: 14, padding: "16px 26px", fontSize: 36, fontWeight: 500, boxShadow: "0 8px 30px rgba(23,21,15,0.12)", alignSelf: "flex-end" }}>{label}</div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// Fastest vs indoor: the headline number counts down from 800 m to 16 m.
export const NumberCard = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = ease(frame, fps);
  const p = interpolate(frame, [fps * 1.6, fps * 3.4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const m = Math.round(800 - (800 - 16) * (1 - Math.pow(1 - p, 3)));
  const c = ease(frame, fps, Math.round(fps * 3.6));
  return (
    <AbsoluteFill style={{ background: color.ground, justifyContent: "center", alignItems: "center" }}>
      <div style={{ opacity: a, transform: `translateY(${(1 - a) * 24}px)`, textAlign: "center" }}>
        <div style={{ fontSize: 32, color: color.muted, letterSpacing: 0.5, textTransform: "uppercase" }}>Scotiabank Arena → Eaton Centre · outdoors</div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 40, marginTop: 8 }}>
          <div style={{ fontSize: 90, color: color.muted, textDecoration: "line-through", fontVariantNumeric: "tabular-nums" }}>800 m</div>
          <div style={{ fontSize: 260, fontWeight: 600, letterSpacing: -10, color: color.ink, fontVariantNumeric: "tabular-nums", lineHeight: 1, minWidth: 620, textAlign: "left" }}>{m} m</div>
        </div>
        <div style={{ display: "flex", gap: 60, justifyContent: "center", marginTop: 30, opacity: c }}>
          <div style={{ fontSize: 48, color: color.ink }}>−98 % outdoors</div>
          <div style={{ fontSize: 48, color: color.inkSoft }}>+1 min</div>
        </div>
      </div>
      <div style={{ position: "absolute", top: 150, fontSize: 28, color: color.muted, opacity: c }}>indoor first, via PATH · measured by tools/evaluate.mjs</div>
    </AbsoluteFill>
  );
};

// `revealAt`: frame at which the small print may appear, i.e. once the last caption is gone.
export const Outro = ({ revealAt = 14 }: { revealAt?: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = ease(frame, fps);
  const b = ease(frame, fps, revealAt);
  return (
    <AbsoluteFill style={{ background: color.ground, justifyContent: "center", alignItems: "center" }}>
      <div style={{ opacity: a, textAlign: "center" }}>
        <div style={{ fontSize: 72, fontWeight: 600, color: color.ink, letterSpacing: -2 }}>happy-map-ashy.vercel.app</div>
        <div style={{ fontSize: 40, color: color.inkSoft, marginTop: 14 }}>github.com/Ketchio-dev/happy-map</div>
      </div>
      <div style={{ position: "absolute", bottom: 90, fontSize: 25, color: color.muted, opacity: b, textAlign: "center", maxWidth: 1300, lineHeight: 1.4 }}>
        Narration synthesized on my laptop from a 19-second recording of my own voice (Fish Audio S2 Pro). Every number is computed from open and live data.
      </div>
    </AbsoluteFill>
  );
};
