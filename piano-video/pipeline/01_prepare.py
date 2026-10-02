"""Cut the animated section out of the source track as a 44.1 kHz WAV."""
import subprocess

from common import CLIP, DURATION, SOURCE, START, TAIL

CLIP.parent.mkdir(parents=True, exist_ok=True)

subprocess.run(
    [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-ss", str(START), "-t", str(DURATION + TAIL),
        "-i", str(SOURCE), "-ac", "2", "-ar", "44100", str(CLIP),
    ],
    check=True,
)
print(f"wrote {CLIP}")
