import type { Caption } from "@remotion/captions";
import manifest from "./generated/test.narration.json";
import captionsFile from "./generated/test.captions.json";
import footage from "./generated/test.footage.json";
import { FPS } from "./theme";

export interface Line { id: string; file: string; text: string; durationSec: number }
export interface Cue extends Line { from: number; durationInFrames: number; captions: Caption[] | null }
export interface Mark { t: number; label: string; x: number; y: number }

export const LEAD_S = 0.6;
export const GAP_S = 0.4;
export const OUTRO_S = 3.8;
export const TAIL_S = 0.45; // scenes outlive their line by this much so cuts land in the gap

// Lays the lines out back to back; every scene and caption keys off these frames.
export function timeline(): { cues: Cue[]; total: number } {
  const lines = manifest as Line[];
  const caps = captionsFile as Record<string, Caption[]>;
  let cursor = Math.round(LEAD_S * FPS);
  const cues = lines.map((l) => {
    const durationInFrames = Math.ceil(l.durationSec * FPS);
    const cue: Cue = { ...l, from: cursor, durationInFrames, captions: caps[l.id] ?? null };
    cursor += durationInFrames + Math.round(GAP_S * FPS);
    return cue;
  });
  return { cues, total: cursor + Math.round(OUTRO_S * FPS) };
}

// Seconds into a line at which a word is spoken, from the whisper timings; a fraction of
// the line when there are none, so scenes still animate on a rough beat.
export function wordAt(cue: Cue, word: string, fallback: number): number {
  const w = word.toLowerCase();
  const hit = cue.captions?.find((c) => c.text.trim().toLowerCase().replace(/[^a-z]/g, "").startsWith(w));
  return hit ? hit.startMs / 1000 : fallback * cue.durationSec;
}

export const FOOTAGE_FILE: string = footage.file;
export const MARKS: Mark[] = footage.marks;
// Second in the footage at which a click happened.
export const markAt = (label: string, offset = 0) => (MARKS.find((m) => m.label === label)?.t ?? 0) + offset;
