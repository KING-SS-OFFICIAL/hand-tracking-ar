// ═══════════════════════════════════════════════════════════════════
//  HAND-TRACKING AR — Full-screen, dual-canvas, camera switch,
//  video recording, readable text overlays
// ═══════════════════════════════════════════════════════════════════

// ─── Palettes ────────────────────────────────────────────────────
const PALETTES = [
  { name: "CYBER CYAN",   primary: "#00ffff", dim: "#00b4b4", bright: "#66ffff", glow: "rgba(0,255,255,0.35)",   fingers: ["#00ffff","#00e5ff","#00d4ff","#00c3ff","#00b2ff"] },
  { name: "NEON MAGENTA", primary: "#ff00ff", dim: "#b400b4", bright: "#ff66ff", glow: "rgba(255,0,255,0.35)",   fingers: ["#ff00ff","#ff00e5","#ff00cc","#ff00b2","#ff0099"] },
  { name: "TOXIC GREEN",  primary: "#39ff14", dim: "#28b40e", bright: "#7fff50", glow: "rgba(57,255,20,0.35)",   fingers: ["#39ff14","#50ff20","#66ff33","#7fff40","#99ff55"] },
  { name: "SOLAR GOLD",   primary: "#ffd700", dim: "#b49600", bright: "#ffe44d", glow: "rgba(255,215,0,0.35)",   fingers: ["#ffd700","#ffcc00","#ffc300","#ffba00","#ffb000"] },
  { name: "ICE BLUE",     primary: "#80e0ff", dim: "#5aaac0", bright: "#b0f0ff", glow: "rgba(128,224,255,0.35)", fingers: ["#80e0ff","#70d8ff","#60d0ff","#50c8ff","#40c0ff"] },
];

let paletteIdx = 0;
let P = PALETTES[0];

const DARK_BG = "rgba(10,10,15,0.65)";
const FINGER_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],[0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],[5,9],[9,13],[13,17],
];
const CONN_FINGER = [0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,-1,-1,-1];
const FINGER_TIPS = [4,8,12,16,20];
const PALM = [0,1,5,9,13,17];
const FINGER_NAMES = ["THUMB","INDEX","MIDDLE","RING","PINKY"];

// ─── State ───────────────────────────────────────────────────────
let rotAngle = 0, lastTime = performance.now(), fps = 0;
let scanY = -1, scanOn = true;
let particles = [], ripples = [];
let prevGesture = "NONE", gestureFrames = 0;
let facingMode = "user";            // "user" = front, "environment" = rear
let cameraInstance = null;
let handsInstance = null;
let isRecording = false;
let mediaRecorder = null;
let recordedChunks = [];
let recStartTime = 0;
let recTimerInterval = null;

// ─── DOM ─────────────────────────────────────────────────────────
const video     = document.getElementById("webcam");
const overlay   = document.getElementById("overlay");
const textLayer = document.getElementById("text-layer");
const oCtx      = overlay.getContext("2d");   // mirrored by CSS
const tCtx      = textLayer.getContext("2d"); // NOT mirrored
const fpsEl     = document.getElementById("fps");
const handsEl   = document.getElementById("hand-count");
const gestEl    = document.getElementById("gesture-name");
const partEl    = document.getElementById("particle-count");
const statusEl  = document.getElementById("status");
const startOvl  = document.getElementById("start-overlay");
const startBtn  = document.getElementById("start-btn");
const btnCam    = document.getElementById("btn-camera");
const btnRec    = document.getElementById("btn-record");
const btnFS     = document.getElementById("btn-fullscreen");
const recInd    = document.getElementById("rec-indicator");
const recTimeEl = document.getElementById("rec-time");

// ─── Helpers ─────────────────────────────────────────────────────
function hexRgb(h) { return `${parseInt(h.slice(1,3),16)},${parseInt(h.slice(3,5),16)},${parseInt(h.slice(5,7),16)}`; }
function dist(a,b) { return Math.hypot(a.x-b.x, a.y-b.y); }

// Convert normalised landmark X → screen X (accounts for CSS mirror)
function screenX(nx, w) { return (1 - nx) * w; }
function screenY(ny, h) { return ny * h; }

function roundRect(c, x, y, w, h, r) {
  c.moveTo(x+r,y); c.lineTo(x+w-r,y);
  c.quadraticCurveTo(x+w,y,x+w,y+r); c.lineTo(x+w,y+h-r);
  c.quadraticCurveTo(x+w,y+h,x+w-r,y+h); c.lineTo(x+r,y+h);
  c.quadraticCurveTo(x,y+h,x,y+h-r); c.lineTo(x,y+r);
  c.quadraticCurveTo(x,y,x+r,y);
}

