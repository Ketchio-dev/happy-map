import { loadFont } from "@remotion/google-fonts/Inter";
import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import { Fade, Layers, NumberCard, Outro, Problem, Provenance, Title } from "./scenes/Cards";
import { Captions } from "./scenes/Captions";
import { FULL, Footage, PANEL } from "./scenes/Footage";
import { OutageTimeline } from "./scenes/OutageTimeline";
import { SidewalkCard } from "./scenes/SidewalkCard";
import { TAIL_S, markAt, timeline, type Cue } from "./narration";
import { FPS, color } from "./theme";

const { fontFamily } = loadFont("normal", { weights: ["400", "500", "600"], subsets: ["latin"] });

const Scene = ({ cue }: { cue: Cue }) => {
  switch (cue.id) {
    case "problem": return <Problem cue={cue} />;
    case "hook": return <Title />;
    case "toronto": return <><Footage startFrom={markAt("loaded", 0.6)} from={FULL} to={{ x: 110, y: 62, w: 1700, h: 956 }} /><Provenance cue={cue} /></>;
    case "layers": return <><Footage startFrom={markAt("Fastest", -0.8)} /><Layers cue={cue} /></>;
    case "compare": return <Footage startFrom={markAt("Fastest", -0.5)} from={FULL} to={PANEL} moveFrames={Math.round(FPS * 1.3)} />;
    case "number": return <NumberCard />;
    case "sidewalks": return <SidewalkCard cue={cue} />;
    case "evidence": {
      const swap = Math.round(FPS * 3.9);
      return (
        <>
          <Sequence from={0} durationInFrames={swap + 12} name="live tab"><Fade><Footage startFrom={markAt("Live", -0.6)} from={FULL} to={PANEL} moveFrames={Math.round(FPS * 1.3)} /></Fade></Sequence>
          <Sequence from={swap} name="timeline"><Fade><OutageTimeline durationInFrames={cue.durationInFrames - swap} /></Fade></Sequence>
        </>
      );
    }
    default: return <Outro revealAt={cue.durationInFrames + 6} />;
  }
};

export const Test = () => {
  const { cues, total } = timeline();
  return (
    <AbsoluteFill style={{ background: color.ground, fontFamily, color: color.ink }}>
      {cues.map((cue, i) => {
        const last = i === cues.length - 1;
        // Scenes outlive their line a little so the dissolve lands in the gap, not mid-word;
        // the last one holds to the end.
        const duration = last ? total - cue.from : cue.durationInFrames + Math.round(TAIL_S * FPS);
        return (
          <Sequence key={cue.id} from={cue.from} durationInFrames={duration} name={cue.id}>
            {cue.id === "evidence" ? <Scene cue={cue} /> : <Fade><Scene cue={cue} /></Fade>}
            <Audio src={staticFile(cue.file)} />
            <Sequence from={0} durationInFrames={cue.durationInFrames} name={`${cue.id} captions`}><Captions captions={cue.captions} text={cue.text} /></Sequence>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
