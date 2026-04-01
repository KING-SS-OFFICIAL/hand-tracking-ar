# Full-Body AR Tracker

Real-time full-body tracking with AR overlays — face mesh, iris, hand gestures, body pose — runs entirely in the browser.

[![Live Demo](https://img.shields.io/badge/Live-Demo-00ffff?style=for-the-badge)](https://KING-SS-OFFICIAL.github.io/hand-tracking-ar)

## Tracking Capabilities

| Tracker | Landmarks | What it tracks |
|---------|-----------|----------------|
| **Body Pose** | 33 points | Full skeleton — shoulders, elbows, wrists, hips, knees, ankles, face outline |
| **Face Mesh** | 468 points | Face contour, lips, eyebrows, nose, sparse mesh dots |
| **Iris** | 10 points | Left + right iris ring + pupil center |
| **Hands** | 21 × 2 | Finger joints, gestures, AR effects |

## Features

- **9 gesture recognition**: Open Palm, Fist, Peace, Thumbs Up, Pinch, Pointing, Rock, Three, Four
- **Landmark smoothing** — exponential moving average eliminates jitter
- **Per-tracker toggles** — enable/disable Body, Face, Hands, Iris independently
- **AR effects on hands** — concentric rotating arcs, glowing skeleton, particle trails
- **Tracking score** — confidence % displayed on palm, always readable
- **Sci-fi data panel** — finger states (EXT/FLD), hand span, gesture name
- **5 color palettes** — `C` to cycle (Cyber Cyan, Neon Magenta, Toxic Green, Solar Gold, Ice Blue)
- **Front/Rear camera switch**
- **Video recording** — saves `.webm` to downloads
- **Fullscreen mode**

## Visual Style

| Element | Color |
|---------|-------|
| Body skeleton | Green `#00ff88` |
| Face contour + eyes | White/cyan |
| Iris ring | Magenta `#ff44aa` |
| Hand skeleton | Palette neon (per-finger) |
| AR arcs | Palette neon |
| Text overlays | Always readable (dual-canvas) |

## Controls

| Key | Action |
|-----|--------|
| `Q` | Stop camera |
| `C` | Cycle color palette |
| `S` | Toggle scan line |

| Button | Action |
|--------|--------|
| BODY / FACE / HANDS / IRIS | Toggle each tracker on/off |
| Camera icon | Switch front/rear camera |
| Red dot | Start/stop recording |
| Expand icon | Toggle fullscreen |

## Run Locally

```bash
git clone https://github.com/KING-SS-OFFICIAL/hand-tracking-ar.git
cd hand-tracking-ar
python3 -m http.server 8080
```

Open `http://localhost:8080` → click **START TRACKING**.

## Tech Stack

- [MediaPipe Hands](https://developers.google.com/mediapipe/solutions/vision/hand_landmarker) — 21-point hand landmarks
- [MediaPipe Pose](https://developers.google.com/mediapipe/solutions/vision/pose_landmarker) — 33-point body pose
- [MediaPipe Face Mesh](https://developers.google.com/mediapipe/solutions/vision/face_landmarker) — 468-point face + 10-point iris
- HTML5 Canvas 2D (dual canvas for readable text)
- MediaRecorder API

## License

MIT
