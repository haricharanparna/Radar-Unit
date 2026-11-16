# Sources

## Competition rules (checked 2026-11-16)

- NASA Space Apps Challenge, **Project Submission Guide**: https://www.spaceappschallenge.org/resources/project-submission-guide/
  The demo is either a video of **30 seconds or less** or a slide deck of up to seven slides. Materials must be in English; a video in another language needs English subtitles. Videos are linked from the project page (hosted elsewhere), not uploaded. No people under 18 may appear; adults who appear must agree to NASA using their name and likeness.
- 2026 Participant Terms and Conditions: https://www.spaceappschallenge.org/legal/
- The guide sets no codec, resolution or file-size rule, so the export uses MP4 / H.264 / AAC / 1920×1080 / 30 fps.

## Scientific claims

| Claim in the video | How it was checked | Source |
|---|---|---|
| NISAR is a NASA–ISRO mission | Mission documentation | https://nisar.jpl.nasa.gov/ ; ISRO S-band data release page https://www.isro.gov.in/NISARS_Band_SAR_Data_Products_Release.html |
| L-band (24 cm) sees through cloud and darkness and can reveal water under forest canopy (double-bounce) | NASA wetland science material and peer-reviewed caveats | NASA Western Water Applications Office NISAR overview (https://wwao.jpl.nasa.gov/documents/123/WWAO-Annual-Meeting-Presentation-2024-WWAO-NISAR-20240501-BDowns.pdf); Bourgeau-Chavez webinar on L-band HH and flooded vegetation (https://nawm.org/pdf_lib/wmc_webinar/bourgeau_chavez_061026.pdf); 2025 Great Lakes preprint showing that double-bounce classification needs validation (https://www.preprints.org/manuscript/202509.1083/download/final_file) |
| "every 12 days" | NISAR's nominal exact-repeat cycle is 12 days. The Mason Neck record has one 24-day gap (27 Jul → 20 Aug 2026), which the app flags | NASA/JPL NISAR mission pages; the app's own "Compare two passes" list |
| "streams real NISAR data from NASA archive" | The live analysis read 504 MB of NISAR L2 GCOV (PROVISIONAL, CRID P05023, track 98D, frame 69) from NASA ASF DAAC by HTTP range reads, in 134.6 s | `assets/data/mason_neck_manifest_2c4e1ba28297eba5.json` (the app's own manifest) |
| "at Mason Neck, flooded forest grew by 40%" | The app reports **+38%**: the water-under-trees (double-bounce) signature grew 28 → 39 km² from 21 Jun to 19 Oct 2026, from **uncalibrated** thresholds, and buildings give the same signature. See quality-control.md | App result card + manifest `screening_counts` |
| Cloud on 13 Sep 2026 (the camera-vs-radar shot) | ERA5 at the hour of the radar pass: 91% cloud (the app's Your Story, chapter 1). NASA GIBS MODIS Terra true colour for 13 Sep 2026: ~72% of the window is bright cloud (our pixel count, `assets/gibs/`) | NASA GIBS WMS (https://gibs.earthdata.nasa.gov); ERA5 via Open-Meteo (CC BY 4.0) |

## Footage, data and licences

- All product footage: genuine screen capture of https://delta-pulse-nisar.vercel.app (live, 2026-11-16), made by `project/scripts/record.mjs`.
- Basemaps seen in the footage: Esri, HERE, Garmin, © OpenStreetMap contributors (attribution is visible in the app's map footers).
- Fonts: Space Grotesk, IBM Plex Sans, IBM Plex Mono, under SIL Open Font License 1.1 (`assets/fonts/OFL-*.txt`). These are the app's own typefaces.
- Music and sound effects: original, synthesised from code (`project/scripts/audio/music.py`). No samples and no third-party audio.
- Narration: the team's own recording (`audio/narration_original.m4a`).