// ═══════════════════════════════════════════════════════════════════
//  AR VISUAL ELEMENTS  (drawn on oCtx — CSS-mirrored)
// ═══════════════════════════════════════════════════════════════════

function glowLine(x1,y1,x2,y2,col,w=1.5){
  oCtx.save(); oCtx.shadowColor=col; oCtx.shadowBlur=12;
  oCtx.strokeStyle=col; oCtx.lineWidth=w; oCtx.lineCap="round";
  oCtx.beginPath(); oCtx.moveTo(x1,y1); oCtx.lineTo(x2,y2); oCtx.stroke();
  oCtx.globalAlpha=0.3; oCtx.shadowBlur=24; oCtx.lineWidth=w+2;
  oCtx.beginPath(); oCtx.moveTo(x1,y1); oCtx.lineTo(x2,y2); oCtx.stroke();
  oCtx.restore();
}

function glowDot(x,y,r,col){
  oCtx.save(); oCtx.shadowColor=col; oCtx.shadowBlur=14;
  oCtx.fillStyle=col; oCtx.beginPath(); oCtx.arc(x,y,r,0,Math.PI*2); oCtx.fill();
  oCtx.globalAlpha=0.9; oCtx.shadowBlur=6; oCtx.fillStyle="#fff";
  oCtx.beginPath(); oCtx.arc(x,y,r*0.35,0,Math.PI*2); oCtx.fill();
  oCtx.restore();
}

function glowArc(cx,cy,r,sa,sweep,col,w=1.5){
  oCtx.save(); oCtx.shadowColor=col; oCtx.shadowBlur=10;
  oCtx.strokeStyle=col; oCtx.lineWidth=w; oCtx.lineCap="round";
  oCtx.beginPath(); oCtx.arc(cx,cy,r,sa,sa+sweep); oCtx.stroke();
  oCtx.globalAlpha=0.25; oCtx.shadowBlur=22; oCtx.lineWidth=w+3;
  oCtx.beginPath(); oCtx.arc(cx,cy,r,sa,sa+sweep); oCtx.stroke();
  oCtx.restore();
}

function drawSkeleton(lm,w,h,fingers){
  for(let ci=0;ci<FINGER_CONNECTIONS.length;ci++){
    const[i,j]=FINGER_CONNECTIONS[ci], fi=CONN_FINGER[ci];
    glowLine(lm[i].x*w,lm[i].y*h, lm[j].x*w,lm[j].y*h, fi>=0?P.fingers[fi]:P.primary, 1.2);
  }
  for(let i=0;i<lm.length;i++){
    const x=lm[i].x*w, y=lm[i].y*h;
    if(FINGER_TIPS.includes(i)){
      const fi=FINGER_TIPS.indexOf(i);
      glowDot(x,y,fingers[fi]?7:5, fingers[fi]?P.bright:P.dim);
    } else if(i===0) glowDot(x,y,7,P.bright);
    else glowDot(x,y,3,P.primary);
  }
}

function drawArcs(cx,cy,gest){
  const sm = gest==="OPEN PALM"?1.5:gest==="FIST"?0.4:1;
  rotAngle += 0.025*sm;
  const R=[55,85,120];
  for(let i=0;i<R.length;i++){
    const r=R[i], dir=i%2===0?1:-1, a=rotAngle*dir*(1+i*0.3), sw=2.1-i*0.35;
    glowArc(cx,cy,r,a,sw,P.fingers[i%5],1);
    glowArc(cx,cy,r,a+Math.PI,sw,P.fingers[i%5],1);
    for(let d=0;d<3;d++){
      const da=a+(d*Math.PI*2)/3;
      glowDot(cx+r*Math.cos(da),cy+r*Math.sin(da),2.5,P.bright);
    }
  }
}

