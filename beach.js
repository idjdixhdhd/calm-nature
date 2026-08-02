import * as THREE from './vendor/three.module.js';

/* 治愈系热带海滩 · 从 adams914/beach-wallpaper 复刻并改造为可嵌入模块
   天空+海洋(Gerstner波)+沙滩+椰树+篝火+海鸥/螃蟹/海龟+云雾+昼夜
   用法: const c = startBeach(containerEl, {hour:14, speed:40, audio:false}); */

export function startBeach(container, opts={}){
/* ==================== 0. 工具 & 参数 ==================== */
const clamp=(x,a,b)=>x<a?a:(x>b?b:x);
const lerp=(a,b,t)=>a+(b-a)*t;
const sstep01=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
const smoothstep=(a,b,x)=>sstep01((x-a)/(b-a));
const lerpC=(A,B,t)=>[lerp(A[0],B[0],t),lerp(A[1],B[1],t),lerp(A[2],B[2],t)];
const rand=(a=1,b)=>b===undefined?Math.random()*a:a+Math.random()*(b-a);
const fract=x=>x-Math.floor(x);
const hash2=(i,j)=>fract(Math.sin(i*127.1+j*311.7)*43758.5453);
/* 平滑值噪声（CPU 侧，给地形/纹理工用） */
function vnoise(x,z){
  const xi=Math.floor(x),zi=Math.floor(z),xf=x-xi,zf=z-zi;
  const u=xf*xf*(3-2*xf),v=zf*zf*(3-2*zf);
  return lerp(lerp(hash2(xi,zi),hash2(xi+1,zi),u),lerp(hash2(xi,zi+1),hash2(xi+1,zi+1),u),v);
}
function fbm2(x,z,oct=4){
  let v=0,a=0.5;
  for(let i=0;i<oct;i++){ v+=a*vnoise(x,z); x=x*2.03+19.7; z=z*2.03+7.3; a*=0.5; }
  return v;
}

  const CFG={
    startHour: (opts&&Number.isFinite(opts.hour))?((opts.hour%24)+24)%24:10,
    speed: (opts&&Number.isFinite(opts.speed)&&opts.speed>0)?opts.speed:60,
    still: !!(opts&&opts.still),
  };

/* ==================== 1. 时间系统 ==================== */
const Time={
  hour:CFG.startHour,
  total:CFG.startHour,
  speed:CFG.speed,
  sync:false,
  anim:rand(100),
  update(dt){
    this.anim+=dt;
    if(this.sync){
      const d=new Date();
      this.hour=d.getHours()+d.getMinutes()/60+d.getSeconds()/3600+d.getMilliseconds()/3.6e6;
      this.total+=dt/3600;
    }else{
      const dh=dt*this.speed/3600;
      this.hour=(this.hour+dh)%24;
      this.total+=dh;
    }
  },
  get day(){return Math.floor(this.total/24);},
  clock(){
    const h=Math.floor(this.hour),m=Math.floor((this.hour-h)*60);
    return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');
  }
};

/* ==================== 2. 调色板（13 关键帧，低饱和） ==================== */
const PAL=[
  {h:0.0, zen:[10,14,32],   hor:[26,32,56],   sun:[250,170,110], cloudL:[46,52,76],   cloudS:[24,28,46],   fog:[32,38,62],   fogD:.45, star:1.00, wD:[12,20,38],  wS:[27,41,63],   sand:[41,35,30]},
  {h:4.0, zen:[13,18,40],   hor:[33,39,64],   sun:[250,170,110], cloudL:[52,56,80],   cloudS:[27,31,50],   fog:[34,40,66],   fogD:.50, star:1.00, wD:[13,22,44],  wS:[30,44,68],   sand:[44,37,31]},
  {h:5.5, zen:[26,32,66],   hor:[94,80,94],   sun:[246,160,104], cloudL:[120,102,110],cloudS:[48,46,66],   fog:[58,56,80],   fogD:.58, star:.55,  wD:[20,28,54],  wS:[46,54,80],   sand:[56,47,41]},
  {h:6.5, zen:[108,122,166],hor:[226,166,130],sun:[244,152,98],  cloudL:[238,188,158],cloudS:[122,112,142],fog:[150,130,138],fogD:.50, star:.05,  wD:[52,74,110], wS:[120,128,150],sand:[152,126,102]},
  {h:8.0, zen:[126,164,206],hor:[214,208,190],sun:[252,222,172], cloudL:[248,242,232],cloudS:[166,174,194],fog:[196,196,190],fogD:.30, star:.00,  wD:[44,88,128], wS:[98,152,180], sand:[214,186,148]},
  {h:10.0,zen:[118,166,212],hor:[222,220,202],sun:[255,236,200], cloudL:[250,248,242],cloudS:[172,182,200],fog:[204,206,200],fogD:.22, star:.00,  wD:[38,92,136], wS:[90,158,190], sand:[222,196,158]},
  {h:12.0,zen:[112,160,208],hor:[230,227,210],sun:[255,244,220], cloudL:[252,250,246],cloudS:[176,186,204],fog:[210,211,204],fogD:.18, star:.00,  wD:[34,90,136], wS:[86,160,192], sand:[228,204,166]},
  {h:15.0,zen:[116,152,196],hor:[236,206,162],sun:[255,228,172], cloudL:[250,238,220],cloudS:[176,172,184],fog:[214,200,184],fogD:.22, star:.00,  wD:[38,86,126], wS:[94,152,182], sand:[228,198,152]},
  {h:17.0,zen:[104,128,178],hor:[238,184,136],sun:[253,192,130], cloudL:[246,204,170],cloudS:[150,134,156],fog:[200,168,150],fogD:.30, star:.00,  wD:[42,76,114], wS:[106,134,160],sand:[216,178,134]},
  {h:18.2,zen:[84,88,140],  hor:[226,130,102],sun:[242,132,90],  cloudL:[234,150,122],cloudS:[98,86,118],  fog:[156,116,112],fogD:.42, star:.10,  wD:[46,60,100], wS:[112,98,124], sand:[170,130,102]},
  {h:19.2,zen:[48,54,100],  hor:[148,100,110],sun:[240,140,100], cloudL:[150,110,118],cloudS:[58,52,78],   fog:[88,74,90],  fogD:.50, star:.50,  wD:[28,38,72],  wS:[62,64,94],   sand:[98,78,65]},
  {h:20.8,zen:[20,26,56],   hor:[40,46,78],   sun:[250,170,110], cloudL:[58,62,88],   cloudS:[30,34,54],   fog:[42,48,74],  fogD:.50, star:.90,  wD:[15,25,50],  wS:[36,46,74],  sand:[54,46,39]},
  {h:22.0,zen:[11,15,34],   hor:[28,34,58],   sun:[250,170,110], cloudL:[48,54,78],   cloudS:[25,29,48],   fog:[33,39,64],  fogD:.47, star:1.00, wD:[12,21,40],  wS:[28,42,64],  sand:[43,36,31]},
];
function samplePal(h){
  h=((h%24)+24)%24;
  let i=0;
  for(let k=0;k<PAL.length;k++){ if(PAL[k].h<=h) i=k; }
  const A=PAL[i], B=PAL[(i+1)%PAL.length];
  const span=((B.h-A.h)+24)%24||24;
  const t=sstep01((((h-A.h)+24)%24)/span);
  const o={};
  for(const k of ['zen','hor','sun','cloudL','cloudS','fog','wD','wS','sand']) o[k]=lerpC(A[k],B[k],t);
  for(const k of ['fogD','star']) o[k]=lerp(A[k],B[k],t);
  return o;
}
/* 白昼强度 0(夜)→1(昼) */
const daylight=h=>smoothstep(5.4,7.2,h)*(1-smoothstep(17.4,19.2,h));
/* 篝火强度：18:30 淡入，5:30 前淡出 */
function fireFade(h){
  if(h>=18.3) return smoothstep(18.3,19.1,h);
  if(h<=5.5)  return 1-smoothstep(4.7,5.5,h);
  return 0;
}
/* 太阳 3D 方向（6-18 时弧线，东左西右，略偏海面上空；余晖延伸到海平线下） */
function sunState(h){
  const t=(h-6)/12;
  const alt=Math.sin(Math.PI*clamp(t,-0.12,1.12));   /* 允许略低于海平线（晨昏余晖） */
  const ct=clamp(t,0,1);
  const dir=new THREE.Vector3(-Math.cos(Math.PI*ct)*0.62, Math.max(alt,0.0)*0.75+0.06, -0.72).normalize();
  const vis=smoothstep(-0.30,-0.02,alt)*smoothstep(5.3,5.6,h)*(1-smoothstep(19.0,19.4,h));
  return {
    t:ct, alt, dir, vis,
    col:lerpC([255,150,88],[255,240,212],smoothstep(0,0.5,Math.max(alt,0)))
  };
}
/* 满月 3D 方向（18-6 时弧线，压扁轨迹保证入画，黄昏缓慢淡入） */
function moonState(h){
  const m=(((h-18)%24)+24)%24;
  if(m>=12) return {vis:0, alt:0, dir:new THREE.Vector3(0,1,0), t:0};
  const t=m/12, alt=Math.sin(Math.PI*t);
  const dir=new THREE.Vector3(-Math.cos(Math.PI*t)*0.45, alt*0.32+0.04, -0.9).normalize();
  return { vis:smoothstep(0.08,0.30,alt), alt, dir, t };
}


/* ==================== 3. 渲染器 / 场景 / 相机 ==================== */
  const canvas=document.createElement('canvas');
  canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;display:block';
  container.appendChild(canvas);
  if(getComputedStyle(container).position==='static') container.style.position='relative';
  container.style.overflow='hidden';
const renderer=new THREE.WebGLRenderer({canvas, antialias:true, powerPreference:'high-performance'});
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.05;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;

const scene=new THREE.Scene();
scene.fog=new THREE.FogExp2(0x22283c, 0.002);

const camera=new THREE.PerspectiveCamera(55, 1, 0.1, 1600);
const CAM_BASE=new THREE.Vector3(0, 3.0, 13);
const LOOK_BASE=new THREE.Vector3(0, 1.55, -26);
camera.position.copy(CAM_BASE);
camera.lookAt(LOOK_BASE);

/* ==================== 3b. 交互控制器（缩放/拖拽旋转） ==================== */
/* 仅当 startBeach(container,{interactive:true}) 时启用；否则保持原来的呼吸漂移+鼠标视差 */
const INTERACTIVE = !!(opts && opts.interactive);
const camCtl = { yaw:0, pitch:0, dist:1, dragging:false, lastX:0, lastY:0, pinchDist:0 };
const ZMIN=0.42, ZMAX=2.4;
const _baseOff = new THREE.Vector3(0, CAM_BASE.y-LOOK_BASE.y, CAM_BASE.z-LOOK_BASE.z); // ≈(0,1.45,39)
const _baseEl = Math.atan2(_baseOff.y, _baseOff.z);
const _camOff = new THREE.Vector3();
function applyCam(dt){
  const L = _baseOff.length() * camCtl.dist;
  const el = clamp(_baseEl + camCtl.pitch, -0.45, 0.85);
  const az = camCtl.yaw;
  _camOff.set(
    L*Math.cos(el)*Math.sin(az),
    L*Math.sin(el),
    L*Math.cos(el)*Math.cos(az)
  );
  const driftK = INTERACTIVE ? 0.22 : 1.0;
  camera.position.set(
    LOOK_BASE.x + _camOff.x + Math.sin(Time.anim*0.273)*0.30*driftK,
    LOOK_BASE.y + _camOff.y + Math.sin(Time.anim*0.217+1.3)*0.16*driftK,
    LOOK_BASE.z + _camOff.z + Math.sin(Time.anim*0.199+2.1)*0.22*driftK
  );
  const px = INTERACTIVE ? 0 : mouse.x;
  const py = INTERACTIVE ? 0 : mouse.y;
  camera.lookAt(
    LOOK_BASE.x + px*1.1,
    LOOK_BASE.y + Math.sin(Time.anim*0.242+0.7)*0.10*driftK + py*0.45,
    LOOK_BASE.z
  );
}

const mouse={x:0,y:0,tx:0,ty:0};
function onMove(e){
  mouse.tx=(e.clientX/window.innerWidth)*2-1;
  mouse.ty=-((e.clientY/window.innerHeight)*2-1);
}
window.addEventListener('mousemove', onMove, {passive:true});

/* 调色板颜色 → THREE.Color（sRGB → linear 工作空间），预分配避免每帧 GC */
const mkCol=(arr)=>new THREE.Color().setRGB(arr[0]/255,arr[1]/255,arr[2]/255,THREE.SRGBColorSpace);
function setCol(target,arr){ target.setRGB(arr[0]/255,arr[1]/255,arr[2]/255,THREE.SRGBColorSpace); return target; }

/* ==================== 4. 程序化纹理（canvas / data） ==================== */
function canvasTex(w,h,draw,srgb=true){
  const cv=document.createElement('canvas'); cv.width=w; cv.height=h;
  draw(cv.getContext('2d'),w,h);
  const t=new THREE.CanvasTexture(cv);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.anisotropy=4;
  if(srgb) t.colorSpace=THREE.SRGBColorSpace;
  return t;
}
/* 通用 RGBA 噪声（给自定义 shader 用，线性空间） */
function makeNoiseTexture(){
  const S=256, data=new Uint8Array(S*S*4);
  for(let y=0;y<S;y++)for(let x=0;x<S;x++){
    const i=(y*S+x)*4;
    /* 三组不同频率/相位的 fbm，tile 化（采样两组周期噪声混合） */
    const u=x/S*8, v=y/S*8;
    const wrap=(a,b)=>fbm2(a,b)-0.5;
    data[i  ]=clamp(128+wrap(u,v)*255*1.6,0,255);                                  // R 中频
    data[i+1]=clamp(128+fbm2(u*2+37,v*2+11,4)*255-128,0,255);                       // G 高频
    data[i+2]=clamp(fbm2(u*4+91,v*4+53,3)*255,0,255);                               // B 细碎
    data[i+3]=255;
  }
  const t=new THREE.DataTexture(data,S,S,THREE.RGBAFormat);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.magFilter=t.minFilter=THREE.LinearFilter;
  t.needsUpdate=true;
  return t;
}
const TEX_NOISE=makeNoiseTexture();

/* 细沙纹理：中性灰（材质 color 上色）+ 风纹 + 颗粒 */
const TEX_SAND=canvasTex(512,512,(ctx,w,h)=>{
  const img=ctx.createImageData(w,h), d=img.data;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4;
    const ripple=Math.sin(y*0.11+x*0.018+fbm2(x*0.02,y*0.02,3)*12.0)*3.2;
    const grain=(hash2(x,y)-0.5)*24;
    const mid=(fbm2(x*0.05,y*0.05,3)-0.5)*30;
    const patch=(fbm2(x*0.012+31,y*0.012+17,3)-0.5)*18;
    const v=clamp(208+ripple+grain+mid+patch,150,255);
    d[i]=v; d[i+1]=v*0.985; d[i+2]=v*0.955; d[i+3]=255;
  }
  ctx.putImageData(img,0,0);
});
TEX_SAND.repeat.set(10,4);

