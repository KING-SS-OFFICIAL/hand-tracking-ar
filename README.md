# Neural Web — Hand-Tracking Interface

A futuristic sci-fi hand-tracking visualization using MediaPipe and Canvas. Single HTML file, runs entirely in the browser.

[![Live Demo](https://img.shields.io/badge/Live-Demo-00ffff?style=for-the-badge)](https://KING-SS-OFFICIAL.github.io/hand-tracking-ar)

## The Concept

A deep black void. Neon-cyan points appear on your 21 hand landmarks. When two hands are detected, **every point connects to every point of the other hand** — 441 glowing lines forming a neural web between your palms.

Move fast → particle trails ignite. Show your palms → electric purple surge, glow intensifies.

## Features

- **21-point hand tracking** per hand via MediaPipe WASM
- **441 neural web connections** (21×21) between two hands
- **Digital flicker** — each line pulses with unique sine-wave phase
- **Palm detection** — lines shift cyan → electric purple when palms face camera
- **Motion particles** — speed-based particle glow on fast hand movement
- **Low-light preprocessing** — brightness + contrast boost for dark rooms
- **Smoothed landmarks** — exponential moving average eliminates jitter
- **Minimalist HUD** — four corners with System Status, FPS, Latency, Connections, Signal
- **Mirrored webcam** — natural digital mirror feel
- **Single file** — just `index.html`, no build step

## Visual Style

| Element | Color | Effect |
|---------|-------|--------|
| Default lines | Cyan `#00ffff` | Glow + flicker |
| Palm mode lines | Purple `#cc44ff` | Intensified glow |
| Landmark dots | White core + colored glow | Pulse animation |
| Background | Black + subtle grid | Vignette overlay |
| HUD | Cyan monospace | Corner panels |

## Controls

| Key | Action |
|-----|--------|
| `Q` | Stop camera |

## Run Locally

```bash
git clone https://github.com/KING-SS-OFFICIAL/hand-tracking-ar.git
cd hand-tracking-ar
python3 -m http.server 8080
```

Open `http://localhost:8080` → click **INITIALIZE**.

## How It Works

1. **Camera** → `getUserMedia` with front-facing constraints
2. **Preprocessing** → every frame is brightened (+25 brightness, 1.35× contrast) for low-light reliability
3. **MediaPipe Hands** → detects up to 2 hands, 21 landmarks each
4. **Smoothing** → EMA (alpha 0.4) on all coordinates
5. **Neural Web** → for each pair of points across hands, draw a line with distance-based opacity and per-line flicker
6. **Palm detection** → checks z-depth + finger spread to determine if palm faces camera → switches to purple mode

## Tech Stack

- [MediaPipe Hands](https://developers.google.com/mediapipe/solutions/vision/hand_landmarker) — WASM hand tracking
- HTML5 Canvas 2D — all rendering
- Vanilla JS — no frameworks, single file

## License

MIT
