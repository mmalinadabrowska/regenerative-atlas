"""Synthesise a dial-up modem handshake (V.8 / V.34 style) as a WAV file.

Every stage is generated from the signals the standards describe, so the
background video owes nothing to a recording:

  dial tone -> DTMF digits -> ringback -> ANSam answer tone (2100 Hz with
  phase reversals) -> V.21 FSK call menu / joint menu -> V.34 INFO0 (DPSK)
  -> line probing (comb of tones) -> scrambled training noise -> data hiss

Usage: python3 scripts/handshake.py out.wav
"""
import sys
import wave

import numpy as np

SR = 8000  # telephone-band sample rate: the spectrum tops out at 4 kHz
rng = np.random.default_rng(56)


def t(seconds):
    return np.arange(int(seconds * SR)) / SR


def silence(seconds):
    return np.zeros(int(seconds * SR))


def tones(freqs, seconds, amp=0.3):
    x = t(seconds)
    return sum(np.sin(2 * np.pi * f * x) for f in freqs) * amp / len(freqs)


def fade(sig, ms=8):
    n = min(int(SR * ms / 1000), len(sig) // 2)
    if n:
        ramp = np.linspace(0, 1, n)
        sig[:n] *= ramp
        sig[-n:] *= ramp[::-1]
    return sig


def dtmf(digits):
    rows = {"1": 697, "2": 697, "3": 697, "4": 770, "5": 770, "6": 770,
            "7": 852, "8": 852, "9": 852, "0": 941}
    cols = {"1": 1209, "2": 1336, "3": 1477, "4": 1209, "5": 1336, "6": 1477,
            "7": 1209, "8": 1336, "9": 1477, "0": 1336}
    out = []
    for d in digits:
        out += [fade(tones([rows[d], cols[d]], 0.09, 0.4)), silence(0.07)]
    return np.concatenate(out)


def ansam(seconds):
    """2100 Hz answer tone, 15 Hz amplitude modulation, phase flips every 450 ms."""
    x = t(seconds)
    phase = np.pi * np.floor(x / 0.45)
    carrier = np.sin(2 * np.pi * 2100 * x + phase)
    return carrier * (1 + 0.2 * np.sin(2 * np.pi * 15 * x)) * 0.3


def fsk(seconds, mark, space, baud=300, amp=0.3):
    """Binary FSK with continuous phase, random bits."""
    n = int(seconds * SR)
    spb = SR / baud
    bits = rng.integers(0, 2, int(n / spb) + 1)
    freq = np.where(bits[(np.arange(n) / spb).astype(int)] == 1, mark, space)
    return np.sin(2 * np.pi * np.cumsum(freq) / SR) * amp


def dpsk(seconds, carrier, baud=600, amp=0.25):
    n = int(seconds * SR)
    spb = SR / baud
    flips = rng.integers(0, 2, int(n / spb) + 1)
    phase = np.pi * np.cumsum(flips)[(np.arange(n) / spb).astype(int)]
    return np.sin(2 * np.pi * carrier * np.arange(n) / SR + phase) * amp


def probe(seconds):
    """V.34 line probing: a comb of tones 150 Hz apart, phase-reversed halfway."""
    x = t(seconds)
    flip = np.where(x > seconds / 2, np.pi, 0)
    freqs = [f for f in range(150, 3751, 150) if f not in (900, 1200, 1800, 2400)]
    return sum(np.sin(2 * np.pi * f * x + flip) for f in freqs) / len(freqs) * 0.9


def band_noise(seconds, lo, hi, amp=0.3):
    n = int(seconds * SR)
    spec = np.fft.rfft(rng.standard_normal(n))
    f = np.fft.rfftfreq(n, 1 / SR)
    spec[(f < lo) | (f > hi)] = 0
    sig = np.fft.irfft(spec, n)
    return sig / np.abs(sig).max() * amp


def handshake():
    parts = [
        silence(0.4),
        fade(tones([350, 440], 1.6, 0.35)),                    # dial tone
        silence(0.2),
        dtmf("5550198"),                                        # dialling
        silence(0.6),
        fade(tones([440, 480], 1.2, 0.3)), silence(0.8),        # ringback
        fade(ansam(2.6)),                                       # answer tone
        silence(0.1),
        fade(fsk(0.7, 980, 1180) + fsk(0.7, 1650, 1850, amp=0.2)),  # V.8 CM / JM
        silence(0.05),
        fade(dpsk(0.25, 1200) + dpsk(0.25, 2400)),              # INFO0
        silence(0.15),
        fade(probe(0.6)),                                       # line probing
        silence(0.08),
        fade(dpsk(0.2, 1200) + dpsk(0.2, 2400)),
        fade(probe(0.5)),
        fade(band_noise(1.4, 250, 3500, 0.35)),                 # half-duplex training
        silence(0.06),
        fade(band_noise(0.5, 600, 3300, 0.3) + dpsk(0.5, 1800)),
        fade(band_noise(2.6, 150, 3700, 0.32), 200),            # full-duplex data hiss
        silence(0.8),
    ]
    sig = np.concatenate(parts)
    return np.clip(sig, -1, 1)


def main(path):
    sig = (handshake() * 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(sig.tobytes())


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "handshake.wav")