/* 树皮纹理：横向环纹 + 纵向纤维 + 斑点（彩色） */
const TEX_BARK=canvasTex(128,256,(ctx,w,h)=>{
  ctx.fillStyle='#a8896a'; ctx.fillRect(0,0,w,h);
  const img=ctx.getImageData(0,0,w,h), d=img.data;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4;
    const ring=Math.sin(y*0.28+fbm2(x*0.08,y*0.05,2)*3.0);
    const ringD=smoothstep(0.15,0.9,ring)*38;
    const fiber=(fbm2(x*0.35,y*0.04,3)-0.5)*26;
    const sp=(hash2(x*3,y)-0.5)*18;
    d[i  ]=clamp(d[i  ]-ringD+fiber+sp,0,255);
    d[i+1]=clamp(d[i+1]-ringD*0.92+fiber+sp,0,255);
    d[i+2]=clamp(d[i+2]-ringD*0.80+fiber*0.8+sp,0,255);
  }
  ctx.putImageData(img,0,0);
});
TEX_BARK.repeat.set(2,5);

/* 羽状叶纹理：中轴 + 两侧渐细小叶（alpha 镂空，高密度填充式小叶） */
const TEX_FROND=canvasTex(512,1024,(ctx,w,h)=>{
  ctx.clearRect(0,0,w,h);
  const cx=w/2;
  /* 小叶：从中脉两侧斜出、略下垂、尖端细的泪滴形填充；基部交叠保证密度 */
  for(let y=20;y<h-10;y+=4.4){
    const t=y/h;
    const prof=Math.sin(Math.PI*clamp((y-14)/(h-28),0,1));      /* 两端短中间长 */
    const len=(34+Math.pow(prof,0.72)*(w*0.455))*(0.86+hash2(y,7)*0.28);
    const wb=(8.5+prof*4.5)*(0.80+hash2(y,13)*0.40);            /* 小叶基部宽 */
    for(const s of [-1,1]){
      const droop=0.40+0.36*t+(hash2(y,s*3)-0.5)*0.10;          /* 下垂角，基部更垂 */
      const ex=cx+s*Math.cos(droop)*len, ey=y+Math.sin(droop)*len*0.60;
      const mx=cx+s*Math.cos(droop)*len*0.5, my=y+Math.sin(droop)*len*0.15-5;
      const g=98+hash2(y,s*11)*60;
      let r=42+g*0.30, b=38+g*0.25;
      if(hash2(y,21)>0.82){ r+=34; b-=12; }                     /* 少量黄绿变化 */
      ctx.fillStyle=`rgba(${clamp(r,0,255)|0},${g|0},${clamp(b,0,255)|0},0.97)`;
      ctx.beginPath();
      ctx.moveTo(cx,y-wb*0.5);
      ctx.quadraticCurveTo(mx,my-wb*0.30,ex,ey);                /* 上缘到细尖 */
      ctx.quadraticCurveTo(mx,my+wb*0.66,cx,y+wb*0.5);          /* 下缘鼓回基部 */
      ctx.closePath(); ctx.fill();
    }
  }
  /* 中轴 */
  ctx.strokeStyle='rgba(118,126,62,0.96)'; ctx.lineWidth=9; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(cx,6); ctx.lineTo(cx,h-4); ctx.stroke();
});

/* 云纹理：fbm 团 + 椭圆衰减 */
const TEX_CLOUD=canvasTex(256,128,(ctx,w,h)=>{
  const img=ctx.createImageData(w,h), d=img.data;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4;
    const n=fbm2(x*0.03,y*0.055,4);
    const ex=(x/w-0.5)*2, ey=(y/h-0.5)*2;
    const fall=clamp(1-(ex*ex*1.15+ey*ey*1.7),0,1);
    const a=clamp(smoothstep(0.46,0.72,n)*Math.pow(fall,1.1)*1.25,0,1);
    const shade=235-(y/h)*38;
    d[i]=shade; d[i+1]=shade; d[i+2]=shade+6; d[i+3]=a*255;
  }
  ctx.putImageData(img,0,0);
});

/* 径向光晕（additive sprite 用） */
const TEX_GLOW=canvasTex(128,128,(ctx,w,h)=>{
  const g=ctx.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);
  g.addColorStop(0,'rgba(255,255,255,1)');
  g.addColorStop(0.25,'rgba(255,255,255,0.55)');
  g.addColorStop(0.6,'rgba(255,255,255,0.16)');
  g.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
});

/* 海平线薄雾：横向柔带 */
const TEX_MIST=canvasTex(256,64,(ctx,w,h)=>{
  const img=ctx.createImageData(w,h), d=img.data;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4;
    const ey=(y/h-0.5)*2, ex=(x/w-0.5)*2;
    const a=Math.exp(-ey*ey*3.2)*clamp(1-ex*ex*1.4,0,1)*(0.75+0.25*fbm2(x*0.02,y*0.06,3));
    d[i]=d[i+1]=d[i+2]=255; d[i+3]=clamp(a*255,0,255);
  }
  ctx.putImageData(img,0,0);
});

/* 海龟壳：斑驳暗绿 */
const TEX_SHELL=canvasTex(128,128,(ctx,w,h)=>{
  const img=ctx.createImageData(w,h), d=img.data;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4;
    const n=fbm2(x*0.07,y*0.07,4);
    const n2=fbm2(x*0.02+9,y*0.02+4,3);
    d[i  ]=clamp(58+n*44+n2*30,0,255);
    d[i+1]=clamp(84+n*52+n2*34,0,255);
    d[i+2]=clamp(52+n*36+n2*22,0,255);
    d[i+3]=255;
  }
  ctx.putImageData(img,0,0);
});

