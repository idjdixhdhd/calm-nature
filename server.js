// 静谧自然 · 后端服务（原生 Node，无第三方依赖）
// 提供：前端静态页 / 素材清单 API / 媒体流式输送 / 自托管访问统计（无第三方、无注册）
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PORT = process.env.PORT || 8787;
const ANALYTICS_FILE = path.join(ROOT, "analytics.json");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".mp3": "audio/mpeg",
  ".webm": "video/webm",
};

const IMMUTABLE = new Set([".mp4", ".jpg", ".jpeg", ".png", ".mp3", ".webm"]);

// ---------- 访问统计（内存 + 落盘） ----------
let events = [];          // {ts, path, ua, load, vid, dev, os, br}
let saveTimer = null;

function loadAnalytics() {
  try {
    const raw = fs.readFileSync(ANALYTICS_FILE, "utf8");
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) events = arr;
  } catch (e) { events = []; }
}
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try { fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(events.slice(-20000))); }
    catch (e) {}
  }, 3000);
}
function parseUA(ua) {
  ua = (ua || "").toLowerCase();
  let os = "其他", br = "其他", dev = "桌面";
  if (/windows nt/.test(ua)) os = "Windows";
  else if (/iphone|ipad|ipod/.test(ua)) os = "iOS";
  else if (/android/.test(ua)) os = "Android";
  else if (/mac os x/.test(ua)) os = "macOS";
  else if (/linux/.test(ua)) os = "Linux";
  if (/edg\//.test(ua)) br = "Edge";
  else if (/opr\/|opera/.test(ua)) br = "Opera";
  else if (/chrome\//.test(ua) && !/edg\//.test(ua)) br = "Chrome";
  else if (/firefox\//.test(ua)) br = "Firefox";
  else if (/safari\//.test(ua) && !/chrome\//.test(ua)) br = "Safari";
  if (/mobile/.test(ua)) dev = "手机";
  else if (/tablet|ipad/.test(ua)) dev = "平板";
  return { os, br, dev };
}
function agg() {
  const byDay = {};
  const dev = {}, os = {}, br = {}, pages = {};
  const vids = new Set();
  const vidDay = {}; // vid -> Set(day)
  for (const e of events) {
    const d = new Date(e.ts).toISOString().slice(0, 10);
    byDay[d] = byDay[d] || { views: 0, uv: 0 };
    byDay[d].views++;
    if (!vidDay[e.vid]) vidDay[e.vid] = new Set();
    vidDay[e.vid].add(d);
    dev[e.dev] = (dev[e.dev] || 0) + 1;
    os[e.os] = (os[e.os] || 0) + 1;
    br[e.br] = (br[e.br] || 0) + 1;
    pages[e.path] = (pages[e.path] || 0) + 1;
    vids.add(e.vid);
  }
  // 重新算每日 uv（按 vid+day 去重）
  const dayUv = {};
  for (const vid in vidDay) for (const d of vidDay[vid]) dayUv[d] = (dayUv[d] || 0) + 1;
  const dayArr = Object.keys(byDay).sort().map(d => ({ d, views: byDay[d].views, uv: dayUv[d] || 0 }));
  const loads = events.filter(e => e.load > 0).map(e => e.load);
  const avgLoad = loads.length ? Math.round(loads.reduce((a, b) => a + b, 0) / loads.length) : 0;
  return {
    total: events.length,
    visitors: vids.size,
    avgLoadMs: avgLoad,
    byDay: dayArr,
    devices: dev,
    os, browsers: br, pages
  };
}

// ---------- 静态文件 ----------
function sendFile(req, res, filePath, mime) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) { res.writeHead(404); res.end("Not found"); return; }
    const total = stat.size;
    const ext = path.extname(filePath).toLowerCase();
    const cache = IMMUTABLE.has(ext)
      ? "public, max-age=31536000, immutable"
      : "public, max-age=3600";
    const range = req.headers.range;
    if (range) {
      const m = range.match(/bytes=(\d*)-(\d*)/);
      let start = m && m[1] ? parseInt(m[1], 10) : 0;
      let end = m && m[2] ? parseInt(m[2], 10) : total - 1;
      if (isNaN(start) || isNaN(end) || start > end || end >= total) {
        res.writeHead(416, { "Content-Range": `bytes */${total}` });
        return res.end();
      }
      res.writeHead(206, {
        "Content-Type": mime, "Content-Range": `bytes ${start}-${end}/${total}`,
        "Accept-Ranges": "bytes", "Content-Length": end - start + 1, "Cache-Control": cache,
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Type": mime, "Content-Length": total,
        "Accept-Ranges": "bytes", "Cache-Control": cache,
      });
      fs.createReadStream(filePath).pipe(res);
    }
  });
}

function sendJson(res, obj, code) {
  const body = JSON.stringify(obj);
  res.writeHead(code || 200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const pathname = decodeURIComponent(url.pathname);
  const meth = req.method || "GET";

  // 健康检查
  if (pathname === "/api/health") {
    return sendJson(res, { ok: true, name: "Quiet Nature", scenes: 4 });
  }

  // 素材清单
  if (pathname === "/api/scenes") {
    return sendFile(req, res, path.join(ROOT, "scenes.json"), MIME[".json"]);
  }

  // 统计：记录一次访问
  if (pathname === "/api/log" && meth === "POST") {
    let buf = "";
    req.on("data", c => { buf += c; if (buf.length > 1e4) req.destroy(); });
    req.on("end", () => {
      let vid = null;
      const ck = req.headers.cookie || "";
      const m = ck.match(/qn_vid=([a-z0-9]+)/);
      if (m) vid = m[1];
      if (!vid) { vid = Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
      let body = {};
      try { body = JSON.parse(buf || "{}"); } catch (e) {}
      const ua = req.headers["user-agent"] || "";
      const p = parseUA(ua);
      events.push({
        ts: Date.now(),
        path: (body.p || "/").toString().slice(0, 80),
        ua, load: Number(body.load) || 0,
        vid, dev: p.dev, os: p.os, br: p.br
      });
      if (events.length > 50000) events = events.slice(-30000);
      scheduleSave();
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Set-Cookie": `qn_vid=${vid}; Max-Age=31536000; Path=/; SameSite=Lax`
      });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }

  // 统计：聚合数据（仅站长可读，但静态站无法真校验，仅作展示）
  if (pathname === "/api/stats" && meth === "GET") {
    return sendJson(res, agg());
  }

  // 媒体资源
  if (pathname.startsWith("/media/")) {
    const fp = path.join(ROOT, pathname);
    if (!fp.startsWith(path.join(ROOT, "media"))) { res.writeHead(403); return res.end(); }
    const ext = path.extname(fp).toLowerCase();
    return sendFile(req, res, fp, MIME[ext] || "application/octet-stream");
  }

  // 默认前端页
  if (pathname === "/" || pathname === "/index.html") {
    return sendFile(req, res, path.join(ROOT, "index.html"), MIME[".html"]);
  }

  const fp = path.join(ROOT, pathname);
  if (fp.startsWith(ROOT)) {
    const ext = path.extname(fp).toLowerCase();
    return sendFile(req, res, fp, MIME[ext] || "application/octet-stream");
  }
  res.writeHead(403); res.end();
});

loadAnalytics();
server.listen(PORT, () => {
  console.log(`静谧自然 已启动： http://localhost:${PORT}`);
  console.log(`素材清单 API： http://localhost:${PORT}/api/scenes`);
  console.log(`统计 API：     http://localhost:${PORT}/api/stats`);
});
