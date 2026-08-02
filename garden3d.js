// 专注花园 · 3D 花朵绽放（Three.js 本地模块）
// 花瓣形状与弯曲全部用「CPU 几何 + 标准材质」实现，杜绝自定义着色器——
// 避免手机端着色器编译失败导致白屏。花瓣几何参考 Ethereal Bloom(garettwong/flower-3d)
// 的写实质感：卵形宽度轮廓 + 横截面勺状凹曲 + 沿长度的纵向卷曲，全部烘焙进顶点。
// 接口：const g = startGarden(container, {count, getGrow});  g.stop() / g.addBloom() / g.three
import * as THREE from './vendor/three.module.js';

function easeOutCubic(x){ return 1 - Math.pow(1 - x, 3); }
function clamp01(x){ return x < 0 ? 0 : x > 1 ? 1 : x; }
function lerp(a, b, t){ return a + (b - a) * t; }
// 平滑过渡 smoothstep(a,b,x)
function smooth(a, b, x){ const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); }

const reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

/* ====================== 花瓣几何（写实弯曲，全部烘焙进顶点） ====================== */
// 基础平面：沿长度 12 段、宽 20 段，足够平滑又省顶点。
const BASE = new THREE.PlaneGeometry(1, 1, 10, 20);
const VC = BASE.attributes.position.count;
const BASE_XW = new Float32Array(VC);   // 宽度坐标 -1..1
const BASE_T  = new Float32Array(VC);   // 沿长度 0(基部)..1(尖端)
{
  const p = BASE.attributes.position;
  for (let i = 0; i < VC; i++){
    BASE_XW[i] = p.getX(i) * 2;
    BASE_T[i]  = p.getY(i) + 0.5;
  }
}
// 顶点灰度渐变（基部略深、尖端略亮），用 vertexColors 与材质色相乘，增强写实层次。
{
  const col = new Float32Array(VC * 3);
  for (let i = 0; i < VC; i++){
    const g = 0.80 + 0.20 * BASE_T[i];
    col[i*3] = g; col[i*3+1] = g; col[i*3+2] = g;
  }
  BASE.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

// 把（基部仰角 th0, 沿长卷曲 k）烘焙进几何体：得到写实弯曲的花瓣。
// th0c/kc = 闭合花苞态；th0o/ko = 绽放态。二者皆烘焙，之后按绽放度在两者间插值。
function bakePetal(geo, th0, k){
  const p = geo.attributes.position;
  for (let i = 0; i < VC; i++){
    const xw = BASE_XW[i], t = BASE_T[i];
    // 卵形宽度轮廓：中部略下最宽，尖端圆收
    const w = Math.pow(Math.sin(Math.PI * Math.pow(t, 0.55)), 0.6) * 0.62 + 0.10;
    const x = xw * w;
    // 横截面勺状凹曲（越近尖端越深）
    const cup = -(xw * xw) * 0.32 * (0.35 + 0.65 * t);
    // 沿长度的纵向弯曲：切线角 th=th0+k*t，对切线积分得到中心线 (cy,cz)
    const th = th0 + k * t;
    let cy, cz;
    if (Math.abs(k) < 1e-3){ cy = Math.cos(th0) * t; cz = Math.sin(th0) * t; }
    else { cy = (Math.sin(th) - Math.sin(th0)) / k; cz = (Math.cos(th0) - Math.cos(th)) / k; }
    // 沿法线叠加勺状凹曲
    const ny = -Math.sin(th), nz = Math.cos(th);
    const lx = x;
    const ly = cy + ny * cup;
    const lz = cz + nz * cup;
    p.setXYZ(i, lx, ly, lz);
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
}

// 生成一朵花某一环的「可形变几何」：保存闭合/绽放两套顶点与法线，按绽放度插值。
function makeMorphGeo(ring){
  const geo = BASE.clone();
  bakePetal(geo, ring.th0c, ring.kc);
  const closed  = Float32Array.from(geo.attributes.position.array);
  const closedN = Float32Array.from(geo.attributes.normal.array);
  bakePetal(geo, ring.th0o, ring.ko);
  const open  = Float32Array.from(geo.attributes.position.array);
  const openN = Float32Array.from(geo.attributes.normal.array);
  geo.attributes.position.array.set(closed); geo.attributes.position.needsUpdate = true;
  geo.attributes.normal.array.set(closedN);   geo.attributes.normal.needsUpdate = true;
  return { geo, closed, open, closedN, openN, _last: -1 };
}

function applyMorph(r, amt){
  amt = clamp01(amt);
  if (Math.abs(amt - r._last) < 0.003) return;
  r._last = amt;
  const pos = r.geo.attributes.position.array, nrm = r.geo.attributes.normal.array;
  for (let i = 0; i < pos.length; i++){
    let a = r.closed[i] + (r.open[i] - r.closed[i]) * amt;
    let b = r.closedN[i] + (r.openN[i] - r.closedN[i]) * amt;
    pos[i] = a; nrm[i] = b;
  }
  // 重新归一化法线（线性插值后略偏离单位向量）
  for (let i = 0; i < nrm.length; i += 3){
    const l = Math.hypot(nrm[i], nrm[i+1], nrm[i+2]) || 1;
    nrm[i] /= l; nrm[i+1] /= l; nrm[i+2] /= l;
  }
  r.geo.attributes.position.needsUpdate = true;
  r.geo.attributes.normal.needsUpdate = true;
}

/* ====================== 花瓣环参数（写实质感，外大内小） ====================== */
// 焦点花：暖白偏粉，4 环更饱满
const FOCUS_RINGS = [
  { count: 7,  wid: 0.95, len: 1.25, base: 0.06, th0c: 0.12, th0o: 0.42, kc: -1.05, ko: 0.62 },
  { count: 10, wid: 1.12, len: 1.75, base: 0.13, th0c: 0.15, th0o: 0.66, kc: -1.15, ko: 0.85 },
  { count: 13, wid: 1.30, len: 2.25, base: 0.22, th0c: 0.18, th0o: 0.92, kc: -1.25, ko: 1.08 },
  { count: 16, wid: 1.48, len: 2.70, base: 0.32, th0c: 0.22, th0o: 1.12, kc: -1.35, ko: 1.35 }
];
// 装饰花：3 环（控制网格量，手机更稳）
const SCATTER_RINGS = [
  { count: 6,  wid: 0.95, len: 1.25, base: 0.06, th0c: 0.12, th0o: 0.42, kc: -1.05, ko: 0.62 },
  { count: 9,  wid: 1.12, len: 1.75, base: 0.13, th0c: 0.15, th0o: 0.66, kc: -1.15, ko: 0.85 },
  { count: 12, wid: 1.30, len: 2.25, base: 0.22, th0c: 0.18, th0o: 0.92, kc: -1.25, ko: 1.08 }
];

const PALETTE = [
  [0xff9ec0, 0xffd1e6], [0xffcf4d, 0xfff3c4], [0xb98cff, 0xe9d6ff],
  [0xffffff, 0xffe6f0], [0xff7a5c, 0xffd0c0], [0xffb07a, 0xffe0c0]
];
const FOCUS_PAIR = [0xffe0ec, 0xfff7f0];   // 焦点花：暖白偏粉

function petalMaterial(baseHex, tipHex){
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(baseHex), roughness: 0.72, metalness: 0.0,
    side: THREE.DoubleSide, vertexColors: true,
    emissive: new THREE.Color(tipHex), emissiveIntensity: 0.04
  });
}

