// ═══════════════════════════════════════════════════════════════════
//  FULL-BODY AR TRACKER — Hands + Pose + Face Mesh + Iris
// ═══════════════════════════════════════════════════════════════════

const PALETTES = [
  { name:"CYBER CYAN",  primary:"#00ffff", dim:"#00b4b4", bright:"#66ffff", glow:"rgba(0,255,255,0.3)",  fingers:["#00ffff","#00e5ff","#00d4ff","#00c3ff","#00b2ff"] },
  { name:"NEON MAGENTA",primary:"#ff00ff", dim:"#b400b4", bright:"#ff66ff", glow:"rgba(255,0,255,0.3)",  fingers:["#ff00ff","#ff00e5","#ff00cc","#ff00b2","#ff0099"] },
  { name:"TOXIC GREEN", primary:"#39ff14", dim:"#28b40e", bright:"#7fff50", glow:"rgba(57,255,20,0.3)",  fingers:["#39ff14","#50ff20","#66ff33","#7fff40","#99ff55"] },
  { name:"SOLAR GOLD",  primary:"#ffd700", dim:"#b49600", bright:"#ffe44d", glow:"rgba(255,215,0,0.3)",  fingers:["#ffd700","#ffcc00","#ffc300","#ffba00","#ffb000"] },
  { name:"ICE BLUE",    primary:"#80e0ff", dim:"#5aaac0", bright:"#b0f0ff", glow:"rgba(128,224,255,0.3)",fingers:["#80e0ff","#70d8ff","#60d0ff","#50c8ff","#40c0ff"] },
];
let palIdx=0, P=PALETTES[0];

// ─── Color constants ─────────────────────────────────────────────
const BODY_COLOR = "#00ff88";
const BODY_DIM   = "#008844";
const FACE_COLOR = "rgba(255,255,255,0.35)";
const IRIS_COLOR = "#ff44aa";
const EYE_COLOR  = "#00ffff";

// ─── Pose connections (MediaPipe 33-point) ───────────────────────
const POSE_CONN = [
  [11,12],[11,13],[13,15],[12,14],[14,16],  // torso + arms
  [11,23],[12,24],[23,24],                   // hip
  [23,25],[24,26],[25,27],[26,28],           // legs
  [15,17],[15,19],[15,21],                   // left hand
  [16,18],[16,20],[16,22],                   // right hand
  [27,29],[27,31],[28,30],[28,32],           // feet
  [0,1],[1,2],[2,3],[3,7],[0,4],[4,5],[5,6],[6,8], // face outline
  [9,10],                                    // mouth
];
const POSE_TIPS = [15,16,17,18,19,20,21,22,27,28,29,30,31,32];

// ─── Face contour indices (subset of 468 for clean rendering) ────
const FACE_OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
const FACE_LIPS = [61,146,91,181,84,17,314,405,321,375,291,409,270,269,267,0,37,39,40,185];
const FACE_REYE = [33,7,163,144,145,153,154,155,133,173,157,158,159,160,161,246];
const FACE_LEYE = [362,382,381,380,374,373,390,249,263,466,388,387,386,385,384,398];

// ─── Hand connections ────────────────────────────────────────────
const HCONN = [
  [0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],[0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],[5,9],[9,13],[13,17],
];
const HCF = [0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,-1,-1,-1];
const TIPS = [4,8,12,16,20];
const PALM = [0,1,5,9,13,17];
const FNAMES = ["THUMB","INDEX","MIDDLE","RING","PINKY"];

// ─── State ───────────────────────────────────────────────────────
let rot=0, lt=performance.now(), sfps=0;
let scanY=-1, scanOn=true;
let particles=[], ripples=[];
let prevGest="NONE", gestFr=0;
let smoothBuf=[];
let facing="user";
let cam=null, handsInst=null, poseInst=null, faceInst=null;
let recording=false, mRec=null, chunks=[];
let recStart=0, recTimer=null;
let modes = { pose:true, face:true, hands:true, iris:true };
let poseReady=false, faceReady=false;
let lastPose=null, lastFace=null;