/* ==================== 地形基准：沙滩高度场（海/沙/树共用） ==================== */
const WATERLINE_Z=-9;                    /* y=0 水线所在 z */
function sandH(x,z){
  if(z<WATERLINE_Z){                     /* 水下海床继续下探 */
    return (z-WATERLINE_Z)*0.14 + (vnoise(x*0.2,z*0.2)-0.5)*0.12;
  }
  const t=clamp((z-WATERLINE_Z)/26,0,1); /* 0=水线 → 1=岸上高处 */
  let h=Math.pow(t,1.35)*3.1;
  h+=(vnoise(x*0.08,z*0.08)-0.5)*0.55*smoothstep(0.1,0.7,t);
  h+=(vnoise(x*0.4+7,z*0.4)-0.5)*0.09;
  return h;
}

/* ==================== 5. 天空穹顶 ==================== */
const SKY_VERT=`
varying vec3 vDir;
void main(){
  vDir=position;
  vec4 mv=modelViewMatrix*vec4(position,1.0);
  gl_Position=projectionMatrix*mv;
}`;
const SKY_FRAG=`
varying vec3 vDir;
uniform vec3 uZen,uHor,uSunCol,uFogCol;
uniform vec3 uSunDir,uMoonDir;
uniform float uSunVis,uMoonVis,uStarA,uFogD,uTime;
float hash13(vec3 p){ return fract(sin(dot(p,vec3(12.9898,78.233,45.164)))*43758.5453); }
float hash12(vec2 p){ return fract(sin(dot(p,vec2(123.34,456.21)))*43758.5453); }
float vn2(vec2 p){
  vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
  float a=hash12(i),b=hash12(i+vec2(1,0)),c=hash12(i+vec2(0,1)),d=hash12(i+vec2(1,1));
  return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
}
float fbm(vec2 p){ float v=0.0,a=0.5; for(int i=0;i<4;i++){ v+=a*vn2(p); p=p*2.03+vec2(19.7,7.3); a*=0.5; } return v; }
float fbm8(vec2 p){ float v=0.0,a=0.5; for(int i=0;i<8;i++){ v+=a*vn2(p); p=p*2.03+vec2(19.7,7.3); a*=0.5; } return v; }
/* 大气散射：Rayleigh + Mie 近似 */
vec3 atmosphere(vec3 dir,vec3 sunDir,vec3 sunCol,float sunVis){
  float y=max(dir.y,0.0);
  float cosT=dot(dir,sunDir);
  float rayP=0.0597*(1.0+cosT*cosT);
  float g=0.76;
  float mieP=(1.0-g*g)/(6.28318*pow(1.0+g*g-2.0*g*cosT,1.5));
  float rayD=exp(-y*8.0);
  float mieD=exp(-y*2.5);
  vec3 sky=mix(uHor,uZen,pow(y,0.55));
  float sunset=1.0-smoothstep(0.0,0.36,sunDir.y);
  vec3 rayC=mix(vec3(0.10,0.28,0.62),vec3(0.62,0.30,0.18),sunset);
  sky+=rayC*rayP*rayD*0.18*sunVis;
  sky+=sunCol*mieP*mieD*0.045*sunVis;
  vec3 sdh=normalize(vec3(sunDir.x,0.0,sunDir.z));
  vec3 ddh=normalize(vec3(dir.x,0.0,dir.z));
  float az=max(dot(ddh,sdh),0.0);
  sky+=sunCol*pow(az,2.2)*exp(-y*5.0)*0.22*sunset*sunVis;
  return sky;
}
/* 体积感云 */
vec3 cloudLayer(vec3 dir,vec3 sunDir,float sunVis,inout float alpha){
  alpha=0.0;
  if(dir.y<0.02) return vec3(0.0);
  vec2 uv=dir.xz/(dir.y+0.28);
  uv+=uTime*0.0009;
  float d=fbm8(uv*0.28);
  float a=smoothstep(0.42,0.72,d);
  a*=smoothstep(0.02,0.28,dir.y);
  if(a<0.001) return vec3(0.0);
  alpha=a*0.88;
  vec3 sdh=normalize(vec3(sunDir.x,0.85,sunDir.z));
  float lit=0.52+0.48*max(dot(normalize(vec3(dir.x,0.55,dir.z)),sdh),0.0)*sunVis;
  vec3 base=mix(vec3(0.58,0.61,0.65),vec3(0.96,0.97,0.98),lit);
  base*=mix(0.40,1.0,smoothstep(0.02,0.40,dir.y));
  return base;
}
void main(){
  vec3 dir=normalize(vDir);
  vec3 col=atmosphere(dir,uSunDir,uSunCol,uSunVis);
  /* 太阳：日轮 + 光晕 */
  if(uSunVis>0.002){
    float d=dot(dir,uSunDir);
    float ang=acos(clamp(d,-1.0,1.0));
    float disc=1.0-smoothstep(0.011,0.017,ang);
    float glow=exp(-ang*ang*230.0)*0.48+exp(-ang*ang*24.0)*0.14;
    float low=1.0-smoothstep(0.05,0.55,uSunDir.y);
    glow+=exp(-ang*ang*3.0)*0.08*(0.35+0.65*low);
    col+=uSunCol*(disc*1.10+glow)*uSunVis;
  }
  /* 满月：环形山月面 + 边缘暗化 + 柔光晕 */
  if(uMoonVis>0.002){
    vec3 bx=normalize(cross(uMoonDir,vec3(0.0,1.0,0.0)));
    vec3 by=cross(bx,uMoonDir);
    float R=0.030;
    vec2 mp=vec2(dot(dir,bx),dot(dir,by))/R;
    float r2=dot(mp,mp);
    float d=dot(dir,uMoonDir);
    float ang=acos(clamp(d,-1.0,1.0));
    float disc=1.0-smoothstep(0.82,1.0,sqrt(r2));
    if(disc>0.001){
      float cr=fbm(mp*3.1+11.0);
      float cr2=fbm(mp*7.0+3.0);
      vec3 surf=mix(vec3(0.94,0.93,0.90),vec3(0.62,0.66,0.74),smoothstep(0.32,0.78,cr*0.75+cr2*0.35));
      surf*=0.72+0.28*sqrt(max(1.0-r2,0.0));
      col=mix(col,surf,disc*uMoonVis);
    }
    float mg=exp(-ang*ang*260.0)*0.42+exp(-ang*ang*22.0)*0.10;
    col+=vec3(0.78,0.83,0.96)*mg*uMoonVis;
  }
  /* 星空 */
  if(uStarA>0.004){
    vec3 sd=dir*150.0;
    vec3 cell=floor(sd);
    float rn=hash13(cell);
    if(rn>0.905){
      vec3 f=fract(sd)-0.5;
      float dd=length(f);
      float tw=0.70+0.30*sin(uTime*(0.4+rn*1.8)+rn*40.0);
      float s=(1.0-smoothstep(0.04,0.30,dd))*tw;
      col+=vec3(0.85,0.88,0.98)*s*uStarA*smoothstep(0.02,0.16,dir.y);
    }
  }
  /* 神光：日轮附近放射状条纹 */
  if(uSunVis>0.002){
    float gra=max(dot(normalize(vec3(dir.x,0.0,dir.z)),normalize(vec3(uSunDir.x,0.0,uSunDir.z))),0.0);
    float streak=pow(gra,7.0)*(0.55+0.45*sin(atan(dir.z,dir.x)*14.0+uTime*0.15));
    col+=uSunCol*streak*exp(-max(dir.y,0.0)*2.2)*uSunVis*0.05;
  }
  /* 云 */
  float cA; vec3 cCol=cloudLayer(dir,uSunDir,uSunVis,cA);
  col=mix(col,cCol,cA);
  /* 地平线雾霭 */
  col=mix(col,uFogCol,exp(-max(dir.y,0.0)*7.5)*uFogD*0.62);
  col+=(hash12(gl_FragCoord.xy)-0.5)*0.006;
  gl_FragColor=vec4(col,1.0);
}`;
const skyU={
  uZen:{value:new THREE.Color(0x0a0e20)}, uHor:{value:new THREE.Color(0x1a2040)},
  uSunCol:{value:new THREE.Color(1,1,1)}, uFogCol:{value:new THREE.Color(0x20263c)},
  uSunDir:{value:new THREE.Vector3(0,1,0)}, uMoonDir:{value:new THREE.Vector3(0,1,0)},
  uSunVis:{value:0}, uMoonVis:{value:0}, uStarA:{value:0}, uFogD:{value:0.4}, uTime:{value:0},
};
const sky=new THREE.Mesh(
  new THREE.SphereGeometry(560,40,20),
  new THREE.ShaderMaterial({vertexShader:SKY_VERT,fragmentShader:SKY_FRAG,uniforms:skyU,
    side:THREE.BackSide,depthWrite:false,fog:false})
);
sky.renderOrder=-2;
scene.add(sky);

/* 日/月 additive 泛光 sprite（贴穹顶方向，云层之后会被云遮住） */
function makeGlowSprite(color,scale){
  const m=new THREE.SpriteMaterial({map:TEX_GLOW,color,transparent:true,opacity:0,
    blending:THREE.AdditiveBlending,depthWrite:false,depthTest:false,fog:false});
  const s=new THREE.Sprite(m); s.scale.set(scale,scale,1); s.renderOrder=-1; scene.add(s);
  return s;
}
const sunSprite=makeGlowSprite(0xffdcb0,210);
const moonSprite=makeGlowSprite(0xbdcbee,95);

