// Sites Edge Function 业务 handler（纯 JS，可注入依赖便于本地 fixture 测试）。
// 路由：/api/extract、/api/health（网关逻辑名 app，物理路径含后缀，按后缀匹配）。
// 真实路径：browser → 同源 Function → Qoder Cloud Agents（读平台 QODER_PAT，免自备 Key）。
// 无 QODER_PAT 或 useMock 时走本地 Mock（明确 mode:"mock"）。
import { createCloudAgentsClient, CloudAgentsError } from "./cloud-agents.mjs";
import { sanitizeItems } from "./model.mjs";
import { buildSystemPrompt } from "./prompt.mjs";
import * as mock from "./mock.mjs";

// 来源：sites get_context runtime.cloudAgents.apiOrigin（cn/prod），仅服务端配置。
const QCA_ORIGIN = "https://api.qoder.com.cn";
const POLL_MS = 700;
const EXTRACT_BUDGET_MS = 20000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function json(status, obj) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}
function tryParse(text) {
  try {
    const t = String(text).replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    const o = JSON.parse(t);
    return typeof o.reply === "string" && Array.isArray(o.items) ? o : null;
  } catch { return null; }
}
function mapError(e) {
  const code = e instanceof CloudAgentsError ? e.code : "network";
  const status = e instanceof CloudAgentsError ? e.status : 0;
  if (code === "ai_not_configured" || code === "ai_configuration_invalid") return { code: "unavailable", message: "站点 Qoder 后端未配置，这条没有录入。" };
  if (code === "ai_timeout" || status === 504) return { code: "timeout", message: "模型响应超时，这条没有录入。可以重试或改用本地识别。" };
  if (status === 429 || status === 402) return { code: "quota", message: "模型额度不足或限流，这条没有录入。样例与现有记录仍可查看。" };
  if (status === 401 || status === 403) return { code: "auth", message: "模型凭据无效，这条没有录入。" };
  if (code === "ai_bad_output") return { code: "bad_output", message: "模型返回格式异常，这条没有录入。可以重试。" };
  return { code: "network", message: "连不上模型服务，这条没有录入。可以重试或改用本地识别。" };
}

export function createHandler({ getToken = () => globalThis.Deno?.env.get("QODER_PAT"), fetchImpl = globalThis.fetch, origin = QCA_ORIGIN, now = () => Date.now() } = {}) {
  const client = createCloudAgentsClient({ origin, getToken, fetchImpl });
  const cache = new Map();
  let bootstrap = null;

  function ensureBootstrap() {
    if (!bootstrap) {
      bootstrap = (async () => {
        const models = await client.request("/api/v1/cloud/models");
        const list = models.data || models.models || [];
        const model = (list.find((m) => m.enabled !== false) || list[0] || {}).id;
        if (!model) throw new CloudAgentsError("ai_not_configured", 503, "not_sent");
        const agent = await client.request("/api/v1/cloud/agents", { method: "POST", idempotencyKey: "pe-extract-agent-v1", body: { name: "personal-economy-extractor", model, system: buildSystemPrompt({}), tools: [], metadata: { app: "personal-economy" } } });
        const env = await client.request("/api/v1/cloud/environments", { method: "POST", body: { name: "pe-extract-env", config: { type: "cloud" }, metadata: { app: "personal-economy" } } });
        return { agentId: agent.id, environmentId: env.id };
      })().catch((e) => { bootstrap = null; throw e; });
    }
    return bootstrap;
  }

  async function qcaExtract(text, context) {
    const { agentId, environmentId } = await ensureBootstrap();
    // 每次请求独立 Session，避免跨访客共享对话历史（隐私隔离）。
    const session = await client.request("/api/v1/cloud/sessions", { method: "POST", body: { agent: agentId, environment_id: environmentId } });
    const prompt = `上下文JSON：${JSON.stringify({ today: context.today, openTasks: context.openTasks || [], pendingEvents: context.pendingEvents || [], pendingRests: context.pendingRests || [] })}\n用户原句：${text}\n只输出 {"reply","items"} 严格 JSON。`;
    await client.request(`/api/v1/cloud/sessions/${session.id}/events`, { method: "POST", body: { events: [{ type: "user.message", content: [{ type: "text", text: prompt }] }] } });
    const deadline = now() + EXTRACT_BUDGET_MS;
    while (now() < deadline) {
      const ev = await client.request(`/api/v1/cloud/sessions/${session.id}/events?order=asc&limit=100`);
      const msgs = (ev.data || []).filter((e) => e.type === "agent.message");
      const last = msgs[msgs.length - 1];
      if (last) {
        const txt = (last.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
        const parsed = tryParse(txt);
        if (parsed) return { ok: true, mode: "model", reply: parsed.reply, items: sanitizeItems(parsed.items, { ...context, text }) };
      }
      await sleep(POLL_MS);
    }
    throw new CloudAgentsError("ai_timeout", 504, "unknown");
  }

  return async function handler(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    const token = (() => { try { return getToken(); } catch { return undefined; } })();
    if (/\/api\/health$/.test(path) && request.method === "GET") {
      return json(200, { ok: true, mode: token ? "model" : "mock", model: token ? "qca" : null });
    }
    if (/\/api\/extract$/.test(path) && request.method === "POST") {
      let body;
      try { body = await request.json(); } catch { return json(400, { ok: false, error: { code: "invalid_request", message: "请求格式错误。" } }); }
      const text = typeof body.text === "string" ? body.text.trim() : "";
      if (!text || text.length > 1500) return json(400, { ok: false, error: { code: "invalid_request", message: "消息为空或超过 1500 字。" } });
      const context = body.context && typeof body.context === "object" ? body.context : {};
      if (!context.today) context.today = new Date().toISOString().slice(0, 10);
      const useMock = body.useMock === true || !token;
      const key = JSON.stringify([text, context.today, (context.pendingEvents || []).map((e) => e.id), (context.pendingRests || []).map((r) => r.id), useMock]);
      const hit = cache.get(key);
      if (hit && now() - hit.at < 600000) return json(200, { ...hit.payload, cached: true });
      let result;
      if (useMock) {
        const m = mock.extract(text, context);
        result = { ok: true, mode: "mock", reply: m.reply, items: m.items };
      } else {
        try { result = await qcaExtract(text, context); }
        catch (e) { result = { ok: false, error: mapError(e) }; }
      }
      if (result.ok) cache.set(key, { at: now(), payload: result });
      const status = result.ok ? 200 : ({ timeout: 504, quota: 429, auth: 502, network: 502, bad_output: 502, unavailable: 503 }[result.error.code] || 502);
      return json(status, result);
    }
    return json(404, { ok: false, error: { code: "not_found", message: "未知路径。" } });
  };
}

export const handler = createHandler();