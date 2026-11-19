// 真实模型代理（OpenAI 兼容）。Key 只在服务端 env，绝不进响应/前端。
import { buildSystemPrompt } from "./prompt.mjs";

const OPS = new Set(["add_event", "add_rest", "add_task", "confirm_event", "deny_event", "delete_event", "confirm_rest", "deny_rest", "delete_rest", "complete_task", "delete_task"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function clampInt(v, lo, hi, dflt) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
}
function clamp01(v, dflt) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : dflt;
}

// 结构上强制 D11：剥掉任何分数字段；校验/归一化 items。
export function sanitizeItems(items, context) {
  const knownEventIds = new Set((context.pendingEvents || []).map((e) => e.id));
  const knownRestIds = new Set((context.pendingRests || []).map((r) => r.id));
  const knownTaskIds = new Set((context.openTasks || []).map((t) => t.id));
  const out = [];
  for (const raw of Array.isArray(items) ? items : []) {
    if (!raw || typeof raw !== "object" || !OPS.has(raw.op)) continue;
    const op = raw.op;
    if (op === "add_event") {
      const e = raw.event || {};
      const eventType = e.eventType === "emotion" ? "emotion" : "behavior";
      const polarity = eventType === "emotion" ? "neutral" : ["positive", "negative", "neutral"].includes(e.polarity) ? e.polarity : "neutral";
      if (!DATE_RE.test(e.occurredAt || "")) continue;
      out.push({ op, event: { eventType, polarity, intensity: clampInt(e.intensity, 1, 5, 2), occurredAt: e.occurredAt, quote: String(e.quote || context.text || "").slice(0, 200), tags: Array.isArray(e.tags) ? e.tags.slice(0, 8).map(String) : [], confidence: clamp01(e.confidence, 0.5) } });
    } else if (op === "add_rest") {
      const r = raw.rest || {};
      if (!DATE_RE.test(r.date || "")) continue;
      out.push({ op, rest: { date: r.date, quote: String(r.quote || context.text || "").slice(0, 200), confidence: clamp01(r.confidence, 0.5) } });
    } else if (op === "add_task") {
      const t = raw.task || {};
      if (!DATE_RE.test(t.dueAt || "") || !t.title) continue;
      out.push({ op, task: { title: String(t.title).slice(0, 80), dueAt: t.dueAt, position: clampInt(t.position, 1, 5, 2), confidence: clamp01(t.confidence, 0.5) } });
    } else if (op === "confirm_event" || op === "deny_event" || op === "delete_event") {
      if (!knownEventIds.has(raw.id)) continue;
      const item = { op, id: raw.id };
      if (op === "confirm_event" && DATE_RE.test(raw.occurredAt || "")) item.occurredAt = raw.occurredAt;
      out.push(item);
    } else if (op === "confirm_rest" || op === "deny_rest" || op === "delete_rest") {
      if (!knownRestIds.has(raw.id)) continue;
      const item = { op, id: raw.id };
      if (op === "confirm_rest" && DATE_RE.test(raw.date || "")) item.date = raw.date;
      out.push(item);
    } else if (op === "complete_task" || op === "delete_task") {
      if (!knownTaskIds.has(raw.id)) continue;
      const item = { op, id: raw.id };
      if (op === "complete_task" && DATE_RE.test(raw.doneAt || "")) item.doneAt = raw.doneAt;
      out.push(item);
    }
  }
  return out;
}

function classify(err, status, bodyText) {
  if (err && (err.name === "AbortError" || err.name === "TimeoutError")) return { code: "timeout", message: "模型响应超时，这条没有录入。可以重试或改用本地识别。" };
  if (status === 429 || status === 402 || /quota|insufficient|balance|credit|arrears|exceeded/i.test(bodyText || "")) return { code: "quota", message: "模型额度不足或限流，这条没有录入。样例与现有记录仍可查看。" };
  if (status === 401 || status === 403) return { code: "auth", message: "模型凭据无效，这条没有录入。" };
  if (err) return { code: "network", message: "连不上模型服务，这条没有录入。可以重试或改用本地识别。" };
  return { code: "unavailable", message: "模型服务暂不可用，这条没有录入。" };
}

export async function extract(text, context, env) {
  const base = (env.MODEL_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = env.MODEL_NAME || "gpt-4o-mini";
  const timeout = Number(env.MODEL_TIMEOUT_MS || 20000);
  const turns = (context.turns || []).slice(-10).map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "").slice(0, 1500) }));
  const body = {
    model,
    messages: [{ role: "system", content: buildSystemPrompt({ ...context, text }) }, ...turns, { role: "user", content: text }],
    temperature: 0.2,
  };
  if (String(env.MODEL_JSON_MODE ?? "1") !== "0") body.response_format = { type: "json_object" };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  let res, bodyText;
  try {
    res = await fetch(base + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.MODEL_API_KEY}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    bodyText = await res.text();
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, error: classify(err, 0, "") };
  }
  clearTimeout(timer);
  if (!res.ok) return { ok: false, error: classify(null, res.status, bodyText) };

  let parsed;
  try {
    const json = JSON.parse(bodyText);
    let content = json.choices?.[0]?.message?.content || "";
    content = content.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    parsed = JSON.parse(content);
  } catch {
    return { ok: false, error: { code: "bad_output", message: "模型返回格式异常，这条没有录入。可以重试。" } };
  }
  if (typeof parsed.reply !== "string" || !Array.isArray(parsed.items)) {
    return { ok: false, error: { code: "bad_output", message: "模型返回格式异常，这条没有录入。可以重试。" } };
  }
  return { ok: true, mode: "model", reply: parsed.reply, items: sanitizeItems(parsed.items, { ...context, text }) };
}