// ═══════════════════════════════════════════════════════════════════
//  HAND-TRACKING AR — Optimized for smoothness + clean recording
// ═══════════════════════════════════════════════════════════════════

const PALETTES = [
  { name: "CYBER CYAN",   primary: "#00ffff", dim: "#00b4b4", bright: "#66ffff", glow: "rgba(0,255,255,0.3)",    fingers: ["#00ffff","#00e5ff","#00d4ff","#00c3ff","#00b2ff"] },
  { name: "NEON MAGENTA", primary: "#ff00ff", dim: "#b400b4", bright: "#ff66ff", glow: "rgba(255,0,255,0.3)",    fingers: ["#ff00ff","#ff00e5","#ff00cc","#ff00b2","#ff0099"] },
  { name: "TOXIC GREEN",  primary: "#39ff14", dim: "#28b40e", bright: "#7fff50", glow: "rgba(57,255,20,0.3)",    fingers: ["#39ff14","#50ff20","#66ff33","#7fff40","#99ff55"] },
  { name: "SOLAR GOLD",   primary: "#ffd700", dim: "#b49600", bright: "#ffe44d", glow: "rgba(255,215,0,0.3)",    fingers: ["#ffd700","#ffcc00","#ffc300","#ffba00","#ffb000"] },
  { name: "ICE BLUE",     primary: "#80e0ff", dim: "#5aaac0", bright: "#b0f0ff", glow: "rgba(128,224,255,0.3)",  fingers: ["#80e0ff","#70d8ff","#60d0ff","#50c8ff","#40c0ff"] },
];

let palIdx = 0, P = PALETTES[0];

const CONN = [
  [0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],[0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],[5,9],[9,13],[13,17],
];
const CF = [0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,-1,-1,-1];
const TIPS = [4,8,12,16,20];
const PALM = [0,1,5,9,13,17];
const FNAMES = ["THUMB","INDEX","MIDDLE","RING","PINKY"];

// ─── State ───────────────────────────────────────────────────────
let rot = 0, lt = performance.now(), sfps = 0;
let scanY = -1, scanOn = true;
let particles = [], ripples = [];
let prevGest = "NONE", gestFr = 0;
let facing = "user";
let cam = null, hands = null;
let recording = false, mRec = null, chunks = [];
let recStart = 0, recTimer = null;
let frameCount = 0;

// Landmark smoothing buffer
let smoothBuf = []; // array of arrays of {x,y} per hand

// ─── DOM ─────────────────────────────────────────────────────────
const vid    = document.getElementById("webcam");
const ovl    = document.getElementById("overlay");
const txt    = document.getElementById("text-layer");
const oc     = ovl.getContext("2d");
const tc     = txt.getContext("2d");
const fpsEl  = document.getElementById("fps");
const hEl    = document.getElementById("hand-count");
const gEl    = document.getElementById("gesture-name");
const pEl    = document.getElementById("particle-count");
const sEl    = document.getElementById("status");
const startO = document.getElementById("start-overlay");
const startB = document.getElementById("start-btn");
const bCam   = document.getElementById("btn-camera");
const bRec   = document.getElementById("btn-record");
const bFS    = document.getElementById("btn-fullscreen");
const recInd = document.getElementById("rec-indicator");
const recTm  = document.getElementById("rec-time");

// ─── Helpers ─────────────────────────────────────────────────────
const hx = h => `${parseInt(h.slice(1,3),16)},${parseInt(h.slice(3,5),16)},${parseInt(h.slice(5,7),16)}`;
const dst = (a,b) => Math.hypot(a.x-b.x, a.y-b.y);
const sx = (nx,w) => (1-nx)*w;
const sy = (ny,h) => ny*h;

function rr(c,x,y,w,h,r){
  c.moveTo(x+r,y);c.lineTo(x+w-r,y);c.quadraticCurveTo(x+w,y,x+w,y+r);
  c.lineTo(x+w,y+h-r);c.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  c.lineTo(x+r,y+h);c.quadraticCurveTo(x,y+h,x,y+h-r);c.lineTo(x,y+r);
  c.quadraticCurveTo(x,y,x+r,y);
}

// ═══════════════════════════════════════════════════════════════════
//  LANDMARK SMOOTHING — exponential moving average
// ═══════════════════════════════════════════════════════════════════

