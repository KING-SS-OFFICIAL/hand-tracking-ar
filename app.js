// ═══════════════════════════════════════════════════════════════════
//  HAND-TRACKING AR — Feature-Rich Web Application
//  Gesture detection, particle trails, pinch ripples, scan lines,
//  color cycling, per-finger colors, sci-fi data panel
// ═══════════════════════════════════════════════════════════════════

// ─── Palette presets ─────────────────────────────────────────────
const PALETTES = [
  { name: "CYBER CYAN",   primary: "#00ffff", dim: "#00b4b4", bright: "#66ffff", glow: "rgba(0,255,255,0.35)",    fingers: ["#00ffff","#00e5ff","#00d4ff","#00c3ff","#00b2ff"] },
  { name: "NEON MAGENTA", primary: "#ff00ff", dim: "#b400b4", bright: "#ff66ff", glow: "rgba(255,0,255,0.35)",    fingers: ["#ff00ff","#ff00e5","#ff00cc","#ff00b2","#ff0099"] },
  { name: "TOXIC GREEN",  primary: "#39ff14", dim: "#28b40e", bright: "#7fff50", glow: "rgba(57,255,20,0.35)",    fingers: ["#39ff14","#50ff20","#66ff33","#7fff40","#99ff55"] },
  { name: "SOLAR GOLD",   primary: "#ffd700", dim: "#b49600", bright: "#ffe44d", glow: "rgba(255,215,0,0.35)",    fingers: ["#ffd700","#ffcc00","#ffc300","#ffba00","#ffb000"] },
  { name: "ICE BLUE",     primary: "#80e0ff", dim: "#5aaac0", bright: "#b0f0ff", glow: "rgba(128,224,255,0.35)",  fingers: ["#80e0ff","#70d8ff","#60d0ff","#50c8ff","#40c0ff"] },
];

let paletteIdx = 0;
let P = PALETTES[0];

// ─── Constants ───────────────────────────────────────────────────
const DARK_BG = "rgba(10,10,15,0.6)";

const FINGER_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
];

// Map each connection to a finger index (0=thumb,1=index,2=middle,3=ring,4=pinky)
const CONNECTION_FINGER = [
  0,0,0,0,  1,1,1,1,  2,2,2,2,  3,3,3,3,  4,4,4,4,  -1,-1,-1,
];

const FINGER_TIPS = [4, 8, 12, 16, 20];
const FINGER_PIPS = [3, 7, 11, 15, 19];
const FINGER_MCPS = [2, 6, 10, 14, 18];  // thumb uses CMC(1) instead
const PALM_LANDMARKS = [0, 1, 5, 9, 13, 17];
const FINGER_NAMES = ["THUMB", "INDEX", "MIDDLE", "RING", "PINKY"];

// ─── State ───────────────────────────────────────────────────────
let rotationAngle = 0;
let lastFrameTime = performance.now();
let smoothedFps = 0;
let scanLineY = -1;
let scanLineEnabled = true;
let particles = [];
let ripples = [];
let prevGesture = "NONE";
let gestureStableFrames = 0;

// ─── DOM ─────────────────────────────────────────────────────────
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

// ═══════════════════════════════════════════════════════════════════
//  DRAWING HELPERS
// ═══════════════════════════════════════════════════════════════════