// 一片叶子（细长椭球，压扁）
function makeLeaf(scale){
  scale = scale || 1;
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 8, 6).scale(0.42, 0.07, 1.0),
    new THREE.MeshStandardMaterial({ color: 0x4f9d5f, roughness: 0.9 })
  );
  m.scale.setScalar(scale);
  return m;
}

// 一朵完整花：种子 + 幼苗 + 茎 + 叶 + 花头（多环写实花瓣）+ 花心
function makeFlower(rings, pair, scaleBase, isFocus){
  const root = new THREE.Group();

  // 茎（基部在地面，向上生长）
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.07, 1.4, 8).translate(0, 0.7, 0),
    new THREE.MeshStandardMaterial({ color: 0x4f9d5f, roughness: 0.9 })
  );
  root.add(stem);

  // 叶（沿茎两片）
  const leaves = new THREE.Group();
  for (let i = 0; i < 2; i++){
    const leaf = makeLeaf();
    leaf.position.set(0, 0.45 + i * 0.35, 0);
    leaf.rotation.y = i * Math.PI + 0.5;
    leaf.rotation.z = 0.5;
    leaves.add(leaf);
  }
  root.add(leaves);

  // 种子（地面小种粒）
  const seed = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 12, 10).scale(1, 1.3, 1),
    new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 1 })
  );
  seed.position.y = 0.06; root.add(seed);

  // 幼苗（两片子叶）
  const sprout = new THREE.Group();
  for (let i = 0; i < 2; i++){
    const sl = makeLeaf(0.45);
    sl.rotation.y = i * Math.PI;
    sl.rotation.z = 0.6;
    sprout.add(sl);
  }
  sprout.position.y = 0.12; root.add(sprout);

  // 花头
  const head = new THREE.Group();
  const ringObjs = rings.map((r, ri) => {
    const mat = petalMaterial(pair[0], pair[1]);
    const mo = makeMorphGeo(r);
    const rg = new THREE.Group();
    for (let i = 0; i < r.count; i++){
      const piv = new THREE.Group();
      piv.rotation.y = (i / r.count) * Math.PI * 2 + ri * 0.45;   // 螺旋交错排布
      const m = new THREE.Mesh(mo.geo, mat);
      m.scale.set(r.wid, r.len, r.len);
      m.position.set(0, 0, r.base);
      piv.add(m); rg.add(piv);
    }
    head.add(rg);
    return Object.assign({ ring: r, ri, mat }, mo);
  });
  // 花心（花蕊）
  const center = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0xf2c14e, roughness: 0.6, emissive: 0x6b4a12, emissiveIntensity: 0.15 })
  );
  center.scale.set(1, 0.6, 1); head.add(center);
  head.position.y = 1.4;
  root.add(head);

  root.scale.setScalar(scaleBase || 1);
  return { root, stem, leaves, seed, sprout, head, ringObjs, isFocus, seedRand: Math.random() * 6.28 };
}

