// 唯一服务端职责：模型代理 + 静态托管。零 npm 依赖（node 内置）。
import http from "node:http";
import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as model from "./model.mjs";
import * as mock from "./mock.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png",
  ".svg": "image/svg+xml", ".webm": "video/webm", ".ico": "image/x-icon", ".woff2": "font/woff2",
};

const CACHE_MAX = 100; // 抽取结果缓存默认上限：条数
const CACHE_TTL = 10 * 60 * 1000; // 抽取结果缓存默认有效期：10 分钟

// `..` 只算一层，所以 `..x` / `..abc` 这类合法文件名不能被误判为穿越。
function isInside(root, target) {
  const rel = path.relative(root, target);
  return rel === "" || (rel !== ".." && !rel.startsWith(".." + path.sep) && !path.isAbsolute(rel));
}

function notFound(res) {
  res.writeHead(404);
  res.end("not found");
}

export function createApp({ env = {}, staticRoot = path.join(REPO, "dist"), cacheMax = CACHE_MAX, cacheTtl = CACHE_TTL, now = () => Date.now() } = {}) {
  const hasKey = Boolean(env.MODEL_API_KEY);
  const rate = new Map(); // ip -> {count, reset}
  const cache = new Map(); // key -> {at, payload}；Map 迭代顺序即最近使用顺序
  const RATE_MAX = 30, RATE_WINDOW = 60 * 1000;

  function rateLimited(ip) {
    const now = Date.now();
    let r = rate.get(ip);
    if (!r || now > r.reset) { r = { count: 0, reset: now + RATE_WINDOW }; rate.set(ip, r); }
    r.count += 1;
    return r.count > RATE_MAX;
  }
  function cacheKey(text, context, useMock) {
    const effective = { today: context.today, clientId: context.clientId || "", openTasks: context.openTasks || [], pendingEvents: context.pendingEvents || [], pendingRests: context.pendingRests || [], clarifications: context.clarifications || [], turns: context.turns || [] };
    return createHash("sha256").update(JSON.stringify({ text, context: effective, useMock })).digest("hex");
  }
  function cacheGet(key) {
    const hit = cache.get(key);
    if (!hit) return null;
    if (now() - hit.at >= cacheTtl) { cache.delete(key); return null; }
    cache.delete(key);
    cache.set(key, hit); // 命中后移到队尾，保持最近使用顺序
    return hit.payload;
  }
  function cacheSet(key, payload) {
    cache.delete(key);
    if (cache.size >= cacheMax) {
      for (const [k, entry] of cache) {
        if (now() - entry.at >= cacheTtl) cache.delete(k); // 先清理过期项
      }
      while (cache.size > 0 && cache.size >= cacheMax) cache.delete(cache.keys().next().value); // 再淘汰最久未使用
    }
    cache.set(key, { at: now(), payload });
  }

  async function serveStatic(res, root, urlPath) {
    const rootDir = path.resolve(root);
    let rel;
    try {
      rel = decodeURIComponent(urlPath);
    } catch {
      return notFound(res);
    }
    if (rel.includes("\0")) return notFound(res);
    if (rel.endsWith("/")) rel += "index.html";
    const file = path.resolve(rootDir, "." + rel);
    if (!isInside(rootDir, file)) return notFound(res);
    try {
      const [realRoot, realFile] = await Promise.all([realpath(rootDir), realpath(file)]);
      if (!isInside(realRoot, realFile)) return notFound(res);
      const st = await stat(realFile);
      if (!st.isFile()) return notFound(res);
      const data = await readFile(realFile);
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
      res.end(data);
    } catch {
      return notFound(res);
    }
  }

  function sendJson(res, status, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(body);
  }

  async function handleExtract(req, res, ip) {
    if (rateLimited(ip)) return sendJson(res, 429, { ok: false, error: { code: "rate_limited", message: "请求太频繁，稍后再试。" } });
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 64 * 1024) { sendJson(res, 400, { ok: false, error: { code: "invalid_request", message: "请求过大。" } }); req.destroy(); return; }
    }
    let body;
    try { body = JSON.parse(raw); } catch { return sendJson(res, 400, { ok: false, error: { code: "invalid_request", message: "请求格式错误。" } }); }
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text || text.length > 1500) return sendJson(res, 400, { ok: false, error: { code: "invalid_request", message: "消息为空或超过 1500 字。" } });
    const context = body.context && typeof body.context === "object" ? body.context : {};
    if (!context.today) context.today = new Date().toISOString().slice(0, 10);
    for (const key of ["openTasks", "pendingEvents", "pendingRests", "turns", "clarifications"]) {
      if (!Array.isArray(context[key])) context[key] = [];
    }
    context.openTasks = context.openTasks.slice(0, 200)
      .filter((task) => task && typeof task.id === "string" && task.id && typeof task.title === "string" && /^\d{4}-\d{2}-\d{2}$/.test(task.dueAt || ""))
      .map((task) => ({ ...task, position: Number.isInteger(task.position) && task.position >= 1 && task.position <= 5 ? task.position : 2 }));
    context.pendingEvents = context.pendingEvents.slice(0, 200)
      .filter((event) => event && typeof event.id === "string" && event.id && typeof event.quote === "string" && /^\d{4}-\d{2}-\d{2}$/.test(event.occurredAt || ""));
    context.pendingRests = context.pendingRests.slice(0, 200)
      .filter((rest) => rest && typeof rest.id === "string" && rest.id && typeof rest.quote === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rest.date || ""));
    context.turns = context.turns.slice(-10);
    context.clarifications = context.clarifications.slice(0, 5).filter((clarification) => clarification && clarification.candidates && Array.isArray(clarification.candidates));
    const useMock = body.useMock === true || !hasKey;

    const key = cacheKey(text, context, useMock);
    const hit = cacheGet(key);
    if (hit) return sendJson(res, 200, { ...hit, cached: true });

    let result;
    if (useMock) {
      const m = mock.extract(text, context);
      const errors = model.validateExtractItems(m.items, { ...context, text });
      result = errors.length
        ? { ok: false, error: { code: "bad_output", message: "本地识别结果未通过校验，这条没有录入。可以重试。" } }
        : { ok: true, mode: "mock", reply: m.reply, items: model.sanitizeItems(m.items, { ...context, text }) };
    } else {
      result = await model.extract(text, context, env);
    }
    if (result.ok) cacheSet(key, result);
    const status = result.ok ? 200 : ({ timeout: 504, quota: 429, auth: 502, network: 502, bad_output: 502, rate_limited: 429, unavailable: 503 }[result.error.code] || 502);
    sendJson(res, status, result);
  }

  const server = http.createServer(async (req, res) => {
    const ip = req.socket.remoteAddress || "local";
    const url = new URL(req.url, "http://localhost");
    try {
      if (url.pathname === "/api/health" && req.method === "GET") {
        return sendJson(res, 200, { ok: true, mode: hasKey ? "model" : "mock", model: hasKey ? (env.MODEL_NAME || "gpt-4o-mini") : null });
      }
      if (url.pathname === "/api/extract" && req.method === "POST") return await handleExtract(req, res, ip);
      if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); res.end(); return; }
      return await serveStatic(res, staticRoot, url.pathname);
    } catch (err) {
      console.error("[server]", err.message);
      if (!res.headersSent) sendJson(res, 500, { ok: false, error: { code: "unavailable", message: "服务内部错误。" } });
      else res.end();
    }
  });
  return server;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const env = process.env;
  const port = Number(env.PORT || 8123);
  const host = env.HOST || "127.0.0.1";
  const server = createApp({ env });
  server.listen(port, host, () => {
    console.log(`Personal Economy P0 · http://${host}:${port} · 抽取模式: ${env.MODEL_API_KEY ? "model(" + (env.MODEL_NAME || "gpt-4o-mini") + ")" : "mock(本地)"}`);
  });
}