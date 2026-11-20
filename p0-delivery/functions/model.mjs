// 真实模型代理（OpenAI 兼容）。Key 只在服务端 env，绝不进响应/前端。
// Agent 协议 v0.1：模型提出操作，应用校验、确认与写入；模型回复不是入账凭证。
import { buildSystemPrompt } from "./prompt.mjs";
import { isVaguePastItem } from "./agent-protocol.js";

const OPS = new Set(["add_event", "add_rest", "add_task", "confirm_event", "deny_event", "delete_event", "confirm_rest", "deny_rest", "delete_rest", "complete_task", "delete_task", "request_clarification"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CLARIFICATION_KINDS = new Set(["task_target", "record_target"]);
const TASK_INTENTS = new Set(["complete_task", "delete_task"]);
const EVENT_INTENTS = new Set(["confirm_event", "deny_event", "delete_event"]);
const REST_INTENTS = new Set(["confirm_rest", "deny_rest", "delete_rest"]);
const FUTURE_HINT = /周[一二三四五六日天]|下周|本周|这周|礼拜|明天|后天|大后天|\d{1,2}月\d{1,2}日|\d{4}-\d{1,2}-\d{1,2}|\d+\s*天(?:后|以后|之后)|\d+\s*(?:周|礼拜)(?:后|以后|之后)|月底|月末/;
const MAX_CANDIDATES = 5;

function validDate(value) {
  if (!DATE_RE.test(value || "")) return false;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10) === value;
}
function validNumber(value, lo, hi, integer = false) {
  return typeof value === "number" && Number.isFinite(value) && value >= lo && value <= hi && (!integer || Number.isInteger(value));
}
function notFuture(value, today) {
  return validDate(value) && (!today || value <= today);
}
function notPast(value, today) {
  return validDate(value) && (!today || value >= today);
}
function text(value, limit) {
  return typeof value === "string" ? value.slice(0, limit) : "";
}

export function validateExtractItems(items, context) {
  const errors = [];
  const today = context.today || "";
  const pendingEvents = new Set((context.pendingEvents || []).map((e) => e.id));
  const pendingRests = new Set((context.pendingRests || []).map((r) => r.id));
  const openTasks = new Set((context.openTasks || []).map((t) => t.id));
  for (const [index, raw] of (Array.isArray(items) ? items : []).entries()) {
    const at = `items[${index}]`;
    if (!raw || typeof raw !== "object" || !OPS.has(raw.op)) { errors.push(`${at}: 无效操作`); continue; }
    if (raw.op === "add_event") {
      const e = raw.event;
      if (!e || typeof e !== "object") { errors.push(`${at}: event 缺失`); continue; }
      if (!["behavior", "emotion"].includes(e.eventType)) errors.push(`${at}: eventType 无效`);
      if (e.eventType === "behavior" && !["positive", "negative", "neutral"].includes(e.polarity)) errors.push(`${at}: polarity 无效`);
      if (!validNumber(e.intensity, 1, 5, true)) errors.push(`${at}: intensity 无效`);
      if (!notFuture(e.occurredAt, today)) errors.push(`${at}: occurredAt 无效或晚于今天`);
      if (typeof e.quote !== "string" || !e.quote.trim()) errors.push(`${at}: quote 无效`);
      if (!validNumber(e.confidence, 0, 1)) errors.push(`${at}: confidence 无效`);
      if (e.tags != null && (!Array.isArray(e.tags) || e.tags.some((tag) => typeof tag !== "string"))) errors.push(`${at}: tags 无效`);
    } else if (raw.op === "add_rest") {
      const r = raw.rest;
      if (!r || typeof r !== "object") { errors.push(`${at}: rest 缺失`); continue; }
      if (!notFuture(r.date, today)) errors.push(`${at}: date 无效或晚于今天`);
      if (typeof r.quote !== "string" || !r.quote.trim()) errors.push(`${at}: quote 无效`);
      if (!validNumber(r.confidence, 0, 1)) errors.push(`${at}: confidence 无效`);
    } else if (raw.op === "add_task") {
      const task = raw.task;
      if (!task || typeof task !== "object") { errors.push(`${at}: task 缺失`); continue; }
      if (typeof task.title !== "string" || !task.title.trim()) errors.push(`${at}: title 无效`);
      if (!notPast(task.dueAt, today)) errors.push(`${at}: dueAt 无效或早于今天`);
      if (context.text && !FUTURE_HINT.test(String(context.text))) errors.push(`${at}: 新增目标缺少明确到期日`);
      if (!validNumber(task.position, 1, 5, true)) errors.push(`${at}: position 无效`);
      if (!validNumber(task.confidence, 0, 1)) errors.push(`${at}: confidence 无效`);
    } else if (["confirm_event", "deny_event", "delete_event"].includes(raw.op)) {
      if (typeof raw.id !== "string" || !pendingEvents.has(raw.id)) errors.push(`${at}: 事件引用不可处理`);
      if (raw.occurredAt != null && !notFuture(raw.occurredAt, today)) errors.push(`${at}: occurredAt 无效或晚于今天`);
    } else if (["confirm_rest", "deny_rest", "delete_rest"].includes(raw.op)) {
      if (typeof raw.id !== "string" || !pendingRests.has(raw.id)) errors.push(`${at}: 休息引用不可处理`);
      if (raw.date != null && !notFuture(raw.date, today)) errors.push(`${at}: date 无效或晚于今天`);
    } else if (["complete_task", "delete_task"].includes(raw.op)) {
      if (typeof raw.id !== "string" || !openTasks.has(raw.id)) errors.push(`${at}: 目标引用不可处理`);
      if (raw.doneAt != null && !notFuture(raw.doneAt, today)) errors.push(`${at}: doneAt 无效或晚于今天`);
    } else if (raw.op === "request_clarification") {
      const c = raw.clarification;
      if (!c || typeof c !== "object") { errors.push(`${at}: clarification 缺失`); continue; }
      if (!CLARIFICATION_KINDS.has(c.kind)) errors.push(`${at}: clarification.kind 无效`);
      if (typeof c.question !== "string" || !c.question.trim()) errors.push(`${at}: clarification.question 无效`);
      if (typeof c.sourceText !== "string" || !c.sourceText.trim()) errors.push(`${at}: clarification.sourceText 无效`);
      if (!Array.isArray(c.candidates) || c.candidates.length < 1 || c.candidates.length > MAX_CANDIDATES) {
        errors.push(`${at}: clarification.candidates 数量无效`);
        continue;
      }
      const ids = new Set();
      for (const candidate of c.candidates) {
        if (!candidate || typeof candidate !== "object" || typeof candidate.id !== "string" || !candidate.id) {
          errors.push(`${at}: 候选 ID 无效`);
          continue;
        }
        if (ids.has(candidate.id)) errors.push(`${at}: 候选 ID 重复`);
        ids.add(candidate.id);
        if (typeof candidate.label !== "string" && typeof candidate.title !== "string" && typeof candidate.quote !== "string") {
          errors.push(`${at}: 候选缺少可读标签`);
        }
        if (c.kind === "task_target" && !openTasks.has(candidate.id)) errors.push(`${at}: 候选目标不可处理`);
        if (c.kind === "record_target") {
          const pool = REST_INTENTS.has(c.intent) ? pendingRests : pendingEvents;
          if (!pool.has(candidate.id)) errors.push(`${at}: 候选记录不可处理`);
        }
      }
      if (c.kind === "task_target" && !TASK_INTENTS.has(c.intent)) errors.push(`${at}: 目标澄清 intent 无效`);
      if (c.kind === "record_target" && !EVENT_INTENTS.has(c.intent) && !REST_INTENTS.has(c.intent)) errors.push(`${at}: 记录澄清 intent 无效`);
    }
  }
  return errors;
}

function clampInt(v, lo, hi, dflt) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
}
function clamp01(v, dflt) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : dflt;
}
function vagueDateConfidence(confidence, quote, context) {
  return isVaguePastItem(quote, context.text) ? Math.min(confidence, 0.4) : confidence;
}
function sanitizeClarification(c, context) {
  if (!c || !CLARIFICATION_KINDS.has(c.kind)) return null;
  const openTasks = new Map((context.openTasks || []).map((task) => [task.id, task]));
  const pendingEvents = new Map((context.pendingEvents || []).map((event) => [event.id, event]));
  const pendingRests = new Map((context.pendingRests || []).map((rest) => [rest.id, rest]));
  const pool = c.kind === "task_target" ? openTasks : REST_INTENTS.has(c.intent) ? pendingRests : pendingEvents;
  const candidates = (Array.isArray(c.candidates) ? c.candidates : [])
    .slice(0, MAX_CANDIDATES)
    .map((candidate) => {
      const record = pool.get(candidate?.id);
      if (!record) return null;
      if (c.kind === "task_target") {
        return {
          id: record.id,
          label: text(candidate.label || record.title, 120),
          kind: "task",
          title: text(record.title, 80),
          dueAt: record.dueAt,
        };
      }
      const isRest = REST_INTENTS.has(c.intent);
      const date = isRest ? record.date : record.occurredAt;
      return {
        id: record.id,
        label: text(candidate.label || record.quote, 120),
        kind: isRest ? "rest" : "event",
        quote: text(record.quote, 200),
        date,
      };
    })
    .filter(Boolean);
  if (!candidates.length) return null;
  return {
    kind: c.kind,
    intent: c.intent,
    question: text(c.question, 200).trim(),
    sourceText: text(c.sourceText, 200).trim(),
    candidates,
  };
}