// 按生长度 g∈[0,1] 设置一朵花的所有形态：种子→幼苗→茎→叶→花苞→绽放
function applyGrowth(f, g){
  g = clamp01(g);
  const stemS = smooth(0.10, 0.46, g);
  f.stem.visible = stemS > 0.01;
  f.stem.scale.y = Math.max(0.0001, stemS);

  const leafS = smooth(0.18, 0.42, g);
  f.leaves.visible = leafS > 0.01;
  f.leaves.scale.setScalar(leafS);

  const headS = smooth(0.44, 0.62, g);
  f.head.visible = headS > 0.01;
  f.head.scale.setScalar(headS);
  f.head.position.y = 1.4 * stemS;

  f.seed.visible = g < 0.16;
  f.seed.scale.setScalar(clamp01(1 - g / 0.14));

  f.sprout.visible = g > 0.03 && g < 0.24;
  f.sprout.scale.setScalar(smooth(0.04, 0.12, g) * (1 - smooth(0.16, 0.24, g)));

  const bloomP = smooth(0.58, 1.0, g);
  const n = f.ringObjs.length;
  f.ringObjs.forEach((r, ri) => {
    const d = (n - 1 - ri) * 0.14;                 // 外环先开，内环后开
    const ringOpen = easeOutCubic(clamp01((bloomP - d) / 0.56));
    applyMorph(r, ringOpen);
  });
}

