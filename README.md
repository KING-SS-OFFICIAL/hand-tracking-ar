# Hand-Tracking AR Interface

Real-time hand tracking with a futuristic AR HUD overlay — runs entirely in the browser.

[![Live Demo](https://img.shields.io/badge/Live-Demo-00ffff?style=for-the-badge)](https://KING-SS-OFFICIAL.github.io/hand-tracking-ar)

![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)
![MediaPipe](https://img.shields.io/badge/MediaPipe-Hands-4285F4?style=flat&logo=google&logoColor=white)

## Features

- **21-point hand landmark tracking** at 0.7 confidence threshold
- **Futuristic AR HUD** — concentric rotating arcs, glowing skeleton, orbiting markers
- **Dynamic tracking score** that follows your palm in real-time
- **Mirrored webcam feed** for a natural user experience
- **Zero server dependency** — all processing happens client-side via MediaPipe WASM
- **Multi-hand support** — tracks up to 2 hands simultaneously
- **Smoothed FPS counter** for performance monitoring

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
├── index.html    # Entry point — video + canvas layout
├── style.css     # Futuristic dark theme, responsive
├── app.js        # MediaPipe Hands init, AR rendering, FPS
└── README.md
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Hand tracking | [MediaPipe Hands](https://developers.google.com/mediapipe/solutions/vision/hand_landmarker) (WASM) |
| Rendering | HTML5 Canvas 2D |
| Camera | @mediapipe/camera_utils |

## AR Elements

| Element | Description |
|---------|-------------|
| Skeleton | Glowing cyan lines + dots across all 21 landmarks |
| Concentric arcs | 3 rotating rings at radii 55/85/115px around the palm |
| Orbiting markers | Bright dots riding each arc ring |
| Tracking score | Confidence % rendered at palm center with backdrop |
| HUD | FPS counter + hand count in top-left overlay |

## Keyboard

| Key | Action |
|-----|--------|
| `Q` | Stop camera and tracking |

## License

MIT