function drawScan(w,h){
  if(!scanOn) return;
  scanY+=1.5; if(scanY>h+20) scanY=-20;
  const rgb=hexRgb(P.primary);
  const g=oCtx.createLinearGradient(0,scanY-10,0,scanY+10);
  g.addColorStop(0,"rgba(0,0,0,0)");
  g.addColorStop(0.4,`rgba(${rgb},0.08)`);
  g.addColorStop(0.5,`rgba(${rgb},0.18)`);
  g.addColorStop(0.6,`rgba(${rgb},0.08)`);
  g.addColorStop(1,"rgba(0,0,0,0)");
  oCtx.save(); oCtx.fillStyle=g; oCtx.fillRect(0,scanY-10,w,20);
  oCtx.globalAlpha=0.4; oCtx.strokeStyle=P.primary;
  oCtx.shadowColor=P.primary; oCtx.shadowBlur=6; oCtx.lineWidth=1;
  oCtx.beginPath(); oCtx.moveTo(0,scanY); oCtx.lineTo(w,scanY); oCtx.stroke();
  oCtx.restore();
}

function drawPart(){
  for(const p of particles){
    oCtx.save(); oCtx.globalAlpha=p.life*0.8;
    oCtx.shadowColor=p.col; oCtx.shadowBlur=8; oCtx.fillStyle=p.col;
    oCtx.beginPath(); oCtx.arc(p.x,p.y,p.r*p.life,0,Math.PI*2); oCtx.fill();
    oCtx.restore();
  }
  partEl.textContent=particles.length;
}

function drawRip(){
  for(const r of ripples){
    oCtx.save();
    oCtx.globalAlpha=r.life*0.6; oCtx.strokeStyle=P.bright;
    oCtx.shadowColor=P.glow; oCtx.shadowBlur=16; oCtx.lineWidth=2;
    oCtx.beginPath(); oCtx.arc(r.x,r.y,r.rad,0,Math.PI*2); oCtx.stroke();
    oCtx.globalAlpha=r.life*0.3; oCtx.lineWidth=1;
    oCtx.beginPath(); oCtx.arc(r.x,r.y,r.rad*0.6,0,Math.PI*2); oCtx.stroke();
    oCtx.restore();
  }
}

function drawEdgeGlow(w,h){
  oCtx.save();
  const g=oCtx.createLinearGradient(0,0,w,0);
  g.addColorStop(0,`rgba(${hexRgb(P.primary)},0.06)`);
  g.addColorStop(0.5,"rgba(0,0,0,0)");
  g.addColorStop(1,`rgba(${hexRgb(P.primary)},0.06)`);
  oCtx.fillStyle=g; oCtx.fillRect(0,0,w,h);
  oCtx.restore();
}

// ═══════════════════════════════════════════════════════════════════
//  TEXT OVERLAYS  (drawn on tCtx — NOT mirrored, always readable)
// ═══════════════════════════════════════════════════════════════════

function drawScore(lm,w,h,handed,conf,gest){
  let px=0,py=0;
  for(const i of PALM){px+=lm[i].x;py+=lm[i].y;}
  px/=PALM.length; py/=PALM.length;
  const sx=screenX(px,w), sy=screenY(py,h);
  const label=`${Math.round(conf*100)}%`;

  tCtx.save();
  tCtx.font="bold 30px 'Segoe UI',system-ui,sans-serif";
  const tw=tCtx.measureText(label).width;
  const bxH=62;
  // box
  tCtx.fillStyle=DARK_BG;
  tCtx.beginPath(); roundRect(tCtx,sx-tw/2-14,sy-26,tw+28,bxH,6); tCtx.fill();
  tCtx.strokeStyle=`rgba(${hexRgb(P.primary)},0.25)`; tCtx.lineWidth=1;
  tCtx.beginPath(); roundRect(tCtx,sx-tw/2-14,sy-26,tw+28,bxH,6); tCtx.stroke();
  // text
  tCtx.shadowColor=P.glow; tCtx.shadowBlur=10;
  tCtx.fillStyle=P.primary;
  tCtx.textAlign="center"; tCtx.textBaseline="middle";
  tCtx.fillText(label,sx,sy-4);
  // sub
  tCtx.font="600 10px 'Segoe UI',system-ui,sans-serif";
  tCtx.shadowBlur=0; tCtx.fillStyle=P.dim;
  tCtx.fillText(`${gest}  |  ${handed.toUpperCase()}`,sx,sy+24);
  tCtx.restore();
}

