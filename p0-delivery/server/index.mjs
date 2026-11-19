// 唯一服务端职责：模型代理 + 静态托管。零 npm 依赖（node 内置）。
import http from "node:http";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
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

export function createApp({ env = {}, staticRoot = path.join(REPO, "web"), legacyRoot = path.join(REPO, "legacy") } = {}) {
  const hasKey = Boolean(env.MODEL_API_KEY);
  const rate = new Map(); // ip -> {count, reset}
  const cache = new Map(); // key -> {at, payload}
  const CACHE_TTL = 10 * 60 * 1000;
  const RATE_MAX = 30, RATE_WINDOW = 60 * 1000;

  function rateLimited(ip) {
    const now = Date.now();
    let r = rate.get(ip);
    if (!r || now > r.reset) { r = { count: 0, reset: now + RATE_WINDOW }; rate.set(ip, r); }
    r.count += 1;
    return r.count > RATE_MAX;
  }
  function cacheKey(text, context, useMock) {
    const effective = { today: context.today, clientId: context.clientId || "", openTasks: context.openTasks || [], pendingEvents: context.pendingEvents || [], pendingRests: context.pendingRests || [], turns: context.turns || [] };
    return createHash("sha256").update(JSON.stringify({ text, context: effective, useMock })).digest("hex");
  }
  function cacheGet(key) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL) return hit.payload;
    if (hit) cache.delete(key);
    return null;
  }

  async function serveStatic(res, root, urlPath) {
    let rel = decodeURIComponent(urlPath);
    if (rel.endsWith("/")) rel += "index.html";
    const file = path.resolve(root, "." + rel);
    if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(404); res.end("not found"); return; }
    try {
      const st = await stat(file);
      if (!st.isFile()) { res.writeHead(404); res.end("not found"); return; }
      const data = await readFile(file);
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
      res.end(data);
    } catch {
      res.writeHead(404); res.end("not found");
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
    const useMock = body.useMock === true || !hasKey;

    const key = cacheKey(text, context, useMock);
    const hit = cacheGet(key);
    if (hit) return sendJson(res, 200, { ...hit, cached: true });

    let result;
    if (useMock) {
      const m = mock.extract(text, context);
      result = { ok: true, mode: "mock", reply: m.reply, items: m.items };
    } else {
      result = await model.extract(text, context, env);
    }
    if (result.ok) cache.set(key, { at: Date.now(), payload: result });
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
      if (url.pathname.startsWith("/legacy/")) return await serveStatic(res, legacyRoot, url.pathname.slice("/legacy".length) || "/");
      if (url.pathname === "/legacy") return await serveStatic(res, legacyRoot, "/");
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
    console.log(`Personal Economy P0 · http://${host}:${port} · 抽取模式: ${env.MODEL_API_KEY ? "model(" + (env.MODEL_NAME || "gpt-4o-mini") + ")" : "mock(本地)"} · 旧原型 /legacy/`);
  });
}