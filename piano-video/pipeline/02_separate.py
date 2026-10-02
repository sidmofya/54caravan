"""Pull the piano out of the mix.

First choice is Demucs htdemucs_6s, which has a dedicated piano stem and so
also drops vocals, bass, drums and guitar. If its weights are unreachable we
fall back to an MDX-Net instrumental model, which removes only the vocals.
Both download from GitHub releases into data/stems/models.
"""
import shutil
import sys

from audio_separator.separator import Separator

from common import CLIP, MODELS, STEMS

PIANO = STEMS / "piano.wav"
INSTRUMENTAL = STEMS / "instrumental.wav"


def run(model: str, names: dict[str, str]) -> None:
    sep = Separator(output_dir=str(STEMS), model_file_dir=str(MODELS), output_format="WAV")
    sep.load_model(model_filename=model)
    sep.separate(str(CLIP), custom_output_names=names)


STEMS.mkdir(parents=True, exist_ok=True)
try:
    run(
        "htdemucs_6s.yaml",
        {s: f"6s_{s}" for s in ("Vocals", "Drums", "Bass", "Guitar", "Piano", "Other")},
    )
    shutil.copy(STEMS / "6s_Piano.wav", PIANO)
    print(f"piano stem -> {PIANO}")
except Exception as err:  # noqa: BLE001 - any failure means use the fallback
    print(f"htdemucs_6s unavailable ({err}); falling back to vocal removal", file=sys.stderr)

run("UVR-MDX-NET-Inst_HQ_4.onnx", {"Instrumental": "instrumental", "Vocals": "vocals"})
print(f"instrumental -> {INSTRUMENTAL}")
if not PIANO.exists():
    shutil.copy(INSTRUMENTAL, PIANO)
