"""Shared paths and settings for the pipeline stages.

Set SEGMENT=30-60 (start-end in seconds) to work on another section of the
song; its files go to data/30-60/. Without it, the first cut (0-30) uses
data/ directly.
"""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
SOURCE = DATA / "source" / "while-you-sleep.mp3"
MODELS = DATA / "stems" / "models"  # separation weights, shared by all sections

SEGMENT = os.environ.get("SEGMENT", "")
_start, _end = (float(x) for x in SEGMENT.split("-")) if SEGMENT else (0.0, 30.0)
OUT = DATA / SEGMENT if SEGMENT else DATA

CLIP = OUT / "clip.wav"
STEMS = OUT / "stems"
RAW_MIDI = OUT / "raw.mid"
NOTES = OUT / "notes.json"
SCORE_XML = OUT / "score.musicxml"
SCORE_PDF = OUT / "score.pdf"

# The section being animated. The clip runs one second past the end so
# notes struck near the end still have audio to ring into.
START = _start
DURATION = _end - _start
TAIL = 1.0


def label() -> str:
    """Section as m:ss–m:ss, for titles."""
    fmt = lambda s: f"{int(s // 60)}:{int(s % 60):02d}"
    return f"{fmt(START)}–{fmt(START + DURATION)}"