function smoothLandmarks(rawHands) {
  // rawHands: array of arrays of {x, y}
  const alpha = 0.55; // 0 = fully old, 1 = fully new — lower = smoother but laggier
  const result = [];

  for (let i = 0; i < rawHands.length; i++) {
    const raw = rawHands[i];
    if (!smoothBuf[i]) {
      // first frame — just copy
      smoothBuf[i] = raw.map(p => ({ x: p.x, y: p.y, z: p.z || 0 }));
    }
    const buf = smoothBuf[i];
    const smoothed = [];
    for (let j = 0; j < raw.length; j++) {
      const r = raw[j];
      const b = buf[j];
      b.x = b.x + (r.x - b.x) * alpha;
      b.y = b.y + (r.y - b.y) * alpha;
      b.z = (b.z || 0) + ((r.z || 0) - (b.z || 0)) * alpha;
      smoothed.push({ x: b.x, y: b.y, z: b.z });
    }
    result.push(smoothed);
  }
  // trim stale buffers
  smoothBuf.length = rawHands.length;
  return result;
}

// ═══════════════════════════════════════════════════════════════════
//  AR VISUALS  (on oCtx — CSS mirrored)
// ═══════════════════════════════════════════════════════════════════

function line(x1,y1,x2,y2,col){
  oc.strokeStyle = col;
  oc.shadowColor = col;
  oc.beginPath(); oc.moveTo(x1,y1); oc.lineTo(x2,y2); oc.stroke();
}

function dot(x,y,r,col){
  oc.fillStyle = col;
  oc.beginPath(); oc.arc(x,y,r,0,6.283); oc.fill();
}

function arc(cx,cy,r,sa,sw,col){
  oc.strokeStyle = col;
  oc.shadowColor = col;
  oc.beginPath(); oc.arc(cx,cy,r,sa,sa+sw); oc.stroke();
}

function drawSkel(lm,w,h,fing){
  oc.save();
  oc.lineCap = "round"; oc.lineWidth = 1.5;
  oc.shadowBlur = 8;
  // lines
  for(let c=0;c<CONN.length;c++){
    const[i,j]=CONN[c], fi=CF[c];
    line(lm[i].x*w,lm[i].y*h, lm[j].x*w,lm[j].y*h, fi>=0?P.fingers[fi]:P.primary);
  }
  // dots — only tips + wrist, skip inner joints for cleaner look
  for(let i=0;i<lm.length;i++){
    const x=lm[i].x*w, y=lm[i].y*h;
    if(TIPS.includes(i)){
      const fi=TIPS.indexOf(i);
      const r = fing[fi] ? 6 : 4;
      dot(x,y,r, fing[fi] ? P.bright : P.dim);
    } else if(i===0){
      dot(x,y,6,P.bright);
    }
  }
  oc.restore();
}

function drawArcs(cx,cy,gest){
  const sm = gest==="OPEN PALM"?1.4 : gest==="FIST"?0.5 : 1;
  rot += 0.02 * sm;
  const R = [60, 90];
  oc.save(); oc.lineCap = "round"; oc.lineWidth = 1.2; oc.shadowBlur = 8;
  for(let i=0;i<R.length;i++){
    const r=R[i], dir=i===0?1:-1, a=rot*dir*(1+i*0.4), sw=1.8-i*0.3;
    arc(cx,cy,r,a,sw,P.fingers[i]);
    arc(cx,cy,r,a+Math.PI,sw,P.fingers[i]);
    // single orbiting dot per ring
    const da = a;
    dot(cx+r*Math.cos(da), cy+r*Math.sin(da), 2, P.bright);
  }
  oc.restore();
}

function drawScan(w,h){
  if(!scanOn) return;
  scanY += 1.2;
  if(scanY > h+10) scanY = -10;
  const rgb = hx(P.primary);
  oc.save();
  oc.globalAlpha = 0.12;
  oc.fillStyle = P.primary;
  oc.fillRect(0, scanY-1, w, 2);
  oc.globalAlpha = 0.04;
  const g = oc.createLinearGradient(0,scanY-8,0,scanY+8);
  g.addColorStop(0,"rgba(0,0,0,0)");
  g.addColorStop(0.5,`rgba(${rgb},1)`);
  g.addColorStop(1,"rgba(0,0,0,0)");
  oc.fillStyle = g;
  oc.fillRect(0,scanY-8,w,16);
  oc.restore();
}

