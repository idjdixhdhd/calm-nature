// 静谧自然 · 访问统计后端（Cloudflare Workers 版）
// 存储：Workers KV（绑定名 ANALYTICS），无需自有服务器、国内可访问。
// 接口：POST /api/log（上报一次访问）  GET /api/stats（聚合数据，供站长面板）
// 部署：把本文件粘贴到 Cloudflare Worker，并在 Worker 设置里把 KV 命名空间绑到变量名 ANALYTICS。

function parseUA(ua) {
  ua = (ua || "").toLowerCase();
  let os = "其他", br = "其他", dev = "桌面", channel = "系统浏览器";
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
  // 来源/渠道：内置浏览器各自带特征串。微信优先于 QQ（微信安卓 UA 也可能含 MQQBrowser）
  if (/micromessenger/.test(ua)) channel = "微信";
  else if (/wxwork/.test(ua)) channel = "企业微信";
  else if (/dingtalk/.test(ua)) channel = "钉钉";
  else if (/weibo/.test(ua)) channel = "微博";
  else if (/alipay/.test(ua)) channel = "支付宝";
  else if (/mqqbrowser|qq\//.test(ua)) channel = "QQ";
  else if (/newsarticle|aweme/.test(ua)) channel = "抖音/头条";
  return { os, br, dev, channel };
}

function agg(events) {
  const byDay = {};
  const dev = {}, os = {}, br = {}, pages = {}, channels = {};
  const vids = new Set();
  const vidDay = {};
  for (const e of events) {
    const d = new Date(e.ts).toISOString().slice(0, 10);
    byDay[d] = byDay[d] || { views: 0, uv: 0 };
    byDay[d].views++;
    if (!vidDay[e.vid]) vidDay[e.vid] = new Set();
    vidDay[e.vid].add(d);
    dev[e.dev] = (dev[e.dev] || 0) + 1;
    os[e.os] = (os[e.os] || 0) + 1;
    br[e.br] = (br[e.br] || 0) + 1;
    channels[e.channel] = (channels[e.channel] || 0) + 1;
    pages[e.path] = (pages[e.path] || 0) + 1;
    vids.add(e.vid);
  }
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
    os, browsers: br, channels, pages
  };
}

async function readEvents(env) {
  try {
    const v = await env.ANALYTICS.get("events");
    if (!v) return [];
    const a = JSON.parse(v);
    return Array.isArray(a) ? a : [];
  } catch (e) { return []; }
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    // 上报访问
    if (url.pathname === "/api/log" && request.method === "POST") {
      let body = {};
      try { body = await request.json(); } catch (e) {}
      const ua = request.headers.get("user-agent") || "";
      const p = parseUA(ua);
      // 用 IP+UA 粗略生成访客 ID（Workers 无 Cookie 场景也能跨请求识别同一人）
      const ip = request.headers.get("cf-connecting-ip") || "";
      const vid = (ip + "|" + p.dev + "|" + p.os + "|" + p.br).replace(/[^a-z0-9|]/gi, "");
      const events = await readEvents(env);
      events.push({
        ts: Date.now(),
        path: (body.p || "/").toString().slice(0, 80),
        ua, load: Number(body.load) || 0,
        vid, dev: p.dev, os: p.os, br: p.br, channel: p.channel
      });
      if (events.length > 20000) events.splice(0, events.length - 15000);
      try { await env.ANALYTICS.put("events", JSON.stringify(events)); } catch (e) {}
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    // 聚合数据
    if (url.pathname === "/api/stats") {
      const events = await readEvents(env);
      return new Response(JSON.stringify(agg(events)), {
        headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    return new Response("Not found", { status: 404, headers: CORS });
  }
};
