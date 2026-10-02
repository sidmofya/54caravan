"""Turn notes.json into readable sheet music: score.musicxml and score.pdf.

Onsets snap to a sixteenth-note grid laid over the fitted beats. Each hand
is written as a single voice of chords, which keeps the page readable; the
pedal carries the sustain that the notation shortens.
"""
import io
import json

import cairosvg
import numpy as np
import verovio
from music21 import chord, clef, dynamics, expressions, key, layout, metadata, meter, note, pitch, stream
from pypdf import PdfReader, PdfWriter

from common import NOTES, SCORE_PDF, SCORE_XML, label

GRID = 4  # subdivisions per beat (sixteenths)
SPLIT = 60  # middle C and above go to the right hand
# Spell black keys as sharps, which suits E minor (D# leading tone, F#, C#).
NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def spell(midi: int) -> pitch.Pitch:
    return pitch.Pitch(f"{NAMES[midi % 12]}{midi // 12 - 1}")


def to_beats(t: float, beats: np.ndarray) -> float:
    idx = np.arange(len(beats), dtype=float)
    if t <= beats[-1]:
        return float(np.interp(t, beats, idx))
    return float(idx[-1] + (t - beats[-1]) / (beats[-1] - beats[-2]))


def hand_part(notes: list[dict], beats: np.ndarray, clef_name: str) -> stream.Part:
    events: dict[float, list[dict]] = {}
    for n in notes:
        on = round(to_beats(n["on"], beats) * GRID) / GRID
        off = round(to_beats(n["off"], beats) * GRID) / GRID
        events.setdefault(on, []).append({**n, "qoff": max(off, on + 1 / GRID)})

    part = stream.Part()
    onsets = sorted(events)
    for i, on in enumerate(onsets):
        group = events[on]
        end = max(g["qoff"] for g in group)
        if i + 1 < len(onsets):
            end = min(end, onsets[i + 1])
        length = max(end - on, 1 / GRID)
        pitches = [spell(p) for p in sorted({g["p"] for g in group})]
        el = note.Note(pitches[0]) if len(pitches) == 1 else chord.Chord(pitches)
        el.quarterLength = length
        part.insert(on, el)

    part.insert(0, clef.TrebleClef() if clef_name == "treble" else clef.BassClef())
    return part


def build_score(perf: dict) -> stream.Score:
    beats = np.array(perf["beats"])
    rh = hand_part([n for n in perf["notes"] if n["p"] >= SPLIT], beats, "treble")
    lh = hand_part([n for n in perf["notes"] if n["p"] < SPLIT], beats, "bass")

    score = stream.Score()
    score.metadata = metadata.Metadata()
    score.metadata.title = "While You Sleep"
    score.metadata.movementName = f"While You Sleep · piano, {label()} (draft transcription)"
    score.metadata.composer = "sonikalkebulan"

    key_sig = key.KeySignature(1)  # E minor / G major
    for i, part in enumerate((rh, lh)):
        part.insert(0, key_sig.__class__(key_sig.sharps))
        part.insert(0, meter.TimeSignature(f"{perf['beatsPerBar']}/4"))
        if i == 0:
            # Tempo as plain text: the PDF renderer lacks the music font that
            # a metronome-mark glyph needs.
            part.insert(0, expressions.TextExpression(f"Gently, about {round(perf['tempo'])} BPM"))
            part.insert(0, dynamics.Dynamic("p"))
        part.makeNotation(inPlace=True)
        score.insert(0, part)

    # Group the two staves as one piano system.
    score.insert(0, layout.StaffGroup([rh, lh], name="Piano", abbreviation="Pno.", symbol="brace"))
    return score


def render_pdf(xml_path: str, pdf_path: str) -> int:
    tk = verovio.toolkit()
    tk.setOptions(
        {
            "pageWidth": 2100,
            "pageHeight": 2970,
            "pageMarginTop": 120,
            "pageMarginBottom": 120,
            "pageMarginLeft": 120,
            "pageMarginRight": 120,
            "scale": 45,
            "footer": "none",
            "breaks": "auto",
        }
    )
    tk.loadFile(xml_path)
    writer = PdfWriter()
    for page in range(1, tk.getPageCount() + 1):
        svg = tk.renderToSVG(page)
        pdf = cairosvg.svg2pdf(bytestring=svg.encode())
        writer.add_page(PdfReader(io.BytesIO(pdf)).pages[0])
    with open(pdf_path, "wb") as fh:
        writer.write(fh)
    # Keep the first page as SVG too, for quick previews.
    with open(str(pdf_path).replace(".pdf", ".svg"), "w") as fh:
        fh.write(tk.renderToSVG(1))
    return tk.getPageCount()


def main() -> None:
    perf = json.loads(NOTES.read_text())
    score = build_score(perf)
    score.write("musicxml", fp=str(SCORE_XML))
    pages = render_pdf(str(SCORE_XML), str(SCORE_PDF))
    print(f"{SCORE_XML.name}, {SCORE_PDF.name} ({pages} page{'s' * (pages > 1)})")


if __name__ == "__main__":
    main()