function drawPanel(lm,w,h,gest,handed,idx){
  const wx=screenX(lm[0].x,w), wy=screenY(lm[0].y,h);
  const pw=155, ph=115, px=wx-pw-15, py=wy-60;
  const span=(dist(lm[0],lm[12])*30).toFixed(1);

  tCtx.save();
  // bg
  tCtx.fillStyle="rgba(5,5,10,0.7)";
  tCtx.beginPath(); roundRect(tCtx,px,py,pw,ph,5); tCtx.fill();
  tCtx.strokeStyle=`rgba(${hexRgb(P.primary)},0.2)`; tCtx.lineWidth=1;
  tCtx.beginPath(); roundRect(tCtx,px,py,pw,ph,5); tCtx.stroke();
  // accent bar
  tCtx.fillStyle=P.primary; tCtx.globalAlpha=0.6;
  tCtx.fillRect(px+8,py+1,pw-16,2); tCtx.globalAlpha=1;
  // content
  tCtx.textAlign="left"; tCtx.textBaseline="top";
  let ty=py+10; const lx=px+10, vx=px+80;
  tCtx.font="bold 9px 'Segoe UI',system-ui,sans-serif";
  tCtx.fillStyle=P.primary; tCtx.shadowColor=P.glow; tCtx.shadowBlur=4;
  tCtx.fillText(`HAND ${idx}  ${handed.toUpperCase()}`,lx,ty); ty+=16;
  tCtx.shadowBlur=0; tCtx.font="9px 'Courier New',monospace";
  for(let fi=0;fi<5;fi++){
    const up=gest.fingers[fi];
    tCtx.fillStyle=P.dim; tCtx.fillText(FINGER_NAMES[fi].padEnd(7),lx,ty);
    tCtx.fillStyle=up?P.bright:"#555"; tCtx.fillText(up?"EXT":"FLD",vx,ty); ty+=13;
  }
  tCtx.fillStyle=P.dim; tCtx.fillText("SPAN",lx,ty);
  tCtx.fillStyle=P.primary; tCtx.fillText(`${span}cm`,vx,ty); ty+=13;
  tCtx.fillStyle=P.dim; tCtx.fillText("GEST",lx,ty);
  tCtx.fillStyle=P.bright; tCtx.fillText(gest.name,vx,ty);
  // connector
  tCtx.strokeStyle=`rgba(${hexRgb(P.primary)},0.15)`; tCtx.lineWidth=1;
  tCtx.setLineDash([3,3]); tCtx.beginPath();
  tCtx.moveTo(wx-10,wy); tCtx.lineTo(px+pw,py+ph/2); tCtx.stroke();
  tCtx.setLineDash([]);
  tCtx.restore();
}

function drawBadge(w,h,name){
  if(name===prevGesture) gestureFrames++;
  else { prevGesture=name; gestureFrames=0; }
  gestEl.textContent=name;
  if(gestureFrames<15 && name!=="NONE"){
    const a=1-gestureFrames/15;
    tCtx.save(); tCtx.globalAlpha=a*0.7;
    tCtx.font="bold 28px 'Segoe UI',system-ui,sans-serif";
    tCtx.textAlign="center"; tCtx.textBaseline="middle";
    tCtx.fillStyle=P.primary; tCtx.shadowColor=P.glow; tCtx.shadowBlur=20;
    tCtx.fillText(name,w/2,h/2-100);
    tCtx.restore();
  }
}

// ═══════════════════════════════════════════════════════════════════
//  GESTURE DETECTION
// ═══════════════════════════════════════════════════════════════════

function fingerUp(lm,tip,pip){ return dist(lm[tip],lm[0])>dist(lm[pip],lm[0])*1.05; }
function thumbUp(lm){ return dist(lm[4],lm[5])>dist(lm[3],lm[5])*1.15; }

function detect(lm){
  const t=thumbUp(lm),i=fingerUp(lm,8,6),m=fingerUp(lm,12,10),
        r=fingerUp(lm,16,14),p=fingerUp(lm,20,18);
  const f=[t,i,m,r,p], up=f.filter(Boolean).length;
  if(dist(lm[4],lm[8])<0.06) return {name:"PINCH",fingers:f};
  if(up===0) return {name:"FIST",fingers:f};
  if(up===5) return {name:"OPEN PALM",fingers:f};
  if(i&&!m&&!r&&!p) return {name:"POINTING",fingers:f};
  if(i&&m&&!r&&!p) return {name:"PEACE",fingers:f};
  if(t&&!i&&!m&&!r&&!p) return {name:"THUMBS UP",fingers:f};
  if(i&&p&&!m&&!r) return {name:"ROCK",fingers:f};
  if(i&&m&&r&&!p) return {name:"THREE",fingers:f};
  if(!t&&i&&m&&r&&p) return {name:"FOUR",fingers:f};
  return {name:`${up} UP`,fingers:f};
}

