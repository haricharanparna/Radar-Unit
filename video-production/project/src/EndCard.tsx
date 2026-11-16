import React from "react";
import { AbsoluteFill, Easing, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Video } from "@remotion/media";
import { C, F } from "./theme";

/** Closing frame: the real app (blurred) behind the project name, the live URL and the team. */
const Inner: React.FC<{ n: number; bgSrc: string; bgTrim: number }> = ({ n, bgSrc, bgTrim }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ease = Easing.out(Easing.cubic);
  const a = (start: number, len = 14) => interpolate(frame, [start, start + len], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const fadeOut = interpolate(frame, [n - 16, n], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeIn = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" });
  const pulse = 0.5 + 0.5 * Math.sin((frame / fps) * Math.PI * 1.4);
  return (
    <AbsoluteFill style={{ backgroundColor: C.void, opacity: Math.min(fadeIn, fadeOut) }}>
      <AbsoluteFill style={{ filter: "blur(14px) brightness(0.32) saturate(1.1)", transform: `scale(${1.08 + frame / n * 0.04})` }}>
        <Video src={staticFile(`recordings/${bgSrc}`)} trimBefore={Math.round(bgTrim * fps)} muted style={{ width: 1920, height: 1080, objectFit: "cover" }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 42%, rgba(17,24,21,0.2) 0%, rgba(7,11,10,0.85) 70%)" }} />
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 170 }}>
        {/* pulse rings, in the app's water colours */}
        <div style={{ position: "relative", width: 120, height: 120, opacity: a(0) }}>
          {[0, 1, 2].map((k) => {
            const p = ((frame / fps) * 0.55 + k / 3) % 1;
            return <div key={k} style={{ position: "absolute", inset: 60 - 60 * p, borderRadius: "50%", border: `2px solid ${k === 1 ? C.amber : C.cyan}`, opacity: 1 - p }} />;
          })}
          <div style={{ position: "absolute", inset: 48, borderRadius: "50%", background: C.cyan, boxShadow: `0 0 ${20 + 20 * pulse}px ${C.cyan}` }} />
        </div>
        <div style={{ fontFamily: F.head, fontWeight: 700, fontSize: 128, letterSpacing: 10, color: "#fff", marginTop: 26, opacity: a(4), transform: `translateY(${(1 - a(4)) * 18}px)` }}>DELTA PULSE</div>
        <div style={{ fontFamily: F.sans, fontSize: 34, color: C.muted, marginTop: 6, opacity: a(10) }}>Revealing the water we cannot see.</div>
        <div style={{ marginTop: 40, opacity: a(18), display: "flex", alignItems: "center", gap: 14, padding: "14px 30px", borderRadius: 999, border: `1.5px solid ${C.accent}`, background: "rgba(17,24,21,0.8)" }}>
          <span style={{ width: 12, height: 12, borderRadius: 6, background: "#5fd38d", boxShadow: "0 0 10px #5fd38d" }} />
          <span style={{ fontFamily: F.mono, fontWeight: 500, fontSize: 38, color: C.text }}>delta-pulse-nisar.vercel.app</span>
        </div>
        <div style={{ marginTop: 34, opacity: a(26), fontFamily: F.mono, fontSize: 21, letterSpacing: 3.5, color: C.amber, textAlign: "center" }}>
          TEAM RADAR UNIT · NASA SPACE APPS CHALLENGE 2026 · DANCING WITH THE SARS
        </div>
        <div style={{ marginTop: 12, opacity: a(30) * 0.85, fontFamily: F.sans, fontSize: 20, color: C.muted, textAlign: "center" }}>
          Data: NASA-ISRO NISAR L2 GCOV via NASA ASF DAAC · NASA GIBS · ERA5 via Open-Meteo · github.com/haricharanparna/Radar-Unit
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const EndCard: React.FC<{ from: number; dur: number; bgSrc: string; bgTrim: number }> = ({ from, dur, bgSrc, bgTrim }) => {
  const { fps } = useVideoConfig();
  const n = Math.round(dur * fps);
  return (
    <Sequence name="End card" from={Math.round(from * fps)} durationInFrames={n} premountFor={fps}>
      <Inner n={n} bgSrc={bgSrc} bgTrim={bgTrim} />
    </Sequence>
  );
};
