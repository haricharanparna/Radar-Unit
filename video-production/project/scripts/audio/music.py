"""Original music bed + sound effects for the DELTA PULSE submission, synthesised from scratch
(no samples, no third-party audio) so there is no licensing question.

Structure follows the narration (bar = 2.5175 s, ~95 BPM):
  0.0  - 7.5  intro: warm Am / F / C / G pads, sub bass from bar 2
  7.5  - 10.0 title lift: soft arpeggio enters ("This is DELTA PULSE")
  10.0 - 18.9 demo: gentle pulse (soft kick + shaker), arpeggio continues
  18.9 - 25.9 impact: fuller, brighter ("Imagine fishers, farmers ...")
  25.9 - end  resolve on C major, long tail and fade
Usage: python -I music.py <outdir>"""
import sys, os
import numpy as np, soundfile as sf
from scipy.signal import butter, sosfilt

OUT = sys.argv[1] if len(sys.argv) > 1 else "."
SR = 48000
DUR = 30.5
BAR = 2.5175
BEAT = BAR / 4
N = int(DUR * SR)
L = np.zeros(N); R = np.zeros(N)
rng = np.random.default_rng(7)

def midi(m): return 440 * 2 ** ((m - 69) / 12)

def env(n, a, r):
    e = np.ones(n); na, nr_ = max(1, int(a * SR)), max(1, int(r * SR))
    e[:na] = np.linspace(0, 1, na); e[-nr_:] *= np.linspace(1, 0, nr_)
    return e

def add(sig, start, gain=1.0, pan=0.0, dst=None):
    i = int(start * SR)
    if i >= N: return
    sig = sig[: N - i]
    l, r = (L, R) if dst is None else dst
    l[i:i+len(sig)] += sig * gain * np.sqrt(0.5 * (1 - pan))
    r[i:i+len(sig)] += sig * gain * np.sqrt(0.5 * (1 + pan))

def pad(f, dur, bright=1.0):
    n = int(dur * SR); t = np.arange(n) / SR
    s = np.zeros(n)
    for det in (-0.07, 0.0, 0.07):
        ff = f * 2 ** (det / 12)
        for h in range(1, 8):
            s += np.sin(2*np.pi*ff*h*t + rng.uniform(0, 6)) / h ** (1.6 - 0.25 * bright)
    return s * env(n, 1.0, 1.4) / 7

def pluck(f, dur=0.7):
    n = int(dur * SR); t = np.arange(n) / SR
    s = np.sin(2*np.pi*f*t) + 0.3*np.sin(2*np.pi*2*f*t) + 0.1*np.sin(2*np.pi*3*f*t)
    return s * np.exp(-t * 5.5) * env(n, 0.003, 0.05)

def kick():
    n = int(0.4 * SR); t = np.arange(n) / SR
    f = 46 + 80 * np.exp(-t * 28)
    return np.sin(2*np.pi*np.cumsum(f)/SR) * np.exp(-t * 8)

def shaker():
    n = int(0.07 * SR); t = np.arange(n) / SR
    s = rng.standard_normal(n) * np.exp(-t * 70)
    return sosfilt(butter(4, 7000, 'hp', fs=SR, output='sos'), s)

prog = [[57, 60, 64, 69], [53, 57, 60, 65], [48, 55, 60, 64], [55, 59, 62, 67]]  # Am F C G
bass = [45, 41, 48, 43]
nbars = int(np.ceil(DUR / BAR))
for b in range(nbars):
    st = b * BAR
    if st >= 25.9: break
    ch = prog[b % 4]
    bright = 1.0 if st < 18.8 else 1.6
    for k, m in enumerate(ch):
        add(pad(midi(m), BAR + 1.4, bright), st, 0.09 if st < 18.8 else 0.11, pan=(-0.6 + k * 0.4))
    if b >= 1:
        n = int(BAR * SR); t = np.arange(n) / SR
        add(np.sin(2*np.pi*midi(bass[b % 4] - 12)*t) * env(n, 0.05, 0.3), st, 0.2)
    if st >= 7.4:
        arp = ch + [ch[2] + 12, ch[1] + 12, ch[3], ch[2]]
        for i in range(8):
            add(pluck(midi(arp[i % len(arp)] + 12)), st + i * BEAT / 2, 0.05 if st < 18.8 else 0.075, pan=0.45 * np.sin(i * 1.3))
    if 9.9 <= st:
        for i in range(4):
            add(kick(), st + i * BEAT, 0.16 if st < 18.8 else 0.24)
            add(shaker(), st + i * BEAT + BEAT / 2, 0.04 if st < 18.8 else 0.055, pan=0.3)