// ─── DOM ─────────────────────────────────────────────────────────
const vid=document.getElementById("webcam");
const ovl=document.getElementById("overlay");
const txt=document.getElementById("text-layer");
const oc=ovl.getContext("2d");
const tc=txt.getContext("2d");
const fpsEl=document.getElementById("fps");
const hEl=document.getElementById("hand-count");
const gEl=document.getElementById("gesture-name");
const poseEl=document.getElementById("pose-status");
const faceEl=document.getElementById("face-status");
const irisEl=document.getElementById("iris-status");
const sEl=document.getElementById("status");
const startO=document.getElementById("start-overlay");
const startB=document.getElementById("start-btn");
const bCam=document.getElementById("btn-camera");
const bRec=document.getElementById("btn-record");
const bFS=document.getElementById("btn-fullscreen");
const recInd=document.getElementById("rec-indicator");
const recTm=document.getElementById("rec-time");

// ─── Helpers ─────────────────────────────────────────────────────
const hx=h=>`${parseInt(h.slice(1,3),16)},${parseInt(h.slice(3,5),16)},${parseInt(h.slice(5,7),16)}`;
const dst=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const nx=(v,w)=>(1-v)*w;  // mirror-x for text canvas
const ny=(v,h)=>v*h;

function rr(c,x,y,w,h,r){
  c.moveTo(x+r,y);c.lineTo(x+w-r,y);c.quadraticCurveTo(x+w,y,x+w,y+r);
  c.lineTo(x+w,y+h-r);c.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  c.lineTo(x+r,y+h);c.quadraticCurveTo(x,y+h,x,y+h-r);c.lineTo(x,y+r);
  c.quadraticCurveTo(x,y,x+r,y);
}

// ═══════════════════════════════════════════════════════════════════
//  LANDMARK SMOOTHING
// ═══════════════════════════════════════════════════════════════════

function smoothLM(raw,alpha=0.5){
  const res=[];
  for(let i=0;i<raw.length;i++){
    const r=raw[i];
    if(!smoothBuf[i]) smoothBuf[i]=r.map(p=>({...p}));
    const b=smoothBuf[i], s=[];
    for(let j=0;j<r.length;j++){
      if(!b[j]) b[j]={...r[j]};
      b[j].x+=(r[j].x-b[j].x)*alpha;
      b[j].y+=(r[j].y-b[j].y)*alpha;
      if(r[j].z!=null) b[j].z=((b[j].z||0)+((r[j].z||0)-(b[j].z||0))*alpha);
      s.push({...b[j]});
    }
    res.push(s);
  }
  smoothBuf.length=raw.length;
  return res;
}

// ═══════════════════════════════════════════════════════════════════
//  BODY POSE RENDERING
// ═══════════════════════════════════════════════════════════════════

function drawPose(lm,w,h){
  oc.save();
  oc.lineCap="round"; oc.lineWidth=2;
  oc.shadowColor=BODY_COLOR; oc.shadowBlur=6;

  // connections
  for(const[i,j] of POSE_CONN){
    if(!lm[i]||!lm[j]) continue;
    if(lm[i].visibility<0.5||lm[j].visibility<0.5) continue;
    oc.strokeStyle=BODY_COLOR; oc.globalAlpha=0.6;
    oc.beginPath();
    oc.moveTo(lm[i].x*w, lm[i].y*h);
    oc.lineTo(lm[j].x*w, lm[j].y*h);
    oc.stroke();
  }

  // joints
  oc.globalAlpha=1;
  for(let i=0;i<lm.length;i++){
    if(!lm[i]||lm[i].visibility<0.5) continue;
    const x=lm[i].x*w, y=lm[i].y*h;
    const isTip = POSE_TIPS.includes(i);
    oc.fillStyle = isTip ? "#88ffbb" : BODY_COLOR;
    oc.beginPath(); oc.arc(x,y, isTip?4:3, 0,6.283); oc.fill();
    if(isTip){
      oc.fillStyle="#fff";
      oc.beginPath(); oc.arc(x,y,1.5,0,6.283); oc.fill();
    }
  }
  oc.restore();
}

