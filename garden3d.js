// 专注花园 · 3D 花朵绽放（Three.js 本地模块，无外部依赖）
// 花瓣弯曲/绽放算法移植自 garettwong/flower-3d（Ethereal Bloom，MIT 风格开源），
// 改为自然色 + 真实花茎 + 花园场景，按场景聚焦生长。
// 接口：const g = startGarden(container, {count, getGrow});  g.stop() / g.addBloom()
import * as THREE from './vendor/three.module.js';

function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }
function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

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
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 花瓣几何：平面重塑为宽卵形 + 横截面凹勺，沿长度弯曲交给 shader
function petalGeometry() {
  const geo = new THREE.PlaneGeometry(1, 1, 12, 28);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const t = y + 0.5;                                   // 0=基部 1=尖端
    const w = Math.pow(Math.sin(Math.PI * Math.pow(t, 0.55)), 0.6) * 0.62 + 0.10;
    const nx = x * 2 * w;
    const cup = -(Math.pow(x * 2, 2)) * 0.32 * (0.35 + 0.65 * t);
    pos.setXYZ(i, nx, t, cup);
  }
  geo.computeVertexNormals();
  return geo;
}

// 花瓣材质：顶点着色器按 uOpen 把花瓣从含苞(curled)弯到舒展(recurved)
function makePetalMat(th0c, th0o, kc, ko, baseHex, tipHex) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: {
      uOpen: { value: 0 },
      uTh0c: { value: th0c }, uTh0o: { value: th0o }, uKc: { value: kc }, uKo: { value: ko },
      uBase: { value: new THREE.Color(baseHex) },
      uTip: { value: new THREE.Color(tipHex) },
      uRim: { value: new THREE.Color(0xffffff) },
      uRimPow: { value: 2.4 }, uRimStr: { value: 0.35 }, uInt: { value: 0.95 }, uAlpha: { value: 0.94 }
    },
    vertexShader: `
      uniform float uOpen, uTh0c, uTh0o, uKc, uKo;
      varying vec3 vN; varying vec3 vV; varying float vT;
      void main(){
        vT = uv.y;
        float s  = position.y;
        float x  = position.x;
        float z0 = position.z;
        float th0 = mix(uTh0c, uTh0o, uOpen);
        float k   = mix(uKc,  uKo,  uOpen);
        float th  = th0 + k * s;
        float cy, cz;
        if(abs(k) < 0.001){ cy = cos(th0) * s; cz = sin(th0) * s; }
        else { cy = (sin(th) - sin(th0)) / k; cz = (cos(th0) - cos(th)) / k; }
        vec3  nrm = vec3(0.0, -sin(th), cos(th));
        vec3  local = vec3(x, cy, cz) + nrm * z0;
        vec4  wp = modelMatrix * vec4(local, 1.0);
        vN = normalize(mat3(modelMatrix) * nrm);
        vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      varying vec3 vN; varying vec3 vV; varying float vT;
      uniform vec3 uBase,uTip,uRim; uniform float uRimPow,uRimStr,uInt,uAlpha;
      void main(){
        vec3 N = normalize(vN);
        if(dot(N,vV) < 0.0) N = -N;
        float f = pow(1.0 - clamp(dot(N,vV),0.0,1.0), uRimPow);
        vec3 col = mix(uBase, uTip, smoothstep(0.0,1.0,vT));
        col += uRim * f * uRimStr;
        float a = uAlpha * (0.82 + 0.18*f);
        gl_FragColor = vec4(col * uInt, a);
      }`
  });
}

// 花头（多圈花瓣 + 花心光晕），不含茎
function buildHead(rings, glow) {
  const head = new THREE.Group();
  const ringMats = [];
  rings.forEach((r, ri) => {
    const mat = makePetalMat(r.th0c, r.th0o, r.kc, r.ko, r.baseHex, r.tipHex);
    ringMats.push(mat);
    for (let i = 0; i < r.count; i++) {
      const pivot = new THREE.Group();
      pivot.rotation.y = (i / r.count) * Math.PI * 2 + ri * 0.45;
      const mesh = new THREE.Mesh(PETAL, mat);
      mesh.scale.set(r.wid, r.len, r.len);
      mesh.position.set(0, 0, r.base);
      pivot.add(mesh);
      head.add(pivot);
    }
  });
  // 花心：小穹顶 + 柔光晕
  const recept = new THREE.Mesh(new THREE.SphereGeometry(0.15, 18, 14),
    new THREE.MeshStandardMaterial({ color: 0xb89a4e, roughness: 0.6 }));
  recept.scale.y = 0.6; recept.position.y = 0.02; head.add(recept);
  const coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glow, color: 0xffd58a, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  coreGlow.scale.set(1.1, 1.1, 1); coreGlow.position.y = 0.08; head.add(coreGlow);
  return { head, ringMats, coreGlow };
}

