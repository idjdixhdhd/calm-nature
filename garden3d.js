// 专注花园 · 3D 花朵绽放（Three.js 本地模块）
// 用「标准材质 + 变换动画」实现，保证移动端 GPU 也能稳定渲染（不依赖自定义着色器，避免手机端着色器编译失败导致白屏）。
// 接口：const g = startGarden(container, {count, getGrow});  g.stop() / g.addBloom()
import * as THREE from './vendor/three.module.js';

function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }
function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
function lerp(a, b, t) { return a + (b - a) * t; }

// 程序化柔光贴图（花心光晕用，避免外部图片）
function makeGlow() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,244,214,1)');
  grd.addColorStop(0.4, 'rgba(255,214,150,0.45)');
  grd.addColorStop(1, 'rgba(255,200,120,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 花瓣：细长椭圆平面，基部在原点（绕基部旋转实现开合）。所有花共用同一几何，省内存。
const PETAL_GEO = (() => {
  const g = new THREE.PlaneGeometry(0.5, 1.2, 1, 6);
  g.translate(0, 0.6, 0);
  return g;
})();

// 花头（多圈花瓣 + 花心光晕），不含茎
function buildHead(rings, glow, baseHex, tipHex) {
  const head = new THREE.Group();
  const petals = [];
  rings.forEach((r, ri) => {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(baseHex), roughness: 0.6, metalness: 0.0,
      side: THREE.DoubleSide, emissive: new THREE.Color(tipHex), emissiveIntensity: 0.08
    });
    for (let i = 0; i < r.count; i++) {
      const pivot = new THREE.Group();
      pivot.rotation.y = (i / r.count) * Math.PI * 2 + ri * 0.6;
      const petal = new THREE.Mesh(PETAL_GEO, mat);
      petal.scale.set(r.wid, r.len, 1);
      pivot.add(petal);
      head.add(pivot);
      petals.push({ pivot, openX: r.openX, delay: r.delay });
    }
  });
  const recept = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0xb89a4e, roughness: 0.6 }));
  recept.scale.y = 0.6; recept.position.y = 0.04; head.add(recept);
  const coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glow, color: 0xffd58a, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  coreGlow.scale.set(1.0, 1.0, 1); coreGlow.position.y = 0.1; head.add(coreGlow);
  return { head, petals, coreGlow };
}