/* ==================== 6. 海洋（Gerstner 顶点波 + 细节法线 + 泡沫） ==================== */
const OCEAN_VERT=`
uniform float uTime;
attribute float aDepth;
varying vec3 vWorld;
varying vec3 vNrm;
varying float vDepth;
varying float vCrest;
void gerstner(vec2 p,vec2 d,float A,float L,float sp,float q,float cw,
              inout vec3 disp,inout vec3 nrm,inout float crest){
  float k=6.28318/L;
  float f=k*(dot(d,p)-sp*uTime);
  float c=cos(f),s=sin(f);
  disp.x+=q*A*d.x*c; disp.z+=q*A*d.y*c; disp.y+=A*s;
  float wa=k*A;
  nrm.x-=d.x*wa*c; nrm.z-=d.y*wa*c; nrm.y-=q*wa*s;
  crest+=(s*0.5+0.5)*cw;
}
void main(){
  vec3 wp=(modelMatrix*vec4(position,1.0)).xyz;
  float dA=clamp(aDepth/1.2,0.18,1.0);      /* 近岸波幅衰减 */
  vec3 disp=vec3(0.0);
  vec3 nrm=vec3(0.0,1.0,0.0);
  float crest=0.0;
  gerstner(wp.xz,vec2(0.148,0.989), 0.150*dA,14.0,1.15,0.30,0.42,disp,nrm,crest);
  gerstner(wp.xz,vec2(-0.196,0.981),0.085*dA, 8.5,0.95,0.26,0.30,disp,nrm,crest);
  gerstner(wp.xz,vec2(0.349,0.937), 0.050*dA, 5.2,0.80,0.20,0.18,disp,nrm,crest);
  gerstner(wp.xz,vec2(-0.0995,0.995),0.032*dA,3.4,1.35,0.14,0.10,disp,nrm,crest);
  vec3 pos=position+disp;
  vWorld=(modelMatrix*vec4(pos,1.0)).xyz;
  vNrm=normalize(nrm);
  vDepth=aDepth;
  vCrest=crest;
  gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.0);
}`;
const OCEAN_FRAG=`
uniform vec3 uDeep,uShallow,uHor,uZen,uSunCol,uFogCol;
uniform vec3 uSunDir,uMoonDir;
uniform float uSunVis,uMoonVis,uTime,uFogDensity,uFoamK;
uniform sampler2D uNoise;
varying vec3 vWorld;
varying vec3 vNrm;
varying float vDepth;
varying float vCrest;
void main(){
  vec3 view=normalize(cameraPosition-vWorld);
  float dist=length(cameraPosition-vWorld);
  vec3 n=normalize(vNrm);
  /* 两片滚动噪声扰动法线（远处衰减防闪烁；近岸降频降幅，水面平滑映天色） */
  float detK=exp(-dist*0.006);
  float calmK=mix(0.34,1.0,smoothstep(0.08,2.6,vDepth));   /* 近岸削弱细波 */
  float fScale=mix(0.68,1.0,smoothstep(0.0,2.2,vDepth));   /* 近岸降频 */
  vec2 wuv=vWorld.xz;
  vec2 uv1=wuv*0.045*fScale+vec2(uTime*0.021,uTime*0.013);
  vec2 uv2=wuv*0.14*fScale+vec2(-uTime*0.017,uTime*0.026);
  float h1a=texture2D(uNoise,uv1).g;
  float h1b=texture2D(uNoise,uv1+vec2(0.06,0.0)).g;
  float h1c=texture2D(uNoise,uv1+vec2(0.0,0.06)).g;
  float h2a=texture2D(uNoise,uv2).g;
  float h2b=texture2D(uNoise,uv2+vec2(0.05,0.0)).g;
  float h2c=texture2D(uNoise,uv2+vec2(0.0,0.05)).g;
  n.x-=((h1b-h1a)*0.56+(h2b-h2a)*0.30)*detK*calmK;
  n.z-=((h1c-h1a)*0.56+(h2c-h2a)*0.30)*detK*calmK;
  n=normalize(n);
  /* 基色：近岸浅绿松石 → 远海深蓝 */
  vec3 base=mix(uShallow,uDeep,smoothstep(0.12,5.5,vDepth));
  /* fresnel 反射天色 */
  float fres=0.028+0.972*pow(1.0-max(dot(n,view),0.0),5.0);
  /* 远海面掠射角强制 fresnel：海平线处海面映天色，海天衔接自然 */
  float grazing=1.0-max(dot(vec3(0.0,1.0,0.0),view),0.0);
  fres=max(fres,pow(grazing,6.0)*0.62);
  vec3 rdir=reflect(-view,n);
  vec3 refl=mix(uHor,uZen,pow(clamp(rdir.y,0.0,1.0),0.55));
  refl=mix(refl,uFogCol,exp(-max(rdir.y,0.0)*6.0)*0.35);
  vec3 col=mix(base,refl,clamp(fres,0.0,1.0)*0.9);
  col+=uHor*0.045;   /* 环境微光，夜里不死黑 */
  /* 太阳 Blinn 高光带（碎闪） */
  float sparkle=texture2D(uNoise,wuv*0.21+vec2(uTime*0.05,-uTime*0.03)).b;
  if(uSunVis>0.002){
    vec3 hv=normalize(view+uSunDir);
    float ndh=max(dot(n,hv),0.0);
    float sp=pow(ndh,260.0)*(0.35+2.3*smoothstep(0.55,0.9,sparkle))+pow(ndh,36.0)*0.10;
    col+=uSunCol*sp*uSunVis*1.35;
  }
  /* 月光银色碎光路 */
  if(uMoonVis>0.002){
    vec3 hv=normalize(view+uMoonDir);
    float ndm=max(dot(n,hv),0.0);
    float sp=pow(ndm,300.0)*(0.30+2.6*smoothstep(0.5,0.9,sparkle))+pow(ndm,40.0)*0.05;
    col+=vec3(0.80,0.86,0.97)*sp*uMoonVis*1.25;
  }
  /* 泡沫：岸线呼吸带 + 碎浪线 + 浪尖白沫 */
  float nz=texture2D(uNoise,wuv*0.045+vec2(uTime*0.008,uTime*0.004)).r;
  float lace=texture2D(uNoise,wuv*0.30+vec2(-uTime*0.03,uTime*0.05)).g;
  float breath=sin(uTime*0.32)*0.5+0.5;
  float band=1.0-smoothstep(0.10,0.75,vDepth+(nz-0.5)*0.6-breath*0.18);
  float foamShore=band*smoothstep(0.30,0.72,lace*0.7+band*0.38);
  float wline=sin(vWorld.z*0.42+uTime*0.7+nz*6.0);
  float breaker=smoothstep(0.55,0.95,wline)*(1.0-smoothstep(0.9,2.4,vDepth))*smoothstep(0.25,0.55,vDepth)*smoothstep(0.42,0.78,lace);
  float crestF=smoothstep(0.60,0.86,vCrest)*smoothstep(0.5,0.82,lace)*smoothstep(0.35,1.2,vDepth)*0.7;
  float foam=clamp(foamShore+breaker*0.8+crestF,0.0,1.0);
  vec3 foamCol=mix(vec3(0.93,0.95,0.96),uHor,0.30)*uFoamK;
  col=mix(col,foamCol,foam*0.88);
  /* 近岸 alpha 渐隐融入湿沙 */
  float alpha=smoothstep(0.02,0.5,vDepth+(nz-0.5)*0.22);
  alpha=max(alpha,foam*smoothstep(0.0,0.2,vDepth+0.06));
  alpha*=0.97;
  /* 雾 + 远处融入海平线 */
  float fogF=1.0-exp(-pow(dist*uFogDensity,2.0));
  col=mix(col,uFogCol,fogF);
  col=mix(col,uHor,smoothstep(190.0,420.0,dist)*0.72);
  gl_FragColor=vec4(col,alpha);
}`;
const oceanU={
  uDeep:{value:new THREE.Color(0x0a2030)}, uShallow:{value:new THREE.Color(0x2a7a8c)},
  uHor:{value:new THREE.Color(0x88aabb)}, uZen:{value:new THREE.Color(0x5588bb)},
  uSunCol:{value:new THREE.Color(1,1,1)}, uFogCol:{value:new THREE.Color(0x20263c)},
  uSunDir:{value:new THREE.Vector3(0,1,0)}, uMoonDir:{value:new THREE.Vector3(0,1,0)},
  uSunVis:{value:0}, uMoonVis:{value:0}, uTime:{value:0}, uFogDensity:{value:0.002},
  uFoamK:{value:1},
  uNoise:{value:TEX_NOISE},
};
const oceanGeo=new THREE.PlaneGeometry(540,620,240,220);
oceanGeo.rotateX(-Math.PI/2);
{
  const pos=oceanGeo.attributes.position;
  const depths=new Float32Array(pos.count);
  const OCEAN_Z=WATERLINE_Z-310;   /* 近边缘在水线处，远边缘 z≈-629 */
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i), z=pos.getZ(i)+OCEAN_Z;
    depths[i]=Math.max(-0.2,-sandH(x,z));
  }
  oceanGeo.setAttribute('aDepth',new THREE.BufferAttribute(depths,1));
}
const ocean=new THREE.Mesh(oceanGeo,new THREE.ShaderMaterial({
  vertexShader:OCEAN_VERT,fragmentShader:OCEAN_FRAG,uniforms:oceanU,
  transparent:true,depthWrite:false,fog:false
}));
ocean.position.z=WATERLINE_Z-310;
ocean.renderOrder=2;
scene.add(ocean);

/* ==================== 7. 沙滩地形（缓坡 + 湿沙反光带） ==================== */
const sandGeo=new THREE.PlaneGeometry(180,54,160,64);
sandGeo.rotateX(-Math.PI/2);
{
  const pos=sandGeo.attributes.position;
  const wet=new Float32Array(pos.count);
  const col=new Float32Array(pos.count*3);
  const SAND_ZC=8;   /* 网格中心 z：覆盖 z∈[-19,+35] */
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i), z=pos.getZ(i)+SAND_ZC;
    const y=sandH(x,z);
    pos.setY(i,y);
    /* 湿沙：水线附近 + 水下变暗 */
    const w=1-smoothstep(0.0,2.6,z-WATERLINE_Z);
    wet[i]=clamp(w,0,1);
    const dark=lerp(1.0,0.58,clamp(w*0.9+(z<WATERLINE_Z?0.25:0),0,1));
    col[i*3]=dark; col[i*3+1]=dark*0.99; col[i*3+2]=dark*0.97;
  }
  sandGeo.setAttribute('aWet',new THREE.BufferAttribute(wet,1));
  sandGeo.setAttribute('color',new THREE.BufferAttribute(col,3));
  sandGeo.computeVertexNormals();
}
const sandMat=new THREE.MeshStandardMaterial({
  map:TEX_SAND, vertexColors:true, roughness:0.96, metalness:0.0, color:0xd9bd96
});
sandMat.onBeforeCompile=(sh)=>{
  sh.vertexShader=sh.vertexShader
    .replace('#include <common>','#include <common>\nattribute float aWet;\nvarying float vWet;')
    .replace('#include <begin_vertex>','#include <begin_vertex>\nvWet=aWet;');
  sh.fragmentShader=sh.fragmentShader
    .replace('#include <common>','#include <common>\nvarying float vWet;')
    .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,0.30,vWet*0.92);');
};
const sand=new THREE.Mesh(sandGeo,sandMat);
sand.position.z=8;
sand.receiveShadow=true;
scene.add(sand);

