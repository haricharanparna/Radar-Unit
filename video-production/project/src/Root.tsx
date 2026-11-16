import { Composition } from "remotion";
import { Main } from "./Main";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* 29.9 s at 30 fps = 897 frames; the official Space Apps limit is 30 s or less. */}
      <Composition id="DeltaPulseFinal" component={Main} durationInFrames={897} fps={30} width={1920} height={1080} />
    </>
  );
};
