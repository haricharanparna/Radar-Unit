# Production log — DELTA PULSE: HIDDEN WATER (submission video)

## 1. Environment audit
- Repository root: `Nasa Space Apps Challenge/` (remote `haricharanparna/Radar-Unit`). The app lives in `radar/` (Next.js 15 + FastAPI backend on Render, `radar-unit-fork.onrender.com`).
- Tools: Node 26, npm 11, Python 3.13, faster-whisper 1.2.1, FFmpeg (imageio-ffmpeg build); Microsoft Edge used as the Playwright browser (`channel: "msedge"`). Playwright's own Chromium download was incomplete, and Edge avoided a download.
- Narration: the only original recording is `Final.m4a` (MPEG-4 audio, 30.36 s; `Final (1).m4a` is byte-identical). No narration MP4 exists. The MP4 in the repo root (`wXK3JAgr7lh72SWEWjm6hA.mp4`) is an earlier render of this video and was not used. Copied unmodified to `audio/narration_original.m4a`.
- An existing empty `Video Production/` folder (with `Audio/Final (1).m4a`) was left untouched. Deliverables are in `video-production/` as specified.

## 2. App inspection
- The supplied `?result=8d9505cb32da551f` returns 404 from the backend (saved results were reset), so the page falls back to the Tonle Sap case study.
- Ran a **new live analysis** in the app: search "Mason Neck, Virginia" → Mason Neck, Fairfax County (38.651, −77.180) → track 98D frame 69, PROVISIONAL P05023, 10 dates (21 Jun → 19 Oct 2026) → Analyse 10 acquisitions. It finished in 136 s with result `2c4e1ba28297eba5`. Manifest saved to `assets/data/`.
- Features confirmed working: homepage, search/geocode, live ASF archive listing, analysis, result cards, map views (Before and after / What changed / Likely water), NASA same-day basemap, opacity slider, Your Story (documentary mode and chapters), 3D globe of newest acquisitions.
- On a later pass the archive had a new VALIDATED 4 Nov 2026 granule and recommended a different track, so the recording script explicitly picks the 10-date track the result came from.

## 3. Claim verification
See `quality-control.md` → "Scientific accuracy". Main decisions:
- Camera-vs-radar date: **13 Sep 2026**, cloudy in both MODIS (≈72%) and ERA5 at the pass hour (91%). 20 Aug was rejected: cloudy in MODIS but 12% at the pass hour.
- Mason Neck's water-under-trees series peaks on 19 Oct, so the script's "11 Sep peak" (a Tonle Sap fact) is not shown.
- Official rule: video ≤ 30 s, English. The edit is 29.9 s.

## 4. Transcription
- faster-whisper `medium.en`, word timestamps, domain prompt. Disputed clips re-decoded with `medium.en` and `small.en` (no prompt, beam 10).
- Fixed "Good problem" → "The problem" and "flood of forest" → "flooded forest". Kept as spoken: "Type in", "real NISAR data from NASA archive", "throughout any storm", "Thank you."
- `project/scripts/make_subtitles.py` builds the cues → SRT + `captions.json` + `transcripts/verified_transcript.md`.

## 5. Recording
- `project/scripts/record.mjs` drives the live site and captures with the Chrome DevTools screencast (JPEG q93) at **2560×1440** (1280×720 viewport at 2× density), so push-ins stay sharp at 1080p. FFmpeg builds 30 fps MP4s using each frame's real timestamp.
- All interactions are real UI events: typing, Enter, row clicks, the opacity slider moved with the keyboard, mouse-wheel zoom on the map, a mouse drag on the globe.
- Nine scenes in `recordings/`. Nothing is sped up; the shortest real waits are simply cut.

## 6. Edit (Remotion 4.0.543, `project/`)
- `src/Main.tsx` is the whole timeline, one JSX `<Shot>` per shot, timed on the narration clock with the narration words in comments.
- `Shot.tsx`: eased push-in/pan on the 2560×1440 footage and 8-frame cross-fades. `Overlays.tsx`: subtitles, editorial notes, titles. `EndCard.tsx`: closing frame. `Audio.tsx`: narration, music with speech ducking, three subtle sound effects.
- Fonts are the app's own (Space Grotesk, IBM Plex Sans/Mono, OFL); colours come from the app's dark theme.

## 7. Audio
- `scripts/audio/process_narration.py`: noisereduce (non-stationary, removes the broadband "waterfall" hiss), FFT denoise, 80 Hz high-pass, 11 kHz low-pass, +2 dB presence at 3.2 kHz, 3:1 compression, −16 LUFS.
- `scripts/audio/music.py`: original synthesised bed (Am–F–C–G, ~95 BPM) arranged to the narration: arpeggio at the title, soft pulse from the demo, fuller at "Imagine…", C-major resolve on the sign-off. It also generates a soft tick, an air swell and a low pulse accent.
- Final mastering pass in FFmpeg: limiter + loudnorm → −13.7 LUFS, −1.5 dBTP.

## 8. Render and QC
- First render review found three issues (radar reveal timing, globe framing, Your Story caption stacking). All fixed, then re-rendered.
- The final master was re-encoded to TV-range yuv420p/BT.709 and the audio re-limited. See `quality-control.md`.

## Reproduce
```bash
cd video-production/project
npm install
node scripts/record.mjs            # re-records every scene from the live app (needs the backend result to exist)
cp ../recordings/s0*.mp4 public/recordings/
python -I scripts/audio/music.py public/audio
python -I scripts/audio/process_narration.py <ffmpeg> ../audio/narration_original.m4a ../audio/narration_processed.wav
cp ../audio/narration_processed.wav public/audio/narration.wav
cd .. && python -I project/scripts/make_subtitles.py && cd project
npx remotion studio                # preview / edit
npx remotion render DeltaPulseFinal ../exports/_master.mp4 --codec=h264 --crf=16 --audio-codec=aac --audio-bitrate=192k
# then the mastering pass in production-log §8 (ffmpeg: TV-range yuv420p + limiter/loudnorm, -t 29.9)
```
If the Render backend has reset, run a new Mason Neck analysis in the app and set `RESULT=<id>` before `record.mjs`.
