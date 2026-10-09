#!/bin/sh
# Rebuild the background video from scratch: synthesise the handshake, draw
# its spectrogram in black and white, then pan across it in a seamless loop.
# Needs python3 (with numpy) and ffmpeg.
set -e
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

python3 scripts/handshake.py "$tmp/handshake.wav"

# 16.5 s of audio drawn 3300 px wide = 200 px per second of scroll.
ffmpeg -v error -y -i "$tmp/handshake.wav" -lavfi \
  "showspectrumpic=s=3300x1080:legend=0:color=intensity:scale=log:gain=1.5,format=gray,eq=contrast=2.2:brightness=-0.05,negate" \
  "$tmp/spectrum.png"

ffmpeg -v error -y -loop 1 -framerate 25 -i "$tmp/spectrum.png" -i "$tmp/handshake.wav" \
  -filter_complex "[0]split[a][b];[a][b]hstack,crop=1920:1080:x='mod(t*200\,3300)':y=0,format=yuv420p[v]" \
  -map "[v]" -map 1:a -t 16.5 -c:v libx264 -preset slow -crf 30 -tune grain \
  -movflags +faststart -c:a aac -b:a 64k public/media/handshake.mp4

ffmpeg -v error -y -i public/media/handshake.mp4 -c:v libvpx-vp9 -b:v 0 -crf 42 -row-mt 1 -an \
  public/media/handshake.webm

ffmpeg -v error -y -ss 4 -i public/media/handshake.mp4 -frames:v 1 -q:v 4 public/media/poster.jpg
echo "wrote public/media/handshake.{mp4,webm} and public/media/poster.jpg"