/* ==================== 8. 椰树（锥形树干 + 羽状叶冠 + 椰子） ==================== */
const barkMat=new THREE.MeshStandardMaterial({map:TEX_BARK,roughness:0.92,metalness:0.0,color:0xb9a183});
const frondMat=new THREE.MeshStandardMaterial({
  map:TEX_FROND,alphaTest:0.30,side:THREE.DoubleSide,roughness:0.85,metalness:0.0,color:0xcfd8b8
});
/* 分层叶色：上层新叶偏黄绿鲜亮，下层老叶偏暗偏黄 */
const frondMatTop=frondMat.clone(); frondMatTop.color.set(0xdde4b4);
const frondMatLow=frondMat.clone(); frondMatLow.color.set(0xbcbd98);
const nutMat=new THREE.MeshStandardMaterial({roughness:0.75,metalness:0.0,color:0x6e5230});

/* 沿样条的锥形管树干（TubeGeometry 逐环缩径） */
function taperedTube(curve,segs,radial,r0,r1){
  const g=new THREE.TubeGeometry(curve,segs,r0,radial,false);
  const pos=g.attributes.position;
  for(let i=0;i<=segs;i++){
    const c=curve.getPointAt(i/segs);
    const r=lerp(r0,r1,i/segs)/r0;
    for(let j=0;j<=radial;j++){
      const idx=i*(radial+1)+j;
      pos.setXYZ(idx,
        c.x+(pos.getX(idx)-c.x)*r,
        c.y+(pos.getY(idx)-c.y)*r,
        c.z+(pos.getZ(idx)-c.z)*r);
    }
  }
  g.computeVertexNormals();
  return g;
}
/* 单片羽叶：沿二次贝塞尔弯成弓箭形的三折条带（arch 控制中脉上拱弧度） */
function frondGeometry(len,wid,droop,arch=0.34,segs=16){
  const P=[],UV=[],I=[];
  const p0=new THREE.Vector3(0,0,0),p1=new THREE.Vector3(0,len*arch,len*0.40),p2=new THREE.Vector3(0,-droop,len);
  const B=t=>new THREE.Vector3(
    (1-t)*(1-t)*p0.x+2*(1-t)*t*p1.x+t*t*p2.x,
    (1-t)*(1-t)*p0.y+2*(1-t)*t*p1.y+t*t*p2.y,
    (1-t)*(1-t)*p0.z+2*(1-t)*t*p1.z+t*t*p2.z);
  const ridge=wid*0.14;   /* 中脉折起高度，随叶宽缩放 */
  for(let i=0;i<=segs;i++){
    const t=i/segs, c=B(t);
    const w=wid*(t<0.14?t/0.14:1-(t-0.14)/0.86*0.93);
    P.push(c.x-w,c.y-ridge*0.45,c.z,  c.x,c.y+ridge,c.z,  c.x+w,c.y-ridge*0.45,c.z);
    UV.push(0,t, 0.5,t, 1,t);
  }
  for(let i=0;i<segs;i++){
    const a=i*3;
    I.push(a,a+3,a+1, a+1,a+3,a+4, a+1,a+4,a+2, a+2,a+4,a+5);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(P,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(UV,2));
  g.setIndex(I);
  g.computeVertexNormals();
  return g;
}
/* 一棵椰树：返回 {group, crown, fronds, phase} */
function makePalm(h,lean,scale){
  const group=new THREE.Group();
  const curve=new THREE.CatmullRomCurve3([
    new THREE.Vector3(0,0,0),
    new THREE.Vector3(lean*0.12,h*0.34,0.06),
    new THREE.Vector3(lean*0.48,h*0.68,-0.04),
    new THREE.Vector3(lean,h,0),
  ]);
  const trunk=new THREE.Mesh(taperedTube(curve,18,7,0.20,0.11),barkMat);
  trunk.castShadow=true; trunk.receiveShadow=true;
  group.add(trunk);
  /* 叶冠：三层共 17-21 片，饱满球形轮廓 */
  const crown=new THREE.Group();
  crown.position.copy(curve.getPointAt(1));
  const fronds=[];
  const LAYERS=[
    /* 上层：挺立新叶，近直立，弧度小 */
    {n:5+Math.floor(rand(0,2)),tilt:[-1.28,-0.92],len:[2.7,3.3],wid:0.44,droop:[0.55,0.9],arch:0.30,mat:frondMatTop},
    /* 中层：平展主力叶，最长最宽，明显弓箭弧 */
    {n:7+Math.floor(rand(0,3)),tilt:[-0.78,-0.34],len:[3.3,4.1],wid:0.56,droop:[1.0,1.45],arch:0.38,mat:frondMat},
    /* 下层：下垂老叶，略短，tip 大幅下挂 */
    {n:5+Math.floor(rand(0,2)),tilt:[-0.10,0.38],len:[2.8,3.5],wid:0.52,droop:[1.6,2.2],arch:0.16,mat:frondMatLow},
  ];
  for(const L of LAYERS){
    const yaw0=rand(0,Math.PI*2);
    for(let i=0;i<L.n;i++){
      const len=rand(L.len[0],L.len[1])*scale;
      const f=new THREE.Mesh(
        frondGeometry(len,rand(0.9,1.1)*L.wid*scale,rand(L.droop[0],L.droop[1])*scale,L.arch),
        L.mat);
      f.castShadow=true;
      const pivot=new THREE.Group();
      pivot.rotation.y=yaw0+(i/L.n)*Math.PI*2+rand(-0.16,0.16);
      const tilt=rand(L.tilt[0],L.tilt[1]);
      f.rotation.x=tilt;
      pivot.add(f);
      crown.add(pivot);
      fronds.push({mesh:pivot,baseY:pivot.rotation.y,leaf:f,baseX:tilt,ph:rand(0,6.28)});
    }
  }
  /* 椰子 2-3 个 */
  const nuts=2+Math.floor(rand(0,2));
  for(let i=0;i<nuts;i++){
    const nut=new THREE.Mesh(new THREE.SphereGeometry(0.15*scale,10,8),nutMat);
    nut.position.set(Math.cos(a)*0.20*scale,-0.22*scale,Math.sin(a)*0.20*scale);
    nut.castShadow=true;
    crown.add(nut);
  }
  group.add(crown);
  group.userData={crown,fronds,phase:rand(0,6.28)};
  return group;
}
const palms=[];
function plantPalm(x,z,h,lean,leanYaw,scale){
  const p=makePalm(h,lean,scale);
  p.position.set(x,sandH(x,z)-0.04,z);
  p.rotation.y=leanYaw;
  scene.add(p);
  palms.push(p);
  return p;
}
/* 三分法构图：左前景 1 棵大椰树，右中景 2 棵高低错落 */
plantPalm(-6.9,-0.5, 4.9, 1.50, 0.55, 0.95);
plantPalm( 7.4,-1.8, 5.2, 1.05, Math.PI-0.5, 0.82);
plantPalm(11.2,-6.8, 4.1, 1.45, Math.PI-0.2, 0.66);

/* ==================== 9. 篝火（18:30-5:30，平滑淡入出） ==================== */
const FIRE_POS=new THREE.Vector3(3.6,0,3.2);
FIRE_POS.y=sandH(FIRE_POS.x,FIRE_POS.z);
const fireGroup=new THREE.Group();
fireGroup.position.copy(FIRE_POS);
scene.add(fireGroup);
{
  /* 碳化木柴：4 根斜搭成锥 */
  const logMat=new THREE.MeshStandardMaterial({color:0x2e2420,roughness:0.95});
  const logGeo=new THREE.CylinderGeometry(0.045,0.055,0.95,7);
  for(let i=0;i<4;i++){
    const a=i/4*Math.PI*2+0.5;
    const log=new THREE.Mesh(logGeo,logMat);
    const from=new THREE.Vector3(Math.cos(a)*0.34,0.02,Math.sin(a)*0.34);
    const to=new THREE.Vector3(0,0.5,0);
    log.position.copy(from).lerp(to,0.5);
    log.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),to.clone().sub(from).normalize());
    log.castShadow=true;
    fireGroup.add(log);
  }
  /* 石圈 */
  const stoneMat=new THREE.MeshStandardMaterial({color:0x585349,roughness:0.94});
  const stoneGeo=new THREE.DodecahedronGeometry(0.11,0);
  for(let i=0;i<9;i++){
    const a=i/9*Math.PI*2+rand(-0.15,0.15);
    const st=new THREE.Mesh(stoneGeo,stoneMat);
    st.position.set(Math.cos(a)*0.62,0.035,Math.sin(a)*0.62);
    st.scale.setScalar(rand(0.7,1.35));
    st.rotation.set(rand(0,3),rand(0,3),rand(0,3));
    st.castShadow=true; st.receiveShadow=true;
    fireGroup.add(st);
  }
}
/* 粒子火焰：金黄→橙→红 ramp，上升收拢泪滴形，~115 循环（防 additive 叠出过曝白心） */
const FLAME_N=115;
const flameGeo=new THREE.BufferGeometry();
{
  const seeds=new Float32Array(FLAME_N);
  for(let i=0;i<FLAME_N;i++) seeds[i]=Math.random();
  flameGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(FLAME_N*3),3));
  flameGeo.setAttribute('aSeed',new THREE.BufferAttribute(seeds,1));
}
const flameU={uTime:{value:0},uFade:{value:0},uPix:{value:1}};
const flameMat=new THREE.ShaderMaterial({
  uniforms:flameU,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
  vertexShader:`
    uniform float uTime,uPix;
    attribute float aSeed;
    varying float vLife;
    varying float vSeed;
    void main(){
      float sp=0.55+0.45*fract(aSeed*7.13);
      float life=fract(uTime*sp+aSeed*3.7);
      float ang=aSeed*6.2831+uTime*(0.6+fract(aSeed*3.3)*0.8);
      float rad=(1.0-life)*(1.0-life)*0.21*(0.45+0.55*fract(aSeed*5.9));
      vec3 p=vec3(cos(ang)*rad,life*0.92+0.05,sin(ang)*rad);
      p.x+=sin(uTime*2.6+aSeed*40.0)*0.035*life;
      p.z+=cos(uTime*2.2+aSeed*31.0)*0.030*life;
      vLife=life; vSeed=aSeed;
      vec4 mv=modelViewMatrix*vec4(p,1.0);
      gl_PointSize=(0.50-0.27*life)*uPix*760.0/max(-mv.z,0.1);
      gl_Position=projectionMatrix*mv;
    }`,
  fragmentShader:`
    uniform float uFade;
    varying float vLife;
    varying float vSeed;
    void main(){
      vec2 pc=gl_PointCoord-0.5;
      float d=length(pc);
      float soft=1.0-smoothstep(0.10,0.5,d);
      vec3 c1=vec3(1.0,0.70,0.22), c2=vec3(1.0,0.44,0.09), c3=vec3(0.62,0.10,0.02);
      vec3 col=mix(c1,c2,smoothstep(0.05,0.45,vLife));
      col=mix(col,c3,smoothstep(0.45,0.95,vLife));
      float a=soft*pow(1.0-vLife,1.4)*smoothstep(0.0,0.06,vLife)*uFade;
      gl_FragColor=vec4(col*(0.72+0.20*sin(vSeed*50.0)),a*0.66);
    }`
});
const flame=new THREE.Points(flameGeo,flameMat);
flame.position.y=0.12;
flame.frustumCulled=false;
flame.renderOrder=6;
fireGroup.add(flame);
/* 上升火星 */
const SPARK_N=26;
const sparkGeo=new THREE.BufferGeometry();
{
  const seeds=new Float32Array(SPARK_N);
  for(let i=0;i<SPARK_N;i++) seeds[i]=Math.random();
  sparkGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(SPARK_N*3),3));
  sparkGeo.setAttribute('aSeed',new THREE.BufferAttribute(seeds,1));
}
const sparkMat=new THREE.ShaderMaterial({
  uniforms:flameU,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
  vertexShader:`
    uniform float uTime,uPix;
    attribute float aSeed;
    varying float vLife;
    void main(){
      float life=fract(uTime*(0.28+0.25*fract(aSeed*9.1))+aSeed*7.7);
      float ang=aSeed*6.2831+life*4.0;
      float rad=0.05+life*0.28*fract(aSeed*4.7);
      vec3 p=vec3(cos(ang)*rad,life*2.0+0.35,sin(ang)*rad);
      p.x+=sin(life*9.0+aSeed*20.0)*0.08*life;
      vLife=life;
      vec4 mv=modelViewMatrix*vec4(p,1.0);
      gl_PointSize=(1.0-life)*uPix*42.0/max(-mv.z,0.1);
      gl_Position=projectionMatrix*mv;
    }`,
  fragmentShader:`
    uniform float uFade;
    varying float vLife;
    void main(){
      vec2 pc=gl_PointCoord-0.5;
      float soft=1.0-smoothstep(0.1,0.5,length(pc));
      gl_FragColor=vec4(vec3(1.0,0.55,0.15),soft*(1.0-vLife)*uFade*0.9);
    }`
});
const sparks=new THREE.Points(sparkGeo,sparkMat);
sparks.frustumCulled=false;
sparks.renderOrder=6;
fireGroup.add(sparks);
/* 闪烁点光：照亮周围沙地与树干 */
const fireLight=new THREE.PointLight(0xff8a3d,0,17,2);
fireLight.position.set(0,1.32,0);
fireGroup.add(fireLight);
/* 光晕 sprite */
const fireGlowMat=new THREE.SpriteMaterial({map:TEX_GLOW,color:0xff9540,transparent:true,opacity:0,
  blending:THREE.AdditiveBlending,depthWrite:false,fog:false});
