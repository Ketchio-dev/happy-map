import { createTikTokStyleCaptions, type Caption } from "@remotion/captions";
import { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { color } from "../theme";

// Word-timed captions when whisper produced them, the plain sentence otherwise.
export const Captions = ({ captions, text }: { captions: Caption[] | null; text: string }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = (frame / fps) * 1000;
  const pages = useMemo(
    () => (captions ? createTikTokStyleCaptions({ captions, combineTokensWithinMilliseconds: 1600 }).pages : null),
    [captions],
  );
  const page = pages?.find((p) => ms >= p.startMs && ms < p.startMs + p.durationMs) ?? pages?.[pages.length - 1] ?? null;
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", padding: "0 160px 72px" }}>
      <div style={{
        background: "rgba(23,21,15,0.82)", color: "#fff", borderRadius: 14, padding: "14px 26px",
        fontSize: 40, lineHeight: 1.3, fontWeight: 500, textAlign: "center", maxWidth: 1400, letterSpacing: -0.4,
      }}>
        {page
          ? page.tokens.map((t, i) => {
              const on = ms >= t.fromMs;
              return <span key={i} style={{ color: on ? "#fff" : "rgba(255,255,255,0.45)" }}>{t.text}</span>;
            })
          : text}
      </div>
    </AbsoluteFill>
  );
};