// ═══════════════════════════════════════════════════════════════════
//  FACE MESH RENDERING
// ═══════════════════════════════════════════════════════════════════

function drawContour(lm,indices,w,h,color,lw=1){
  oc.strokeStyle=color; oc.lineWidth=lw;
  oc.beginPath();
  for(let i=0;i<indices.length;i++){
    const p=lm[indices[i]];
    if(!p) continue;
    if(i===0) oc.moveTo(p.x*w,p.y*h);
    else oc.lineTo(p.x*w,p.y*h);
  }
  oc.stroke();
}

function drawFace(lm,w,h){
  oc.save();
  oc.lineCap="round"; oc.lineJoin="round";

  // face oval — subtle
  drawContour(lm,FACE_OVAL,w,h,FACE_COLOR,1.2);

  // lips — two lines
  const lipTop = [61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146];
  const lipBot = [61,146,91,181,84,17,314,405,321,375,291,409,270,269,267,0,37,39,40,185,61];
  drawContour(lm,lipTop,w,h,"rgba(255,150,150,0.3)",0.8);

  // eyes
  drawContour(lm,FACE_REYE,w,h,EYE_COLOR,1);
  drawContour(lm,FACE_LEYE,w,h,EYE_COLOR,1);

  // eyebrows
  const rBrow=[70,63,105,66,107,55,65,52,53,46];
  const lBrow=[300,293,334,296,336,285,295,282,283,276];
  drawContour(lm,rBrow,w,h,"rgba(255,255,255,0.2)",0.8);
  drawContour(lm,lBrow,w,h,"rgba(255,255,255,0.2)",0.8);

  // nose
  const nose=[168,6,197,195,5,4,1,19,94,2];
  drawContour(lm,nose,w,h,"rgba(255,255,255,0.2)",0.8);

  // sparse mesh dots (every 8th point for performance)
  oc.fillStyle="rgba(255,255,255,0.12)";
  for(let i=0;i<lm.length;i+=8){
    if(!lm[i]) continue;
    oc.beginPath(); oc.arc(lm[i].x*w, lm[i].y*h, 0.8, 0, 6.283); oc.fill();
  }

  oc.restore();
}

// ═══════════════════════════════════════════════════════════════════
//  IRIS RENDERING
// ═══════════════════════════════════════════════════════════════════

function drawIris(lm,w,h){
  // Iris indices: 468-472 (right), 473-477 (left)
  oc.save();
  oc.shadowColor=IRIS_COLOR; oc.shadowBlur=8;

  // right iris
  oc.strokeStyle=IRIS_COLOR; oc.lineWidth=1.2;
  oc.beginPath();
  for(let i=468;i<=472;i++){
    if(i===468) oc.moveTo(lm[i].x*w, lm[i].y*h);
    else oc.lineTo(lm[i].x*w, lm[i].y*h);
  }
  oc.closePath(); oc.stroke();

  // left iris
  oc.beginPath();
  for(let i=473;i<=477;i++){
    if(i===473) oc.moveTo(lm[i].x*w, lm[i].y*h);
    else oc.lineTo(lm[i].x*w, lm[i].y*h);
  }
  oc.closePath(); oc.stroke();

  // iris centers
  oc.fillStyle=IRIS_COLOR;
  oc.beginPath(); oc.arc(lm[468].x*w, lm[468].y*h, 3, 0,6.283); oc.fill();
  oc.beginPath(); oc.arc(lm[473].x*w, lm[473].y*h, 3, 0,6.283); oc.fill();

  // pupil
  oc.fillStyle="#000";
  oc.beginPath(); oc.arc(lm[468].x*w, lm[468].y*h, 1.5, 0,6.283); oc.fill();
  oc.beginPath(); oc.arc(lm[473].x*w, lm[473].y*h, 1.5, 0,6.283); oc.fill();

  oc.restore();
}

// ═══════════════════════════════════════════════════════════════════
//  HAND RENDERING
// ═══════════════════════════════════════════════════════════════════