// 结构上强制 D11：剥掉任何分数字段；校验/归一化 items。
export function sanitizeItems(items, context) {
  const knownEventIds = new Set((context.pendingEvents || []).map((e) => e.id));
  const knownRestIds = new Set((context.pendingRests || []).map((r) => r.id));
  const knownTaskIds = new Set((context.openTasks || []).map((t) => t.id));
  const today = context.today || "";
  const out = [];
  for (const raw of Array.isArray(items) ? items : []) {
    if (!raw || typeof raw !== "object" || !OPS.has(raw.op)) continue;
    const op = raw.op;
    if (op === "add_event") {
      const e = raw.event || {};
      const eventType = e.eventType === "emotion" ? "emotion" : "behavior";
      const polarity = eventType === "emotion" ? "neutral" : ["positive", "negative", "neutral"].includes(e.polarity) ? e.polarity : "neutral";
      if (!DATE_RE.test(e.occurredAt || "")) continue;
      out.push({ op, event: { eventType, polarity, intensity: clampInt(e.intensity, 1, 5, 2), occurredAt: e.occurredAt, quote: text(e.quote || context.text || "", 200), tags: Array.isArray(e.tags) ? e.tags.slice(0, 8).map(String) : [], confidence: vagueDateConfidence(clamp01(e.confidence, 0.5), e.quote || "", context) } });
    } else if (op === "add_rest") {
      const r = raw.rest || {};
      if (!DATE_RE.test(r.date || "")) continue;
      out.push({ op, rest: { date: r.date, quote: text(r.quote || context.text || "", 200), confidence: vagueDateConfidence(clamp01(r.confidence, 0.5), r.quote || "", context) } });
    } else if (op === "add_task") {
      const task = raw.task || {};
      if (!DATE_RE.test(task.dueAt || "") || !task.title) continue;
      out.push({ op, task: { title: text(task.title, 80), dueAt: task.dueAt, position: clampInt(task.position, 1, 5, 2), confidence: clamp01(task.confidence, 0.5) } });
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
    } else if (op === "request_clarification") {
      const clarification = sanitizeClarification(raw.clarification, context);
      if (clarification) out.push({ op, clarification });
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

export async function extract(textValue, context, env) {
  const base = (env.MODEL_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = env.MODEL_NAME || "gpt-4o-mini";
  const timeout = Number(env.MODEL_TIMEOUT_MS || 20000);
  const turns = (context.turns || []).slice(-10).map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "").slice(0, 1500) }));
  const body = {
    model,
    messages: [{ role: "system", content: buildSystemPrompt({ ...context, text: textValue }) }, ...turns, { role: "user", content: textValue }],
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
  const errors = validateExtractItems(parsed.items, { ...context, text: textValue });
  if (errors.length) return { ok: false, error: { code: "bad_output", message: `模型返回未通过校验：${errors[0]}。这条没有录入。` } };
  return { ok: true, mode: "model", reply: parsed.reply, items: sanitizeItems(parsed.items, { ...context, text: textValue }) };
}
