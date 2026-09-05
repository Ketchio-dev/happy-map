import { AbsoluteFill, Easing, OffthreadVideo, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { FOOTAGE_FILE, MARKS } from "../narration";
import { HEIGHT, WIDTH, color } from "../theme";

// A region of the 1920x1080 footage to frame. The camera eases from one to the other.
export interface Frame { x: number; y: number; w: number; h: number }
export const FULL: Frame = { x: 0, y: 0, w: WIDTH, h: HEIGHT };
export const PANEL: Frame = { x: 0, y: 270, w: 980, h: 700 };   // the strategy cards
export const MAP: Frame = { x: 560, y: 0, w: 1360, h: 1080 };
const MAX_SCALE = 1.6;

function transform(f: Frame) {
  const s = Math.min(MAX_SCALE, WIDTH / f.w, HEIGHT / f.h);
  const tx = WIDTH / 2 - (f.x + f.w / 2) * s;
  const ty = HEIGHT / 2 - (f.y + f.h / 2) * s;
  return { s, tx, ty };
}

const Cursor = ({ t }: { t: number }) => {
  const clicks = MARKS.filter((m) => m.label !== "loaded");
  const i = clicks.findIndex((m, k) => t < m.t && (k === 0 || t >= clicks[k - 1].t));
  const next = clicks[i] ?? null;
  const prev = i > 0 ? clicks[i - 1] : i === -1 ? clicks[clicks.length - 1] : null;
  const anchor = prev ?? next;
  if (!anchor) return null;
  const MOVE = 0.55;
  let x = anchor.x, y = anchor.y;
  if (prev && next && t > next.t - MOVE) {
    const p = Easing.inOut(Easing.cubic)((t - (next.t - MOVE)) / MOVE);
    x = prev.x + (next.x - prev.x) * p; y = prev.y + (next.y - prev.y) * p;
  }
  const visible = clicks.length && t >= clicks[0].t - 0.7;
  if (!visible) return null;
  const since = prev ? t - prev.t : 99;
  const ring = since < 0.5 ? since / 0.5 : null;
  return (
    <>
      {ring !== null && <div style={{ position: "absolute", left: x - 30, top: y - 30, width: 60, height: 60, borderRadius: 30, border: `3px solid ${color.ink}`, opacity: 1 - ring, transform: `scale(${0.4 + ring})` }} />}
      <div style={{ position: "absolute", left: x - 11, top: y - 11, width: 22, height: 22, borderRadius: 11, background: color.ink, border: "3px solid #fff", boxShadow: "0 2px 10px rgba(0,0,0,0.35)" }} />
    </>
  );
};

// Footage from `startFrom` seconds, framed from `from` to `to` over `moveFrames`, with a cursor
// that travels between the recorded clicks.
export const Footage = ({ startFrom, from = FULL, to = from, moveFrames, delay = 0 }: { startFrom: number; from?: Frame; to?: Frame; moveFrames?: number; delay?: number }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const span = moveFrames ?? durationInFrames;
  const p = interpolate(frame, [delay, delay + span], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  const f: Frame = { x: from.x + (to.x - from.x) * p, y: from.y + (to.y - from.y) * p, w: from.w + (to.w - from.w) * p, h: from.h + (to.h - from.h) * p };
  const { s, tx, ty } = transform(f);
  const t = startFrom + frame / fps;
  return (
    <AbsoluteFill style={{ background: color.ground, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: WIDTH, height: HEIGHT, transform: `translate(${tx}px, ${ty}px) scale(${s})`, transformOrigin: "0 0" }}>
        <OffthreadVideo src={staticFile(FOOTAGE_FILE)} startFrom={Math.round(startFrom * fps)} muted style={{ width: WIDTH, height: HEIGHT, filter: "contrast(1.07) saturate(1.2)" }} />
        <Cursor t={t} />
      </div>
    </AbsoluteFill>
  );
};
