import { loadFont } from "@remotion/google-fonts/Inter";
import { AbsoluteFill, Audio, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Layers, NumberCard, Outro, Title } from "./scenes/Cards";
import { Captions } from "./scenes/Captions";
import { OutageTimeline } from "./scenes/OutageTimeline";
import { INTRO_S, timeline, type Cue } from "./narration";
import { FPS, color } from "./theme";

const { fontFamily } = loadFont("normal", { weights: ["400", "500", "600"], subsets: ["latin"] });

// Where in the recorded footage each footage-backed line starts (seconds). Set from the
// marks printed by footage/record.mjs.
const FOOTAGE: Record<string, number> = { hook: 1.5, layers: 8.6, compare: 8.0 };

const Footage = ({ startFrom, zoom = 1.04 }: { startFrom: number; zoom?: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = interpolate(frame, [0, fps * 12], [1, zoom], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: color.ground }}>
      <OffthreadVideo src={staticFile("footage/test.mp4")} startFrom={Math.round(startFrom * FPS)} muted style={{ width: "100%", height: "100%", transform: `scale(${s})`, transformOrigin: "60% 50%" }} />
      <AbsoluteFill style={{ background: "linear-gradient(to top, rgba(23,21,15,0.35), rgba(23,21,15,0) 30%)" }} />
    </AbsoluteFill>
  );
};

const Scene = ({ cue }: { cue: Cue }) => {
  switch (cue.id) {
    case "number": return <NumberCard durationInFrames={cue.durationInFrames} />;
    case "evidence": return <OutageTimeline durationInFrames={cue.durationInFrames} />;
    case "layers": return <><Footage startFrom={FOOTAGE.layers} /><Layers durationInFrames={cue.durationInFrames} /></>;
    default: return <Footage startFrom={FOOTAGE[cue.id] ?? 0} />;
  }
};

export const Test = () => {
  const { cues, total } = timeline();
  const frame = useCurrentFrame();
  const introEnd = Math.round(INTRO_S * FPS);
  // Title dissolves over the first half second of the first line.
  const titleOpacity = interpolate(frame, [introEnd, introEnd + FPS * 0.5], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const last = cues[cues.length - 1];
  const outroFrom = last ? last.from + last.durationInFrames : introEnd;
  return (
    <AbsoluteFill style={{ background: color.ground, fontFamily, color: color.ink }}>
      {cues.map((cue) => (
        // Scenes run a little past their line so the next cut lands on the gap, not mid-word.
        <Sequence key={cue.id} from={cue.from} durationInFrames={cue.durationInFrames + Math.round(FPS * 0.45)} name={cue.id}>
          <Scene cue={cue} />
          <Audio src={staticFile(cue.file)} />
          <Captions captions={cue.captions} text={cue.text} />
        </Sequence>
      ))}
      <Sequence from={0} durationInFrames={introEnd + FPS} name="title">
        <AbsoluteFill style={{ opacity: titleOpacity }}><Title /></AbsoluteFill>
      </Sequence>
      <Sequence from={outroFrom} durationInFrames={total - outroFrom} name="outro">
        <Outro />
      </Sequence>
    </AbsoluteFill>
  );
};
