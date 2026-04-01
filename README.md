# Hand-Tracking AR Interface

Real-time hand tracking with a futuristic AR HUD overlay — runs entirely in the browser.

[![Live Demo](https://img.shields.io/badge/Live-Demo-00ffff?style=for-the-badge)](https://KING-SS-OFFICIAL.github.io/hand-tracking-ar)

![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)
![MediaPipe](https://img.shields.io/badge/MediaPipe-Hands-4285F4?style=flat&logo=google&logoColor=white)

## Features

### Core
- **21-point hand landmark tracking** at 0.7 confidence threshold
- **Mirrored webcam feed** for a natural user experience
- **Multi-hand support** — tracks up to 2 hands simultaneously
- **Zero server dependency** — all processing happens client-side via MediaPipe WASM

### Unique AR Effects
- **Gesture Detection** — recognizes Open Palm, Fist, Peace, Thumbs Up, Pinch, Pointing, Rock, Three, Four
- **Particle Trail System** — neon particles emit from each fingertip with gravity + fade
- **Pinch Ripple Effect** — expanding shockwave rings when thumb and index finger touch
- **Holographic Scan Line** — sweeping beam across the viewport
- **Per-Finger Colors** — each finger gets its own hue in the skeleton
- **Sci-Fi Data Panel** — floating readout showing finger states (EXT/FLD), hand span, gesture name
- **Gesture Badge** — large centered notification flashes on gesture change
- **5 Color Palettes** — cycle through Cyber Cyan, Neon Magenta, Toxic Green, Solar Gold, Ice Blue

### AR HUD Elements
| Element | Description |
|---------|-------------|
| Skeleton | Glowing lines + dots across all 21 landmarks, colored per finger |
| Concentric arcs | 3 rotating rings at radii 55/85/120px with 3 orbiting dots each |
| Tracking score | Confidence % at palm center with gesture + handedness subtitle |
| Data panel | Floating readout with finger states, hand span, current gesture |
| Scan line | Horizontal holographic sweep beam |
| Viewport glow | Subtle edge gradient matching current palette |

## Keyboard Controls

| Key | Action |
|-----|--------|
| `Q` | Stop camera and tracking |
| `C` | Cycle through 5 color palettes |
| `S` | Toggle holographic scan line |

## Quick Start

### Run locally

```bash
git clone https://github.com/KING-SS-OFFICIAL/hand-tracking-ar.git
cd hand-tracking-ar
python3 -m http.server 8080
```

Open `http://localhost:8080` in your browser. Click **START CAMERA** and allow webcam access.

### Deploy to GitHub Pages

1. Push this repo to GitHub
2. Go to **Settings → Pages**
3. Set **Source** to `Deploy from a branch`
4. Set **Branch** to `main` / `/ (root)`
5. Save — your app will be live at `https://KING-SS-OFFICIAL.github.io/hand-tracking-ar`

## Project Structure

```
hand-tracking-ar/
├── index.html    # Entry point — video + canvas layout, HUD stats
├── style.css     # Futuristic dark theme, responsive
├── app.js        # All logic: MediaPipe, gestures, particles, ripples, rendering
└── README.md
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Hand tracking | [MediaPipe Hands](https://developers.google.com/mediapipe/solutions/vision/hand_landmarker) (WASM) |
| Rendering | HTML5 Canvas 2D |
| Camera | @mediapipe/camera_utils |

## Color Palettes

| Palette | Primary | Vibe |
|---------|---------|------|
| Cyber Cyan | `#00ffff` | Default sci-fi look |
| Neon Magenta | `#ff00ff` | Synthwave / vaporwave |
| Toxic Green | `#39ff14` | Matrix / hacker |
| Solar Gold | `#ffd700` | Warm / premium |
| Ice Blue | `#80e0ff` | Cool / minimal |

## License

MIT