function drawHandSkel(lm,w,h,fing){
  oc.save();
  oc.lineCap="round"; oc.lineWidth=1.5; oc.shadowBlur=6;
  for(let c=0;c<HCONN.length;c++){
    const[i,j]=HCONN[c],fi=HCF[c];
    oc.strokeStyle=fi>=0?P.fingers[fi]:P.primary;
    oc.shadowColor=oc.strokeStyle;
    oc.beginPath();oc.moveTo(lm[i].x*w,lm[i].y*h);oc.lineTo(lm[j].x*w,lm[j].y*h);oc.stroke();
  }
  for(let i=0;i<lm.length;i++){
    const x=lm[i].x*w,y=lm[i].y*h;
    if(TIPS.includes(i)){
      const fi=TIPS.indexOf(i);
      oc.fillStyle=fing[fi]?P.bright:P.dim;
      oc.beginPath();oc.arc(x,y,fing[fi]?5:3.5,0,6.283);oc.fill();
    } else if(i===0){
      oc.fillStyle=P.bright;oc.beginPath();oc.arc(x,y,5,0,6.283);oc.fill();
    }
  }
  oc.restore();
}

function drawArcs(cx,cy,gest){
  const sm=gest==="OPEN PALM"?1.4:gest==="FIST"?0.5:1;
  rot+=0.02*sm;
  const R=[55,85];
  oc.save();oc.lineCap="round";oc.lineWidth=1.2;oc.shadowBlur=6;
  for(let i=0;i<R.length;i++){
    const r=R[i],dir=i===0?1:-1,a=rot*dir*(1+i*0.4),sw=1.6-i*0.2;
    oc.strokeStyle=P.fingers[i];oc.shadowColor=oc.strokeStyle;
    oc.beginPath();oc.arc(cx,cy,r,a,a+sw);oc.stroke();
    oc.beginPath();oc.arc(cx,cy,r,a+Math.PI,a+Math.PI+sw);oc.stroke();
    const da=a;
    oc.fillStyle=P.bright;oc.beginPath();oc.arc(cx+r*Math.cos(da),cy+r*Math.sin(da),2,0,6.283);oc.fill();
  }
  oc.restore();
}

// ═══════════════════════════════════════════════════════════════════
//  PARTICLES / RIPPLES / SCAN
// ═══════════════════════════════════════════════════════════════════

function spawn(x,y,col){
  if(particles.length>100)return;
  const a=Math.random()*6.283,s=0.4+Math.random()*0.6;
  particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:1,dec:0.02+Math.random()*0.01,r:1.5+Math.random()*1,col});
}
function tickP(){for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.x+=p.vx;p.y+=p.vy;p.vy+=0.01;p.life-=p.dec;if(p.life<=0)particles.splice(i,1);}}
function tickR(){for(let i=ripples.length-1;i>=0;i--){const r=ripples[i];r.rad+=1.5;r.life-=0.03;if(r.life<=0||r.rad>70)ripples.splice(i,1);}}
function emitP(lm,w,h,f){for(let i=0;i<TIPS.length;i++){if(!f[i]||Math.random()>0.25)continue;spawn(lm[TIPS[i]].x*w,lm[TIPS[i]].y*h,P.fingers[i]);}}

function drawPart(){
  oc.save();oc.shadowBlur=3;
  for(const p of particles){oc.globalAlpha=p.life*0.6;oc.fillStyle=p.col;oc.shadowColor=p.col;oc.beginPath();oc.arc(p.x,p.y,p.r*p.life,0,6.283);oc.fill();}
  oc.restore();
}
function drawRip(){
  oc.save();oc.lineWidth=1.2;
  for(const r of ripples){oc.globalAlpha=r.life*0.4;oc.strokeStyle=P.bright;oc.shadowColor=P.glow;oc.shadowBlur=8;oc.beginPath();oc.arc(r.x,r.y,r.rad,0,6.283);oc.stroke();}
  oc.restore();
}

function drawScan(w,h){
  if(!scanOn)return;
  scanY+=1;if(scanY>h+8)scanY=-8;
  oc.save();oc.globalAlpha=0.1;oc.fillStyle=P.primary;oc.fillRect(0,scanY,w,1.5);oc.restore();
}

