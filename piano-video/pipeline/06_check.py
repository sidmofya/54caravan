"""Check the transcription against the audio, by ear and by numbers.

Writes data/check.wav: the vocal-free stem on the left channel and a plain
synthesized rendering of notes.json on the right. Played on headphones,
wrong or missing notes stand out. Also reports how closely note onsets line
up with onsets heard in the stem, and how well the harmony (chroma) matches.
"""
import json

import librosa
import numpy as np
import soundfile as sf

from common import DATA, NOTES, STEMS

SR = 44100
DAMPER_FALL = 0.035
DAMPED_DECAY = 0.07


def ring_time(p: int) -> float:
    return 4.5 * 2 ** (-(p - 21) / 22)  # matches web/src/timeline.ts


def pedal_release(pedal: list[dict], t: float) -> float | None:
    for s in pedal:
        if s["on"] <= t < s["off"]:
            return s["off"]
    return None


def synthesize(perf: dict, length: float) -> np.ndarray:
    out = np.zeros(int(length * SR))
    for n in perf["notes"]:
        f0 = 440 * 2 ** ((n["p"] - 69) / 12)
        start = int(n["on"] * SR)
        held = pedal_release(perf["pedal"], n["off"] + DAMPER_FALL)
        damp = (held if held is not None else n["off"] + DAMPER_FALL) - n["on"]
        t = np.arange(0, min(length - n["on"], damp + 0.5), 1 / SR)
        env = np.exp(-t / ring_time(n["p"])) * np.minimum(t / 0.003, 1)
        env *= np.where(t > damp, np.exp(-(t - damp) / DAMPED_DECAY), 1)
        tone = np.zeros_like(t)
        for k in range(1, 9):
            fk = f0 * k * np.sqrt(1 + 0.0004 * k * k)  # slight string stiffness
            if fk > SR / 2.2:
                break
            tone += np.sin(2 * np.pi * fk * t) * k ** -1.3 * np.exp(-t * 0.6 * (k - 1))
        seg = tone * env * (0.2 + 0.8 * n["v"])
        out[start : start + len(seg)] += seg[: len(out) - start]
    return out / (np.abs(out).max() + 1e-9) * 0.8


def onset_alignment(perf: dict, stem: np.ndarray) -> tuple[float, float]:
    heard = librosa.onset.onset_detect(y=stem, sr=SR, units="time", backtrack=False)
    played = []
    for n in sorted(perf["notes"], key=lambda n: n["on"]):
        if not played or n["on"] - played[-1] > 0.05:
            played.append(n["on"])
    gaps = np.array([np.min(np.abs(heard - t)) for t in played])
    return float(np.median(gaps) * 1000), float(np.mean(gaps < 0.05) * 100)


def chroma_match(a: np.ndarray, b: np.ndarray) -> float:
    ca = librosa.feature.chroma_cqt(y=a, sr=SR)
    cb = librosa.feature.chroma_cqt(y=b, sr=SR)
    n = min(ca.shape[1], cb.shape[1])
    ca, cb = ca[:, :n], cb[:, :n]
    energy = librosa.feature.rms(y=a)[0][:n]
    live = energy > np.percentile(energy, 30)
    cos = np.sum(ca * cb, 0) / (np.linalg.norm(ca, axis=0) * np.linalg.norm(cb, axis=0) + 1e-9)
    return float(np.mean(cos[live]))


def main() -> None:
    perf = json.loads(NOTES.read_text())
    stem, _ = librosa.load(str(STEMS / "piano.wav"), sr=SR, mono=True)
    synth = synthesize(perf, len(stem) / SR)
    stem = stem / (np.abs(stem).max() + 1e-9) * 0.8

    sf.write(str(DATA / "check.wav"), np.stack([stem, synth], axis=1), SR)
    sf.write(str(DATA / "check_synth.wav"), synth, SR)

    median_ms, within = onset_alignment(perf, stem)
    print(f"notes: {len(perf['notes'])}, pitch range {min(n['p'] for n in perf['notes'])}-"
          f"{max(n['p'] for n in perf['notes'])}")
    print(f"onsets: median gap to a heard onset {median_ms:.0f} ms, {within:.0f}% within 50 ms")
    print(f"harmony: chroma similarity {chroma_match(stem, synth):.2f} (1.0 = identical)")
    print(f"listen: {DATA / 'check.wav'} (left = stem, right = transcription)")


if __name__ == "__main__":
    main()
