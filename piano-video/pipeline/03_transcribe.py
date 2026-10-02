"""Transcribe the piano stem to MIDI with Transkun (weights ship in its wheel).

Also transcribes the untouched mix, so 06_check can show how much the vocal
removal helped.
"""
import subprocess
import sys
from pathlib import Path

from common import CLIP, DATA, RAW_MIDI, STEMS

TRANSKUN = Path(sys.executable).with_name("transkun")


def transcribe(audio: Path, out: Path) -> None:
    subprocess.run([str(TRANSKUN), str(audio), str(out), "--device", "cpu"], check=True)
    print(f"{audio.name} -> {out}")


transcribe(STEMS / "piano.wav", RAW_MIDI)
if "--with-mix" in sys.argv:
    transcribe(CLIP, DATA / "stems" / "mix.mid")
