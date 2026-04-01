# Hand-Tracking AR Interface

Full-screen real-time hand tracking with a futuristic AR HUD overlay — runs entirely in the browser.

[![Live Demo](https://img.shields.io/badge/Live-Demo-00ffff?style=for-the-badge)](https://KING-SS-OFFICIAL.github.io/hand-tracking-ar)

## Features

### Hand Tracking
- **21-point landmark detection** at 0.7 confidence via MediaPipe WASM
- **9 gesture recognition**: Open Palm, Fist, Peace, Thumbs Up, Pinch, Pointing, Rock, Three, Four
- **Multi-hand support** — tracks up to 2 hands simultaneously

### AR Visuals
- **Glowing skeleton** with per-finger neon colors
- **3 concentric rotating arc rings** with orbiting marker dots
- **Particle trail system** — neon particles emit from each fingertip
- **Pinch ripple effect** — expanding shockwave rings on thumb-index contact
- **Holographic scan line** sweeping across the viewport
- **5 color palettes**: `C` to cycle (Cyber Cyan, Neon Magenta, Toxic Green, Solar Gold, Ice Blue)

### Readable Text Overlays (dual-canvas fix)
- Tracking score `%` on the palm — always left-to-right readable
- Sci-fi data panel with finger states (EXT/FLD), hand span, gesture name
- Gesture change badge notification

### Camera & Recording
- **Front / Rear camera switch** button
- **Video recording** — captures screen as `.webm`, auto-downloads to your device
- **Fullscreen mode** toggle

## Controls

| Key | Action |
|-----|--------|
| `Q` | Stop camera |
| `C` | Cycle color palette |
| `S` | Toggle scan line |

| Button | Action |
|--------|--------|
| Camera icon | Switch front/rear camera |
| Red dot | Start/stop recording |
| Expand icon | Toggle fullscreen |

## Run Locally

```bash
git clone https://github.com/KING-SS-OFFICIAL/hand-tracking-ar.git
cd hand-tracking-ar
python3 -m http.server 8080
```

Open `http://localhost:8080` → click **START CAMERA**.

## Deploy to GitHub Pages

1. Push repo to GitHub
2. **Settings → Pages** → Source: `Deploy from a branch` → Branch: `main` / `/ (root)`

## How Text Mirroring Is Solved

The app uses **two separate canvases**:

| Canvas | CSS `scaleX(-1)` | Purpose |
|--------|-----------------|---------|
| `#overlay` | Yes (mirrored) | AR visuals — skeleton, particles, arcs, ripples |
| `#text-layer` | No (normal) | All text — tracking score, data panel, gesture badge |

Video is mirrored for natural selfie view. AR lines follow the mirrored video on the overlay canvas. Text is drawn on the un-mirrored text-layer at `(1 - landmarkX) * width` so it appears at the correct screen position and is always readable.

## Tech Stack

- [MediaPipe Hands](https://developers.google.com/mediapipe/solutions/vision/hand_landmarker) (WASM)
- HTML5 Canvas 2D (dual canvas)
- @mediapipe/camera_utils
- MediaRecorder API (video capture)

## License

MIT