function drawPart(){
  oc.save(); oc.shadowBlur = 4;
  for(const p of particles){
    oc.globalAlpha = p.life * 0.7;
    oc.fillStyle = p.col;
    oc.shadowColor = p.col;
    oc.beginPath(); oc.arc(p.x,p.y,p.r*p.life,0,6.283); oc.fill();
  }
  oc.restore();
  pEl.textContent = particles.length;
}

function drawRip(){
  oc.save(); oc.lineWidth = 1.5;
  for(const r of ripples){
    oc.globalAlpha = r.life * 0.5;
    oc.strokeStyle = P.bright;
    oc.shadowColor = P.glow; oc.shadowBlur = 10;
    oc.beginPath(); oc.arc(r.x,r.y,r.rad,0,6.283); oc.stroke();
  }
  oc.restore();
}

function drawEdge(w,h){
  oc.save();
  const g = oc.createLinearGradient(0,0,w,0);
  g.addColorStop(0,`rgba(${hx(P.primary)},0.05)`);
  g.addColorStop(0.5,"rgba(0,0,0,0)");
  g.addColorStop(1,`rgba(${hx(P.primary)},0.05)`);
  oc.fillStyle = g; oc.fillRect(0,0,w,h);
  oc.restore();
}

// ═══════════════════════════════════════════════════════════════════
//  TEXT OVERLAYS  (on tc — not mirrored, always readable)
// ═══════════════════════════════════════════════════════════════════

function drawScore(lm,w,h,hand,conf,gest){
  let px=0,py=0;
  for(const i of PALM){px+=lm[i].x;py+=lm[i].y;}
  px/=PALM.length; py/=PALM.length;
  const scx=sx(px,w), scy=sy(py,h);
  const lbl=`${Math.round(conf*100)}%`;

  tc.save();
  tc.font="bold 28px 'Segoe UI',system-ui,sans-serif";
  const tw=tc.measureText(lbl).width;
  const bh=58;
  // box
  tc.fillStyle="rgba(8,8,12,0.7)";
  tc.beginPath(); rr(tc,scx-tw/2-12,scy-24,tw+24,bh,5); tc.fill();
  tc.strokeStyle=`rgba(${hx(P.primary)},0.2)`; tc.lineWidth=1;
  tc.beginPath(); rr(tc,scx-tw/2-12,scy-24,tw+24,bh,5); tc.stroke();
  // pct
  tc.fillStyle=P.primary;
  tc.textAlign="center"; tc.textBaseline="middle";
  tc.fillText(lbl,scx,scy-3);
  // sub
  tc.font="600 9px 'Segoe UI',system-ui,sans-serif";
  tc.fillStyle=P.dim;
  tc.fillText(`${gest}  |  ${hand.toUpperCase()}`,scx,scy+22);
  tc.restore();
}

function drawPanel(lm,w,h,gest,hand,idx){
  const wx=sx(lm[0].x,w), wy=sy(lm[0].y,h);
  const pw=145, ph=108, px=wx-pw-12, py=wy-54;
  const span=(dst(lm[0],lm[12])*30).toFixed(1);

  tc.save();
  tc.fillStyle="rgba(5,5,10,0.72)";
  tc.beginPath(); rr(tc,px,py,pw,ph,4); tc.fill();
  tc.strokeStyle=`rgba(${hx(P.primary)},0.18)`; tc.lineWidth=1;
  tc.beginPath(); rr(tc,px,py,pw,ph,4); tc.stroke();
  // accent
  tc.fillStyle=P.primary; tc.globalAlpha=0.5;
  tc.fillRect(px+6,py+1,pw-12,1.5); tc.globalAlpha=1;
  // text
  tc.textAlign="left"; tc.textBaseline="top";
  let ty=py+8; const lx=px+8, vx=px+72;
  tc.font="bold 8px 'Segoe UI',system-ui,sans-serif";
  tc.fillStyle=P.primary;
  tc.fillText(`HAND ${idx}  ${hand.toUpperCase()}`,lx,ty); ty+=14;
  tc.font="8px 'Courier New',monospace";
  for(let fi=0;fi<5;fi++){
    const up=gest.fingers[fi];
    tc.fillStyle=P.dim; tc.fillText(FNAMES[fi].padEnd(7),lx,ty);
    tc.fillStyle=up?P.bright:"#444"; tc.fillText(up?"EXT":"FLD",vx,ty); ty+=12;
  }
  tc.fillStyle=P.dim; tc.fillText("SPAN",lx,ty);
  tc.fillStyle=P.primary; tc.fillText(`${span}cm`,vx,ty); ty+=12;
  tc.fillStyle=P.dim; tc.fillText("GEST",lx,ty);
  tc.fillStyle=P.bright; tc.fillText(gest.name,vx,ty);
  // connector
  tc.strokeStyle=`rgba(${hx(P.primary)},0.12)`; tc.lineWidth=1;
  tc.setLineDash([2,3]); tc.beginPath();
  tc.moveTo(wx-8,wy); tc.lineTo(px+pw,py+ph/2); tc.stroke();
  tc.setLineDash([]);
  tc.restore();
}

