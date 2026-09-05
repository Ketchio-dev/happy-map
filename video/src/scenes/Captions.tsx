import { createTikTokStyleCaptions, type Caption } from "@remotion/captions";
import { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";

// Word-timed captions when whisper produced them, the plain sentence otherwise.
export const Captions = ({ captions, text }: { captions: Caption[] | null; text: string }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = (frame / fps) * 1000;
  const pages = useMemo(() => (captions ? createTikTokStyleCaptions({ captions, combineTokensWithinMilliseconds: 1500 }).pages : null), [captions]);
  const page = pages?.find((p) => ms >= p.startMs && ms < p.startMs + p.durationMs) ?? null;
  if (pages && !page) return null;
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", padding: "0 160px 58px" }}>
      <div style={{ background: "rgba(23,21,15,0.74)", color: "#fff", borderRadius: 12, padding: "11px 22px", fontSize: 34, lineHeight: 1.3, fontWeight: 500, textAlign: "center", maxWidth: 1300, letterSpacing: -0.3 }}>
        {page ? page.tokens.map((t, i) => <span key={i} style={{ color: ms >= t.fromMs ? "#fff" : "rgba(255,255,255,0.45)" }}>{t.text}</span>) : text}
      </div>
    </AbsoluteFill>
  );
};