function drawEdge(w){
  oc.save();const g=oc.createLinearGradient(0,0,w,0);g.addColorStop(0,`rgba(${hx(P.primary)},0.04)`);g.addColorStop(0.5,"rgba(0,0,0,0)");g.addColorStop(1,`rgba(${hx(P.primary)},0.04)`);oc.fillStyle=g;oc.fillRect(0,0,w,ovl.height);oc.restore();
}

// ═══════════════════════════════════════════════════════════════════
//  TEXT OVERLAYS
// ═══════════════════════════════════════════════════════════════════

function drawScore(lm,w,h,hand,conf,gest){
  let px=0,py=0;for(const i of PALM){px+=lm[i].x;py+=lm[i].y;}px/=PALM.length;py/=PALM.length;
  const scx=nx(px,w),scy=ny(py,h),lbl=`${Math.round(conf*100)}%`;
  tc.save();tc.font="bold 26px 'Segoe UI',system-ui,sans-serif";
  const tw=tc.measureText(lbl).width;
  tc.fillStyle="rgba(8,8,12,0.7)";tc.beginPath();rr(tc,scx-tw/2-10,scy-22,tw+20,54,4);tc.fill();
  tc.fillStyle=P.primary;tc.textAlign="center";tc.textBaseline="middle";tc.fillText(lbl,scx,scy-2);
  tc.font="600 8px 'Segoe UI',system-ui,sans-serif";tc.fillStyle=P.dim;tc.fillText(`${gest} | ${hand.toUpperCase()}`,scx,scy+20);
  tc.restore();
}

function drawPanel(lm,w,h,gest,hand,idx){
  const wx=nx(lm[0].x,w),wy=ny(lm[0].y,h);
  const pw=135,ph=100,px=wx-pw-10,py=wy-50;
  const span=(dst(lm[0],lm[12])*30).toFixed(1);
  tc.save();tc.fillStyle="rgba(5,5,10,0.72)";tc.beginPath();rr(tc,px,py,pw,ph,4);tc.fill();
  tc.strokeStyle=`rgba(${hx(P.primary)},0.15)`;tc.lineWidth=1;tc.beginPath();rr(tc,px,py,pw,ph,4);tc.stroke();
  tc.fillStyle=P.primary;tc.globalAlpha=0.5;tc.fillRect(px+6,py+1,pw-12,1);tc.globalAlpha=1;
  tc.textAlign="left";tc.textBaseline="top";let ty=py+7;const lx=px+7,vx=px+66;
  tc.font="bold 7px 'Segoe UI',system-ui,sans-serif";tc.fillStyle=P.primary;
  tc.fillText(`HAND ${idx} ${hand.toUpperCase()}`,lx,ty);ty+=12;
  tc.font="7px 'Courier New',monospace";
  for(let fi=0;fi<5;fi++){tc.fillStyle=P.dim;tc.fillText(FNAMES[fi].padEnd(7),lx,ty);tc.fillStyle=gest.fingers[fi]?P.bright:"#444";tc.fillText(gest.fingers[fi]?"EXT":"FLD",vx,ty);ty+=11;}
  tc.fillStyle=P.dim;tc.fillText("SPAN",lx,ty);tc.fillStyle=P.primary;tc.fillText(`${span}cm`,vx,ty);ty+=11;
  tc.fillStyle=P.dim;tc.fillText("GEST",lx,ty);tc.fillStyle=P.bright;tc.fillText(gest.name,vx,ty);
  tc.restore();
}

function drawBadge(w,h,name){
  if(name===prevGest)gestFr++;else{prevGest=name;gestFr=0;}
  gEl.textContent=name;
  if(gestFr<10&&name!=="NONE"){tc.save();tc.globalAlpha=(1-gestFr/10)*0.5;tc.font="bold 24px 'Segoe UI',system-ui,sans-serif";tc.textAlign="center";tc.textBaseline="middle";tc.fillStyle=P.primary;tc.fillText(name,w/2,h/2-80);tc.restore();}
}

// ═══════════════════════════════════════════════════════════════════
//  GESTURE
// ═══════════════════════════════════════════════════════════════════

