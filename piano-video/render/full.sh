#!/usr/bin/env bash
# Assemble the whole song: cut 1, cut 2 and the 1:00-3:29 film, under one
# unbroken pass of the source audio.
#
#   render/full.sh
#
# Expects out/while-you-sleep-0-30.mp4 (cut 1), out/cut2-video.mp4 (cut 2,
# picture only) and out/song-*.mp4: the 1:00-3:29 film in video-only pieces
# from render.mjs --film song --no-audio, named so they sort in order.
# Writes:
#   out/while-you-sleep-full.mp4        the master (1080p, high quality)
#   out/web/init.mp4, seg-NN.m4s        about 8 Mbit/s, in twelve-second streaming pieces
#   out/web/segments.json               each piece's start time, for the page
#   out/while-you-sleep-60-152-share.mp4, -152-209-share.mp4
#                                       the new sections, small enough to send
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=data/source/while-you-sleep.mp3
OUT=out
ff() { ffmpeg -hide_banner -loglevel error -y "$@"; }

ls "$OUT"/song-0*.mp4 | sort | sed "s#^#file '$PWD/#; s#\$#'#" > "$OUT/song-list.txt"
ff -f concat -safe 0 -i "$OUT/song-list.txt" -c copy "$OUT/song-video.mp4"
LEN=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/song-video.mp4")
TOTAL=$(python3 -c "print(round(60 + $LEN, 3))")
echo "song pieces: ${LEN}s, whole film ${TOTAL}s"

# The master: all three pictures, one soundtrack, a fade on the last breath.
ff -i "$OUT/while-you-sleep-0-30.mp4" -i "$OUT/cut2-video.mp4" -i "$OUT/song-video.mp4" -t "$TOTAL" -i "$SRC" \
  -filter_complex "[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]" -map "[v]" -map 3:a \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p \
  -af "afade=t=out:st=$(python3 -c "print($TOTAL - 1.5)"):d=1.5" -c:a aac -b:a 192k -movflags +faststart \
  "$OUT/while-you-sleep-full.mp4"

# For the web page: about 8 Mbit/s, a keyframe every two seconds, cut into
# twelve-second fragmented-MP4 pieces (each under 15 MB) that the page
# streams through Media Source Extensions and joins back into one file.
mkdir -p "$OUT/web"
rm -f "$OUT"/web/*
ff -i "$OUT/while-you-sleep-full.mp4" -c:v libx264 -preset slow -b:v 7600k -maxrate 9500k -bufsize 15000k \
  -profile:v high -level 4.0 -pix_fmt yuv420p -g 60 -keyint_min 60 -sc_threshold 0 -c:a aac -b:a 160k \
  -f hls -hls_time 12 -hls_playlist_type vod -hls_segment_type fmp4 -hls_fmp4_init_filename init.mp4 \
  -hls_segment_filename "$OUT/web/seg-%02d.m4s" "$OUT/web/stream.m3u8"
python3 - "$OUT/web" <<'PY'
import json, os, re, sys
web = sys.argv[1]
lines = open(os.path.join(web, "stream.m3u8")).read().splitlines()
segs, t = [], 0.0
for i, line in enumerate(lines):
    m = re.match(r"#EXTINF:([0-9.]+)", line)
    if m:
        d = float(m.group(1))
        segs.append({"file": "video/" + lines[i + 1].strip(), "start": round(t, 3), "dur": d})
        t += d
sizes = [os.path.getsize(os.path.join(web, s["file"].split("/")[1])) for s in segs]
assert max(sizes) <= 15_000_000, f"a piece is {max(sizes)} bytes"
json.dump({"segments": segs, "bytes": sum(sizes) + os.path.getsize(os.path.join(web, "init.mp4"))}, open(os.path.join(web, "segments.json"), "w"))
print(f"{len(segs)} pieces, {t:.2f}s, largest {max(sizes)/1e6:.1f} MB, total {sum(sizes)/1e6:.1f} MB")
PY

# Share copies of the new sections.
ff -ss 60 -to 151.6 -i "$OUT/while-you-sleep-full.mp4" -c:v libx264 -preset slow -crf 28 -pix_fmt yuv420p \
  -c:a aac -b:a 128k -movflags +faststart "$OUT/while-you-sleep-60-152-share.mp4"
ff -ss 151.6 -i "$OUT/while-you-sleep-full.mp4" -c:v libx264 -preset slow -crf 28 -pix_fmt yuv420p \
  -c:a aac -b:a 128k -movflags +faststart "$OUT/while-you-sleep-152-209-share.mp4"
ls -la "$OUT"/while-you-sleep-full.mp4 "$OUT"/web/ "$OUT"/while-you-sleep-*-share.mp4