// ═══════════════════════════════════════════════════════════════════
//  PARTICLES / RIPPLES
// ═══════════════════════════════════════════════════════════════════

function spawn(x,y,col){
  if(particles.length>600) return;
  const a=Math.random()*Math.PI*2, s=0.3+Math.random()*1.2;
  particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,
    life:1,dec:0.012+Math.random()*0.015,r:1+Math.random()*2.5,col});
}
function tickPart(){
  for(let i=particles.length-1;i>=0;i--){
    const p=particles[i]; p.x+=p.vx; p.y+=p.vy; p.vy+=0.02; p.life-=p.dec;
    if(p.life<=0) particles.splice(i,1);
  }
}
function tickRip(){
  for(let i=ripples.length-1;i>=0;i--){
    const r=ripples[i]; r.rad+=2.5; r.life-=0.025;
    if(r.life<=0||r.rad>90) ripples.splice(i,1);
  }
}
function emitParticles(lm,w,h){
  for(const ti of FINGER_TIPS){
    const x=lm[ti].x*w, y=lm[ti].y*h, fi=FINGER_TIPS.indexOf(ti);
    spawn(x,y,P.fingers[fi]);
    if(Math.random()>0.5) spawn(x+(Math.random()-0.5)*6,y+(Math.random()-0.5)*6,P.fingers[fi]);
  }
}
function handlePinch(lm,w,h,gest){
  if(gest==="PINCH"){
    const tx=((lm[4].x+lm[8].x)/2)*w, ty=((lm[4].y+lm[8].y)/2)*h;
    if(Math.random()>0.6) ripples.push({x:tx,y:ty,rad:5,life:1});
  }
}

// ═══════════════════════════════════════════════════════════════════
//  FPS
// ═══════════════════════════════════════════════════════════════════

function tickFps(){
  const now=performance.now(), dt=now-lastTime; lastTime=now;
  if(dt>0) fps=fps*0.9+(1000/dt)*0.1;
  fpsEl.textContent=Math.round(fps);
}

// ═══════════════════════════════════════════════════════════════════
//  MAIN RENDER CALLBACK
// ═══════════════════════════════════════════════════════════════════

function onResults(results){
  const w=overlay.clientWidth, h=overlay.clientHeight;
  overlay.width=w; overlay.height=h;
  textLayer.width=w; textLayer.height=h;

  oCtx.clearRect(0,0,w,h);
  tCtx.clearRect(0,0,w,h);
  tickFps(); tickPart(); tickRip();
  drawScan(w,h);

  if(results.multiHandLandmarks && results.multiHandedness){
    const n=results.multiHandLandmarks.length;
    handsEl.textContent=n;
    for(let i=0;i<n;i++){
      const lm=results.multiHandLandmarks[i];
      const hand=results.multiHandedness[i].label;
      const conf=results.multiHandedness[i].score;
      const g=detect(lm);
      let cx=0,cy=0;
      for(const pi of PALM){cx+=lm[pi].x;cy+=lm[pi].y;}
      cx=(cx/PALM.length)*w; cy=(cy/PALM.length)*h;

      drawSkeleton(lm,w,h,g.fingers);
      emitParticles(lm,w,h);
      handlePinch(lm,w,h,g.name);
      drawArcs(cx,cy,g.name);

      // text on non-mirrored canvas
      drawScore(lm,w,h,hand,conf,g.name);
      drawPanel(lm,w,h,g,hand,i+1);
      drawBadge(w,h,g.name);
    }
  } else {
    handsEl.textContent="0"; gestEl.textContent="NONE"; prevGesture="NONE";
  }

  drawRip(); drawPart(); drawEdgeGlow(w,h);
}

// ═══════════════════════════════════════════════════════════════════
//  CAMERA SWITCH
// ═══════════════════════════════════════════════════════════════════

async function switchCamera(){
  facingMode = facingMode === "user" ? "environment" : "user";
  statusEl.textContent = facingMode === "user" ? "FRONT CAM" : "REAR CAM";
  if(cameraInstance) cameraInstance.stop();
  video.srcObject?.getTracks().forEach(t=>t.stop());

  cameraInstance = new Camera(video, {
    onFrame: async () => { if(handsInstance) await handsInstance.send({image:video}); },
    width: 1280, height: 720,
    facingMode: facingMode,
  });
  await cameraInstance.start();
}

