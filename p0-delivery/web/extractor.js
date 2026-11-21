// 前端抽取客户端：只调服务端代理，绝不接触密钥。失败归一化，绝不把失败输入记为已录入。
// 路由自适应：本地 Node 服务用 /api；Qoder Sites 网关 Function（.qoder.zone / .qoder.website）用 /functions/v1/app/api。
const QODER_SITE_HOST = /\.qoder\.(zone|website)$/;
const BASE = typeof location !== "undefined" && QODER_SITE_HOST.test(location.hostname) ? "/functions/v1/app" : "";
export { QODER_SITE_HOST };
const CLIENT_TIMEOUT = 25000;

async function readJson(res) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("text/html")) return { ok: false, error: { code: "auth", message: "站点需登录后才能调用模型。当前仍可看样例与本地记录。" } };
  return res.json();
}

export async function health() {
  try {
    const res = await fetch(BASE + "/api/health", { cache: "no-store" });
    if (!res.ok) throw new Error("health");
    const j = await readJson(res);
    return j && j.ok ? j : { ok: false, mode: "offline" };
  } catch {
    return { ok: false, mode: "offline" };
  }
}

export async function send(text, context, { useMock = false } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CLIENT_TIMEOUT);
  try {
    const res = await fetch(BASE + "/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, context, useMock }),
      signal: ctrl.signal,
    });
    const json = await readJson(res).catch(() => null);
    if (!res.ok || !json || json.ok !== true) {
      const code = json?.error?.code || (res.status === 429 ? "quota" : "unavailable");
      const message = json?.error?.message || "模型服务暂不可用，这条没有录入。";
      return { ok: false, error: { code, message } };
    }
    return json;
  } catch (err) {
    const code = err && (err.name === "AbortError" || err.name === "TimeoutError") ? "timeout" : "network";
    return { ok: false, error: { code, message: code === "timeout" ? "模型响应超时，这条没有录入。可以重试或改用本地识别。" : "连不上模型服务，这条没有录入。可以重试或改用本地识别。" } };
  } finally {
    clearTimeout(timer);
  }
}