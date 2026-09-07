import { loadFont } from "@remotion/google-fonts/Inter";
import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import { Fade, Layers, NumberCard, Outro } from "./scenes/Cards";
import { Captions } from "./scenes/Captions";
import { FULL, Footage, MAP, PANEL, type Frame } from "./scenes/Footage";
import { OutageTimeline } from "./scenes/OutageTimeline";
import { SidewalkCard } from "./scenes/SidewalkCard";
import { TAIL_S, markAt, timeline, type Cue } from "./narration";
import { FPS, color } from "./theme";

const { fontFamily } = loadFont("normal", { weights: ["400", "500", "600"], subsets: ["latin"] });

// Regions of the 1920x1080 footage worth framing (see Footage.tsx for FULL, PANEL, MAP).
const SUN_PANEL: Frame = { x: 0, y: 540, w: 980, h: 540 };   // sun slider and the sky toggle
const SCRUBBER: Frame = { x: 0, y: 560, w: 980, h: 520 };    // replay sparkline and slider
const LOWER_PANEL: Frame = { x: 0, y: 420, w: 980, h: 660 }; // the step-free card, fourth in the list

// One scene per narration line; footage scenes start at the recorded click marks.
const Scene = ({ cue }: { cue: Cue }) => {
  switch (cue.id) {
    case "open": return <Footage startFrom={markAt("replay-sep2", 0.2)} from={FULL} to={MAP} moveFrames={Math.round(FPS * 2.4)} delay={Math.round(FPS * 1.2)} />;
    case "stakes": return <Footage startFrom={markAt("Route", 0.4)} from={FULL} to={LOWER_PANEL} moveFrames={Math.round(FPS * 1.1)} />;
    case "hook": return <><Footage startFrom={markAt("loaded", 0.4)} /><Layers cue={cue} items={[["Minutes outdoors", "minutes", 0.3], ["Metres in direct sun", "metres", 0.48], ["Stairs, kerbs, missing sidewalks", "stairs", 0.66], ["Elevator out right now", "elevator", 0.82]]} /></>;
    case "compare": return <Footage startFrom={markAt("Indoor first", -0.4)} from={FULL} to={MAP} moveFrames={Math.round(FPS * 1.4)} />;
    case "number": return <NumberCard note="indoor first, walking, via the PATH · this route has stairs; the step-free card beside it does not" />;
    case "shade": return <Footage startFrom={markAt("Shade first", -0.3)} from={FULL} to={SUN_PANEL} moveFrames={Math.round(FPS * 1.2)} delay={Math.round(FPS * 3.2)} />;
    case "sidewalks": {
      const swap = Math.max(FPS, cue.durationInFrames - Math.round(FPS * 1.9));
      return (
        <>
          <Sequence from={0} durationInFrames={swap + 10} name="sidewalk card"><Fade><SidewalkCard cue={cue} /></Fade></Sequence>
          <Sequence from={swap} name="no-sidewalk layer"><Fade><Footage startFrom={markAt("No sidewalk", 0.3)} from={FULL} to={MAP} moveFrames={Math.round(FPS * 1.5)} /></Fade></Sequence>
        </>
      );
    }
    case "replay": return <Footage startFrom={markAt("Live", -0.2)} from={FULL} to={SCRUBBER} moveFrames={Math.round(FPS * 1.2)} delay={Math.round(FPS * 1.6)} />;
    case "impact": return <OutageTimeline durationInFrames={cue.durationInFrames} />;
    case "montreal": return <Footage startFrom={markAt("montreal", 0.2)} from={FULL} to={PANEL} moveFrames={Math.round(FPS * 1.3)} delay={Math.round(FPS * 3.4)} />;
    case "honest": return <Footage startFrom={markAt("evidence", 0.2)} />;
    default: return <Outro />;
  }
};

export const Final = () => {
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
            <Fade><Scene cue={cue} /></Fade>
            <Audio src={staticFile(cue.file)} />
            <Sequence from={0} durationInFrames={cue.durationInFrames} name={`${cue.id} captions`}><Captions captions={cue.captions} text={cue.text} /></Sequence>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
