import React from "react";
import { AbsoluteFill, Easing, Sequence, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C, F } from "./theme";
import captions from "./captions.json";

const fadeInOut = (frame: number, n: number, k = 7) =>
  Math.min(interpolate(frame, [0, k], [0, 1], { extrapolateRight: "clamp" }), interpolate(frame, [n - k, n], [1, 0], { extrapolateLeft: "clamp" }));

/* ---------------- subtitles ---------------- */
type Cue = { text: string; startMs: number; endMs: number };

const CueView: React.FC<{ cue: Cue; n: number }> = ({ cue, n }) => {
  const frame = useCurrentFrame();
  const o = fadeInOut(frame, n, 5);
  const y = interpolate(frame, [0, 6], [10, 0], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 54 }}>
      <div style={{
        opacity: o, transform: `translateY(${y}px)`, maxWidth: 1240, textAlign: "center",
        padding: "14px 30px 16px", borderRadius: 14, background: "rgba(7,11,10,0.66)",
        boxShadow: "0 8px 30px rgba(0,0,0,0.35)", backdropFilter: "blur(6px)",
        borderBottom: `2px solid ${C.cyan}`,
      }}>
        {cue.text.split("\n").map((line, i) => (
          <div key={i} style={{ fontFamily: F.sans, fontWeight: 600, fontSize: 44, lineHeight: 1.22, color: "#fff", letterSpacing: 0.1, textShadow: "0 2px 8px rgba(0,0,0,0.6)", whiteSpace: "nowrap" }}>
            {line}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

/** Burned-in subtitles from the verified captions (src/captions.json = exports/DELTA_PULSE_FINAL.srt). */
export const Subtitles: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <>
      {(captions as Cue[]).map((c, i) => {
        const from = Math.round((c.startMs / 1000) * fps);
        const n = Math.round((c.endMs / 1000) * fps) - from;
        return (
          <Sequence key={i} name={`Subtitle ${i + 1}`} from={from} durationInFrames={n} layout="none">
            <CueView cue={c} n={n} />
          </Sequence>
        );
      })}
    </>
  );
};

/* ---------------- editorial labels (clearly not part of the app UI) ---------------- */
/** A small editorial note: dashed outline + "video note" styling so it never looks like a native app control. */
export const Note: React.FC<{ name: string; from: number; dur: number; label: string; text: string; x?: number; y?: number; color?: string }> = ({ name, from, dur, label, text, x = 72, y = 64, color = C.cyan }) => {
  const { fps } = useVideoConfig();
  return (
    <Sequence name={name} from={Math.round(from * fps)} durationInFrames={Math.round(dur * fps)} layout="none">
      <NoteInner n={Math.round(dur * fps)} label={label} text={text} x={x} y={y} color={color} />
    </Sequence>
  );
};
const NoteInner: React.FC<{ n: number; label: string; text: string; x: number; y: number; color: string }> = ({ n, label, text, x, y, color }) => {
  const frame = useCurrentFrame();
  const o = fadeInOut(frame, n, 8);
  const dx = interpolate(frame, [0, 10], [-14, 0], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return (
    <div style={{ position: "absolute", left: x, top: y, opacity: o, transform: `translateX(${dx}px)` }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 14, padding: "10px 18px", borderRadius: 10, background: "rgba(7,11,10,0.78)", border: `1.5px dashed ${color}88`, boxShadow: "0 6px 24px rgba(0,0,0,0.4)" }}>
        <span style={{ width: 10, height: 10, borderRadius: 5, background: color, boxShadow: `0 0 12px ${color}` }} />
        <span style={{ fontFamily: F.mono, fontSize: 19, letterSpacing: 2.2, color, textTransform: "uppercase" }}>{label}</span>
        <span style={{ fontFamily: F.sans, fontSize: 25, color: C.text }}>{text}</span>
      </div>
    </div>
  );
};

/* ---------------- titles ---------------- */
export const TeamChip: React.FC<{ from: number; dur: number }> = ({ from, dur }) => {
  const { fps } = useVideoConfig();
  return (
    <Sequence name="Team title" from={Math.round(from * fps)} durationInFrames={Math.round(dur * fps)} layout="none">
      <TeamChipInner n={Math.round(dur * fps)} />
    </Sequence>
  );
};
const TeamChipInner: React.FC<{ n: number }> = ({ n }) => {
  const frame = useCurrentFrame();
  const o = fadeInOut(frame, n, 8);
  const w = interpolate(frame, [4, 22], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return (
    <div style={{ position: "absolute", right: 72, top: 64, opacity: o, textAlign: "right" }}>
      <div style={{ fontFamily: F.mono, fontSize: 20, letterSpacing: 5, color: C.amber }}>NASA SPACE APPS CHALLENGE 2026</div>
      <div style={{ height: 2, background: C.amber, margin: "10px 0 12px auto", width: 420 * w }} />
      <div style={{ fontFamily: F.head, fontWeight: 600, fontSize: 52, color: C.text, letterSpacing: 1 }}>Team RADAR UNIT</div>
    </div>
  );
};

export const ChallengeTitle: React.FC<{ from: number; dur: number }> = ({ from, dur }) => {
  const { fps } = useVideoConfig();
  return (
    <Sequence name="Challenge title" from={Math.round(from * fps)} durationInFrames={Math.round(dur * fps)} layout="none">
      <ChallengeInner n={Math.round(dur * fps)} />
    </Sequence>
  );
};
const ChallengeInner: React.FC<{ n: number }> = ({ n }) => {
  const frame = useCurrentFrame();
  const o = fadeInOut(frame, n, 7);
  const s = interpolate(frame, [0, n], [1, 1.03]);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: o, background: "radial-gradient(ellipse at center, rgba(7,11,10,0.62) 0%, rgba(7,11,10,0.0) 62%)" }}>
      <div style={{ transform: `scale(${s})`, textAlign: "center" }}>
        <div style={{ fontFamily: F.mono, fontSize: 22, letterSpacing: 7, color: C.cyan }}>THE CHALLENGE</div>
        <div style={{ fontFamily: F.head, fontWeight: 600, fontSize: 92, color: "#fff", marginTop: 8, textShadow: "0 4px 30px rgba(0,0,0,0.7)" }}>Dancing with the SARs</div>
      </div>
    </AbsoluteFill>
  );
};

/** A "sped up" badge for any footage played faster than real time. */
export const SpeedBadge: React.FC<{ from: number; dur: number; text: string }> = ({ from, dur, text }) => {
  const { fps } = useVideoConfig();
  return (
    <Sequence name="Speed note" from={Math.round(from * fps)} durationInFrames={Math.round(dur * fps)} layout="none">
      <SpeedInner n={Math.round(dur * fps)} text={text} />
    </Sequence>
  );
};
const SpeedInner: React.FC<{ n: number; text: string }> = ({ n, text }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: "absolute", right: 72, top: 64, opacity: fadeInOut(frame, n, 6), fontFamily: F.mono, fontSize: 20, letterSpacing: 2, color: C.muted, padding: "8px 14px", borderRadius: 8, background: "rgba(7,11,10,0.75)", border: `1.5px dashed ${C.muted}77` }}>
      {text}
    </div>
  );
};
