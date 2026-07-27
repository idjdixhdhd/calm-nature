// 静谧自然 · 后端媒体服务（原生 Node，无第三方依赖）
// 提供：前端静态页 / 素材清单 API / 媒体流式输送（支持 Range 拖动、缓存）
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PORT = process.env.PORT || 8787;

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

// 媒体文件名稳定 → 可长期缓存；页面/清单短期缓存
const IMMUTABLE = new Set([".mp4", ".jpg", ".jpeg", ".png", ".mp3", ".webm"]);

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
        "Content-Type": mime,
        "Content-Range": `bytes ${start}-${end}/${total}`,
        "Accept-Ranges": "bytes",
        "Content-Length": end - start + 1,
        "Cache-Control": cache,
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Type": mime,
        "Content-Length": total,
        "Accept-Ranges": "bytes",
        "Cache-Control": cache,
      });
      fs.createReadStream(filePath).pipe(res);
    }
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const pathname = decodeURIComponent(url.pathname);

  // 健康检查
  if (pathname === "/api/health") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    return res.end(JSON.stringify({ ok: true, name: "Quiet Nature", scenes: 4 }));
  }

  // 素材清单 API（后端数据接口）
  if (pathname === "/api/scenes") {
    return sendFile(req, res, path.join(ROOT, "scenes.json"), MIME[".json"]);
  }

  // 媒体资源（视频 / 图片 / 音频）流式输送
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

  // 其它静态文件（scenes.json 等）
  const fp = path.join(ROOT, pathname);
  if (fp.startsWith(ROOT)) {
    const ext = path.extname(fp).toLowerCase();
    return sendFile(req, res, fp, MIME[ext] || "application/octet-stream");
  }
  res.writeHead(403); res.end();
});

server.listen(PORT, () => {
  console.log(`静谧自然 已启动： http://localhost:${PORT}`);
  console.log(`素材清单 API： http://localhost:${PORT}/api/scenes`);
});