export function startGarden(container, opts) {
  opts = opts || {};
  const getCount = () => (typeof opts.count === 'function' ? opts.count() : (opts.count || 0));
  const getGrow = () => (typeof opts.getGrow === 'function' ? opts.getGrow() : 0);

  const DPR = Math.min(2, window.devicePixelRatio || 1);
  let alive = true, raf = 0, t0 = performance.now();
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const PETAL = petalGeometry();
  const GLOW = makeGlow();

  // 自然配色 [base, tip]
  const palette = [
    [0xffd9e6, 0xff8fb3], [0xfff3c4, 0xffcf4d], [0xe9d6ff, 0xb98cff],
    [0xffffff, 0xffe6f0], [0xffd0c0, 0xff7a5c]
  ];
  const FOCUS = [0xfff1ea, 0xffc7d6];   // 焦点花：暖白偏粉

  const SCATTER_RINGS = (c) => [
    { count: 6, wid: 0.8, len: 1.0, base: 0.06, th0c: 0.12, th0o: 0.42, kc: -1.05, ko: 0.62, baseHex: c[0], tipHex: c[1] },
    { count: 9, wid: 0.95, len: 1.4, base: 0.13, th0c: 0.15, th0o: 0.66, kc: -1.15, ko: 0.85, baseHex: c[0], tipHex: c[1] },
    { count: 12, wid: 1.1, len: 1.8, base: 0.22, th0c: 0.18, th0o: 0.92, kc: -1.25, ko: 1.08, baseHex: c[0], tipHex: c[1] }
  ];
  const FOCUS_RINGS = [
    { count: 7, wid: 0.8, len: 1.0, base: 0.06, th0c: 0.12, th0o: 0.42, kc: -1.05, ko: 0.62, baseHex: FOCUS[0], tipHex: FOCUS[1] },
    { count: 10, wid: 0.95, len: 1.4, base: 0.13, th0c: 0.15, th0o: 0.66, kc: -1.15, ko: 0.85, baseHex: FOCUS[0], tipHex: FOCUS[1] },
    { count: 13, wid: 1.1, len: 1.8, base: 0.22, th0c: 0.18, th0o: 0.92, kc: -1.25, ko: 1.08, baseHex: FOCUS[0], tipHex: FOCUS[1] },
    { count: 16, wid: 1.25, len: 2.1, base: 0.32, th0c: 0.22, th0o: 1.12, kc: -1.35, ko: 1.35, baseHex: FOCUS[0], tipHex: FOCUS[1] }
  ];

  // 一朵完整花（茎 + 花头），growth g∈[0,1]
  function makeFlower(rings, scaleBase) {
    const root = new THREE.Group();
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.05, 1.4, 8).translate(0, 0.7, 0),
      new THREE.MeshStandardMaterial({ color: 0x57a766, roughness: 0.9 })
    );
    root.add(stem);
    const { head, ringMats, coreGlow } = buildHead(rings, GLOW);
    head.position.y = 1.4;
    root.add(head);
    root.scale.setScalar(scaleBase || 1);
    return { root, stem, head, ringMats, coreGlow, seed: Math.random() * 6.28, baseY: root.rotation.y };
  }

  function setBloom(f, b) {
    b = clamp01(b);
    const ss = 0.08 + 0.92 * b;
    f.stem.scale.y = ss;
    f.head.position.y = 1.4 * ss;
    f.head.scale.setScalar(0.35 + 0.65 * b);
    const n = f.ringMats.length;
    for (let ri = 0; ri < n; ri++) {
      const d = (n - 1 - ri) * 0.14;          // 外圈先开，内圈最后开
      const o = reduce ? 1 : easeOutCubic(clamp01((b - d) / 0.56));
      f.ringMats[ri].uniforms.uOpen.value = o;
    }
    f.coreGlow.material.opacity = (0.45 + 0.15 * Math.sin(performance.now() * 0.002)) * clamp01((b - 0.35) / 0.4);
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 200);
  camera.position.set(0, 3.0, 8.0);
  camera.lookAt(0, 1.8, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(DPR);
  renderer.setClearColor(0x000000, 0);
  if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  const cv = renderer.domElement;
  cv.style.width = '100%'; cv.style.height = '100%'; cv.style.display = 'block';

  scene.add(new THREE.HemisphereLight(0xfff2dd, 0x3c5e34, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.05); sun.position.set(3.5, 7, 4.5); scene.add(sun);
  const rim = new THREE.DirectionalLight(0xffd9e8, 0.3); rim.position.set(-4, 3, -3); scene.add(rim);

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
  const n = getCount();
  for (let i = 0; i < n; i++) {
    const c = palette[i % palette.length];
    const f = makeFlower(SCATTER_RINGS(c), 0.55 + Math.random() * 0.45);
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
    const w = container.clientWidth || 320, h = container.clientHeight || 200;
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
      f.root.rotation.z = Math.sin(t * 0.6 + f.seed) * 0.035;
      f.root.rotation.y = f.baseY + Math.sin(t * 0.2 + f.seed) * 0.05;
    });
    focus.root.rotation.z = Math.sin(t * 0.5) * 0.02;
    const ca = Math.sin(t * 0.08) * 0.6;
    camera.position.x = ca; camera.position.z = Math.cos(t * 0.08) * 8.0; camera.lookAt(0, 1.8, 0);
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
      if (o.geometry) o.geometry.dispose();
      if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); }
    });
  }

  const api = {
    stop,
    setVisible(v) { tabVisible = !!v; kick(); },
    setGrow() {},
    addBloom() {
      const c = palette[flowers.length % palette.length];
      const f = makeFlower(SCATTER_RINGS(c), 0.55 + Math.random() * 0.45);
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
