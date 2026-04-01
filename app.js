// ═══════════════════════════════════════════════════════════════════
//  HAND-TRACKING AR
// ═══════════════════════════════════════════════════════════════════

const PALETTES = [
  { name: "CYBER CYAN",   primary: "#00ffff", dim: "#00b4b4", bright: "#66ffff", glow: "rgba(0,255,255,0.35)",    fingers: ["#00ffff","#00e5ff","#00d4ff","#00c3ff","#00b2ff"] },
  { name: "NEON MAGENTA", primary: "#ff00ff", dim: "#b400b4", bright: "#ff66ff", glow: "rgba(255,0,255,0.35)",    fingers: ["#ff00ff","#ff00e5","#ff00cc","#ff00b2","#ff0099"] },
  { name: "TOXIC GREEN",  primary: "#39ff14", dim: "#28b40e", bright: "#7fff50", glow: "rgba(57,255,20,0.35)",    fingers: ["#39ff14","#50ff20","#66ff33","#7fff40","#99ff55"] },
  { name: "SOLAR GOLD",   primary: "#ffd700", dim: "#b49600", bright: "#ffe44d", glow: "rgba(255,215,0,0.35)",    fingers: ["#ffd700","#ffcc00","#ffc300","#ffba00","#ffb000"] },
  { name: "ICE BLUE",     primary: "#80e0ff", dim: "#5aaac0", bright: "#b0f0ff", glow: "rgba(128,224,255,0.35)",  fingers: ["#80e0ff","#70d8ff","#60d0ff","#50c8ff","#40c0ff"] },
];

let paletteIdx = 0;
let P = PALETTES[0];
const DARK_BG = "rgba(10,10,15,0.6)";

const FINGER_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
];
const CONNECTION_FINGER = [
  0,0,0,0,  1,1,1,1,  2,2,2,2,  3,3,3,3,  4,4,4,4,  -1,-1,-1,
];
const FINGER_TIPS = [4, 8, 12, 16, 20];
const PALM_LANDMARKS = [0, 1, 5, 9, 13, 17];
const FINGER_NAMES = ["THUMB", "INDEX", "MIDDLE", "RING", "PINKY"];

let rotationAngle = 0;
let lastFrameTime = performance.now();
let smoothedFps = 0;
let scanLineY = -1;
let scanLineEnabled = true;
let particles = [];
let ripples = [];
let prevGesture = "NONE";
let gestureStableFrames = 0;

const video = document.getElementById("webcam");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");
const fpsEl = document.getElementById("fps");
const handCountEl = document.getElementById("hand-count");
const gestureEl = document.getElementById("gesture-name");
const particleCountEl = document.getElementById("particle-count");
const statusEl = document.getElementById("status");
const startOverlay = document.getElementById("start-overlay");
const startBtn = document.getElementById("start-btn");

// ─── Landmark → screen (mirrored) ────────────────────────────────
// CSS scaleX(-1) mirrors the canvas.  A landmark at normalised x
// appears on screen at (1-x).  We pre-mirror coordinates so text
// drawn at the "wrong" canvas position shows up correctly on screen.

function sx(lmX, w) { return (1 - lmX) * w; }
function sy(lmY, h) { return lmY * h; }

// ─── Drawing helpers (on ctx, which is CSS-mirrored) ──────────────

function roundRect(c, x, y, w, h, r) {
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y);
  c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r);
  c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r);
  c.quadraticCurveTo(x, y, x + r, y);
}

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
  ctx.globalAlpha = 0.9;
  ctx.shadowBlur = 6;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(x, y, r * 0.35, 0, Math.PI * 2);
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
  ctx.globalAlpha = 0.25;
  ctx.shadowBlur = 22;
  ctx.lineWidth = width + 3;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, startAngle, startAngle + sweep);
  ctx.stroke();
  ctx.restore();
}

// ─── Gesture detection ───────────────────────────────────────────

function dist2D(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}
function isFingerExtended(lm, tip, pip) {
  return dist2D(lm[tip], lm[0]) > dist2D(lm[pip], lm[0]) * 1.05;
}
function isThumbExtended(lm) {
  return dist2D(lm[4], lm[5]) > dist2D(lm[3], lm[5]) * 1.15;
}

