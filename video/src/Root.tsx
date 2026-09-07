import { Composition } from "remotion";
import { Final } from "./Final";
import { timeline } from "./narration";
import { FPS, HEIGHT, WIDTH } from "./theme";

export const RemotionRoot = () => (
  <Composition
    id="Final"
    component={Final}
    width={WIDTH}
    height={HEIGHT}
    fps={FPS}
    durationInFrames={Math.max(FPS, timeline().total)}
  />
);