function roundRect(x, y, w, h, r) {
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

// ═══════════════════════════════════════════════════════════════════
//  GESTURE DETECTION
// ═══════════════════════════════════════════════════════════════════

function dist2D(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function isFingerExtended(lm, tipIdx, pipIdx) {
  // finger is "up" if tip is farther from wrist than the PIP joint
  const wrist = lm[0];
  return dist2D(lm[tipIdx], wrist) > dist2D(lm[pipIdx], wrist) * 1.05;
}

function isThumbExtended(lm) {
  // thumb: compare tip(4) vs IP(3) distance from index MCP(5)
  const ref = lm[5];
  return dist2D(lm[4], ref) > dist2D(lm[3], ref) * 1.15;
}

function detectGesture(lm) {
  const thumbUp = isThumbExtended(lm);
  const indexUp = isFingerExtended(lm, 8, 6);
  const middleUp = isFingerExtended(lm, 12, 10);
  const ringUp = isFingerExtended(lm, 16, 14);
  const pinkyUp = isFingerExtended(lm, 20, 18);

  const fingers = [thumbUp, indexUp, middleUp, ringUp, pinkyUp];
  const upCount = fingers.filter(Boolean).length;

  // Pinch: thumb tip very close to index tip
  const pinchDist = dist2D(lm[4], lm[8]);
  if (pinchDist < 0.06) return { name: "PINCH", fingers };

  // Fist: all fingers down
  if (upCount === 0) return { name: "FIST", fingers };

  // Open palm: all fingers up
  if (upCount === 5) return { name: "OPEN PALM", fingers };

  // Peace: index + middle up, others down
  if (indexUp && middleUp && !ringUp && !pinkyUp) return { name: "PEACE", fingers };

  // Thumbs up: only thumb up
  if (thumbUp && !indexUp && !middleUp && !ringUp && !pinkyUp) return { name: "THUMBS UP", fingers };

  // Pointing: only index up
  if (!thumbUp && indexUp && !middleUp && !ringUp && !pinkyUp) return { name: "POINTING", fingers };

  // Rock: index + pinky up
  if (indexUp && pinkyUp && !middleUp && !ringUp) return { name: "ROCK", fingers };

  // Three: index + middle + ring
  if (indexUp && middleUp && ringUp && !pinkyUp) return { name: "THREE", fingers };

  // Four: all except thumb
  if (!thumbUp && indexUp && middleUp && ringUp && pinkyUp) return { name: "FOUR", fingers };

  return { name: `${upCount} UP`, fingers };
}

// ═══════════════════════════════════════════════════════════════════
//  PARTICLE SYSTEM
// ═══════════════════════════════════════════════════════════════════

function spawnParticle(x, y, color) {
  if (particles.length > 600) return;
  const angle = Math.random() * Math.PI * 2;
  const speed = 0.3 + Math.random() * 1.2;
  particles.push({
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life: 1.0,
    decay: 0.012 + Math.random() * 0.015,
    r: 1 + Math.random() * 2.5,
    color,
  });
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.02; // slight gravity
    p.life -= p.decay;
    if (p.life <= 0) {
      particles.splice(i, 1);
    }
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.save();
    ctx.globalAlpha = p.life * 0.8;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 8;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  particleCountEl.textContent = particles.length;
}

// ═══════════════════════════════════════════════════════════════════
//  RIPPLE SYSTEM (pinch effect)
// ═══════════════════════════════════════════════════════════════════

function spawnRipple(x, y) {
  ripples.push({ x, y, radius: 5, maxRadius: 90, life: 1.0 });
}

function updateRipples() {
  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i];
    r.radius += 2.5;
    r.life -= 0.025;
    if (r.life <= 0 || r.radius > r.maxRadius) {
      ripples.splice(i, 1);
    }
  }
}

