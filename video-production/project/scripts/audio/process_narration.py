"""Clean the ORIGINAL team narration (never modified in place).
Steps: decode -> mono 48 kHz -> non-stationary spectral noise reduction (removes the hiss
heard as a 'waterfall') -> FFmpeg: light FFT denoise, high-pass 80 Hz, low-pass 11 kHz,
gentle presence EQ, 3:1 compression, loudness normalisation to -16 LUFS.
Usage: python -I process_narration.py <ffmpeg> <in.m4a> <out.wav>"""
import subprocess, sys, tempfile, os
import numpy as np, soundfile as sf, noisereduce as nr
ff, src, out = sys.argv[1:4]
tmp = tempfile.mkdtemp()
raw, den = os.path.join(tmp, "raw.wav"), os.path.join(tmp, "den.wav")
subprocess.run([ff, "-hide_banner", "-loglevel", "error", "-y", "-i", src, "-ac", "1", "-ar", "48000", raw], check=True)
x, sr = sf.read(raw)
y = nr.reduce_noise(y=x, sr=sr, stationary=False, prop_decrease=0.95, time_constant_s=1.0,
                    freq_mask_smooth_hz=300, time_mask_smooth_ms=60)
sf.write(den, y, sr)
af = ("afftdn=nr=12:nf=-50,highpass=f=80,lowpass=f=11000,equalizer=f=3200:t=q:w=1.2:g=2,"
      "acompressor=threshold=-20dB:ratio=3:attack=5:release=80,loudnorm=I=-16:TP=-1.5:LRA=7")
subprocess.run([ff, "-hide_banner", "-loglevel", "error", "-y", "-i", den, "-af", af, "-ar", "48000", out], check=True)
print("ok", out)
