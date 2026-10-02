"""Shared paths and settings for the pipeline stages."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
SOURCE = DATA / "source" / "while-you-sleep.mp3"
CLIP = DATA / "clip.wav"
STEMS = DATA / "stems"
RAW_MIDI = DATA / "raw.mid"
NOTES = DATA / "notes.json"
SCORE_XML = DATA / "score.musicxml"
SCORE_PDF = DATA / "score.pdf"

# The cut being animated. The clip runs one second past the end so notes
# struck near 0:30 still have audio to ring into during transcription.
START = 0.0
DURATION = 30.0
TAIL = 1.0
