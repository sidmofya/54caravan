# While You Sleep: piano animation

A code-built video of a white upright piano playing the opening of *While You Sleep* (sonikalkebulan). The keys go down, the hammers strike, the dampers lift and the strings ring, all in time with the recording. The camera moves between the keyboard and the action.

This first cut covers **0:00–0:30** at 1920×1080, 30 fps.

## How it works

```
source mp3 ──► vocal removal ──► Transkun piano transcription ──► notes.json ──► Three.js piano ──► MP4
                                                      └──► score.musicxml / score.pdf
```

1. **pipeline/** (Python) turns audio into notes and sheet music.
2. **web/** (Vite + TypeScript + Three.js) is the 3D piano. Every moving part is a pure function of time, so any frame renders the same way twice.
3. **render/render.mjs** steps through the frames in headless Chromium and pipes them to ffmpeg with the original audio.

## Running it

```bash
# 1. Audio -> notes -> score (Python 3.11)
python3 -m venv ~/pv-venv && ~/pv-venv/bin/pip install -r pipeline/requirements.txt
cd pipeline
~/pv-venv/bin/python 01_prepare.py      # cut 0:00-0:31 to data/clip.wav
~/pv-venv/bin/python 02_separate.py     # strip vocals -> data/stems/piano.wav
~/pv-venv/bin/python 03_transcribe.py   # Transkun -> data/raw.mid
~/pv-venv/bin/python 04_clean.py        # beat grid, cleanup -> data/notes.json
~/pv-venv/bin/python 05_score.py        # -> data/score.musicxml, data/score.pdf
~/pv-venv/bin/python 06_check.py        # -> data/check.wav (left: stem, right: transcription)

# 2. Live preview with audio
cd ../web && npm install && npm run dev  # http://127.0.0.1:5173
npm test                                 # timeline tests (hammer contact on every onset, dampers, pedal)

# 3. Render (dev server must be running)
node ../render/render.mjs                          # full video -> out/while-you-sleep-0-30.mp4
node ../render/render.mjs --stills 3.5,9.95        # PNG stills -> out/stills/
node ../render/render.mjs --from 4.4 --to 6.6      # a short clip
```

`render.mjs` expects Chromium at `/opt/pw-browsers/chromium-1194`; set `CHROMIUM=/path/to/chrome` to override.

## Correcting the music

The transcription is automatic. The track is generated audio with vocals on top, so no "true" score exists to recover, and some quiet inner notes will be wrong or missing. To fix notes:

1. Edit `data/raw.mid` in any MIDI editor (or edit `data/notes.json` directly; each note is `{p, on, off, v}` in seconds).
2. Re-run `04_clean.py` (if you edited the MIDI) and `05_score.py`.
3. Re-render. The animation reads `notes.json`, so hammers follow the corrected notes.

## Directing the camera

`web/src/director.ts` holds the shot plan (`PLAN`): a list of shots measured in bars, each with a kind and how long it takes to move in from the previous shot (0 means a cut).

| Shot | What it shows |
|---|---|
| `wide` | The whole piano in the lamp-lit room, pushing in |
| `medium` | A slow orbit around the piano |
| `keys` | A low close-up on the keyboard, following where the music is |
| `action` | A high three-quarter view of hammers striking strings |
| `row` | Inside the case, looking down the line of hammers |
| `macro` | One hammer hitting its strings, chosen as the loudest note in the bar |
| `outro` | Pulling back out of the room |

## Notes on the environment

- Hugging Face, Zenodo and Facebook's model host are unreachable from the build container, so the pipeline uses models that ship in pip wheels or GitHub releases: Transkun for transcription and an MDX-Net model for vocal removal. Demucs' six-stem model, which has a dedicated piano stem, would separate more cleanly where its weights can be downloaded; `02_separate.py` tries it first.
- Rendering uses software WebGL (SwiftShader) at about 4–7 s per frame, so the 30-second cut takes roughly an hour. On a machine with a GPU, the same script runs far faster.
