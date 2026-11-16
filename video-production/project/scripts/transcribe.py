"""Transcribe the original narration with faster-whisper (word timestamps).
Usage: python -I transcribe.py <audio> <out.json>"""
import json, sys
from faster_whisper import WhisperModel

audio, out = sys.argv[1], sys.argv[2]
model = WhisperModel("medium.en", device="cpu", compute_type="int8")
prompt = "Team RADAR UNIT. DELTA PULSE. NISAR radar. Dancing with the SARs. Mason Neck. NASA."
import soundfile as sf
x, sr = sf.read(audio, dtype="float32")
assert sr == 16000
segs, info = model.transcribe(x, word_timestamps=True, initial_prompt=prompt, beam_size=5, vad_filter=False)
words, text = [], []
for s in segs:
    text.append(s.text)
    for w in s.words:
        words.append({"word": w.word, "start": round(w.start, 3), "end": round(w.end, 3), "p": round(w.probability, 3)})
json.dump({"text": "".join(text).strip(), "words": words}, open(out, "w"), indent=1)
print("".join(text))