function fUp(lm,t,p){return dst(lm[t],lm[0])>dst(lm[p],lm[0])*1.05;}
function tUp(lm){return dst(lm[4],lm[5])>dst(lm[3],lm[5])*1.15;}
function detect(lm){
  const t=tUp(lm),i=fUp(lm,8,6),m=fUp(lm,12,10),r=fUp(lm,16,14),p=fUp(lm,20,18);
  const f=[t,i,m,r,p],n=f.filter(Boolean).length;
  if(dst(lm[4],lm[8])<0.055)return{name:"PINCH",fingers:f};
  if(n===0)return{name:"FIST",fingers:f};
  if(n===5)return{name:"OPEN PALM",fingers:f};
  if(i&&!m&&!r&&!p)return{name:"POINTING",fingers:f};
  if(i&&m&&!r&&!p)return{name:"PEACE",fingers:f};
  if(t&&!i&&!m&&!r&&!p)return{name:"THUMBS UP",fingers:f};
  if(i&&p&&!m&&!r)return{name:"ROCK",fingers:f};
  if(i&&m&&r&&!p)return{name:"THREE",fingers:f};
  if(!t&&i&&m&&r&&p)return{name:"FOUR",fingers:f};
  return{name:`${n} UP`,fingers:f};
}

// ═══════════════════════════════════════════════════════════════════
//  FPS
// ═══════════════════════════════════════════════════════════════════

function tickFps(){const now=performance.now(),dt=now-lt;lt=now;if(dt>0)sfps=sfps*0.92+(1000/dt)*0.08;fpsEl.textContent=Math.round(sfps);}

// ═══════════════════════════════════════════════════════════════════
//  MEDIAPIPE CALLBACKS
// ═══════════════════════════════════════════════════════════════════

function onPoseResults(res){
  if(res.poseLandmarks) lastPose = res.poseLandmarks;
  else lastPose = null;
  poseEl.textContent = lastPose ? "ON" : "--";
}

function onFaceResults(res){
  if(res.multiFaceLandmarks && res.multiFaceLandmarks.length > 0){
    lastFace = res.multiFaceLandmarks[0];
    faceEl.textContent = "ON";
    // check for iris (indices 468+)
    irisEl.textContent = (lastFace.length > 470) ? "ON" : "--";
  } else {
    lastFace = null;
    faceEl.textContent = "--";
    irisEl.textContent = "--";
  }
}

function onHandResults(res){
  hEl.textContent = res.multiHandLandmarks ? res.multiHandLandmarks.length : 0;
  if(res.multiHandLandmarks && res.multiHandedness){
    const raw = res.multiHandLandmarks;
    const sm = smoothLM(raw, 0.5);
    // store for rendering
    window._handData = { raw, sm, handedness: res.multiHandedness };
  } else {
    window._handData = null;
    smoothBuf = [];
  }
}

// ═══════════════════════════════════════════════════════════════════
//  MAIN RENDER LOOP (called by rAF for smooth visuals between MP frames)
// ═══════════════════════════════════════════════════════════════════

let renderAnimId;
function renderLoop(){
  const w=ovl.clientWidth, h=ovl.clientHeight;
  if(ovl.width!==w){ovl.width=w;ovl.height=h;}
  if(txt.width!==w){txt.width=w;txt.height=h;}

  oc.clearRect(0,0,w,h);
  tc.clearRect(0,0,w,h);
  tickFps(); tickP(); tickR();
  drawScan(w,h);

  // ── Body pose ────────────────────────────────────────────────
  if(modes.pose && lastPose){
    drawPose(lastPose, w, h);
  }

  // ── Face mesh ────────────────────────────────────────────────
  if(modes.face && lastFace){
    drawFace(lastFace, w, h);
    if(modes.iris && lastFace.length > 470){
      drawIris(lastFace, w, h);
    }
  }

  // ── Hands ────────────────────────────────────────────────────
  if(modes.hands && window._handData){
    const {sm, raw, handedness} = window._handData;
    for(let i=0;i<sm.length;i++){
      const lm = sm[i];
      const rlm = raw[i];
      const hand = handedness[i].label;
      const conf = handedness[i].score;
      const g = detect(rlm);

      let cx=0,cy=0;
      for(const pi of PALM){cx+=lm[pi].x;cy+=lm[pi].y;}
      cx=(cx/PALM.length)*w;cy=(cy/PALM.length)*h;

      drawHandSkel(lm,w,h,g.fingers);
      emitP(rlm,w,h,g.fingers);
      if(g.name==="PINCH"&&Math.random()>0.7) ripples.push({x:((rlm[4].x+rlm[8].x)/2)*w,y:((rlm[4].y+rlm[8].y)/2)*h,rad:3,life:1});
      drawArcs(cx,cy,g.name);
      drawScore(lm,w,h,hand,conf,g.name);
      drawPanel(lm,w,h,g,hand,i+1);
      drawBadge(w,h,g.name);
    }
  }

  drawRip(); drawPart(); drawEdge(w);
  renderAnimId = requestAnimationFrame(renderLoop);
}

