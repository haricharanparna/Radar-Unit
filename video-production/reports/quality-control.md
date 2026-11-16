# Quality control — `exports/DELTA_PULSE_FINAL.mp4`

Checked 2026-11-16 on the exported file itself, not the Remotion preview.

## Technical (FFprobe / FFmpeg)

| Check | Result | Pass |
|---|---|---|
| File exists and decodes end to end | yes (full decode pass with `blackdetect`/`freezedetect`, no errors) | ✅ |
| Duration | **29.90 s** (897 frames) — official limit is 30 s or less | ✅ |
| Container / video codec | MP4, H.264 High, yuv420p (TV range), BT.709, `+faststart` | ✅ |
| Resolution / aspect / frame rate | 1920 × 1080, 16:9, 30 fps constant | ✅ |
| Audio | AAC-LC, 48 kHz stereo, 193 kb/s | ✅ |
| Loudness | −13.7 LUFS integrated, LRA 2.9 LU, **true peak −1.5 dBFS** (the first master peaked at +0.1 dBFS; fixed with a limiter) | ✅ |
| Speech vs music | speech ≈ −13.8 dB RMS; music alone in a pause ≈ −27.9 dB, about 14 dB under the voice and ducked further under speech | ✅ |
| Black frames | none (`blackdetect d=0.1`) | ✅ |
| Frozen frames > 1.5 s | none (`freezedetect`) | ✅ |
| Start / end | starts on the homepage with the music fading in; ends on a 0.5 s fade to black with the music tail fading out (last 0.4 s ≈ −38 dB) | ✅ |
| File size | 24.6 MB (the guide sets no size limit; the video is linked, not uploaded) | ✅ |

## Visual (whole export reviewed at 2 frames/s, plus full-resolution stills)

- Every product shot is genuine footage of the live app. No recreated interfaces, no stock or AI imagery.
- Editorial additions are visibly editorial: dashed-outline "Camera / Radar" notes, the team title, the "Dancing with the SARs" title and the end card. None imitates an app control.
- Captions sit bottom-centre on a translucent backing, two lines at most, with no overlaps (40 ms minimum gap). The Your Story shot was reframed so the app's own narration captions don't stack under ours.
- Fixed during review: the radar reveal started too late for "Radar doesn't" (moved earlier); the globe was too pale at high zoom (reframed to include the live acquisitions list); the result card's crop clipped the sidebar text (recentred).
- No browser errors, no cursor (headless capture), no personal data or unrelated tabs on screen.

## Subtitles

- 13 cues, verified against the audio with two independent Whisper models (see `transcripts/verified_transcript.md`).
- Spelling checked: DELTA PULSE, RADAR UNIT, NISAR, SARs, Mason Neck, 40%, 12 days.
- The burned-in subtitles and `exports/DELTA_PULSE_FINAL.srt` come from the same file (`project/src/captions.json`).

## Scientific accuracy — items for the team

1. **"flooded forest grew by 40%"**. The app shows **+38%**: the *water-under-trees (double-bounce) signature* grew from 28 to 39 km², 21 Jun → 19 Oct 2026. The app labels this INTERPRETED, uses uncalibrated thresholds, and warns that buildings give the same signature. Rounding 38% to 40% is small, but the card on screen reads +38% while the voice says 40%. The narration is kept as recorded, with no extra emphasis on "40%". **Team decision (2026-11-16): keep the narration as recorded.** The on-screen card still shows the app's real +38%.
2. **The "11 Sep peak" in the script** belongs to the Tonle Sap case study, not Mason Neck. Mason Neck's peak is on the last pass, **19 Oct 2026**, so the video doesn't highlight 11 Sep. The narration never says it.
3. **"maps the hidden water in seconds"**. A 2-date analysis is estimated by the app at 12–24 s. The full 10-pass Mason Neck analysis took **~135 s** (504 MB read). The footage shows the real search and archive listing; the 10-pass result opens from the app's saved-result cache, at real speed and not sped up. The claim holds for a 2-date analysis but is generous for 10 passes.
4. **"every 12 days"** is NISAR's nominal repeat. The Mason Neck record has one 24-day gap (27 Jul → 20 Aug), and the app marks it in red.
5. **The camera-vs-radar shot**: the optical image is NASA GIBS MODIS Terra on the same UTC date as the radar pass (13 Sep 2026). MODIS images in daylight, about 15 hours after NISAR's ~00:09 UTC (evening local) pass. ERA5 independently shows 91% cloud at the radar pass hour, so "cloudy that day" holds; the two images are not simultaneous. The on-screen notes say "13 Sep 2026" for both, not "same moment". (20 Aug looked even cloudier in MODIS but was only 12% cloudy at the radar pass, so it was rejected.)
6. **"Radar doesn't"** is kept as the team's line. No further claims of infallibility were added. The app itself says flooding stays UNCONFIRMED until other evidence confirms it.
7. **The shared link** in the brief (`?result=8d9505cb32da551f`) no longer resolves; the backend returns 404 because its saved results were reset. The footage uses a fresh live analysis, `?result=2c4e1ba28297eba5`, which may also expire when the backend restarts.

## Verdict

Technical, visual, audio and subtitle QC: **passed**. Scientific items 1–3 are disclosed above for the team to decide on. None required changing the team's narration.