const fireGlow=new THREE.Sprite(fireGlowMat);
fireGlow.position.set(0,0.55,0);
fireGlow.scale.set(2.6,2.0,1);
fireGlow.renderOrder=7;
fireGroup.add(fireGlow);

/* ==================== 10. 生物 ==================== */
/* ---- 海鸥：白身体 + 双翼扇动，弧线掠空，轻微侧倾 ---- */
const gullMat=new THREE.MeshStandardMaterial({color:0xf2f1ec,roughness:0.8,transparent:true});
const gullWingMat=new THREE.MeshStandardMaterial({color:0xe9e8e2,roughness:0.85,side:THREE.DoubleSide,transparent:true});
const gulls=[];
function makeGull(){
  const g=new THREE.Group();
  const body=new THREE.Mesh(new THREE.SphereGeometry(0.09,10,8),gullMat.clone());
  body.scale.set(1.0,0.72,1.9);
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.055,8,7),body.material);
  head.position.set(0,0.05,-0.16);
  const beak=new THREE.Mesh(new THREE.ConeGeometry(0.018,0.09,6),new THREE.MeshStandardMaterial({color:0xd9903a,transparent:true}));
  beak.rotation.x=-Math.PI/2; beak.position.set(0,0.045,-0.23);
  const wingGeo=new THREE.PlaneGeometry(0.52,0.17,1,1);
  wingGeo.translate(0.26,0,0);
  const wL=new THREE.Group(), wR=new THREE.Group();
  const mL=new THREE.Mesh(wingGeo,gullWingMat.clone());
  const mR=new THREE.Mesh(wingGeo,mL.material);
  mR.scale.x=-1;
  wL.position.set(0.05,0.03,0); wR.position.set(-0.05,0.03,0);
  wL.add(mL); wR.add(mR);
  g.add(body,head,beak,wL,wR);
  g.scale.setScalar(1.35);
  g.userData={wL,wR,mats:[body.material,mL.material,beak.material],t:0,dur:24,p0:null,p1:null,p2:null,flap:rand(5,7),ph:rand(0,6)};
  g.visible=false;
  scene.add(g);
  return g;
}
function spawnGulls(){
  if(Time.hour<6.2||Time.hour>17.8) return;
  const n=1+Math.floor(rand(0,3.99));
  const baseY=rand(7,15), baseZ=rand(-55,-115);
  for(let i=0;i<n;i++){
    let g=gulls.find(x=>!x.visible);
    if(!g){ if(gulls.length>=5) break; g=makeGull(); gulls.push(g); }
    const u=g.userData, dir=Math.random()<0.5?1:-1;
    u.p0=new THREE.Vector3(-42*dir, baseY+rand(-2,2), baseZ+rand(-12,12));
    u.p2=new THREE.Vector3( 42*dir, baseY+rand(-2,2), baseZ+rand(-12,12));
    u.p1=new THREE.Vector3(rand(-14,14), baseY+rand(-3.5,3.5), baseZ+rand(-18,6));
    u.t=-i*rand(0.5,1.4); u.dur=rand(20,30);
    g.visible=true;
  }
  /* 音频已移除（站点自带自然音效） */
}
let nextGull=8;
function updateGulls(dt){
  const t=Time.anim;
  for(const g of gulls){
    if(!g.visible) continue;
    const u=g.userData;
    u.t+=dt/u.dur;
    if(u.t>=1){ g.visible=false; continue; }
    if(u.t<0) continue;
    const a=u.p0.clone().lerp(u.p1,u.t), b=u.p1.clone().lerp(u.p2,u.t);
    const pos=a.lerp(b,u.t);
    pos.y+=Math.sin(u.t*22+u.ph)*0.35;
    const vel=b.clone().sub(a).normalize();
    g.position.copy(pos);
    g.lookAt(pos.clone().add(vel));
    /* 侧倾：水平转向带来滚转 */
    const bank=clamp(vel.x*0.9,-0.6,0.6);
    g.rotateZ(bank);
    const flap=Math.sin(t*u.flap+u.ph)*0.6+0.12;
    u.wL.rotation.z=flap; u.wR.rotation.z=-flap;
    const op=smoothstep(0,0.08,u.t)*(1-smoothstep(0.90,1.0,u.t));
    for(const m of u.mats) m.opacity=op;
  }
}
/* ---- 螃蟹：赭红小身体 + 8 腿交替，横向疾走-停顿 ---- */
const crabGroup=new THREE.Group();
const crab={g:crabGroup,legs:[],state:'hide',t:0,dir:1,speed:0,next:20,life:0};
{
  const bodyMat=new THREE.MeshStandardMaterial({color:0xa8542f,roughness:0.75,transparent:true});
  const body=new THREE.Mesh(new THREE.SphereGeometry(0.155,12,9),bodyMat);
  body.scale.set(1.3,0.6,1.0);
  body.position.y=0.09;
  body.castShadow=true;
  crabGroup.add(body);
  for(const s of [-1,1]){   /* 眼柄 */
    const eye=new THREE.Mesh(new THREE.SphereGeometry(0.02,6,5),bodyMat);
    eye.position.set(s*0.05,0.17,-0.10);
    crabGroup.add(eye);
  }
  const legMat=new THREE.MeshStandardMaterial({color:0x8e4526,roughness:0.8,transparent:true});
  const legGeo=new THREE.CylinderGeometry(0.011,0.008,0.20,5);
  legGeo.translate(0,-0.10,0);
  for(let i=0;i<4;i++)for(const s of [-1,1]){
    const piv=new THREE.Group();
    piv.position.set(s*0.11,0.10,-0.07+i*0.045);
    const leg=new THREE.Mesh(legGeo,legMat);
    leg.rotation.z=s*0.9;
    piv.add(leg);
    crabGroup.add(piv);
    crab.legs.push({piv,ph:(i%2)*Math.PI+s*0.4});
  }
  crabGroup.visible=false;
  scene.add(crabGroup);
}
function updateCrab(dt){
  const dayOK=Time.hour>6.5&&Time.hour<17.8;
  const c=crab;
  if(c.state==='hide'){
    c.next-=dt;
    if(c.next<=0&&dayOK){
      c.state='pause'; c.t=rand(0.6,1.6); c.life=rand(28,55);
      c.g.position.set(rand(-5,5),0,rand(-6.8,-4.2));
      c.g.position.y=sandH(c.g.position.x,c.g.position.z);
      c.g.visible=true;
      c.g.traverse(o=>{if(o.material)o.material.opacity=1;});
    }
    return;
  }
  if(!dayOK){ /* 天黑：钻沙退场 */
    c.g.position.y-=dt*0.2;
    if(c.g.position.y<-0.25){ c.g.visible=false; c.state='hide'; c.next=rand(40,90); c.g.position.y=0; }
    return;
  }
  c.life-=dt;
  if(c.life<=0){ c.state='leave'; }
  if(c.state==='pause'){
    c.t-=dt;
    c.g.position.y=sandH(c.g.position.x,c.g.position.z);
    if(c.t<=0){ c.state='run'; c.t=rand(0.7,1.8); c.dir=Math.random()<0.5?-1:1; c.speed=rand(0.9,1.5); }
  }else{
    c.t-=dt;
    const sp=c.state==='leave'?1.6:c.speed;
    c.g.position.x+=c.dir*sp*dt;
    c.g.position.z+=(c.state==='leave'?-sp*0.6:Math.sin(Time.anim*0.7)*0.08)*dt;
    c.g.position.y=sandH(c.g.position.x,c.g.position.z)+Math.abs(Math.sin(Time.anim*14))*0.012;   /* 贴地 + 疾走颠簸 */
    const sw=Math.sin(Time.anim*13)*0.5;
    for(const L of c.legs) L.piv.rotation.y=Math.sin(Time.anim*13+L.ph)*0.5;
    if(c.g.position.x<-7) c.dir=1; if(c.g.position.x>7) c.dir=-1;
    if(c.state==='leave'&&c.g.position.z<-8.0){
      c.g.visible=false; c.state='hide'; c.next=rand(40,90);
    }
    if(c.t<=0&&c.state==='run'){ c.state='pause'; c.t=rand(0.8,2.6); }
  }
}
/* ---- 海龟：深绿扁壳 + 头 + 四肢划动，缓步入海（每场景日约 1 次） ---- */
const turtle={g:new THREE.Group(),active:false,state:'wait',t:0,pause:0,td:-1,day:-1,flippers:[],head:null,mats:[],start:null,end:null,prog:0,fade:0};
{
  const shellMat=new THREE.MeshStandardMaterial({map:TEX_SHELL,roughness:0.7,transparent:true});
  const skinMat=new THREE.MeshStandardMaterial({color:0x5c7050,roughness:0.85,transparent:true});
  const shell=new THREE.Mesh(new THREE.SphereGeometry(0.36,14,10),shellMat);
  shell.scale.set(1,0.42,1.28); shell.position.y=0.16; shell.castShadow=true;
  const body=new THREE.Mesh(new THREE.SphereGeometry(0.28,10,8),skinMat);
  body.scale.set(1,0.32,1.15); body.position.y=0.12;
  const headG=new THREE.Group(); headG.position.set(0,0.14,-0.42);
  const neck=new THREE.Mesh(new THREE.CylinderGeometry(0.045,0.055,0.16,7),skinMat);
  neck.rotation.x=Math.PI/2-0.35; neck.position.set(0,0.01,-0.05);
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.075,9,7),skinMat);
  head.scale.set(1.05,0.9,1.35); head.position.set(0,0.045,-0.14);
  headG.add(neck,head);
  turtle.head=headG;
  const flipGeo=new THREE.SphereGeometry(0.10,8,6);
  const flipDef=[[0.30,0.05,-0.22,1.9],[-0.30,0.05,-0.22,1.9],[0.24,0.05,0.24,1.3],[-0.24,0.05,0.24,1.3]];
  for(const [fx,fy,fz,sc] of flipDef){
    const piv=new THREE.Group(); piv.position.set(fx,fy,fz);
    const f=new THREE.Mesh(flipGeo,skinMat);
    f.scale.set(sc,0.32,0.85); f.position.x=Math.sign(fx)*0.09;
    f.castShadow=true;
    piv.add(f);
    turtle.g.add(piv);
    turtle.flippers.push({piv,front:fz<0,side:Math.sign(fx)});
  }
  turtle.g.add(shell,body,headG);
  turtle.mats=[shellMat,skinMat];
  turtle.g.visible=false;
  scene.add(turtle.g);
}
function updateTurtle(dt){
  const T=turtle;
  /* 每个场景日排程一次（9-16 时之间） */
  if(T.day!==Time.day){ T.day=Time.day; T.td=9.5+rand(0,5.5); }
  if(!T.active&&T.state==='wait'){
    if(Time.hour>=T.td&&Time.hour<T.td+0.4){
      T.active=true; T.state='crawl'; T.prog=0; T.pause=0; T.fade=0;
      const sx=rand(-3,3);
      T.start=new THREE.Vector3(sx,0,rand(9.0,10.5));   /* 从岸边高处的沙丘后爬入画面 */
      T.end=new THREE.Vector3(sx*0.4+rand(-1,1),0,-13.5);
      T.g.visible=true;
      for(const m of T.mats) m.opacity=0;               /* 淡入，不凭空闪现 */
    }
    return;
  }
  if(!T.active) return;
  const pos=T.start.clone().lerp(T.end,T.prog);
  pos.x+=Math.sin(T.prog*9.0)*0.35;   /* 缓慢蜿蜒 */
  const dirV=T.end.clone().sub(T.start).normalize();
  T.g.rotation.y=Math.atan2(dirV.x,dirV.z)+Math.PI;   /* 头朝 -Z 的海 */
  if(T.state==='crawl'){
    if(T.fade<1){ T.fade=Math.min(1,T.fade+dt*0.5); for(const m of T.mats) m.opacity=T.fade; }
    T.prog+=dt*0.22/T.start.distanceTo(T.end);   /* ≈0.22 m/s，真实龟速 */
    T.prog=Math.min(T.prog,1);
    T.pause-=dt;
    if(T.pause<-rand(6,11)) T.pause=rand(2,4);   /* 周期性停下喘息 */
    const moving=T.pause<=0;
    if(moving){
      const sw=Math.sin(Time.anim*3.4);
      for(const F of T.flippers){
        F.piv.rotation.z=sw*(F.front?0.42:0.25)*F.side;
        F.piv.rotation.y=Math.cos(Time.anim*3.4)*(F.front?0.30:0.15);
      }
      T.head.rotation.x=Math.sin(Time.anim*0.8)*0.08;
    }else{
      for(const F of T.flippers){ F.piv.rotation.z*=0.95; F.piv.rotation.y*=0.95; }
      T.head.rotation.x=-0.25;   /* 抬头张望，惹人怜爱 */
    }
    /* 地形跟随 + 入水下沉 */
    if(pos.z>WATERLINE_Z-0.3){
      pos.y=sandH(pos.x,pos.z)+0.02;
    }else{
      T.state='swim';
    }
    T.g.position.copy(pos);
  }else if(T.state==='swim'){
    T.swimT=(T.swimT||0)+dt;
    pos.z=T.g.position.z-dt*0.5;
    pos.y=lerp(T.g.position.y,-0.55,dt*0.35);
    for(const F of T.flippers){
      F.piv.rotation.z=Math.sin(Time.anim*2.2)*(F.front?0.5:0.2)*F.side;
    }
    const op=clamp(1-T.swimT/4.5,0,1);
    for(const m of T.mats) m.opacity=op;
    T.g.position.copy(pos);
    if(op<=0){ T.g.visible=false; T.active=false; T.state='wait'; T.prog=0; T.swimT=0; }
  }
}

