import React from "react";
import { AbsoluteFill, Easing, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Video } from "@remotion/media";

/** A camera framing on the 2560x1440 recording: centre (fractions of the frame) and zoom (1 = whole frame). */
export type Cam = { x: number; y: number; z: number };

type Props = {
  name: string;
  src: string; // file in public/recordings
  from: number; // seconds on the master timeline
  dur: number; // seconds on screen
  trim: number; // seconds into the recording where this shot starts
  rate?: number; // playback rate (1 = real time)
  camFrom: Cam;
  camTo?: Cam;
  fadeIn?: number; // seconds
  fadeOut?: number;
  children?: React.ReactNode; // overlays that belong to this shot
};

const W = 1920, H = 1080;

function camTransform(c: Cam) {
  // clamp so the frame edge never shows
  const z = Math.max(1, c.z);
  const half = 0.5 / z;
  const x = Math.min(1 - half, Math.max(half, c.x));
  const y = Math.min(1 - half, Math.max(half, c.y));
  const tx = W / 2 - x * W * z;
  const ty = H / 2 - y * H * z;
  return `translate(${tx}px, ${ty}px) scale(${z})`;
}

const Inner: React.FC<Omit<Props, "from" | "name">> = ({ src, dur, trim, rate = 1, camFrom, camTo, fadeIn = 0.27, fadeOut = 0.27, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const n = dur * fps;
  const t = interpolate(frame, [0, n], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  const to = camTo ?? camFrom;
  const cam = { x: camFrom.x + (to.x - camFrom.x) * t, y: camFrom.y + (to.y - camFrom.y) * t, z: camFrom.z * Math.pow(to.z / camFrom.z, t) };
  const opacity = Math.min(
    fadeIn > 0 ? interpolate(frame, [0, fadeIn * fps], [0, 1], { extrapolateRight: "clamp" }) : 1,
    fadeOut > 0 ? interpolate(frame, [n - fadeOut * fps, n], [1, 0], { extrapolateLeft: "clamp" }) : 1,
  );
  return (
    <AbsoluteFill style={{ opacity, overflow: "hidden", backgroundColor: "#070b0a" }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, transformOrigin: "0 0", transform: camTransform(cam) }}>
        <Video src={staticFile(`recordings/${src}`)} trimBefore={Math.round(trim * fps)} playbackRate={rate} muted
          style={{ width: W, height: H, objectFit: "cover" }} />
      </div>
      {children}
    </AbsoluteFill>
  );
};

/** One shot of genuine app footage with a slow, eased camera move and soft cross-fades. */
export const Shot: React.FC<Props> = ({ name, from, dur, ...rest }) => {
  const { fps } = useVideoConfig();
  return (
    <Sequence name={name} from={Math.round(from * fps)} durationInFrames={Math.round(dur * fps)} premountFor={fps}>
      <Inner dur={dur} {...rest} />
    </Sequence>
  );
};