function drawRipples() {
  for (const r of ripples) {
    ctx.save();
    ctx.globalAlpha = r.life * 0.6;
    ctx.strokeStyle = P.bright;
    ctx.shadowColor = P.glow;
    ctx.shadowBlur = 16;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
    ctx.stroke();
    // inner ring
    ctx.globalAlpha = r.life * 0.3;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.radius * 0.6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

// ═══════════════════════════════════════════════════════════════════
//  SCAN LINE
// ═══════════════════════════════════════════════════════════════════

function drawScanLine(w, h) {
  if (!scanLineEnabled) return;
  scanLineY += 1.5;
  if (scanLineY > h + 20) scanLineY = -20;
  // gradient beam
  const grad = ctx.createLinearGradient(0, scanLineY - 10, 0, scanLineY + 10);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(0.4, `rgba(${hexToRgb(P.primary)},0.08)`);
  grad.addColorStop(0.5, `rgba(${hexToRgb(P.primary)},0.18)`);
  grad.addColorStop(0.6, `rgba(${hexToRgb(P.primary)},0.08)`);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.save();
  ctx.fillStyle = grad;
  ctx.fillRect(0, scanLineY - 10, w, 20);
  // bright center line
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = P.primary;
  ctx.shadowColor = P.primary;
  ctx.shadowBlur = 6;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, scanLineY);
  ctx.lineTo(w, scanLineY);
  ctx.stroke();
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════
//  SKELETON (per-finger colors)
// ═══════════════════════════════════════════════════════════════════

function drawSkeleton(landmarks, w, h, fingerStates) {
  // lines
  for (let ci = 0; ci < FINGER_CONNECTIONS.length; ci++) {
    const [i, j] = FINGER_CONNECTIONS[ci];
    const fi = CONNECTION_FINGER[ci];
    const color = fi >= 0 ? P.fingers[fi] : P.primary;
    glowLine(
      landmarks[i].x * w, landmarks[i].y * h,
      landmarks[j].x * w, landmarks[j].y * h,
      color, 1.2
    );
  }
  // dots
  for (let i = 0; i < landmarks.length; i++) {
    const x = landmarks[i].x * w;
    const y = landmarks[i].y * h;
    if (FINGER_TIPS.includes(i)) {
      const fi = FINGER_TIPS.indexOf(i);
      const active = fingerStates[fi];
      const color = active ? P.bright : P.dim;
      glowDot(x, y, active ? 7 : 5, color);
    } else if (i === 0) {
      glowDot(x, y, 7, P.bright);
    } else {
      glowDot(x, y, 3, P.primary);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
//  CONCENTRIC ARCS
// ═══════════════════════════════════════════════════════════════════

function drawConcentricCircles(cx, cy, gestureName) {
  const speedMult = gestureName === "OPEN PALM" ? 1.5 : gestureName === "FIST" ? 0.4 : 1;
  rotationAngle += 0.025 * speedMult;
  const radii = [55, 85, 120];
  for (let idx = 0; idx < radii.length; idx++) {
    const r = radii[idx];
    const dir = idx % 2 === 0 ? 1 : -1;
    const angle = rotationAngle * dir * (1 + idx * 0.3);
    const sweep = 2.1 - idx * 0.35;
    const color = P.fingers[idx % 5];
    glowArc(cx, cy, r, angle, sweep, color, 1);
    glowArc(cx, cy, r, angle + Math.PI, sweep, color, 1);
    // orbiting dots (3 per ring)
    for (let d = 0; d < 3; d++) {
      const da = angle + (d * Math.PI * 2) / 3;
      const dx = cx + r * Math.cos(da);
      const dy = cy + r * Math.sin(da);
      glowDot(dx, dy, 2.5, P.bright);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
//  TRACKING SCORE
// ═══════════════════════════════════════════════════════════════════

function drawTrackingScore(landmarks, w, h, handedness, confidence, gestureName) {
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
  ctx.font = "bold 30px 'Segoe UI', system-ui, sans-serif";
  const tw = ctx.measureText(label).width;
  const boxH = 62;
  // backdrop
  ctx.fillStyle = DARK_BG;
  ctx.beginPath();
  roundRect(px - tw / 2 - 14, py - 26, tw + 28, boxH, 6);
  ctx.fill();
  ctx.strokeStyle = `rgba(${hexToRgb(P.primary)},0.25)`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  roundRect(px - tw / 2 - 14, py - 26, tw + 28, boxH, 6);
  ctx.stroke();
  // percentage
  ctx.shadowColor = P.glow;
  ctx.shadowBlur = 10;
  ctx.fillStyle = P.primary;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, px, py - 4);
  // subtitle: gesture + handedness
  ctx.font = "600 10px 'Segoe UI', system-ui, sans-serif";
  ctx.shadowBlur = 0;
  ctx.fillStyle = P.dim;
  ctx.fillText(`${gestureName}  |  ${handedness.toUpperCase()}`, px, py + 24);
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════
//  DATA PANEL (sci-fi readout)
// ═══════════════════════════════════════════════════════════════════

function drawDataPanel(landmarks, w, h, gesture, handedness, idx) {
  // position panel at wrist offset
  const wx = landmarks[0].x * w;
  const wy = landmarks[0].y * h;
  const panelX = wx + 70;
  const panelY = wy - 60;
  const panelW = 155;
  const panelH = 115;

  // hand span: wrist to middle finger tip
  const span = dist2D(landmarks[0], landmarks[12]);
  const spanCm = (span * 30).toFixed(1); // rough approximation

  ctx.save();
  // panel background
  ctx.fillStyle = "rgba(5,5,10,0.7)";
  ctx.beginPath();
  roundRect(panelX, panelY, panelW, panelH, 5);
  ctx.fill();
  ctx.strokeStyle = `rgba(${hexToRgb(P.primary)},0.2)`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  roundRect(panelX, panelY, panelW, panelH, 5);
  ctx.stroke();

  // top accent line
  ctx.fillStyle = P.primary;
  ctx.globalAlpha = 0.6;
  ctx.fillRect(panelX + 8, panelY + 1, panelW - 16, 2);

  ctx.globalAlpha = 1;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  let ty = panelY + 10;
  const lx = panelX + 10;
  const vx = panelX + 80;

  // header
  ctx.font = "bold 9px 'Segoe UI', system-ui, sans-serif";
  ctx.fillStyle = P.primary;
  ctx.shadowColor = P.glow;
  ctx.shadowBlur = 4;
  ctx.fillText(`HAND ${idx}  ${handedness.toUpperCase()}`, lx, ty);
  ty += 16;

  // finger states
  ctx.shadowBlur = 0;
  ctx.font = "9px 'Courier New', monospace";
  for (let fi = 0; fi < 5; fi++) {
    const up = gesture.fingers[fi];
    const stateLabel = up ? "EXT" : "FLD";
    ctx.fillStyle = P.dim;
    ctx.fillText(FINGER_NAMES[fi].padEnd(7), lx, ty);
    ctx.fillStyle = up ? P.bright : "#555";
    ctx.fillText(stateLabel, vx, ty);
    ty += 13;
  }

  // hand span
  ctx.fillStyle = P.dim;
  ctx.fillText("SPAN", lx, ty);
  ctx.fillStyle = P.primary;
  ctx.fillText(`${spanCm}cm`, vx, ty);
  ty += 13;

  // gesture
  ctx.fillStyle = P.dim;
  ctx.fillText("GEST", lx, ty);
  ctx.fillStyle = P.bright;
  ctx.fillText(gesture.name, vx, ty);

  // connector line from wrist to panel
  ctx.strokeStyle = `rgba(${hexToRgb(P.primary)},0.15)`;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(wx + 10, wy);
  ctx.lineTo(panelX, panelY + panelH / 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════
//  FINGER TRAIL PARTICLES
// ═══════════════════════════════════════════════════════════════════

function emitFingerParticles(landmarks, w, h) {
  for (let fi = 0; fi < FINGER_TIPS.length; fi++) {
    const tip = landmarks[FINGER_TIPS[fi]];
    const x = tip.x * w;
    const y = tip.y * h;
    // emit 1-2 particles per tip per frame
    spawnParticle(x, y, P.fingers[fi]);
    if (Math.random() > 0.5) {
      spawnParticle(x + (Math.random() - 0.5) * 6, y + (Math.random() - 0.5) * 6, P.fingers[fi]);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
//  PINCH RIPPLE TRIGGER
// ═══════════════════════════════════════════════════════════════════

function handlePinch(landmarks, w, h, gestureName) {
  if (gestureName === "PINCH") {
    const tx = ((landmarks[4].x + landmarks[8].x) / 2) * w;
    const ty = ((landmarks[4].y + landmarks[8].y) / 2) * h;
    if (Math.random() > 0.6) spawnRipple(tx, ty);
  }
}

// ═══════════════════════════════════════════════════════════════════
//  GESTURE BADGE (large centered notification on gesture change)
// ═══════════════════════════════════════════════════════════════════

function drawGestureBadge(w, h, gestureName) {
  if (gestureName === prevGesture) {
    gestureStableFrames++;
  } else {
    prevGesture = gestureName;
    gestureStableFrames = 0;
  }
  gestureEl.textContent = gestureName;
  // flash badge on gesture change (first ~15 frames)
  if (gestureStableFrames < 15 && gestureName !== "NONE") {
    const alpha = 1 - gestureStableFrames / 15;
    ctx.save();
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

// ═══════════════════════════════════════════════════════════════════
//  HEX UTILS
// ═══════════════════════════════════════════════════════════════════

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

// ═══════════════════════════════════════════════════════════════════
//  FPS
// ═══════════════════════════════════════════════════════════════════

function updateFps() {
  const now = performance.now();
  const dt = now - lastFrameTime;
  lastFrameTime = now;
  if (dt > 0) {
    smoothedFps = smoothedFps * 0.9 + (1000 / dt) * 0.1;
  }
  fpsEl.textContent = Math.round(smoothedFps);
}

// ═══════════════════════════════════════════════════════════════════
//  MAIN RENDER LOOP (MediaPipe callback)
// ═══════════════════════════════════════════════════════════════════

function onResults(results) {
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);
  updateFps();
  updateParticles();
  updateRipples();

  // always draw scan line
  drawScanLine(w, h);

  if (results.multiHandLandmarks && results.multiHandedness) {
    const count = results.multiHandLandmarks.length;
    handCountEl.textContent = count;

    for (let i = 0; i < count; i++) {
      const lm = results.multiHandLandmarks[i];
      const handedness = results.multiHandedness[i].label;
      const confidence = results.multiHandedness[i].score;
      const gesture = detectGesture(lm);

      // palm center
      let cx = 0, cy = 0;
      for (const pi of PALM_LANDMARKS) {
        cx += lm[pi].x;
        cy += lm[pi].y;
      }
      cx = (cx / PALM_LANDMARKS.length) * w;
      cy = (cy / PALM_LANDMARKS.length) * h;

      drawSkeleton(lm, w, h, gesture.fingers);
      emitFingerParticles(lm, w, h);
      handlePinch(lm, w, h, gesture.name);
      drawConcentricCircles(cx, cy, gesture.name);
      drawTrackingScore(lm, w, h, handedness, confidence, gesture.name);
      drawDataPanel(lm, w, h, gesture, handedness, i + 1);
      drawGestureBadge(w, h, gesture.name);
    }
  } else {
    handCountEl.textContent = "0";
    gestureEl.textContent = "NONE";
    prevGesture = "NONE";
  }

  // particles + ripples drawn on top
  drawRipples();
  drawParticles();

  // viewport edge glow
  ctx.save();
  const edgeGrad = ctx.createLinearGradient(0, 0, w, 0);
  edgeGrad.addColorStop(0, `rgba(${hexToRgb(P.primary)},0.06)`);
  edgeGrad.addColorStop(0.5, "rgba(0,0,0,0)");
  edgeGrad.addColorStop(1, `rgba(${hexToRgb(P.primary)},0.06)`);
  ctx.fillStyle = edgeGrad;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════
//  KEYBOARD CONTROLS
// ═══════════════════════════════════════════════════════════════════

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
  if (e.key === "s" || e.key === "S") {
    scanLineEnabled = !scanLineEnabled;
  }
});

// ═══════════════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════════════

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
  statusEl.textContent = P.name;
  statusEl.style.borderColor = P.primary;
  statusEl.style.color = P.primary;
}

startBtn.addEventListener("click", start);
