"""Build the verified subtitle cues from the faster-whisper word timings.
Each cue = (first word index, last word index, corrected text). Text is what the team actually
SAYS (checked by two independent Whisper decodes of each disputed clip), with ASR spelling errors
fixed: "Good problem" -> "The problem", "flood of forest" -> "flooded forest".
Writes: transcripts/verified_transcript.md, transcripts/words.json, exports/DELTA_PULSE_FINAL.srt,
        project/src/captions.json
Usage (from video-production/): python -I project/scripts/make_subtitles.py"""
import json

W = json.load(open("transcripts/whisper_raw.json"))["words"]
words = [w["word"].strip() for w in W]

# (start word, end word inclusive, verified text with at most two lines)
CUES = [
    ("Hi,", "UNIT.", "Hi, we're team RADAR UNIT."),
    ("Good", "clouds.", "The problem: cameras miss floods\nhiding under trees and clouds."),
    ("RADAR", "SARs.", "Radar doesn't, and that's our challenge:\nDancing with the SARs."),
    ("This", "see.", "This is DELTA PULSE:\nrevealing the water we cannot see."),
    ("Type", "Earth.", "Type in any place on Earth."),
    ("DELTA", "archive", "DELTA PULSE streams real NISAR data\nfrom NASA archive"),
    ("and", "seconds.", "and maps the hidden water in seconds."),
    ("For", "40%.", "For example, at Mason Neck,\nflooded forest grew by 40%."),
    ("Imagine", "managers", "Imagine fishers, farmers\nand water managers"),
    ("watching", "storm", "watching their wetlands breathe\nthroughout any storm,"),
    ("anywhere", "days.", "anywhere on Earth, every 12 days."),
    ("DELTA", "water.", "DELTA PULSE:\nfeel the pulse of the planet's water."),
    ("Thank", "you.", "Thank you."),
]

cues, i = [], 0
for a, b, text in CUES:
    while words[i] != a: i += 1
    j = i
    while words[j] != b: j += 1
    cues.append({"start": W[i]["start"], "end": W[j]["end"], "text": text})
    i = j + 1

# Display timing: lead-in 80 ms, hold up to 350 ms after speech, never overlap the next cue (40 ms gap).
for k, c in enumerate(cues):
    s = max(0.0, c["start"] - 0.08)
    e = c["end"] + 0.35
    if k + 1 < len(cues):
        e = min(e, cues[k + 1]["start"] - 0.08 - 0.04)
    c["show"], c["hide"] = round(s, 3), round(min(e, 29.85), 3)

def ts(t):
    ms = int(round(t * 1000)); h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); s, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"

with open("exports/DELTA_PULSE_FINAL.srt", "w", encoding="utf-8") as f:
    for k, c in enumerate(cues, 1):
        f.write(f"{k}\n{ts(c['show'])} --> {ts(c['hide'])}\n{c['text']}\n\n")

json.dump([{"text": c["text"], "startMs": int(c["show"] * 1000), "endMs": int(c["hide"] * 1000)} for c in cues],
          open("project/src/captions.json", "w"), indent=1)
json.dump(W, open("transcripts/words.json", "w"), indent=1)

with open("transcripts/verified_transcript.md", "w", encoding="utf-8") as f:
    f.write("# Verified narration transcript\n\nSource: `audio/narration_original.m4a` (team recording, 30.36 s, unmodified).\n"
            "ASR: faster-whisper medium.en (word timestamps), disputed clips re-decoded with medium.en and small.en.\n\n")
    f.write("| # | Start | End | Text as spoken |\n|---|---|---|---|\n")
    for k, c in enumerate(cues, 1):
        f.write(f"| {k} | {c['start']:.2f} | {c['end']:.2f} | {c['text'].replace(chr(10), ' ')} |\n")
    f.write("\n## Corrections to the raw ASR\n\n"
            "- \"Good problem\" -> **\"The problem\"** (both re-decodes of 1.5-4.6 s hear \"The problem\").\n"
            "- \"flood of forest\" / \"flutter forest\" -> **\"flooded forest\"** (low ASR confidence 0.24-0.58; matches the script).\n"
            "- \"RADAR doesn't\" -> **\"Radar doesn't\"** (the technology, not the team name).\n\n"
            "## Where the recording differs from the written script (kept as spoken)\n\n"
            "- \"Type **in** any place on Earth\" (script: \"Type any place\").\n"
            "- \"streams real NISAR **data** from **NASA archive**\" (script: \"real NISAR radar from NASA's archive\"); all three decodes agree.\n"
            "- \"watching their wetlands breathe **throughout** any storm\" (script: \"through any storm\"); medium.en heard \"throughout\" twice.\n"
            "- Ends with \"**Thank you.**\" (28.72-29.16 s), not in the script.\n")
print(len(cues), "cues")
for c in cues: print(c["show"], c["hide"], c["text"].replace("\n", " / "))