function detectGesture(lm) {
  const t = isThumbExtended(lm), i = isFingerExtended(lm, 8, 6);
  const m = isFingerExtended(lm, 12, 10), r = isFingerExtended(lm, 16, 14);
  const p = isFingerExtended(lm, 20, 18);
  const fingers = [t, i, m, r, p];
  const up = fingers.filter(Boolean).length;
  if (dist2D(lm[4], lm[8]) < 0.06) return { name: "PINCH", fingers };
  if (up === 0) return { name: "FIST", fingers };
  if (up === 5) return { name: "OPEN PALM", fingers };
  if (i && m && !r && !p) return { name: "PEACE", fingers };
  if (t && !i && !m && !r && !p) return { name: "THUMBS UP", fingers };
  if (!t && i && !m && !r && !p) return { name: "POINTING", fingers };
  if (i && p && !m && !r) return { name: "ROCK", fingers };
  if (i && m && r && !p) return { name: "THREE", fingers };
  if (!t && i && m && r && p) return { name: "FOUR", fingers };
  return { name: `${up} UP`, fingers };
}

// ─── Particles ───────────────────────────────────────────────────

function spawnParticle(x, y, color) {
  if (particles.length > 600) return;
  const a = Math.random() * Math.PI * 2;
  const s = 0.3 + Math.random() * 1.2;
  particles.push({
    x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
    life: 1, decay: 0.012 + Math.random() * 0.015,
    r: 1 + Math.random() * 2.5, color,
  });
}
function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.02; p.life -= p.decay;
    if (p.life <= 0) particles.splice(i, 1);
  }
}
function drawParticles() {
  for (const p of particles) {
    ctx.save();
    ctx.globalAlpha = p.life * 0.8;
    ctx.shadowColor = p.color; ctx.shadowBlur = 8;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  particleCountEl.textContent = particles.length;
}

// ─── Ripples ─────────────────────────────────────────────────────

function spawnRipple(x, y) {
  ripples.push({ x, y, radius: 5, maxRadius: 90, life: 1 });
}
function updateRipples() {
  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i];
    r.radius += 2.5; r.life -= 0.025;
    if (r.life <= 0 || r.radius > r.maxRadius) ripples.splice(i, 1);
  }
}
function drawRipples() {
  for (const r of ripples) {
    ctx.save();
    ctx.globalAlpha = r.life * 0.6;
    ctx.strokeStyle = P.bright;
    ctx.shadowColor = P.glow; ctx.shadowBlur = 16;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = r.life * 0.3;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.radius * 0.6, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}

// ─── Scan line ───────────────────────────────────────────────────

function drawScanLine(w, h) {
  if (!scanLineEnabled) return;
  scanLineY += 1.5;
  if (scanLineY > h + 20) scanLineY = -20;
  const grad = ctx.createLinearGradient(0, scanLineY - 10, 0, scanLineY + 10);
  const rgb = hexToRgb(P.primary);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(0.4, `rgba(${rgb},0.08)`);
  grad.addColorStop(0.5, `rgba(${rgb},0.18)`);
  grad.addColorStop(0.6, `rgba(${rgb},0.08)`);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.save();
  ctx.fillStyle = grad;
  ctx.fillRect(0, scanLineY - 10, w, 20);
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = P.primary;
  ctx.shadowColor = P.primary; ctx.shadowBlur = 6; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, scanLineY); ctx.lineTo(w, scanLineY); ctx.stroke();
  ctx.restore();
}

// ─── Skeleton ────────────────────────────────────────────────────