# resolve: C major (add9) with a long tail from the "DELTA PULSE" sign-off
END0 = 25.88
for k, m in enumerate([48, 55, 60, 64, 67, 74]):
    add(pad(midi(m), DUR - END0, 1.3), END0, 0.085, pan=(-0.6 + k * 0.24))
n = int((DUR - END0) * SR); t = np.arange(n) / SR
add(np.sin(2*np.pi*midi(36)*t) * env(n, 0.1, 2.0), END0, 0.2)
for i, m in enumerate([72, 76, 79, 84]):
    add(pluck(midi(m), 2.0), END0 + 0.15 + i * 0.32, 0.06, pan=-0.3 + i * 0.2)

def verb(x):
    y = x.copy()
    for d, g in [(0.031, .34), (0.047, .3), (0.067, .26), (0.097, .22), (0.149, .17), (0.223, .13), (0.331, .09)]:
        k = int(d * SR); z = np.zeros_like(x); z[k:] = x[:-k] * g; y += z
    return y

mix = np.stack([verb(L), verb(R)], 1)
mix = sosfilt(butter(2, 9500, 'lp', fs=SR, output='sos'), mix, axis=0)
mix = sosfilt(butter(2, 35, 'hp', fs=SR, output='sos'), mix, axis=0)
fade = np.ones(N)
fade[: int(1.2 * SR)] = np.linspace(0, 1, int(1.2 * SR)) ** 2
f0 = int(27.4 * SR); fade[f0:] = np.linspace(1, 0, N - f0) ** 1.6
mix *= fade[:, None]
mix /= np.abs(mix).max() / 0.89
sf.write(os.path.join(OUT, "music_bed.wav"), mix.astype(np.float32), SR)

# ---- sound effects (each a separate file so the Remotion timeline can move them) ----
def write(name, x):
    x = x / np.abs(x).max() * 0.8
    sf.write(os.path.join(OUT, name), np.stack([x, x], 1).astype(np.float32), SR)

# soft UI tick: short filtered click
n = int(0.09 * SR); t = np.arange(n) / SR
tick = (np.sin(2*np.pi*1800*t) * 0.6 + rng.standard_normal(n) * 0.25) * np.exp(-t * 90)
write("sfx_tick.wav", sosfilt(butter(2, [600, 5000], 'bp', fs=SR, output='sos'), tick))

# gentle rising air swell (1.4 s) into the title
n = int(1.4 * SR); t = np.arange(n) / SR
noise = rng.standard_normal(n)
sw = np.zeros(n)
for i, c in enumerate(np.linspace(300, 3500, 14)):  # sweep a band-pass upwards
    a, b2 = int(i * n / 14), int((i + 1) * n / 14)
    seg = sosfilt(butter(2, [c * 0.7, c * 1.3], 'bp', fs=SR, output='sos'), noise)[a:b2]
    sw[a:b2] = seg
sw *= (t / t[-1]) ** 2.2 * np.minimum(1, (t[-1] - t) / 0.08)
write("sfx_swell.wav", sw)

# soft low "pulse" accent: a deep sine thump + shimmer (for the logo/end card)
n = int(2.5 * SR); t = np.arange(n) / SR
pul = np.sin(2*np.pi*55*t) * np.exp(-t * 2.2) + 0.25 * np.sin(2*np.pi*880*t) * np.exp(-t * 3) * np.sin(2*np.pi*3*t) ** 2
write("sfx_pulse.wav", pul * env(n, 0.01, 0.6))
print("ok")