/* ============================================================ */
export function startGarden(container, opts){
  opts = opts || {};
  const getCount = () => (typeof opts.count === 'function' ? opts.count() : (opts.count || 0));
  const getGrow  = () => (typeof opts.getGrow  === 'function' ? opts.getGrow()  : 0);

  const DPR = Math.min(2, window.devicePixelRatio || 1);
  let alive = true, raf = 0, t0 = performance.now();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 200);
  camera.position.set(0, 2.6, 7); camera.lookAt(0, 1.6, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(DPR);
  renderer.setClearColor(0x000000, 0);
  if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;

  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  container.style.overflow = 'hidden';
  container.appendChild(renderer.domElement);
  const cv = renderer.domElement;
  cv.style.position = 'absolute'; cv.style.left = 0; cv.style.top = 0;
  cv.style.width = '100%'; cv.style.height = '100%'; cv.style.display = 'block';

  scene.add(new THREE.HemisphereLight(0xfff2dd, 0x3c5e34, 1.0));
  const sun = new THREE.DirectionalLight(0xffffff, 1.1); sun.position.set(3.5, 7, 4.5); scene.add(sun);
  const rim = new THREE.DirectionalLight(0xffd9e8, 0.35); rim.position.set(-4, 3, -3); scene.add(rim);

  // 草地 + 柔光环
  const ground = new THREE.Mesh(new THREE.CircleGeometry(7, 56).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x3f7a4e, roughness: 1 }));
  scene.add(ground);
  const ring = new THREE.Mesh(new THREE.RingGeometry(6.6, 7, 56).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x9fe0b0, transparent: true, opacity: 0.22, side: THREE.DoubleSide }));
  ring.position.y = 0.01; scene.add(ring);

  // 草丛
  const blade = new THREE.ConeGeometry(0.03, 0.5, 4);
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x4f9d5f, roughness: 1 });
  const grass = new THREE.Group();
  for (let i = 0; i < 40; i++){
    const a = Math.random() * 6.28, r = 0.6 + Math.random() * 5.8;
    const b = new THREE.Mesh(blade, bladeMat);
    b.position.set(Math.cos(a) * r, 0.22 + Math.random() * 0.1, Math.sin(a) * r);
    b.rotation.y = Math.random() * 6.28; b.scale.setScalar(0.6 + Math.random() * 0.8);
    grass.add(b);
  }
  scene.add(grass);

  // 装饰花（至少 6 朵，已绽放）
  const flowers = [];
  const n = Math.max(getCount(), 6);
  for (let i = 0; i < n; i++){
    const pair = PALETTE[i % PALETTE.length];
    const f = makeFlower(SCATTER_RINGS, pair, 0.55 + Math.random() * 0.4, false);
    const a = Math.random() * 6.28, r = 0.9 + Math.random() * 5.2;
    f.root.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    f.root.rotation.y = Math.random() * 6.28;
    applyGrowth(f, 1);
    scene.add(f.root); flowers.push(f);
  }

  // 中央焦点花（随 getGrow() 从种子生长）
  const focus = makeFlower(FOCUS_RINGS, FOCUS_PAIR, 1.05, true);
  focus.root.position.set(0, 0, 0);
  applyGrowth(focus, clamp01(getGrow()));
  scene.add(focus.root);

  function resize(){
    const w = container.clientWidth || 320, h = container.clientHeight || 300;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
  }
  resize();

  function renderOnce(){ resize(); renderer.render(scene, camera); }

  let inView = true, tabVisible = !document.hidden, dispG = clamp01(getGrow());
  function active(){ return alive && inView && tabVisible; }
  function kick(){ if (raf) cancelAnimationFrame(raf); raf = 0; if (active() && !reduce) raf = requestAnimationFrame(loop); else if (reduce) renderOnce(); }

  function loop(now){
    if (!alive) return;
    if (!container.isConnected){ stop(); return; }
    const t = (now - t0) / 1000;
    // 焦点花：平滑跟随生长度，按绽放度形变（仅变化时更新几何）
    const tg = clamp01(getGrow());
    dispG += (tg - dispG) * 0.08;
    applyGrowth(focus, dispG < 0.001 ? 0.001 : dispG);
    // 轻风摇曳
    flowers.forEach(f => {
      f.root.rotation.z = Math.sin(t * 0.6 + f.seedRand) * 0.03;
      f.root.rotation.y = f.seedRand + Math.sin(t * 0.2 + f.seedRand) * 0.05;
    });
    focus.root.rotation.z = Math.sin(t * 0.5) * 0.02;
    const ca = Math.sin(t * 0.08) * 0.5;
    camera.position.x = ca; camera.position.z = Math.cos(t * 0.08) * 7; camera.lookAt(0, 1.6, 0);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  }

  const onVis = () => { tabVisible = !document.hidden; kick(); };
  document.addEventListener('visibilitychange', onVis);
  let io; try { io = new IntersectionObserver(es => { inView = es[0].isIntersecting; kick(); }, { threshold: 0.05 }); io.observe(container); } catch (e) {}
  let ro; try { ro = new ResizeObserver(resize); ro.observe(container); } catch (e) {}

  if (reduce) renderOnce(); else raf = requestAnimationFrame(loop);

  function stop(){
    alive = false; if (raf) cancelAnimationFrame(raf); raf = 0;
    document.removeEventListener('visibilitychange', onVis);
    if (io) try { io.disconnect(); } catch (e) {}
    if (ro) try { ro.disconnect(); } catch (e) {}
    try { renderer.dispose(); } catch (e) {}
    try { if (renderer.forceContextLoss) renderer.forceContextLoss(); } catch (e) {}
    if (cv && cv.parentNode) cv.parentNode.removeChild(cv);
    if (window.__gGarden === api) window.__gGarden = null;
    scene.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); }
    });
  }

  const api = {
    stop,
    setVisible(v){ tabVisible = !!v; kick(); },
    setGrow(){},
    addBloom(){
      const pair = PALETTE[flowers.length % PALETTE.length];
      const f = makeFlower(SCATTER_RINGS, pair, 0.55 + Math.random() * 0.4, false);
      const a = Math.random() * 6.28, r = 0.9 + Math.random() * 5.2;
      f.root.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      f.root.rotation.y = Math.random() * 6.28;
      applyGrowth(f, 1); scene.add(f.root); flowers.push(f);
    },
    three: { scene, camera, renderer }
  };
  window.__gGarden = api;
  return api;
}

window.startGarden = startGarden;