// ═══════════════════════════════════════════════════════════════════
//  VIDEO RECORDING
// ═══════════════════════════════════════════════════════════════════

function startRecording(){
  // create a combined canvas (video + overlay + text)
  const recCanvas = document.createElement("canvas");
  const rc = recCanvas.getContext("2d");
  recCanvas.width = overlay.width || 1280;
  recCanvas.height = overlay.height || 720;

  const stream = recCanvas.captureStream(30);
  // add audio if available (won't have audio from webcam typically)
  mediaRecorder = new MediaRecorder(stream, {
    mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm",
  });
  recordedChunks = [];
  mediaRecorder.ondataavailable = e => { if(e.data.size > 0) recordedChunks.push(e.data); };
  mediaRecorder.onstop = () => {
    const blob = new Blob(recordedChunks, {type: "video/webm"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hand-ar-${Date.now()}.webm`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // composite frame function
  let animId;
  function compositeFrame(){
    if(!isRecording) { cancelAnimationFrame(animId); return; }
    rc.clearRect(0,0,recCanvas.width,recCanvas.height);
    // draw video (mirrored)
    rc.save();
    rc.translate(recCanvas.width, 0);
    rc.scale(-1, 1);
    rc.drawImage(video, 0, 0, recCanvas.width, recCanvas.height);
    rc.restore();
    // draw overlay (already CSS-mirrored, so undo that for recording)
    rc.save();
    rc.translate(recCanvas.width, 0);
    rc.scale(-1, 1);
    rc.drawImage(overlay, 0, 0);
    rc.restore();
    // draw text-layer (not mirrored, draw as-is)
    rc.drawImage(textLayer, 0, 0);
    animId = requestAnimationFrame(compositeFrame);
  }

  isRecording = true;
  mediaRecorder.start(100);
  compositeFrame();

  btnRec.classList.add("recording");
  recInd.classList.remove("hidden");
  recStartTime = Date.now();
  recTimerInterval = setInterval(()=>{
    const s = Math.floor((Date.now()-recStartTime)/1000);
    recTimeEl.textContent = `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
  }, 500);
}

function stopRecording(){
  isRecording = false;
  if(mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
  btnRec.classList.remove("recording");
  recInd.classList.add("hidden");
  clearInterval(recTimerInterval);
}

// ═══════════════════════════════════════════════════════════════════
//  FULLSCREEN
// ═══════════════════════════════════════════════════════════════════

function toggleFullscreen(){
  const vp = document.getElementById("viewport");
  if(!document.fullscreenElement){
    vp.requestFullscreen?.() || vp.webkitRequestFullscreen?.();
  } else {
    document.exitFullscreen?.() || document.webkitExitFullscreen?.();
  }
}

// ═══════════════════════════════════════════════════════════════════
//  KEYBOARD
// ═══════════════════════════════════════════════════════════════════

document.addEventListener("keydown", e => {
  if(e.key==="q"||e.key==="Q"){
    statusEl.textContent="STOPPED";
    video.srcObject?.getTracks().forEach(t=>t.stop());
  }
  if(e.key==="c"||e.key==="C"){
    paletteIdx=(paletteIdx+1)%PALETTES.length;
    P=PALETTES[paletteIdx];
    statusEl.textContent=P.name;
    statusEl.style.borderColor=P.primary;
    statusEl.style.color=P.primary;
  }
  if(e.key==="s"||e.key==="S") scanOn=!scanOn;
});

// ═══════════════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════════════

async function start(){
  startOvl.classList.add("hidden");
  statusEl.textContent="LOADING MODEL...";

  handsInstance = new Hands({
    locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${f}`,
  });
  handsInstance.setOptions({
    maxNumHands: 2, modelComplexity: 1,
    minDetectionConfidence: 0.7, minTrackingConfidence: 0.7,
  });
  handsInstance.onResults(onResults);

  statusEl.textContent="STARTING CAMERA...";
  cameraInstance = new Camera(video, {
    onFrame: async () => await handsInstance.send({image:video}),
    width: 1280, height: 720,
    facingMode: facingMode,
  });
  await cameraInstance.start();
  statusEl.textContent=P.name;
  statusEl.style.borderColor=P.primary;
  statusEl.style.color=P.primary;
}

startBtn.addEventListener("click", start);
btnCam.addEventListener("click", switchCamera);
btnRec.addEventListener("click", () => { isRecording ? stopRecording() : startRecording(); });
btnFS.addEventListener("click", toggleFullscreen);
