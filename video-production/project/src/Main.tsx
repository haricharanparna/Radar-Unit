import React, { useEffect, useState } from "react";
import { AbsoluteFill, continueRender, delayRender } from "remotion";
import { Shot } from "./Shot";
import { ChallengeTitle, Note, Subtitles, TeamChip } from "./Overlays";
import { EndCard } from "./EndCard";
import { Soundtrack } from "./Audio";
import { C, loadFonts } from "./theme";

/*
  DELTA PULSE: HIDDEN WATER — NASA Space Apps Challenge 2026 submission (≤ 30 s).
  Every shot is genuine footage of the live app (video-production/recordings, made by scripts/record.mjs).
  Timings are in seconds on the master clock, which is the team's narration (words in transcripts/words.json).
  Camera framings: x/y = centre as a fraction of the 2560x1440 recording, z = zoom.
*/
export const Main: React.FC = () => {
  const [handle] = useState(() => delayRender("fonts"));
  useEffect(() => { loadFonts().then(() => continueRender(handle)); }, [handle]);

  return (
    <AbsoluteFill style={{ backgroundColor: C.void }}>
      {/* 0.00  "Hi, we're team RADAR UNIT." — the real homepage */}
      <Shot name="01 Home (team intro)" src="s01_home.mp4" from={0} dur={2.1} trim={0.6} fadeIn={0}
        camFrom={{ x: 0.5, y: 0.5, z: 1.0 }} camTo={{ x: 0.47, y: 0.47, z: 1.05 }} />
      <TeamChip from={0.15} dur={1.75} />

      {/* 1.88  "The problem: cameras miss floods hiding under trees and clouds. Radar doesn't…"
          The app's own controls: NASA same-day optical basemap (MODIS Terra, 13 Sep 2026, mostly cloud)
          with the NISAR 13 Sep 2026 radar layer faded in using the real opacity slider. Real time. */}
      <Shot name="02 Clouds vs radar (13 Sep 2026)" src="s02_clouds_vs_radar.mp4" from={1.85} dur={5.75} trim={1.6}
        camFrom={{ x: 0.6, y: 0.6, z: 1.27 }} camTo={{ x: 0.56, y: 0.6, z: 1.42 }} />
      <Note name="Note: camera" from={2.15} dur={2.35} label="Camera" text="NASA MODIS Terra true colour · 13 Sep 2026" />
      <Note name="Note: radar" from={4.75} dur={2.4} label="Radar" text="NISAR L-band, HH · 13 Sep 2026 · same place" color={C.amber} />
      <ChallengeTitle from={6.25} dur={1.3} />

      {/* 7.45  "This is DELTA PULSE: revealing the water we cannot see." — the app's own headline */}
      <Shot name="03 Home headline" src="s01_home.mp4" from={7.4} dur={2.6} trim={3.0}
        camFrom={{ x: 0.36, y: 0.33, z: 1.32 }} camTo={{ x: 0.38, y: 0.32, z: 1.5 }} />

      {/* 9.88  "Type in any place on Earth. DELTA PULSE streams real NISAR data from NASA archive…" */}
      <Shot name="04a Search typed" src="s03_search.mp4" from={9.85} dur={2.2} trim={0.4}
        camFrom={{ x: 0.55, y: 0.38, z: 1.4 }} camTo={{ x: 0.55, y: 0.4, z: 1.5 }} />
      <Shot name="04b Archive listing" src="s03_search.mp4" from={11.9} dur={1.95} trim={3.6}
        camFrom={{ x: 0.56, y: 0.48, z: 1.3 }} camTo={{ x: 0.56, y: 0.5, z: 1.4 }} />

      {/* 13.70 "…and maps the hidden water in seconds." — the real cyan/amber "Likely water" map */}
      <Shot name="05 Likely-water map" src="s04_water_map.mp4" from={13.7} dur={2.1} trim={1.0}
        camFrom={{ x: 0.56, y: 0.5, z: 1.22 }} camTo={{ x: 0.52, y: 0.5, z: 1.45 }} />

      {/* 15.70 "For example, at Mason Neck, flooded forest grew by 40%." — the app's result card (+38%) and per-pass bars */}
      <Shot name="06a Result card" src="s05_summary.mp4" from={15.65} dur={1.85} trim={4.5}
        camFrom={{ x: 0.42, y: 0.43, z: 1.55 }} camTo={{ x: 0.4, y: 0.42, z: 1.75 }} />
      <Shot name="06b Water under trees per pass" src="s07_story_water.mp4" from={17.35} dur={1.6} trim={5.5}
        camFrom={{ x: 0.46, y: 0.52, z: 1.4 }} camTo={{ x: 0.45, y: 0.55, z: 1.55 }} />

      {/* 18.88 "Imagine fishers, farmers and water managers watching their wetlands breathe…" — Your Story playing */}
      <Shot name="07a Your Story playing" src="s06_story_play.mp4" from={18.8} dur={2.4} trim={2.0}
        camFrom={{ x: 0.45, y: 0.44, z: 1.25 }} camTo={{ x: 0.43, y: 0.42, z: 1.34 }} />
      <Shot name="07b Your Story chapters" src="s06b_story_chapters.mp4" from={21.05} dur={2.45} trim={4.2}
        camFrom={{ x: 0.5, y: 0.36, z: 1.3 }} camTo={{ x: 0.5, y: 0.35, z: 1.4 }} />

      {/* 23.42 "…anywhere on Earth, every 12 days." — the live 3D globe of the newest NISAR acquisitions */}
      <Shot name="08 Globe" src="s08_globe.mp4" from={23.35} dur={2.6} trim={1.5}
        camFrom={{ x: 0.56, y: 0.33, z: 1.32 }} camTo={{ x: 0.5, y: 0.31, z: 1.5 }} />

      {/* 25.80 "DELTA PULSE: feel the pulse of the planet's water. Thank you." */}
      <EndCard from={25.75} dur={4.15} bgSrc="s01_home.mp4" bgTrim={0.5} />

      <Subtitles />
      <Soundtrack />
    </AbsoluteFill>
  );
};
