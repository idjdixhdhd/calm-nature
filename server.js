// 静谧自然 · 后端媒体服务（原生 Node，无第三方依赖）
// 提供：前端静态页 / 素材清单 API / 媒体流式输送
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

function sendFile(res, filePath, mime) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) { res.writeHead(404); res.end("Not found"); return; }
    const range = undefined; // 简化：整文件输出（前端 <video>/<audio> 已支持流式播放）
    res.writeHead(200, {
      "Content-Type": mime,
      "Content-Length": stat.size,
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=86400",
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  let pathname = decodeURIComponent(url.pathname);

  // 素材清单 API（后端提供的数据接口）
  if (pathname === "/api/scenes") {
    return sendFile(res, path.join(ROOT, "scenes.json"), MIME[".json"]);
  }

  // 媒体资源（视频 / 图片 / 音频）流式输送
  if (pathname.startsWith("/media/")) {
    const fp = path.join(ROOT, pathname);
    if (!fp.startsWith(path.join(ROOT, "media"))) { res.writeHead(403); return res.end(); }
    const ext = path.extname(fp).toLowerCase();
    return sendFile(res, fp, MIME[ext] || "application/octet-stream");
  }

  // 默认前端页
  if (pathname === "/" || pathname === "/index.html") {
    return sendFile(res, path.join(ROOT, "index.html"), MIME[".html"]);
  }

  // 其它静态文件（scenes.json 等）
  const fp = path.join(ROOT, pathname);
  if (fp.startsWith(ROOT)) {
    const ext = path.extname(fp).toLowerCase();
    return sendFile(res, fp, MIME[ext] || "application/octet-stream");
  }
  res.writeHead(403); res.end();
});

server.listen(PORT, () => {
  console.log(`静谧自然 已启动： http://localhost:${PORT}`);
  console.log(`素材清单 API： http://localhost:${PORT}/api/scenes`);
});