// ═══════════════════════════════════════════════════════════════════
//  MODE TOGGLES
// ═══════════════════════════════════════════════════════════════════

function setupModes(){
  const ids = ["tog-pose","tog-face","tog-hands","tog-iris"];
  const keys = ["pose","face","hands","iris"];
  const statusEls = [poseEl, faceEl, gEl ? null : null, irisEl];

  ids.forEach((id,i) => {
    const btn = document.getElementById(id);
    btn.addEventListener("click", () => {
      modes[keys[i]] = !modes[keys[i]];
      btn.classList.toggle("active", modes[keys[i]]);
      // update status
      const el = [poseEl, faceEl, null, irisEl][i];
      if(el && !modes[keys[i]]) el.textContent = "OFF";
    });
  });
}

// ═══════════════════════════════════════════════════════════════════
//  CAMERA SWITCH
// ═══════════════════════════════════════════════════════════════════

async function switchCam(){
  facing = facing==="user" ? "environment" : "user";
  sEl.textContent = facing==="user" ? "FRONT" : "REAR";
  if(cam) cam.stop();
  vid.srcObject?.getTracks().forEach(t=>t.stop());
  smoothBuf = [];
  lastPose = null; lastFace = null;

  cam = new Camera(vid, {
    onFrame: async()=>{
      const promises = [];
      if(handsInst && modes.hands) promises.push(handsInst.send({image:vid}));
      if(poseInst && modes.pose) promises.push(poseInst.send({image:vid}));
      if(faceInst && (modes.face || modes.iris)) promises.push(faceInst.send({image:vid}));
      await Promise.all(promises);
    },
    width:1280, height:720, facingMode:facing,
  });
  await cam.start();
}

// ═══════════════════════════════════════════════════════════════════
//  RECORDING
// ═══════════════════════════════════════════════════════════════════

