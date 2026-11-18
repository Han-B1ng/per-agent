// 前端抽取客户端：只调服务端代理，绝不接触密钥。失败归一化，绝不把失败输入记为已录入。
const CLIENT_TIMEOUT = 25000;

export async function health() {
  try {
    const res = await fetch("/api/health", { cache: "no-store" });
    if (!res.ok) throw new Error("health");
    return await res.json();
  } catch {
    return { ok: false, mode: "offline" };
  }
}

export async function send(text, context, { useMock = false } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CLIENT_TIMEOUT);
  try {
    const res = await fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, context, useMock }),
      signal: ctrl.signal,
    });
    const json = await res.json().catch(() => null);
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