function drawBadge(w,h,name){
  if(name===prevGest) gestFr++;
  else { prevGest=name; gestFr=0; }
  gEl.textContent = name;
  if(gestFr<12 && name!=="NONE"){
    const a=1-gestFr/12;
    tc.save(); tc.globalAlpha=a*0.6;
    tc.font="bold 26px 'Segoe UI',system-ui,sans-serif";
    tc.textAlign="center"; tc.textBaseline="middle";
    tc.fillStyle=P.primary;
    tc.fillText(name,w/2,h/2-90);
    tc.restore();
  }
}

// ═══════════════════════════════════════════════════════════════════
//  GESTURE
// ═══════════════════════════════════════════════════════════════════

function fUp(lm,t,p){ return dst(lm[t],lm[0])>dst(lm[p],lm[0])*1.05; }
function tUp(lm){ return dst(lm[4],lm[5])>dst(lm[3],lm[5])*1.15; }

function detect(lm){
  const t=tUp(lm),i=fUp(lm,8,6),m=fUp(lm,12,10),r=fUp(lm,16,14),p=fUp(lm,20,18);
  const f=[t,i,m,r,p], n=f.filter(Boolean).length;
  if(dst(lm[4],lm[8])<0.055) return {name:"PINCH",fingers:f};
  if(n===0) return {name:"FIST",fingers:f};
  if(n===5) return {name:"OPEN PALM",fingers:f};
  if(i&&!m&&!r&&!p) return {name:"POINTING",fingers:f};
  if(i&&m&&!r&&!p) return {name:"PEACE",fingers:f};
  if(t&&!i&&!m&&!r&&!p) return {name:"THUMBS UP",fingers:f};
  if(i&&p&&!m&&!r) return {name:"ROCK",fingers:f};
  if(i&&m&&r&&!p) return {name:"THREE",fingers:f};
  if(!t&&i&&m&&r&&p) return {name:"FOUR",fingers:f};
  return {name:`${n} UP`,fingers:f};
}

// ═══════════════════════════════════════════════════════════════════
//  PARTICLES / RIPPLES  (reduced counts)
// ═══════════════════════════════════════════════════════════════════

function spawn(x,y,col){
  if(particles.length > 120) return;
  const a=Math.random()*6.283, s=0.4+Math.random()*0.8;
  particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,
    life:1,dec:0.018+Math.random()*0.012,r:1.5+Math.random()*1.5,col});
}

function tickPart(){
  for(let i=particles.length-1;i>=0;i--){
    const p=particles[i];
    p.x+=p.vx; p.y+=p.vy; p.vy+=0.015; p.life-=p.dec;
    if(p.life<=0) particles.splice(i,1);
  }
}

function tickRip(){
  for(let i=ripples.length-1;i>=0;i--){
    const r=ripples[i]; r.rad+=2; r.life-=0.03;
    if(r.life<=0||r.rad>80) ripples.splice(i,1);
  }
}

function emitPart(lm,w,h,fing){
  // only emit from extended finger tips, and only 30% chance per frame
  for(let fi=0;fi<TIPS.length;fi++){
    if(!fing[fi]) continue;
    if(Math.random()>0.3) continue;
    spawn(lm[TIPS[fi]].x*w, lm[TIPS[fi]].y*h, P.fingers[fi]);
  }
}