function drawSkeleton(lm, w, h, fingers) {
  for (let ci = 0; ci < FINGER_CONNECTIONS.length; ci++) {
    const [i, j] = FINGER_CONNECTIONS[ci];
    const fi = CONNECTION_FINGER[ci];
    glowLine(lm[i].x * w, lm[i].y * h, lm[j].x * w, lm[j].y * h,
             fi >= 0 ? P.fingers[fi] : P.primary, 1.2);
  }
  for (let i = 0; i < lm.length; i++) {
    const x = lm[i].x * w, y = lm[i].y * h;
    if (FINGER_TIPS.includes(i)) {
      const fi = FINGER_TIPS.indexOf(i);
      glowDot(x, y, fingers[fi] ? 7 : 5, fingers[fi] ? P.bright : P.dim);
    } else if (i === 0) {
      glowDot(x, y, 7, P.bright);
    } else {
      glowDot(x, y, 3, P.primary);
    }
  }
}

// ─── Concentric arcs ─────────────────────────────────────────────

function drawConcentricCircles(cx, cy, gestureName) {
  const sm = gestureName === "OPEN PALM" ? 1.5 : gestureName === "FIST" ? 0.4 : 1;
  rotationAngle += 0.025 * sm;
  const radii = [55, 85, 120];
  for (let idx = 0; idx < radii.length; idx++) {
    const r = radii[idx];
    const dir = idx % 2 === 0 ? 1 : -1;
    const angle = rotationAngle * dir * (1 + idx * 0.3);
    const sweep = 2.1 - idx * 0.35;
    glowArc(cx, cy, r, angle, sweep, P.fingers[idx % 5], 1);
    glowArc(cx, cy, r, angle + Math.PI, sweep, P.fingers[idx % 5], 1);
    for (let d = 0; d < 3; d++) {
      const da = angle + (d * Math.PI * 2) / 3;
      glowDot(cx + r * Math.cos(da), cy + r * Math.sin(da), 2.5, P.bright);
    }
  }
}

// ─── TEXT: draw with identity transform (no CSS mirror) ──────────
// We save the context, reset the canvas transform to undo any
// internal transforms, draw text at pre-mirrored X, then restore.
// CSS scaleX(-1) still mirrors the canvas visually, but since we
// already drew at (w - x), the double-mirror produces readable text.

function drawTextAt(text, lmX, lmY, font, color, align = "center", baseline = "middle") {
  const w = canvas.width, h = canvas.height;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);   // identity — undo any context mirror
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  // pre-mirror X so CSS scaleX(-1) puts it on the correct side
  ctx.fillText(text, sx(lmX, w), sy(lmY, h));
  ctx.restore();
}

function fillRectAt(lmX, lmY, rw, rh, color, alpha = 1) {
  const w = canvas.width, h = canvas.height;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(sx(lmX, w) - rw / 2, sy(lmY, h), rw, rh);
  ctx.restore();
}

// ─── Tracking score (on palm, readable) ──────────────────────────

function drawTrackingScore(lm, w, h, handedness, confidence, gestureName) {
  let px = 0, py = 0;
  for (const i of PALM_LANDMARKS) { px += lm[i].x; py += lm[i].y; }
  px /= PALM_LANDMARKS.length;
  py /= PALM_LANDMARKS.length;

  const score = Math.round(confidence * 100);
  const label = `${score}%`;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);    // identity transform

  const screenX = sx(px, w);
  const screenY = sy(py, h);

  ctx.font = "bold 30px 'Segoe UI', system-ui, sans-serif";
  const tw = ctx.measureText(label).width;
  const boxH = 62;

  // backdrop
  ctx.fillStyle = DARK_BG;
  ctx.beginPath();
  roundRect(ctx, screenX - tw / 2 - 14, screenY - 26, tw + 28, boxH, 6);
  ctx.fill();
  ctx.strokeStyle = `rgba(${hexToRgb(P.primary)},0.25)`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  roundRect(ctx, screenX - tw / 2 - 14, screenY - 26, tw + 28, boxH, 6);
  ctx.stroke();

  // percentage
  ctx.shadowColor = P.glow;
  ctx.shadowBlur = 10;
  ctx.fillStyle = P.primary;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, screenX, screenY - 4);

  // subtitle
  ctx.font = "600 10px 'Segoe UI', system-ui, sans-serif";
  ctx.shadowBlur = 0;
  ctx.fillStyle = P.dim;
  ctx.fillText(`${gestureName}  |  ${handedness.toUpperCase()}`, screenX, screenY + 24);

  ctx.restore();
}

