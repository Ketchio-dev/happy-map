import type { Caption } from "@remotion/captions";
import manifest from "./generated/test.narration.json";
import captionsFile from "./generated/test.captions.json";
import { FPS } from "./theme";

export interface Line { id: string; file: string; text: string; durationSec: number }
export interface Cue extends Line { from: number; durationInFrames: number; captions: Caption[] | null }

export const INTRO_S = 2.4;
export const GAP_S = 0.45;
export const OUTRO_S = 3.6;

// Lays the lines out back to back; every scene and caption keys off these frames.
export function timeline(): { cues: Cue[]; total: number } {
  const lines = manifest as Line[];
  const caps = captionsFile as Record<string, Caption[]>;
  let cursor = Math.round(INTRO_S * FPS);
  const cues = lines.map((l) => {
    const durationInFrames = Math.ceil(l.durationSec * FPS);
    const cue: Cue = { ...l, from: cursor, durationInFrames, captions: caps[l.id] ?? null };
    cursor += durationInFrames + Math.round(GAP_S * FPS);
    return cue;
  });
  return { cues, total: cursor + Math.round(OUTRO_S * FPS) };
}
