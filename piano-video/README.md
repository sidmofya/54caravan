# While You Sleep: piano animation

A code-built video of a white upright piano playing *While You Sleep* (sonikalkebulan), in two cuts at 1920×1080, 30 fps:

- **Cut 1, 0:00–0:30**: the piano plays. The keys go down, the hammers strike, the dampers lift and the strings ring, all in time with the recording, while the camera moves between the keyboard and the action.
- **Cut 2, 0:30–1:00**: a Powers-of-Ten dive into one hammer strike. The camera goes from the A3 hammer through felt meeting steel, inside the wire, the iron lattice, an iron atom and its nucleus, down to a proton, then rushes back out to the keys. Time slows the deeper we go, and each note sends a pulse through whatever scale is on screen.

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

# 3. Render (starts its own server)
node ../render/render.mjs                          # cut 1 -> out/while-you-sleep-0-30.mp4
node ../render/render.mjs --stills 3.5,9.95        # PNG stills -> out/stills/
node ../render/render.mjs --from 4.4 --to 6.6      # a short clip
node ../render/render.mjs --film journey --data 30-60 --audio-start 30   # cut 2
```

Cut 2's data comes from the same pipeline run on its section: `SEGMENT=30-60 ~/pv-venv/bin/python 01_prepare.py` and so on through `06_check.py`, which writes to `data/30-60/`.

`render.mjs` expects Chromium at `/opt/pw-browsers/chromium-1194`; set `CHROMIUM=/path/to/chrome` to override.

## Correcting the music

The transcription is automatic. The track is generated audio with vocals on top, so no "true" score exists to recover, and some quiet inner notes will be wrong or missing. To fix notes:

1. Edit `data/raw.mid` in any MIDI editor (or edit `data/notes.json` directly; each note is `{p, on, off, v}` in seconds).
2. Re-run `04_clean.py` (if you edited the MIDI) and `05_score.py`.
3. Re-render. The animation reads `notes.json`, so hammers follow the corrected notes.

## Cut 2: the dive

`web/src/journey/` holds cut 2. Each scale is its own small Three.js scene, in its own units, so fifteen orders of magnitude never strain floating point:

| Scene | Units | What it shows |
|---|---|---|
| `piano` | m | The piano from cut 1, flying in to the featured hammer (the loudest mid-keyboard note on the strike bar) |
| `hammer` | mm | Maple moulding grain, wool felt, the felt pressing into three strings, dust and fibres squeezed out |
| `contact` | µm | Crimped wool fibres, with cuticle scales, pressed into the wedge against the striated steel |
| `pearlite` | nm | Inside the cold-drawn wire: colonies of iron and iron-carbide plates, then a flight between two plates |
| `lattice` | Å | The body-centred cubic iron crystal; each note sends a phonon wave down the channel |
| `atom` | pm | Iron's 26 electrons as orbital clouds sampled from hydrogen-like wavefunctions at iron's real radii |
| `nucleus` | fm | The empty atom, then iron-56: 26 protons and 30 neutrons |
| `proton` | 0.1 fm | Two up quarks and a down, colour charges swapping, gluon flux tubes, virtual quark pairs |

`choreography.ts` sets the zoom (log₁₀ of frame width), the slow-motion factor and the handovers, cued to the bar grid: the strike on bar 2, the empty atom in the quiet breakdown, the proton as the chorus enters (0:48.3), and the landing on the keys at 0:52.7. `compositor.ts` dissolves between scales from the centre outward, then adds bloom, a zoom blur in the rush and film grain.

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
- Rendering uses software WebGL (SwiftShader) at about 3–9 s per frame, so each 30-second cut takes one to one and a half hours. Render long cuts in pieces with `--from`, `--to` and `--no-audio`, then mux the source audio over the joined video. On a machine with a GPU, the same script runs far faster.