export function startGarden(container, opts) {
  opts = opts || {};
  const getCount = () => (typeof opts.count === 'function' ? opts.count() : (opts.count || 0));
  const getGrow = () => (typeof opts.getGrow === 'function' ? opts.getGrow() : 0);

  const DPR = Math.min(2, window.devicePixelRatio || 1);
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let alive = true, raf = 0, t0 = performance.now();

  const GLOW = makeGlow();

  // 自然配色 [base, tip]
  const palette = [
    [0xff9ec0, 0xffd1e6], [0xffcf4d, 0xfff3c4], [0xb98cff, 0xe9d6ff],
    [0xffffff, 0xffe6f0], [0xff7a5c, 0xffd0c0]
  ];
  const FOCUS = [0xffc7d6, 0xfff1ea];   // 焦点花：暖白偏粉

  // 花瓣开合：CLOSED_X=收拢成花苞，openX=绽放到外倾
  const CLOSED_X = 0.12;
  const SCATTER_RINGS = (c0, c1) => [
    { count: 6,  wid: 0.85, len: 1.0,  openX: 0.70, delay: 0.00, baseHex: c0, tipHex: c1 },
    { count: 9,  wid: 0.95, len: 1.35, openX: 0.92, delay: 0.12, baseHex: c0, tipHex: c1 },
    { count: 12, wid: 1.10, len: 1.70, openX: 1.12, delay: 0.24, baseHex: c0, tipHex: c1 }
  ];
  const FOCUS_RINGS = [
    { count: 7,  wid: 0.85, len: 1.0,  openX: 0.70, delay: 0.00, baseHex: FOCUS[0], tipHex: FOCUS[1] },
    { count: 10, wid: 0.95, len: 1.35, openX: 0.92, delay: 0.10, baseHex: FOCUS[0], tipHex: FOCUS[1] },
    { count: 13, wid: 1.10, len: 1.70, openX: 1.12, delay: 0.20, baseHex: FOCUS[0], tipHex: FOCUS[1] },
    { count: 16, wid: 1.22, len: 2.0,  openX: 1.28, delay: 0.30, baseHex: FOCUS[0], tipHex: FOCUS[1] }
  ];

  // 一朵完整花（茎 + 花头），growth b∈[0,1]
  function makeFlower(rings, scaleBase) {
    const root = new THREE.Group();
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.06, 1.4, 8).translate(0, 0.7, 0),
      new THREE.MeshStandardMaterial({ color: 0x57a766, roughness: 0.9 })
    );
    root.add(stem);
    const { head, petals, coreGlow } = buildHead(rings, GLOW, rings[0].baseHex, rings[0].tipHex);
    head.position.y = 1.4;
    root.add(head);
    root.scale.setScalar(scaleBase || 1);
    return { root, stem, head, petals, coreGlow, seed: Math.random() * 6.28, baseY: 0 };
  }

  function setBloom(f, b) {
    b = clamp01(b);
    const ss = 0.12 + 0.88 * b;          // 整株随生长放大
    f.stem.scale.y = ss;
    f.head.position.y = 1.4 * ss;
    f.head.scale.setScalar(0.4 + 0.6 * b);
    f.petals.forEach(p => {
      const t = reduce ? 1 : easeOutCubic(clamp01((b - p.delay) / 0.55));
      p.pivot.rotation.x = lerp(CLOSED_X, p.openX, t);   // 花瓣由收拢→外倾
    });
    f.coreGlow.material.opacity = (0.4 + 0.2 * Math.sin(performance.now() * 0.002)) * clamp01((b - 0.3) / 0.4);
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 200);
  camera.position.set(0, 2.6, 7); camera.lookAt(0, 1.6, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(DPR);
  renderer.setClearColor(0x000000, 0);
  if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;

  // 容器自适应：绝对定位铺满，避免容器高度塌缩导致画布 0 高
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
  for (let i = 0; i < 56; i++) {
    const a = Math.random() * 6.28, r = 0.6 + Math.random() * 5.8;
    const b = new THREE.Mesh(blade, bladeMat);
    b.position.set(Math.cos(a) * r, 0.22 + Math.random() * 0.1, Math.sin(a) * r);
    b.rotation.y = Math.random() * 6.28; b.scale.setScalar(0.6 + Math.random() * 0.8);
    grass.add(b);
  }
  scene.add(grass);

  const flowers = [];
  const n = Math.max(getCount(), 6);   // 至少 6 朵装饰花，保证初次进入也是座花园而非空地
  for (let i = 0; i < n; i++) {
    const c = palette[i % palette.length];
    const f = makeFlower(SCATTER_RINGS(c[0], c[1]), 0.55 + Math.random() * 0.45);
    const a = Math.random() * 6.28, r = 0.9 + Math.random() * 5.2;
    f.root.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    f.root.rotation.y = Math.random() * 6.28;
    setBloom(f, 1);
    scene.add(f.root); flowers.push(f);
  }

  // 中央焦点花（暖白，随 getGrow() 生长）
  const focus = makeFlower(FOCUS_RINGS, 1.0);
  focus.root.position.set(0, 0, 0);
  setBloom(focus, clamp01(getGrow()));
  scene.add(focus.root);

  function resize() {
    const w = container.clientWidth || 320, h = container.clientHeight || 300;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
  }
  resize();

  function renderOnce() { resize(); renderer.render(scene, camera); }

  let inView = true, tabVisible = !document.hidden;
  function active() { return alive && inView && tabVisible; }
  function kick() { if (raf) cancelAnimationFrame(raf); raf = 0; if (active() && !reduce) raf = requestAnimationFrame(loop); else if (reduce) renderOnce(); }

  function loop(now) {
    if (!alive) return;
    if (!container.isConnected) { stop(); return; }
    const t = (now - t0) / 1000;
    const g = clamp01(getGrow());
    setBloom(focus, g < 0.001 ? 0.001 : g);
    flowers.forEach(f => {
      f.root.rotation.z = Math.sin(t * 0.6 + f.seed) * 0.03;
      f.root.rotation.y = f.seed + Math.sin(t * 0.2 + f.seed) * 0.05;
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

  function stop() {
    alive = false; if (raf) cancelAnimationFrame(raf); raf = 0;
    document.removeEventListener('visibilitychange', onVis);
    if (io) try { io.disconnect(); } catch (e) {}
    if (ro) try { ro.disconnect(); } catch (e) {}
    try { renderer.dispose(); } catch (e) {}
    try { if (renderer.forceContextLoss) renderer.forceContextLoss(); } catch (e) {}
    if (cv && cv.parentNode) cv.parentNode.removeChild(cv);
    if (window.__gGarden === api) window.__gGarden = null;
    scene.traverse(o => {
      if (o.geometry && o.geometry !== PETAL_GEO) o.geometry.dispose();
      if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); }
    });
  }

  const api = {
    stop,
    setVisible(v) { tabVisible = !!v; kick(); },
    setGrow() {},
    addBloom() {
      const c = palette[flowers.length % palette.length];
      const f = makeFlower(SCATTER_RINGS(c[0], c[1]), 0.55 + Math.random() * 0.45);
      const a = Math.random() * 6.28, r = 0.9 + Math.random() * 5.2;
      f.root.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      f.root.rotation.y = Math.random() * 6.28;
      setBloom(f, 1); scene.add(f.root); flowers.push(f);
    },
    three: { scene, camera, renderer }
  };
  window.__gGarden = api;
  return api;
}

window.startGarden = startGarden;