function handlePinch(lm,w,h,gest){
  if(gest==="PINCH" && Math.random()>0.7){
    ripples.push({x:((lm[4].x+lm[8].x)/2)*w, y:((lm[4].y+lm[8].y)/2)*h, rad:4, life:1});
  }
}

// ═══════════════════════════════════════════════════════════════════
//  FPS
// ═══════════════════════════════════════════════════════════════════

function tickFps(){
  const now=performance.now(), dt=now-lt; lt=now;
  if(dt>0) sfps=sfps*0.92+(1000/dt)*0.08;
  fpsEl.textContent=Math.round(sfps);
}

// ═══════════════════════════════════════════════════════════════════
//  RENDER
// ═══════════════════════════════════════════════════════════════════

function onResults(res){
  frameCount++;
  const w=ovl.clientWidth, h=ovl.clientHeight;

  // only resize if changed (avoids clearing + allocation every frame)
  if(ovl.width!==w){ ovl.width=w; ovl.height=h; }
  if(txt.width!==w){ txt.width=w; txt.height=h; }

  oc.clearRect(0,0,w,h);
  tc.clearRect(0,0,w,h);
  tickFps(); tickPart(); tickRip();
  drawScan(w,h);

  if(res.multiHandLandmarks && res.multiHandedness){
    // smooth landmarks
    const raw = res.multiHandLandmarks;
    const lmArr = smoothLandmarks(raw);
    const n = raw.length;
    hEl.textContent = n;

    for(let i=0;i<n;i++){
      const lm = lmArr[i];
      const rawLm = raw[i];
      const hand = res.multiHandedness[i].label;
      const conf = res.multiHandedness[i].score;
      const g = detect(rawLm); // detect on raw for accuracy

      let cx=0,cy=0;
      for(const pi of PALM){cx+=lm[pi].x;cy+=lm[pi].y;}
      cx=(cx/PALM.length)*w; cy=(cy/PALM.length)*h;

      drawSkel(lm,w,h,g.fingers);
      emitPart(rawLm,w,h,g.fingers);
      handlePinch(rawLm,w,h,g.name);
      drawArcs(cx,cy,g.name);

      drawScore(lm,w,h,hand,conf,g.name);
      drawPanel(lm,w,h,g,hand,i+1);
      drawBadge(w,h,g.name);
    }
  } else {
    hEl.textContent="0"; gEl.textContent="NONE"; prevGest="NONE";
    smoothBuf = [];
  }

  drawRip(); drawPart(); drawEdge(w,h);
}

// ═══════════════════════════════════════════════════════════════════
//  CAMERA SWITCH
// ═══════════════════════════════════════════════════════════════════

async function switchCam(){
  facing = facing==="user" ? "environment" : "user";
  sEl.textContent = facing==="user" ? "FRONT CAM" : "REAR CAM";
  if(cam) cam.stop();
  vid.srcObject?.getTracks().forEach(t=>t.stop());
  smoothBuf = [];
  cam = new Camera(vid,{
    onFrame: async()=>{ if(hands) await hands.send({image:vid}); },
    width:1280, height:720, facingMode:facing,
  });
  await cam.start();
}

// ═══════════════════════════════════════════════════════════════════
//  RECORDING  (robust — proper timeslice + download fallbacks)
// ═══════════════════════════════════════════════════════════════════