/* ==================== 11. 云 & 海平线薄雾（billboard） ==================== */
const clouds=[];
{
  const defs=[
    [-95,52,-260, 88,22], [30,68,-310,110,26], [110,46,-230, 70,17],
    [-30,38,-190, 56,13], [80,60,-290, 92,21],
  ];
  for(const [x,y,z,sx,sy] of defs){
    const m=new THREE.MeshBasicMaterial({map:TEX_CLOUD,transparent:true,depthWrite:false,fog:false,
      opacity:rand(0.50,0.72),color:0xffffff});
    const c=new THREE.Mesh(new THREE.PlaneGeometry(sx,sy),m);
    c.position.set(x,y,z);
    c.renderOrder=5;
    c.userData={sp:rand(0.25,0.55),baseOp:m.opacity};
    scene.add(c);
    clouds.push(c);
  }
}
const mists=[];
{
  const defs=[[-40,4.5,-185,150,16],[45,6,-240,190,20],[0,3,-150,130,12]];
  for(const [x,y,z,sx,sy] of defs){
    const m=new THREE.MeshBasicMaterial({map:TEX_MIST,transparent:true,depthWrite:false,fog:false,
      opacity:0.12,color:0x8890a8});
    const q=new THREE.Mesh(new THREE.PlaneGeometry(sx,sy),m);
    q.position.set(x,y,z);
    q.renderOrder=5;
    q.userData={ph:rand(0,6.28),baseX:x};
    scene.add(q);
    mists.push(q);
  }
}

/* ==================== 12. 光照装配 ==================== */
const hemi=new THREE.HemisphereLight(0x8fb2d9,0x8a7355,0.6);
scene.add(hemi);
const keyLight=new THREE.DirectionalLight(0xffffff,2.4);
keyLight.castShadow=true;
keyLight.shadow.mapSize.set(2048,2048);
keyLight.shadow.camera.left=-26; keyLight.shadow.camera.right=26;
keyLight.shadow.camera.top=28;  keyLight.shadow.camera.bottom=-26;
keyLight.shadow.camera.near=4;  keyLight.shadow.camera.far=150;
keyLight.shadow.bias=-0.0006;
keyLight.shadow.normalBias=0.03;
keyLight.target.position.set(0,0,-2);
scene.add(keyLight,keyLight.target);
const MOON_COL=new THREE.Color(0.62,0.70,0.92);


