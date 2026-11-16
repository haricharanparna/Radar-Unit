import React from "react";
import { Sequence, interpolate, staticFile, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";
import captions from "./captions.json";

type Cue = { startMs: number; endMs: number };
const speech = (captions as Cue[]).map((c) => [c.startMs / 1000, c.endMs / 1000] as const);

/** Music level: lower under speech, a little higher in the pauses, smooth 250 ms ramps. */
function musicGain(t: number) {
  const UNDER = 0.16, GAP = 0.3, R = 0.25;
  let g = GAP;
  for (const [s, e] of speech) {
    const k = Math.min(interpolate(t, [s - R, s], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
      interpolate(t, [e, e + R], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
    g = Math.min(g, GAP - (GAP - UNDER) * k);
  }
  return g;
}

export const Soundtrack: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <>
      {/* the team's original narration, cleaned (scripts/audio/process_narration.py) */}
      <Audio name="Narration (team recording)" src={staticFile("audio/narration.wav")} volume={1} />
      {/* original synthesised music bed (scripts/audio/music.py) */}
      <Audio name="Music bed" src={staticFile("audio/music_bed.wav")} volume={(f) => musicGain(f / fps)} />
      <Sequence name="SFX: swell into title" from={Math.round(6.15 * fps)} durationInFrames={Math.round(1.5 * fps)} layout="none">
        <Audio src={staticFile("audio/sfx_swell.wav")} volume={0.14} />
      </Sequence>
      <Sequence name="SFX: search submitted" from={Math.round(11.6 * fps)} durationInFrames={Math.round(0.4 * fps)} layout="none">
        <Audio src={staticFile("audio/sfx_tick.wav")} volume={0.18} />
      </Sequence>
      <Sequence name="SFX: end card pulse" from={Math.round(25.78 * fps)} durationInFrames={Math.round(2.5 * fps)} layout="none">
        <Audio src={staticFile("audio/sfx_pulse.wav")} volume={0.22} />
      </Sequence>
    </>
  );
};
