import { Composition } from "remotion";
import { Test } from "./Test";
import { timeline } from "./narration";
import { FPS, HEIGHT, WIDTH } from "./theme";

export const RemotionRoot = () => (
  <Composition
    id="Test"
    component={Test}
    width={WIDTH}
    height={HEIGHT}
    fps={FPS}
    durationInFrames={Math.max(FPS, timeline().total)}
  />
);
