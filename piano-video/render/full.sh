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
#   out/web/while-you-sleep.mp4         about 8 Mbit/s, fragmented for streaming
#   out/web/part-NN.bin                 that file cut into pieces of 15 MB or less
#   out/while-you-sleep-60-152-share.mp4, -152-209-share.mp4
#                                       the new sections, small enough to send
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=data/source/while-you-sleep.mp3
OUT=out
ff() { ffmpeg -hide_banner -loglevel error -y "$@"; }

ls "$OUT"/song-*.mp4 | sort | sed "s#^#file '$PWD/#; s#\$#'#" > "$OUT/song-list.txt"
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

# For the web page: about 8 Mbit/s, a keyframe every two seconds, fragmented
# so the page can stream it piece by piece through Media Source Extensions.
mkdir -p "$OUT/web"
rm -f "$OUT"/web/part-*.bin
ff -i "$OUT/while-you-sleep-full.mp4" -c:v libx264 -preset slow -b:v 7600k -maxrate 9500k -bufsize 15000k \
  -profile:v high -level 4.0 -pix_fmt yuv420p -g 60 -keyint_min 60 -sc_threshold 0 -c:a copy \
  -movflags frag_keyframe+empty_moov+default_base_moof "$OUT/web/while-you-sleep.mp4"
split -b 15000000 -d -a 2 --additional-suffix=.bin "$OUT/web/while-you-sleep.mp4" "$OUT/web/part-"

# Share copies of the new sections.
ff -ss 60 -to 151.6 -i "$OUT/while-you-sleep-full.mp4" -c:v libx264 -preset slow -crf 28 -pix_fmt yuv420p \
  -c:a aac -b:a 128k -movflags +faststart "$OUT/while-you-sleep-60-152-share.mp4"
ff -ss 151.6 -i "$OUT/while-you-sleep-full.mp4" -c:v libx264 -preset slow -crf 28 -pix_fmt yuv420p \
  -c:a aac -b:a 128k -movflags +faststart "$OUT/while-you-sleep-152-209-share.mp4"
ls -la "$OUT"/while-you-sleep-full.mp4 "$OUT"/web/ "$OUT"/while-you-sleep-*-share.mp4