/* ==================== 15. 每帧场景更新 & 主循环 ==================== */
const _c1=new THREE.Color(), _c2=new THREE.Color();
function updateScene(dt){
  const h=Time.hour, t=Time.anim;
  const pal=samplePal(h);
  const dayW=daylight(h);
  const sun=sunState(h), moon=moonState(h);
  const fire=fireFade(h);

  /* ---- 天空 ---- */
  setCol(skyU.uZen.value,pal.zen); setCol(skyU.uHor.value,pal.hor);
  setCol(skyU.uSunCol.value,sun.col); setCol(skyU.uFogCol.value,pal.fog);
  skyU.uSunDir.value.copy(sun.dir); skyU.uMoonDir.value.copy(moon.dir);
  skyU.uSunVis.value=sun.vis; skyU.uMoonVis.value=moon.vis;
  skyU.uStarA.value=pal.star; skyU.uFogD.value=pal.fogD; skyU.uTime.value=t;
  /* 泛光 sprite 跟随日/月方向 */
  sunSprite.position.copy(sun.dir).multiplyScalar(500);
  sunSprite.material.opacity=sun.vis*0.55;
  setCol(sunSprite.material.color,sun.col);
  moonSprite.position.copy(moon.dir).multiplyScalar(500);
  moonSprite.material.opacity=moon.vis*0.45;

  /* ---- 海洋 ---- */
  setCol(oceanU.uDeep.value,pal.wD); setCol(oceanU.uShallow.value,pal.wS);
  setCol(oceanU.uHor.value,pal.hor); setCol(oceanU.uZen.value,pal.zen);
  setCol(oceanU.uSunCol.value,sun.col); setCol(oceanU.uFogCol.value,pal.fog);
  oceanU.uSunDir.value.copy(sun.dir); oceanU.uMoonDir.value.copy(moon.dir);
  oceanU.uSunVis.value=sun.vis*smoothstep(0.0,0.06,sun.alt);
  oceanU.uMoonVis.value=moon.vis;
  oceanU.uTime.value=t;
  oceanU.uFoamK.value=clamp(0.14+0.86*dayW+moon.vis*0.18,0,1);
  const fogDensity=0.0008+pal.fogD*0.0028;
  oceanU.uFogDensity.value=fogDensity;

  /* ---- 场景雾 ---- */
  scene.fog.density=fogDensity;
  setCol(scene.fog.color,pal.fog);

  /* ---- 光照：日/月共用一个 DirectionalLight（按强度加权切换） ---- */
  const sunI=3.3*smoothstep(0.01,0.30,sun.alt)*(0.45+0.55*clamp(sun.alt,0,1));
  const moonI=1.30*moon.vis;
  const wSun=sunI/(sunI+moonI+1e-5);
  keyLight.intensity=sunI+moonI;
  setCol(_c1,sun.col);
  keyLight.color.copy(_c2.copy(MOON_COL).lerp(_c1,wSun));
  keyLight.position.copy(moon.dir).lerp(sun.dir,wSun).normalize().multiplyScalar(60).add(new THREE.Vector3(0,0,-2));
  /* 半球环境：夜里偏月蓝，白天偏天色/沙色 */
  setCol(_c1,pal.hor);
  hemi.color.copy(_c2.setRGB(0.30,0.36,0.55).lerp(_c1,dayW*0.85+0.08));
  setCol(_c1,pal.sand);
  hemi.groundColor.copy(_c2.setRGB(0.16,0.17,0.23).lerp(_c1,dayW*0.9+0.05));
  hemi.intensity=0.42+0.40*dayW;
  /* 沙色随时段 */
  setCol(sandMat.color,pal.sand);

  /* ---- 相机：交互（缩放/拖拽）或直接呼吸漂移 ---- */
  mouse.x+=(mouse.tx-mouse.x)*Math.min(1,dt*1.5);
  mouse.y+=(mouse.ty-mouse.y)*Math.min(1,dt*1.5);
  applyCam(dt);

  /* ---- 椰树：海风摇摆 ---- */
  const gust=Math.sin(t*0.5)*0.5+Math.sin(t*0.23+1.7)*0.5;
  for(const p of palms){
    const u=p.userData;
    u.crown.rotation.z=Math.sin(t*0.45+u.phase)*0.022+gust*0.018;
    u.crown.rotation.x=Math.cos(t*0.36+u.phase)*0.016;
    for(const f of u.fronds){
      f.mesh.rotation.y=f.baseY+Math.sin(t*0.6+f.ph)*0.012;
      f.leaf.rotation.x=f.baseX+Math.sin(t*0.85+f.ph)*0.035+gust*0.02;
    }
  }

  /* ---- 篝火 ---- */
  flameU.uTime.value=t; flameU.uFade.value=fire;
  flameU.uPix.value=Math.min(2,window.devicePixelRatio||1);
  fireGroup.visible=fire>0.012;
  if(fireGroup.visible){
    const fl=0.72+0.28*(vnoise(t*3.1,7.7)-0.5)*2*0.5+0.14*Math.sin(t*11.0);
    fireLight.intensity=fire*(10.5+fl*5.5);
    fireGlowMat.opacity=fire*(0.33+0.10*fl);
    const gs=1+0.06*Math.sin(t*9.0)+0.04*fl;
    fireGlow.scale.set(2.8*gs,2.05*gs,1);
  }

  /* ---- 生物 ---- */
  nextGull-=dt;
  if(nextGull<=0){ spawnGulls(); nextGull=rand(20,50); }
  updateGulls(dt);
  updateCrab(dt);
  updateTurtle(dt);

  /* ---- 云 & 雾 billboard ---- */
  setCol(_c1,lerpC(pal.cloudS,pal.cloudL,0.62));
  const sunGlowK=sun.vis*(1-smoothstep(0.05,0.5,Math.max(sun.alt,0)))*0.30;
  setCol(_c2,sun.col);
  _c1.lerp(_c2,sunGlowK);
  for(const c of clouds){
    c.quaternion.copy(camera.quaternion);
    c.position.x+=c.userData.sp*dt;
    if(c.position.x>170) c.position.x=-170;
    c.material.color.copy(_c1);
    c.material.opacity=c.userData.baseOp*(0.30+0.70*dayW);   /* 夜里云极淡 */
  }
  setCol(_c1,pal.fog);
  for(const q of mists){
    q.quaternion.copy(camera.quaternion);
    q.position.x=q.userData.baseX+Math.sin(t*0.05+q.userData.ph)*14;
    q.material.opacity=0.06+pal.fogD*0.16;
    q.material.color.copy(_c1);
  }
}
/* 初始就有一波海鸥/一只螃蟹（白天），让画面第一眼就有生气 */
if(daylight(CFG.startHour)>0.4){ spawnGulls(); for(const g of gulls) g.userData.t=rand(0.10,0.42); crab.next=0.4; }

let running=true, rafId=0, lastTs=0;
function frame(ts){
  if(!running) return;
  if(!container.isConnected){ dispose(); return; }
  const dt=Math.min(0.1,(ts-lastTs)/1000||0.016); lastTs=ts;
  Time.update(dt);
  updateScene(dt);
  renderer.render(scene,camera);
  rafId=requestAnimationFrame(frame);
}
function resize(){
  const dpr=Math.min(2,window.devicePixelRatio||1);
  const w=container.clientWidth||window.innerWidth, hh=container.clientHeight||window.innerHeight;
  renderer.setPixelRatio(dpr);
  renderer.setSize(w,hh,false);
  camera.aspect=w/hh;
  camera.updateProjectionMatrix();
}
function startLoops(){
  lastTs=performance.now();
  if(CFG.still){
    let n=0;
    const step=(ts)=>{ Time.update(1/60); updateScene(1/60); renderer.render(scene,camera);
      if(++n<90) requestAnimationFrame(step); };
    requestAnimationFrame(step);
    return;
  }
  rafId=requestAnimationFrame(frame);
}
  /* ---- 控制器：进入/离开视口自动播放暂停；提供 stop/dispose ---- */
  let disposed=false;
  function dispose(){
    if(disposed) return; disposed=true; running=false;
    try{ cancelAnimationFrame(rafId); }catch(e){}
    try{ _io.disconnect(); }catch(e){}
    try{ _ro.disconnect(); }catch(e){}
    try{ window.removeEventListener('mousemove', onMove); }catch(e){}
    try{ window.removeEventListener('resize', resize); }catch(e){}
    try{ if(camCtl._unbind) camCtl._unbind(); }catch(e){}
    if(canvas.parentNode) canvas.parentNode.removeChild(canvas);
  }
  /* 交互事件绑定（缩放/拖拽/双指捏合/双击复位） */
  function bindInteract(){
    if(!INTERACTIVE) return;
    const el=canvas;
    el.style.touchAction='none';
    el.style.cursor='grab';
    const onDown=(e)=>{ camCtl.dragging=true; camCtl.lastX=e.clientX; camCtl.lastY=e.clientY; el.style.cursor='grabbing'; try{ el.setPointerCapture(e.pointerId); }catch(_){} };
    const onMove=(e)=>{ if(!camCtl.dragging) return; const dx=e.clientX-camCtl.lastX, dy=e.clientY-camCtl.lastY; camCtl.lastX=e.clientX; camCtl.lastY=e.clientY; camCtl.yaw-=dx*0.005; camCtl.pitch=clamp(camCtl.pitch-dy*0.004,-0.45,0.85); };
    const onUp=(e)=>{ camCtl.dragging=false; el.style.cursor='grab'; try{ el.releasePointerCapture(e.pointerId); }catch(_){} };
    const onWheel=(e)=>{ e.preventDefault(); camCtl.dist=clamp(camCtl.dist*(1+e.deltaY*0.0012), ZMIN, ZMAX); };
    const onTouch=(e)=>{ if(e.touches.length===2){ const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY); if(camCtl.pinchDist>0){ camCtl.dist=clamp(camCtl.dist*(camCtl.pinchDist/d), ZMIN, ZMAX); } camCtl.pinchDist=d; } };
    const onTouchEnd=()=>{ camCtl.pinchDist=0; };
    const onDbl=()=>{ camCtl.yaw=0; camCtl.pitch=0; camCtl.dist=1; };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('wheel', onWheel, {passive:false});
    el.addEventListener('touchmove', onTouch, {passive:true});
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('dblclick', onDbl);
    camCtl._unbind=()=>{ el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerup', onUp); el.removeEventListener('pointercancel', onUp); el.removeEventListener('wheel', onWheel); el.removeEventListener('touchmove', onTouch); el.removeEventListener('touchend', onTouchEnd); el.removeEventListener('dblclick', onDbl); };
  }
  resize();
  const _ro=new ResizeObserver(()=>{ try{ resize(); }catch(e){} });
  _ro.observe(container);
  const _io=new IntersectionObserver((es)=>{
    for(const e of es){
      if(e.isIntersecting){ if(!running && !disposed){ running=true; startLoops(); } }
      else { if(running){ running=false; try{cancelAnimationFrame(rafId);}catch(e){} } }
    }
  },{threshold:0.01});
  _io.observe(container);
  bindInteract();
  /* 立即启动渲染循环（不依赖初始尺寸/可视判定）——尺寸由 ResizeObserver 校正，
     离屏时由 IntersectionObserver 暂停；避免面板过渡期尺寸为 0 导致静默落到 2D 兜底 */
  running=true; startLoops();
  window.addEventListener('resize', resize);
  return {
    stop(){ dispose(); },
    setVisible(v){ if(disposed) return; if(v && !running){ running=true; startLoops(); } else if(!v && running){ running=false; try{cancelAnimationFrame(rafId);}catch(e){} } },
    setHour(h){ Time.hour=((h%24)+24)%24; },
    three:THREE, scene, camera, renderer
  };
}
window.startBeach = startBeach;
