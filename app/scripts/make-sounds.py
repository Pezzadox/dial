# Synthesises Dial's sound set as small WAV files. Run: python3 scripts/make-sounds.py
# Soft, warm and short: glassy clicks that rise in pitch as the Dial climbs, a lock-in
# chime on release, a shimmer at 100, and a rising three-note chime for a match.
import numpy as np, wave, os
SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'sounds')
os.makedirs(OUT, exist_ok=True)

def env(n, attack=0.004, decay=0.08):
    t = np.arange(n) / SR
    a = np.clip(t / attack, 0, 1)
    return a * np.exp(-t / decay)

def tone(freq, dur, decay=0.12, partials=((1, 1.0), (2, 0.25), (3, 0.08)), attack=0.004):
    n = int(SR * dur); t = np.arange(n) / SR
    w = sum(a * np.sin(2 * np.pi * freq * k * t) for k, a in partials)
    return w * env(n, attack, decay)

def write(name, x, gain=0.55):
    x = x / (np.max(np.abs(x)) or 1) * gain
    x = np.concatenate([x, np.zeros(int(SR * 0.01))])
    data = (x * 32767).astype(np.int16)
    with wave.open(os.path.join(OUT, name + '.wav'), 'w') as f:
        f.setnchannels(1); f.setsampwidth(2); f.setframerate(SR); f.writeframes(data.tobytes())

def mix(*parts):
    n = max(len(p) + int(o * SR) for p, o in parts)
    out = np.zeros(n)
    for p, o in parts:
        s = int(o * SR); out[s:s + len(p)] += p
    return out

# Ticks every 5 points, climbing a pentatonic scale across four octaves as the Dial rises.
penta = [0, 2, 4, 7, 9]
for i in range(20):
    freq = 196.0 * 2 ** ((penta[i % 5] + 12 * (i // 5)) / 12)
    click = tone(freq * 2, 0.06, decay=0.018, partials=((1, 1.0), (2.7, 0.3)))
    write(f'tick_{(i + 1) * 5:03d}', click, gain=0.30 + 0.012 * i)

write('tap', tone(880, 0.07, decay=0.02, partials=((1, 1.0), (2, 0.2))), gain=0.25)
write('lock', mix((tone(659.25, 0.35, 0.12), 0), (tone(987.77, 0.45, 0.16), 0.07)), gain=0.45)
write('full', mix(*[(tone(f, 0.6, 0.22), k * 0.06) for k, f in enumerate([523.25, 659.25, 783.99, 1046.5, 1318.5])]), gain=0.5)
write('match', mix((tone(523.25, 0.7, 0.3), 0), (tone(659.25, 0.7, 0.3), 0.12), (tone(783.99, 0.9, 0.4), 0.24), (tone(1046.5, 1.1, 0.5), 0.36)), gain=0.55)
write('reward', mix((tone(1318.5, 0.25, 0.08), 0), (tone(1760, 0.35, 0.12), 0.06), (tone(2093, 0.4, 0.14), 0.12)), gain=0.38)
write('open', mix((tone(392, 0.3, 0.1, partials=((1, 1.0),)), 0), (tone(587.33, 0.3, 0.12, partials=((1, 1.0),)), 0.04)), gain=0.3)
# Intro: a soft swell into a bright chord as the logo draws itself.
pad = mix(*[(tone(f, 1.6, 0.9, attack=0.35), 0) for f in [261.63, 392.0, 523.25]])
sparkle = mix(*[(tone(f, 0.5, 0.16), 0.55 + k * 0.08) for k, f in enumerate([1046.5, 1318.5, 1568.0, 2093.0])])
write('intro', mix((pad, 0), (sparkle, 0)), gain=0.42)
print('sounds written to', os.path.abspath(OUT))
