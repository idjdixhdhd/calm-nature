// 自然之境 · 程序化环境音引擎（Web Audio，无外部 mp3 依赖）
// 每个场景按 category/id 生成专属分层音景 + 沉浸混响 + 声像偏移。
// 接口：NatureAmbient.ensure() / play(scene) / stop() / setHour(h) / setMuted(m) / setVolume(v)
(function () {
  const A = (window.NatureAmbient = {});
  let ctx = null, master = null, reverb = null, reverbGain = null, noiseBuf = null;
  let layers = [];          // 当前播放层：{id, set(v), stop(), kind}
  let currentId = null;     // 当前场景 id
  let muted = false, volume = 0.6;

  function ensure() {
    if (ctx) { if (ctx.state === "suspended") ctx.resume().catch(() => {}); return ctx; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : volume; master.connect(ctx.destination);
    // 沉浸混响：程序化生成指数衰减脉冲响应（开阔空间感）
    reverb = ctx.createConvolver(); reverb.buffer = makeIR(2.4, 2.6);
    reverbGain = ctx.createGain(); reverbGain.gain.value = 0.22;
    reverb.connect(reverbGain); reverbGain.connect(master);
    return ctx;
  }
  function makeIR(dur, decay) {
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return buf;
  }
  function noise() {
    if (noiseBuf) return noiseBuf;
    const len = Math.floor(ctx.sampleRate * 2);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }
  function panNode(p) { if (ctx.createStereoPanner) { const n = ctx.createStereoPanner(); n.pan.value = p || 0; return n; } return ctx.createGain(); }
  function now() { return ctx.currentTime; }

  // 持续噪声层（风/海/雨/溪/火底），可选 LFO 调制滤波频率做起伏
  function noiseLayer(cfg) {
    const src = ctx.createBufferSource(); src.buffer = noise(); src.loop = true;
    const filt = ctx.createBiquadFilter(); filt.type = cfg.filter || "bandpass";
    filt.frequency.value = cfg.freq || 500; filt.Q.value = cfg.q != null ? cfg.q : 0.7;
    const g = ctx.createGain(); g.gain.value = 0;
    const pan = panNode(cfg.pan || 0);
    src.connect(filt); filt.connect(g); g.connect(pan);
    pan.connect(master); pan.connect(reverb);
    src.start();
    let lfo = null;
    if (cfg.lfo) {
      lfo = ctx.createOscillator(); lfo.frequency.value = cfg.lfo;
      const lg = ctx.createGain(); lg.gain.value = cfg.lfoDepth != null ? cfg.lfoDepth : cfg.freq * 0.3;
      lfo.connect(lg); lg.connect(cfg.lfoTarget === "gain" ? g.gain : filt.frequency); lfo.start();
    }
    return { set(v) { g.gain.setTargetAtTime(v, now(), 0.8); }, stop() { try { src.stop(); } catch (e) {} if (lfo) try { lfo.stop(); } catch (e) {} } };
  }

  // 低频 pad（白天/夜晚氛围），双振荡器微失谐 + 慢 LFO 音量
  function padLayer(freq, vol) {
    const o1 = ctx.createOscillator(); o1.type = "sine"; o1.frequency.value = freq;
    const o2 = ctx.createOscillator(); o2.type = "sine"; o2.frequency.value = freq * 1.005;
    const g = ctx.createGain(); g.gain.value = 0;
    const pan = panNode((Math.random() * 2 - 1) * 0.3);
    o1.connect(g); o2.connect(g); g.connect(pan); pan.connect(master); pan.connect(reverb);
    o1.start(); o2.start();
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.06; const lg = ctx.createGain(); lg.gain.value = vol * 0.35;
    lfo.connect(lg); lg.connect(g.gain); lfo.start();
    return { set(v) { g.gain.setTargetAtTime(v, now(), 0.8); }, stop() { try { o1.stop(); o2.stop(); lfo.stop(); } catch (e) {} } };
  }

  // 高频虫鸣：带通噪声 + 快速 AM 颤动
  function insectLayer(vol) {
    const src = ctx.createBufferSource(); src.buffer = noise(); src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 6200; bp.Q.value = 6;
    const g = ctx.createGain(); g.gain.value = 0;
    const pan = panNode((Math.random() * 2 - 1) * 0.4);
    src.connect(bp); bp.connect(g); g.connect(pan); pan.connect(master); pan.connect(reverb);
    const am = ctx.createOscillator(); am.type = "square"; am.frequency.value = 22;
    const amg = ctx.createGain(); amg.gain.value = vol * 0.5; const dc = ctx.createConstantSource(); dc.offset.value = vol * 0.5;
    am.connect(amg); amg.connect(g.gain); dc.connect(g.gain);
    src.start(); am.start(); dc.start();
    return { set(v) { g.gain.setTargetAtTime(v, now(), 0.8); }, stop() { try { src.stop(); am.stop(); dc.stop(); } catch (e) {} } };
  }

  // 随机短音（鸟/水滴/海鸥/篝火噼啪）
  function spawnTone(f0, f1, dur, type, vol, pan) {
    const o = ctx.createOscillator(); o.type = type || "sine"; o.frequency.setValueAtTime(f0, now());
    o.frequency.exponentialRampToValueAtTime(Math.max(40, f1), now() + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, now());
    g.gain.linearRampToValueAtTime(vol, now() + dur * 0.3); g.gain.linearRampToValueAtTime(0, now() + dur);
    const p = panNode(pan || 0); o.connect(g); g.connect(p); p.connect(master); p.connect(reverb);
    o.start(); o.stop(now() + dur + 0.05);
  }
  function spawnBurst(dur, vol, pan, hp) {
    const src = ctx.createBufferSource(); src.buffer = noise(); src.loop = false;
    const off = Math.floor(Math.random() * (noise().length / 2));
    try { src.start(0, off / ctx.sampleRate, dur); } catch (e) {}
    const f = ctx.createBiquadFilter(); f.type = hp ? "highpass" : "lowpass"; f.frequency.value = hp || 900;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, now()); g.gain.exponentialRampToValueAtTime(0.0001, now() + dur);
    const p = panNode(pan || 0); src.connect(f); f.connect(g); g.connect(p); p.connect(master); p.connect(reverb);
  }
  function scheduler(msMin, msMax, fn) {
    let tid = null, alive = true;
    function tick() { if (!alive) return; fn(); tid = setTimeout(tick, msMin + Math.random() * (msMax - msMin)); }
    tid = setTimeout(tick, msMin + Math.random() * (msMax - msMin));
    return { stop() { alive = false; if (tid) clearTimeout(tid); } };
  }

  // ---- 预设：按 id 优先，再 category ----
  const PRESETS = {
    meadow: [
      { t: "noise", filter: "bandpass", freq: 380, q: 0.6, lfo: 0.08, lfoDepth: 120, vol: 0.18, pan: -0.2 },
      { t: "birds" }, { t: "pad", freq: 110, vol: 0.05, kind: "day" }, { t: "pad", freq: 82, vol: 0.05, kind: "night" }
    ],
    rain: [
      { t: "noise", filter: "highpass", freq: 1400, q: 0.5, vol: 0.16, pan: 0 },
      { t: "noise", filter: "bandpass", freq: 5000, q: 0.5, vol: 0.05, pan: 0.1 },
      { t: "noise", filter: "lowpass", freq: 320, q: 0.4, vol: 0.05, pan: 0 }
    ],
    campfire: [
      { t: "noise", filter: "lowpass", freq: 420, q: 0.5, lfo: 0.05, lfoDepth: 60, vol: 0.10, pan: 0.15 },
      { t: "fire" }, { t: "noise", filter: "bandpass", freq: 300, q: 0.5, vol: 0.05, pan: -0.3 }
    ],
    stars: [
      { t: "noise", filter: "bandpass", freq: 260, q: 0.5, lfo: 0.06, lfoDepth: 80, vol: 0.10, pan: 0.2 },
      { t: "insects", vol: 0.04 }, { t: "pad", freq: 70, vol: 0.06, kind: "night" }
    ],
    mountain: [
      { t: "noise", filter: "bandpass", freq: 500, q: 0.45, lfo: 0.05, lfoDepth: 200, vol: 0.22, pan: 0 },
      { t: "birds", slow: true }
    ],
    ocean: [
      { t: "sea" }, { t: "gulls" }
    ],
    waterfall: [
      { t: "noise", filter: "lowpass", freq: 3800, q: 0.4, vol: 0.26, pan: 0 },
      { t: "noise", filter: "highpass", freq: 1800, q: 0.4, vol: 0.08, pan: 0.1 }
    ],
    aurora: [
      { t: "noise", filter: "bandpass", freq: 240, q: 0.5, lfo: 0.05, lfoDepth: 70, vol: 0.09, pan: -0.2 },
      { t: "insects", vol: 0.035 }, { t: "pad", freq: 140, vol: 0.05, kind: "night" }
    ],
    snow: [
      { t: "noise", filter: "lowpass", freq: 700, q: 0.4, lfo: 0.04, lfoDepth: 120, vol: 0.12, pan: 0.1 }
    ],
    "beach-shore": [{ t: "sea" }, { t: "gulls" }]
  };
  const CAT = {
    water: [{ t: "noise", filter: "bandpass", freq: 900, q: 0.8, lfo: 0.1, lfoDepth: 300, vol: 0.16, pan: 0 }, { t: "drops" }],
    extreme: [{ t: "noise", filter: "bandpass", freq: 620, q: 0.4, lfo: 0.04, lfoDepth: 240, vol: 0.26, pan: 0 }],
    forest: [{ t: "noise", filter: "bandpass", freq: 360, q: 0.6, lfo: 0.08, lfoDepth: 120, vol: 0.12, pan: -0.15 }, { t: "birds" }, { t: "insects", vol: 0.05 }],
    sky: [{ t: "noise", filter: "bandpass", freq: 260, q: 0.5, lfo: 0.06, lfoDepth: 80, vol: 0.10, pan: 0.2 }, { t: "insects", vol: 0.04 }, { t: "pad", freq: 70, vol: 0.05, kind: "night" }]
  };

  function presetFor(scene) {
    if (PRESETS[scene.id]) return PRESETS[scene.id];
    if (CAT[scene.category]) return CAT[scene.category];
    return [{ t: "noise", filter: "bandpass", freq: 400, q: 0.6, lfo: 0.07, lfoDepth: 100, vol: 0.12, pan: 0 }];
  }

  function buildLayer(cfg) {
    switch (cfg.t) {
      case "noise": return noiseLayer(cfg);
      case "pad": { const L = padLayer(cfg.freq, cfg.vol); L.kind = cfg.kind; L._vol = cfg.vol; if (cfg.kind) L.set(0); return L; }
      case "insects": { const L = insectLayer(cfg.vol || 0.04); L.kind = "insect"; return L; }
      case "birds": return { sched: scheduler(cfg.slow ? 6000 : 2200, cfg.slow ? 12000 : 6000, () => { const f = 1700 + Math.random() * 1400; spawnTone(f, f * (0.6 + Math.random() * 0.3), 0.16, "triangle", 0.06, (Math.random() * 2 - 1) * 0.5); }), set() {}, stop() { this.sched.stop(); } };
      case "gulls": return { sched: scheduler(7000, 16000, () => { const f = 800 + Math.random() * 300; spawnTone(f, f * 1.4, 0.5, "sawtooth", 0.05, (Math.random() * 2 - 1) * 0.6); }), set() {}, stop() { this.sched.stop(); } };
      case "drops": return { sched: scheduler(1500, 5000, () => { spawnTone(700 + Math.random() * 400, 300, 0.12, "sine", 0.05, (Math.random() * 2 - 1) * 0.5); }), set() {}, stop() { this.sched.stop(); } };
      case "fire": return { sched: scheduler(120, 600, () => { spawnBurst(0.02 + Math.random() * 0.05, 0.05 + Math.random() * 0.08, (Math.random() * 2 - 1) * 0.4, 1500); }), set() {}, stop() { this.sched.stop(); } };
      case "sea": {
        // 海浪：低通噪声 + 大幅慢 LFO 调制音量（涌动）
        const L = noiseLayer({ filter: "lowpass", freq: 600, q: 0.4, vol: 0.0, lfo: 0.1, lfoDepth: 0.16, lfoTarget: "gain" });
        L.seaBase = 0.12; L.set(0.12); return L;
      }
      default: return noiseLayer(cfg);
    }
  }

  function stopAll() {
    layers.forEach(L => { try { L.stop(); } catch (e) {} });
    layers = [];
  }

  A.currentId = () => currentId;

  A.play = function (scene) {
    if (!ensure()) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    stopAll();
    currentId = scene.id;
    const preset = presetFor(scene);
    layers = preset.map(cfg => buildLayer(cfg));
    // 淡入（sea 自带 base；pad 由 setHour 控制；其余按各自 vol）
    layers.forEach((L, i) => {
      const cfg = preset[i];
      if (cfg.t === "noise" && cfg.t !== "sea") L.set(cfg.vol || 0.12);
      else if (cfg.t === "insects") L.set(cfg.vol || 0.04);
      else if (cfg.t === "pad") { if (!cfg.kind) L.set(cfg.vol || 0.05); }
      // birds/gulls/drops/fire 由调度器产生，层本身不持有音量
    });
  };

  A.stop = function () { stopAll(); currentId = null; };

  // 24h 场景（meadow）：按小时调白天/夜晚 pad 音量，保留时间轴感
  A.setHour = function (h) {
    if (!ctx) return;
    let day = 0, night = 0;
    if (h >= 5 && h < 17) day = Math.min(1, Math.max(0, 1 - Math.abs(h - 11) / 6));
    else if (h >= 17 && h < 19) day = Math.max(0, 1 - (h - 17) / 2);
    else if (h >= 4 && h < 5) day = h - 4;
    if (h >= 19 || h < 5) { const c = h >= 19 ? (h <= 23 ? 21 : 23.5) : 1; night = Math.max(0, 1 - Math.abs(h - c) / 4); }
    if (h >= 17 && h < 19) night = (h - 17) / 2;
    layers.forEach(L => {
      if (L.kind === "day") L.set((L._vol || 0.05) * day);
      else if (L.kind === "night") L.set((L._vol || 0.05) * night);
    });
  };

  A.setMuted = function (m) { muted = m; if (master) master.gain.setTargetAtTime(m ? 0 : volume, now(), 0.3); };
  A.setVolume = function (v) { volume = v; if (master && !muted) master.gain.setTargetAtTime(v, now(), 0.2); };
})();
