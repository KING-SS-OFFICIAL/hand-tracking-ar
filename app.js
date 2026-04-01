const CYAN = "#00ffff";
const CYAN_DIM = "#00b4b4";
const CYAN_BRIGHT = "#66ffff";
const CYAN_GLOW = "rgba(0,255,255,0.35)";
const DARK_BG = "rgba(10,10,15,0.6)";

const FINGER_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
];

const FINGER_TIPS = [4, 8, 12, 16, 20];
const PALM_LANDMARKS = [0, 1, 5, 9, 13, 17];

let rotationAngle = 0;
let fps = 0;
let lastFrameTime = performance.now();
let smoothedFps = 0;

// DOM
const video = document.getElementById("webcam");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");
const fpsEl = document.getElementById("fps");
const handCountEl = document.getElementById("hand-count");
const statusEl = document.getElementById("status");
const startOverlay = document.getElementById("start-overlay");
const startBtn = document.getElementById("start-btn");

// ─── Glow drawing helpers ──────────────────────────────────────

function glowLine(x1, y1, x2, y2, color, width = 1.5) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  // outer glow pass
  ctx.globalAlpha = 0.3;
  ctx.shadowBlur = 24;
  ctx.lineWidth = width + 2;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

function glowDot(x, y, r, color) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  // brighter core
  ctx.globalAlpha = 0.9;
  ctx.shadowBlur = 6;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(x, y, r * 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function glowArc(cx, cy, radius, startAngle, sweep, color, width = 1.5) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(cx, cy, radius, startAngle, startAngle + sweep);
  ctx.stroke();
  // glow pass
  ctx.globalAlpha = 0.25;
  ctx.shadowBlur = 22;
  ctx.lineWidth = width + 3;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, startAngle, startAngle + sweep);
  ctx.stroke();
  ctx.restore();
}

function drawSkeleton(landmarks, w, h) {
  for (const [i, j] of FINGER_CONNECTIONS) {
    glowLine(
      landmarks[i].x * w, landmarks[i].y * h,
      landmarks[j].x * w, landmarks[j].y * h,
      CYAN, 1.2
    );
  }
  for (let i = 0; i < landmarks.length; i++) {
    const x = landmarks[i].x * w;
    const y = landmarks[i].y * h;
    if (FINGER_TIPS.includes(i)) {
      glowDot(x, y, 6, CYAN_BRIGHT);
    } else if (i === 0) {
      glowDot(x, y, 7, CYAN_BRIGHT);
    } else {
      glowDot(x, y, 3.5, CYAN);
    }
  }
}

function drawConcentricCircles(cx, cy) {
  rotationAngle += 0.025;
  const radii = [55, 85, 115];
  for (let idx = 0; idx < radii.length; idx++) {
    const r = radii[idx];
    const dir = idx % 2 === 0 ? 1 : -1;
    const angle = rotationAngle * dir * (1 + idx * 0.3);
    const sweep = (2.1 - idx * 0.35);
    // two arcs opposite each other
    glowArc(cx, cy, r, angle, sweep, CYAN, 1);
    glowArc(cx, cy, r, angle + Math.PI, sweep, CYAN, 1);
    // orbiting dot
    const dx = cx + r * Math.cos(angle);
    const dy = cy + r * Math.sin(angle);
    glowDot(dx, dy, 3, CYAN_BRIGHT);
  }
}

function drawTrackingScore(landmarks, w, h, handedness, confidence) {
  // palm center
  let px = 0, py = 0;
  for (const i of PALM_LANDMARKS) {
    px += landmarks[i].x;
    py += landmarks[i].y;
  }
  px = (px / PALM_LANDMARKS.length) * w;
  py = (py / PALM_LANDMARKS.length) * h;

  const score = Math.round(confidence * 100);
  const label = `${score}%`;
  ctx.save();
  ctx.font = "bold 32px 'Segoe UI', system-ui, sans-serif";
  const tw = ctx.measureText(label).width;
  // backdrop
  ctx.fillStyle = DARK_BG;
  ctx.beginPath();
  roundRect(ctx, px - tw / 2 - 12, py - 22, tw + 24, 48, 6);
  ctx.fill();
  // border
  ctx.strokeStyle = "rgba(0,255,255,0.2)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  roundRect(ctx, px - tw / 2 - 12, py - 22, tw + 24, 48, 6);
  ctx.stroke();
  // text
  ctx.shadowColor = CYAN_GLOW;
  ctx.shadowBlur = 10;
  ctx.fillStyle = CYAN;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, px, py);
  // subtitle
  ctx.font = "500 11px 'Segoe UI', system-ui, sans-serif";
  ctx.shadowBlur = 0;
  ctx.fillStyle = CYAN_DIM;
  ctx.fillText(`CONF  ${handedness.toUpperCase()}`, px, py + 28);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}

function drawHandId(landmarks, w, h, idx) {
  const x = landmarks[0].x * w;
  const y = landmarks[0].y * h;
  ctx.save();
  ctx.font = "500 10px 'Segoe UI', system-ui, sans-serif";
  ctx.fillStyle = CYAN_DIM;
  ctx.textAlign = "center";
  ctx.fillText(`HAND ${idx}`, x, y + 30);
  ctx.restore();
}

// ─── FPS ────────────────────────────────────────────────────────

function updateFps() {
  const now = performance.now();
  const dt = now - lastFrameTime;
  lastFrameTime = now;
  if (dt > 0) {
    const instantFps = 1000 / dt;
    smoothedFps = smoothedFps * 0.9 + instantFps * 0.1;
  }
  fpsEl.textContent = Math.round(smoothedFps);
}

// ─── MediaPipe callback ─────────────────────────────────────────

function onResults(results) {
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);
  updateFps();

  if (results.multiHandLandmarks && results.multiHandedness) {
    const count = results.multiHandLandmarks.length;
    handCountEl.textContent = count;
    for (let i = 0; i < count; i++) {
      const lm = results.multiHandLandmarks[i];
      const handedness = results.multiHandedness[i].label;
      const confidence = results.multiHandedness[i].score;
      drawSkeleton(lm, w, h);
      // palm center for circles
      let cx = 0, cy = 0;
      for (const pi of PALM_LANDMARKS) {
        cx += lm[pi].x;
        cy += lm[pi].y;
      }
      cx = (cx / PALM_LANDMARKS.length) * w;
      cy = (cy / PALM_LANDMARKS.length) * h;
      drawConcentricCircles(cx, cy);
      drawTrackingScore(lm, w, h, handedness, confidence);
      drawHandId(lm, w, h, i + 1);
    }
  } else {
    handCountEl.textContent = "0";
  }
}

// ─── Init ───────────────────────────────────────────────────────

async function start() {
  startOverlay.classList.add("hidden");
  statusEl.textContent = "LOADING MODEL...";

  const hands = new Hands({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`,
  });

  hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.7,
  });

  hands.onResults(onResults);

  statusEl.textContent = "STARTING CAMERA...";

  const camera = new Camera(video, {
    onFrame: async () => {
      await hands.send({ image: video });
    },
    width: 1280,
    height: 720,
  });

  await camera.start();
  statusEl.textContent = "TRACKING";
  statusEl.style.borderColor = CYAN;
}

startBtn.addEventListener("click", start);

document.addEventListener("keydown", (e) => {
  if (e.key === "q" || e.key === "Q") {
    statusEl.textContent = "STOPPED";
    video.srcObject?.getTracks().forEach((t) => t.stop());
  }
});
