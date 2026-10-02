"""Clean the raw transcription and fit a beat grid -> notes.json.

The beat grid comes from the piano's own chords rather than a generic beat
tracker: on this track librosa locks onto a 152 BPM pulse in the backing.
Chords with a bass note mark downbeats; we fit a steady bar length, then let
each downbeat snap to its chord so the grid follows small tempo drift.
"""
import json

import numpy as np
import pretty_midi
import soundfile as sf

from common import DURATION, NOTES, RAW_MIDI, STEMS

BEATS_PER_BAR = 4
MIN_DURATION = 0.03
CLUSTER = 0.06  # onsets this close count as one chord
BASS = 55  # G3; chords containing a note below this anchor downbeats


def load_notes(midi: pretty_midi.PrettyMIDI) -> list[dict]:
    notes = []
    for inst in midi.instruments:
        for n in inst.notes:
            if not 21 <= n.pitch <= 108 or n.end - n.start < MIN_DURATION:
                continue
            notes.append({"p": n.pitch, "on": n.start, "off": n.end, "vel": n.velocity})
    notes.sort(key=lambda n: (n["on"], n["p"]))
    # A key can't sound twice at once: end each note just before its repeat.
    last: dict[int, dict] = {}
    for n in notes:
        prev = last.get(n["p"])
        if prev and prev["off"] > n["on"] - 0.01:
            prev["off"] = max(prev["on"] + MIN_DURATION, n["on"] - 0.01)
        last[n["p"]] = n
    return notes


def load_pedal(midi: pretty_midi.PrettyMIDI) -> list[dict]:
    spans, down = [], None
    for inst in midi.instruments:
        for cc in sorted(inst.control_changes, key=lambda c: c.time):
            if cc.number != 64:
                continue
            if cc.value >= 64 and down is None:
                down = cc.time
            elif cc.value < 64 and down is not None:
                spans.append({"on": down, "off": cc.time})
                down = None
    if down is not None:
        spans.append({"on": down, "off": DURATION + 1})
    return spans


def chords(notes: list[dict]) -> list[dict]:
    groups: list[dict] = []
    for n in notes:
        if groups and n["on"] - groups[-1]["t"] < CLUSTER:
            g = groups[-1]
        else:
            g = {"t": n["on"], "weight": 0.0, "bass": False}
            groups.append(g)
        g["weight"] += n["vel"]
        g["bass"] |= n["p"] < BASS
    return groups


def fit_downbeats(groups: list[dict]) -> list[float]:
    anchors = [g for g in groups if g["bass"]]
    times = np.array([g["t"] for g in anchors])
    weights = np.array([g["weight"] for g in anchors])
    best = (-1.0, 0.0, 0.0)
    for bar in np.arange(1.8, 2.6, 0.002):
        for phase in np.arange(0, bar, 0.01):
            d = (times - phase) % bar
            d = np.minimum(d, bar - d)
            score = float(np.sum(weights * np.exp(-((d / 0.06) ** 2) / 2)))
            if score > best[0]:
                best = (score, bar, phase)
    _, bar, phase = best

    # Walk bar by bar from the first chord. Each predicted downbeat snaps to
    # the strongest nearby bass chord, and the bar length follows the drift
    # (the intro is played a little slower than the verse).
    first = times[np.argmin(np.abs(times - phase))]
    out = [float(first)]
    while out[-1] < DURATION + bar:
        pred = out[-1] + bar
        near = np.abs(times - pred) < 0.3
        if near.any():
            fit = weights[near] * np.exp(-(((times[near] - pred) / 0.12) ** 2) / 2)
            hit = float(times[near][np.argmax(fit)])
            bar = 0.6 * bar + 0.4 * (hit - out[-1])
            out.append(hit)
        else:
            out.append(pred)
    # A section starting mid-song needs bars before its first bass chord too.
    first_bar = out[1] - out[0] if len(out) > 1 else bar
    while out[0] > 0:
        out.insert(0, out[0] - first_bar)
    print(f"bar {bar:.3f}s -> {60 * BEATS_PER_BAR / bar:.1f} BPM, first downbeat {out[0]:.2f}s")
    return out


def bar_vocal_energy(downbeats: list[float]) -> list[float]:
    """Mean vocal loudness in each bar (0..1), to find where the chorus lands."""
    path = STEMS / "vocals.wav"
    if not path.exists():
        return []
    audio, sr = sf.read(str(path))
    mono = audio.mean(axis=1) if audio.ndim > 1 else audio
    energy = []
    for a, b in zip(downbeats, downbeats[1:]):
        seg = mono[max(int(a * sr), 0) : max(int(b * sr), 0)]
        energy.append(float(np.sqrt(np.mean(seg**2))) if len(seg) else 0.0)
    peak = max(energy) or 1.0
    return [round(e / peak, 3) for e in energy]


def beats_from(downbeats: list[float]) -> list[float]:
    beats = []
    for a, b in zip(downbeats, downbeats[1:]):
        beats += [a + (b - a) * k / BEATS_PER_BAR for k in range(BEATS_PER_BAR)]
    return beats


def main() -> None:
    midi = pretty_midi.PrettyMIDI(str(RAW_MIDI))
    notes = load_notes(midi)
    pedal = load_pedal(midi)
    downbeats = fit_downbeats(chords(notes))
    beats = beats_from(downbeats)

    # Spread Transkun's quiet velocities (mostly 16-75 here) across 0..1 so
    # loud and soft strikes look different on screen.
    vels = np.array([n["vel"] for n in notes])
    lo, hi = np.percentile(vels, 5), np.percentile(vels, 98)
    for n in notes:
        n["v"] = round(float(np.clip((n["vel"] - lo) / (hi - lo), 0, 1)) * 0.85 + 0.15, 3)

    tempo = 60 * BEATS_PER_BAR / float(np.median(np.diff(downbeats)))
    out = {
        "duration": DURATION,
        "tempo": round(tempo, 2),
        "beatsPerBar": BEATS_PER_BAR,
        "beats": [round(b, 4) for b in beats if b <= DURATION + 1],
        "downbeats": [round(b, 4) for b in downbeats if b <= DURATION + 1],
        "barVocal": bar_vocal_energy([b for b in downbeats if b <= DURATION + 1]),
        "notes": [
            {"p": n["p"], "on": round(n["on"], 4), "off": round(n["off"], 4), "v": n["v"], "vel": n["vel"]}
            for n in notes
            if n["on"] < DURATION
        ],
        "pedal": [{"on": round(s["on"], 4), "off": round(s["off"], 4)} for s in pedal if s["on"] < DURATION],
    }
    NOTES.write_text(json.dumps(out, indent=1))
    print(f"{len(out['notes'])} notes, {len(out['pedal'])} pedal presses -> {NOTES}")


if __name__ == "__main__":
    main()
