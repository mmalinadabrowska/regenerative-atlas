# Dial Up

A one-page site: the words **Dial Up** and a *say hello* link, over a
black-and-white spectrogram of a dial-up modem handshake scrolling past.

- `public/` — the site, served as-is (no build step).
- `public/media/handshake.webm` / `.mp4` — the background loop (16.5 s,
  ~0.3–0.5 MB),
  with `poster.jpg` as its still frame.
- `scripts/handshake.py` — synthesises the handshake from the signals the
  standards describe: dial tone, DTMF, ringback, the 2100 Hz answer tone with
  phase reversals, V.21 FSK call/joint menus, V.34 INFO0 and line probing,
  then the scrambled training noise.
- `scripts/render-video.sh` — turns that sound into the video (needs python3
  with numpy, and ffmpeg).

Run locally with any static server, e.g. `npx serve public` or
`python3 -m http.server -d public`.