function startRec(){
  const rc=document.createElement("canvas"), rx=rc.getContext("2d");
  rc.width=ovl.width||1280; rc.height=ovl.height||720;
  let mime="video/webm";
  if(MediaRecorder.isTypeSupported("video/webm;codecs=vp9")) mime="video/webm;codecs=vp9";
  else if(MediaRecorder.isTypeSupported("video/webm;codecs=vp8")) mime="video/webm;codecs=vp8";
  const stream=rc.captureStream(30);
  mRec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:4000000});
  chunks=[];mRec.ondataavailable=e=>{if(e.data.size>0)chunks.push(e.data);};
  mRec.onstop=saveRec;

  let anim;
  function comp(){
    if(!recording){cancelAnimationFrame(anim);return;}
    rx.clearRect(0,0,rc.width,rc.height);
    rx.save();rx.translate(rc.width,0);rx.scale(-1,1);rx.drawImage(vid,0,0,rc.width,rc.height);rx.restore();
    rx.save();rx.translate(rc.width,0);rx.scale(-1,1);rx.drawImage(ovl,0,0);rx.restore();
    rx.drawImage(txt,0,0);
    anim=requestAnimationFrame(comp);
  }
  recording=true; mRec.start(1000); comp();
  bRec.classList.add("recording"); recInd.classList.remove("hidden");
  recStart=Date.now();
  recTimer=setInterval(()=>{const s=Math.floor((Date.now()-recStart)/1000);recTm.textContent=`${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;},500);
}

function saveRec(){
  const blob=new Blob(chunks,{type:mRec.mimeType||"video/webm"});
  chunks=[];
  const ts=new Date().toISOString().replace(/[:.]/g,"-").slice(0,19);
  const fn=`body-ar-${ts}.webm`;
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.style.display="none";a.href=url;a.download=fn;document.body.appendChild(a);a.click();
  setTimeout(()=>{try{window.open(url,"_blank");}catch(e){}setTimeout(()=>{URL.revokeObjectURL(url);a.remove();},5000);},500);
  if(navigator.share&&navigator.canShare){
    blob.arrayBuffer().then(buf=>{const f=new File([buf],fn,{type:"video/webm"});if(navigator.canShare({files:[f]}))navigator.share({files:[f],title:"Body AR Recording"}).catch(()=>{});});
  }
}

function stopRec(){recording=false;if(mRec&&mRec.state!=="inactive")mRec.stop();bRec.classList.remove("recording");recInd.classList.add("hidden");clearInterval(recTimer);}

// ═══════════════════════════════════════════════════════════════════
//  FULLSCREEN
// ═══════════════════════════════════════════════════════════════════

function toggleFS(){if(!document.fullscreenElement)document.getElementById("viewport").requestFullscreen?.();else document.exitFullscreen?.();}

// ═══════════════════════════════════════════════════════════════════
//  KEYBOARD
// ═══════════════════════════════════════════════════════════════════

document.addEventListener("keydown",e=>{
  if(e.key==="q"||e.key==="Q"){sEl.textContent="STOPPED";vid.srcObject?.getTracks().forEach(t=>t.stop());}
  if(e.key==="c"||e.key==="C"){palIdx=(palIdx+1)%PALETTES.length;P=PALETTES[palIdx];sEl.textContent=P.name;sEl.style.borderColor=P.primary;sEl.style.color=P.primary;}
  if(e.key==="s"||e.key==="S")scanOn=!scanOn;
});

// ═══════════════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════════════

async function start(){
  startO.classList.add("hidden");
  sEl.textContent="LOADING MODELS...";

  // ── Hands ──────────────────────────────────────────────────
  handsInst = new Hands({locateFile:f=>`https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${f}`});
  handsInst.setOptions({maxNumHands:2,modelComplexity:1,minDetectionConfidence:0.75,minTrackingConfidence:0.65});
  handsInst.onResults(onHandResults);

  // ── Pose ───────────────────────────────────────────────────
  poseInst = new Pose({locateFile:f=>`https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${f}`});
  poseInst.setOptions({modelComplexity:1,smoothLandmarks:true,enableSegmentation:false,minDetectionConfidence:0.6,minTrackingConfidence:0.6});
  poseInst.onResults(onPoseResults);

  // ── Face Mesh (+ iris) ─────────────────────────────────────
  faceInst = new FaceMesh({locateFile:f=>`https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${f}`});
  faceInst.setOptions({maxNumFaces:1,refineLandmarks:true,minDetectionConfidence:0.6,minTrackingConfidence:0.6});
  faceInst.onResults(onFaceResults);

  sEl.textContent="STARTING CAM...";
  cam = new Camera(vid,{
    onFrame: async()=>{
      const p=[];
      if(modes.hands) p.push(handsInst.send({image:vid}));
      if(modes.pose) p.push(poseInst.send({image:vid}));
      if(modes.face||modes.iris) p.push(faceInst.send({image:vid}));
      await Promise.all(p);
    },
    width:1280, height:720, facingMode:facing,
  });
  await cam.start();

  sEl.textContent=P.name; sEl.style.borderColor=P.primary; sEl.style.color=P.primary;
  setupModes();
  renderLoop(); // start the render loop
}

startB.addEventListener("click",start);
bCam.addEventListener("click",switchCam);
bRec.addEventListener("click",()=>{recording?stopRec():startRec();});
bFS.addEventListener("click",toggleFS);
