#!/usr/bin/env bash
# Assemble finished renders into the deliverables.
#
#   render/join.sh
#
# Expects out/cut2-a.mp4 and out/cut2-b.mp4 (cut 2 in two video-only halves,
# from render.mjs --no-audio) and out/while-you-sleep-0-30.mp4 (cut 1).
# Writes:
#   out/while-you-sleep-30-60.mp4        cut 2 with its audio
#   out/while-you-sleep-0-60.mp4         both cuts, one continuous soundtrack
#   out/*-share.mp4                      smaller copies for sending
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=data/source/while-you-sleep.mp3
OUT=out
ff() { ffmpeg -hide_banner -loglevel error -y "$@"; }

# Cut 2: join the halves (same encoder settings, so stream copy), then lay
# the source audio for 0:30-1:00 over it.
printf "file '%s'\nfile '%s'\n" "$PWD/$OUT/cut2-a.mp4" "$PWD/$OUT/cut2-b.mp4" > "$OUT/cut2-list.txt"
ff -f concat -safe 0 -i "$OUT/cut2-list.txt" -c copy "$OUT/cut2-video.mp4"
ff -i "$OUT/cut2-video.mp4" -ss 30 -t 30 -i "$SRC" -map 0:v -map 1:a -c:v copy \
  -af "afade=t=out:st=29.4:d=0.6" -c:a aac -b:a 192k -shortest -movflags +faststart \
  "$OUT/while-you-sleep-30-60.mp4"

# The full minute: cut 1's picture then cut 2's, under one unbroken stretch
# of the song (no seam at 0:30).
ff -i "$OUT/while-you-sleep-0-30.mp4" -i "$OUT/cut2-video.mp4" -t 60 -i "$SRC" \
  -filter_complex "[0:v][1:v]concat=n=2:v=1:a=0[v]" -map "[v]" -map 2:a \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p \
  -af "afade=t=out:st=59.4:d=0.6" -c:a aac -b:a 192k -movflags +faststart \
  "$OUT/while-you-sleep-0-60.mp4"

# Share copies, small enough to send.
ff -i "$OUT/while-you-sleep-30-60.mp4" -c:v libx264 -preset slow -crf 25 -pix_fmt yuv420p -c:a copy -movflags +faststart "$OUT/while-you-sleep-30-60-share.mp4"
ff -i "$OUT/while-you-sleep-0-60.mp4" -c:v libx264 -preset slow -crf 29 -pix_fmt yuv420p -c:a copy -movflags +faststart "$OUT/while-you-sleep-0-60-share.mp4"
ls -la "$OUT"/while-you-sleep-*.mp4