// ─── Data panel (readable sci-fi readout) ────────────────────────

function drawDataPanel(lm, w, h, gesture, handedness, idx) {
  const screenX = sx(lm[0].x, w);
  const screenY = sy(lm[0].y, h);
  const panelW = 155, panelH = 115;
  // panel sits to the LEFT of wrist in screen space
  const px = screenX - panelW - 15;
  const py = screenY - 60;

  const span = (dist2D(lm[0], lm[12]) * 30).toFixed(1);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // background
  ctx.fillStyle = "rgba(5,5,10,0.7)";
  ctx.beginPath(); roundRect(ctx, px, py, panelW, panelH, 5); ctx.fill();
  ctx.strokeStyle = `rgba(${hexToRgb(P.primary)},0.2)`;
  ctx.lineWidth = 1;
  ctx.beginPath(); roundRect(ctx, px, py, panelW, panelH, 5); ctx.stroke();

  // accent bar
  ctx.fillStyle = P.primary;
  ctx.globalAlpha = 0.6;
  ctx.fillRect(px + 8, py + 1, panelW - 16, 2);
  ctx.globalAlpha = 1;

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  let ty = py + 10;
  const lx = px + 10, vx = px + 80;

  // header
  ctx.font = "bold 9px 'Segoe UI', system-ui, sans-serif";
  ctx.fillStyle = P.primary;
  ctx.shadowColor = P.glow; ctx.shadowBlur = 4;
  ctx.fillText(`HAND ${idx}  ${handedness.toUpperCase()}`, lx, ty);
  ty += 16;

  // finger states
  ctx.shadowBlur = 0;
  ctx.font = "9px 'Courier New', monospace";
  for (let fi = 0; fi < 5; fi++) {
    const up = gesture.fingers[fi];
    ctx.fillStyle = P.dim;
    ctx.fillText(FINGER_NAMES[fi].padEnd(7), lx, ty);
    ctx.fillStyle = up ? P.bright : "#555";
    ctx.fillText(up ? "EXT" : "FLD", vx, ty);
    ty += 13;
  }

  ctx.fillStyle = P.dim; ctx.fillText("SPAN", lx, ty);
  ctx.fillStyle = P.primary; ctx.fillText(`${span}cm`, vx, ty);
  ty += 13;
  ctx.fillStyle = P.dim; ctx.fillText("GEST", lx, ty);
  ctx.fillStyle = P.bright; ctx.fillText(gesture.name, vx, ty);

  // connector line
  ctx.strokeStyle = `rgba(${hexToRgb(P.primary)},0.15)`;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(screenX - 10, screenY);
  ctx.lineTo(px + panelW, py + panelH / 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.restore();
}

// ─── Gesture badge (center, always readable) ─────────────────────

function drawGestureBadge(w, h, gestureName) {
  if (gestureName === prevGesture) { gestureStableFrames++; }
  else { prevGesture = gestureName; gestureStableFrames = 0; }
  gestureEl.textContent = gestureName;

  if (gestureStableFrames < 15 && gestureName !== "NONE") {
    const alpha = 1 - gestureStableFrames / 15;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = alpha * 0.7;
    ctx.font = "bold 28px 'Segoe UI', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = P.primary;
    ctx.shadowColor = P.glow;
    ctx.shadowBlur = 20;
    ctx.fillText(gestureName, w / 2, h / 2 - 80);
    ctx.restore();
  }
}

// ─── Helpers ─────────────────────────────────────────────────────

function hexToRgb(hex) {
  return `${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)}`;
}

function updateFps() {
  const now = performance.now();
  const dt = now - lastFrameTime;
  lastFrameTime = now;
  if (dt > 0) smoothedFps = smoothedFps * 0.9 + (1000 / dt) * 0.1;
  fpsEl.textContent = Math.round(smoothedFps);
}

function emitFingerParticles(lm, w, h) {
  for (let fi = 0; fi < FINGER_TIPS.length; fi++) {
    const x = lm[FINGER_TIPS[fi]].x * w;
    const y = lm[FINGER_TIPS[fi]].y * h;
    spawnParticle(x, y, P.fingers[fi]);
    if (Math.random() > 0.5)
      spawnParticle(x + (Math.random() - 0.5) * 6, y + (Math.random() - 0.5) * 6, P.fingers[fi]);
  }
}

function handlePinch(lm, w, h, gestureName) {
  if (gestureName === "PINCH") {
    const tx = ((lm[4].x + lm[8].x) / 2) * w;
    const ty = ((lm[4].y + lm[8].y) / 2) * h;
    if (Math.random() > 0.6) spawnRipple(tx, ty);
  }
}

// ═══════════════════════════════════════════════════════════════════
//  MAIN RENDER
// ═══════════════════════════════════════════════════════════════════

function onResults(results) {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w;
  canvas.height = h;

  ctx.clearRect(0, 0, w, h);
  updateFps();
  updateParticles();
  updateRipples();
  drawScanLine(w, h);

  if (results.multiHandLandmarks && results.multiHandedness) {
    const count = results.multiHandLandmarks.length;
    handCountEl.textContent = count;

    for (let i = 0; i < count; i++) {
      const lm = results.multiHandLandmarks[i];
      const handedness = results.multiHandedness[i].label;
      const confidence = results.multiHandedness[i].score;
      const gesture = detectGesture(lm);

      let cx = 0, cy = 0;
      for (const pi of PALM_LANDMARKS) { cx += lm[pi].x; cy += lm[pi].y; }
      cx = (cx / PALM_LANDMARKS.length) * w;
      cy = (cy / PALM_LANDMARKS.length) * h;

      drawSkeleton(lm, w, h, gesture.fingers);
      emitFingerParticles(lm, w, h);
      handlePinch(lm, w, h, gesture.name);
      drawConcentricCircles(cx, cy, gesture.name);

      // Text drawn with identity transform + pre-mirrored X
      drawTrackingScore(lm, w, h, handedness, confidence, gesture.name);
      drawDataPanel(lm, w, h, gesture, handedness, i + 1);
      drawGestureBadge(w, h, gesture.name);
    }
  } else {
    handCountEl.textContent = "0";
    gestureEl.textContent = "NONE";
    prevGesture = "NONE";
  }

  drawRipples();
  drawParticles();

  // edge glow
  ctx.save();
  const eg = ctx.createLinearGradient(0, 0, w, 0);
  eg.addColorStop(0, `rgba(${hexToRgb(P.primary)},0.06)`);
  eg.addColorStop(0.5, "rgba(0,0,0,0)");
  eg.addColorStop(1, `rgba(${hexToRgb(P.primary)},0.06)`);
  ctx.fillStyle = eg;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// ─── Keyboard ────────────────────────────────────────────────────

document.addEventListener("keydown", (e) => {
  if (e.key === "q" || e.key === "Q") {
    statusEl.textContent = "STOPPED";
    video.srcObject?.getTracks().forEach((t) => t.stop());
  }
  if (e.key === "c" || e.key === "C") {
    paletteIdx = (paletteIdx + 1) % PALETTES.length;
    P = PALETTES[paletteIdx];
    statusEl.textContent = P.name;
    statusEl.style.borderColor = P.primary;
    statusEl.style.color = P.primary;
  }
  if (e.key === "s" || e.key === "S") scanLineEnabled = !scanLineEnabled;
});

// ─── Init ────────────────────────────────────────────────────────

async function start() {
  startOverlay.classList.add("hidden");
  statusEl.textContent = "LOADING MODEL...";

  const hands = new Hands({
    locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${f}`,
  });
  hands.setOptions({
    maxNumHands: 2, modelComplexity: 1,
    minDetectionConfidence: 0.7, minTrackingConfidence: 0.7,
  });
  hands.onResults(onResults);

  statusEl.textContent = "STARTING CAMERA...";
  const camera = new Camera(video, {
    onFrame: async () => await hands.send({ image: video }),
    width: 1280, height: 720,
  });
  await camera.start();
  statusEl.textContent = P.name;
  statusEl.style.borderColor = P.primary;
  statusEl.style.color = P.primary;
}

startBtn.addEventListener("click", start);