function startRec(){
  const rc = document.createElement("canvas");
  const rx = rc.getContext("2d");
  rc.width = ovl.width || 1280;
  rc.height = ovl.height || 720;

  // pick best mime
  let mime = "video/webm";
  if(MediaRecorder.isTypeSupported("video/webm;codecs=vp9")) mime = "video/webm;codecs=vp9";
  else if(MediaRecorder.isTypeSupported("video/webm;codecs=vp8")) mime = "video/webm;codecs=vp8";

  const stream = rc.captureStream(30);
  mRec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4000000 });
  chunks = [];
  mRec.ondataavailable = e => { if(e.data.size>0) chunks.push(e.data); };
  mRec.onstop = saveRec;

  let animId;
  function composite(){
    if(!recording){ cancelAnimationFrame(animId); return; }
    rx.clearRect(0,0,rc.width,rc.height);
    // video mirrored
    rx.save(); rx.translate(rc.width,0); rx.scale(-1,1);
    rx.drawImage(vid,0,0,rc.width,rc.height);
    rx.restore();
    // overlay mirrored — undo mirror for recording
    rx.save(); rx.translate(rc.width,0); rx.scale(-1,1);
    rx.drawImage(ovl,0,0);
    rx.restore();
    // text as-is
    rx.drawImage(txt,0,0);
    animId = requestAnimationFrame(composite);
  }

  recording = true;
  mRec.start(1000); // collect data every 1s for reliability
  composite();

  bRec.classList.add("recording");
  recInd.classList.remove("hidden");
  recStart = Date.now();
  recTimer = setInterval(()=>{
    const s=Math.floor((Date.now()-recStart)/1000);
    recTm.textContent=`${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
  },500);
}

function saveRec(){
  const blob = new Blob(chunks, {type: mRec.mimeType || "video/webm"});
  chunks = [];

  // filename
  const ts = new Date().toISOString().replace(/[:.]/g,"-").slice(0,19);
  const fname = `hand-ar-${ts}.webm`;

  // try multiple save strategies
  const url = URL.createObjectURL(blob);

  // strategy 1: hidden link click (works on desktop)
  const a = document.createElement("a");
  a.style.display = "none";
  a.href = url;
  a.download = fname;
  document.body.appendChild(a);
  a.click();

  // strategy 2: open in new tab as fallback (mobile)
  setTimeout(()=>{
    try { window.open(url, "_blank"); } catch(e){}
    // cleanup after a delay
    setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 5000);
  }, 500);

  // strategy 3: Web Share API (mobile gallery save)
  if(navigator.share && navigator.canShare){
    blob.arrayBuffer().then(buf=>{
      const file = new File([buf], fname, {type: "video/webm"});
      if(navigator.canShare({files:[file]})){
        navigator.share({files:[file], title:"Hand-Tracking AR Recording"}).catch(()=>{});
      }
    });
  }
}

function stopRec(){
  recording = false;
  if(mRec && mRec.state!=="inactive") mRec.stop();
  bRec.classList.remove("recording");
  recInd.classList.add("hidden");
  clearInterval(recTimer);
}

// ═══════════════════════════════════════════════════════════════════
//  FULLSCREEN
// ═══════════════════════════════════════════════════════════════════

function toggleFS(){
  const vp=document.getElementById("viewport");
  if(!document.fullscreenElement) vp.requestFullscreen?.();
  else document.exitFullscreen?.();
}

// ═══════════════════════════════════════════════════════════════════
//  KEYBOARD
// ═══════════════════════════════════════════════════════════════════

document.addEventListener("keydown",e=>{
  if(e.key==="q"||e.key==="Q"){ sEl.textContent="STOPPED"; vid.srcObject?.getTracks().forEach(t=>t.stop()); }
  if(e.key==="c"||e.key==="C"){
    palIdx=(palIdx+1)%PALETTES.length; P=PALETTES[palIdx];
    sEl.textContent=P.name; sEl.style.borderColor=P.primary; sEl.style.color=P.primary;
  }
  if(e.key==="s"||e.key==="S") scanOn=!scanOn;
});

// ═══════════════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════════════

async function start(){
  startO.classList.add("hidden");
  sEl.textContent="LOADING...";

  hands = new Hands({
    locateFile: f=>`https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${f}`,
  });
  hands.setOptions({
    maxNumHands:2,
    modelComplexity:1,
    minDetectionConfidence:0.75,
    minTrackingConfidence:0.65,
  });
  hands.onResults(onResults);

  sEl.textContent="STARTING CAM...";
  cam = new Camera(vid,{
    onFrame: async()=>await hands.send({image:vid}),
    width:1280, height:720, facingMode:facing,
  });
  await cam.start();
  sEl.textContent=P.name;
  sEl.style.borderColor=P.primary; sEl.style.color=P.primary;
}

startB.addEventListener("click", start);
bCam.addEventListener("click", switchCam);
bRec.addEventListener("click", ()=>{ recording ? stopRec() : startRec(); });
bFS.addEventListener("click", toggleFS);
