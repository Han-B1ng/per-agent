// 本地持久化：个人记录与样例严格分离。v2 原地迁移 v1，迁移前保留原键以便回退。
const KEY = "pe.personal.v2";
const LEGACY_KEY = "pe.personal.v1";
const PERSONAL_VERSION = 2;

export function emptyPersonal() {
  return { version: 2, events: [], rests: [], tasks: [], chat: [], audit: [] };
}

const isDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isId = (v) => typeof v === "string" && v.length > 0;

function normalizeEvent(e) {
  if (!e || e.kind !== "event" || !isId(e.id) || !isDate(e.occurredAt) || typeof e.quote !== "string") return null;
  return { ...e, eventType: e.eventType === "emotion" ? "emotion" : "behavior", polarity: ["positive", "negative", "neutral"].includes(e.polarity) ? e.polarity : "neutral", intensity: Number.isFinite(e.intensity) ? Math.max(1, Math.min(5, Math.round(e.intensity))) : 2, tags: Array.isArray(e.tags) ? e.tags.filter((t) => typeof t === "string") : [], confidence: Number.isFinite(e.confidence) ? Math.max(0, Math.min(1, e.confidence)) : 0.5, status: e.status === "pending" ? "pending" : "confirmed", createdAt: typeof e.createdAt === "string" ? e.createdAt : new Date().toISOString(), deletedAt: e.deletedAt ?? null };
}
function normalizeRest(r) {
  if (!r || r.kind !== "rest" || !isId(r.id) || !isDate(r.date) || typeof r.quote !== "string") return null;
  return { ...r, confidence: Number.isFinite(r.confidence) ? Math.max(0, Math.min(1, r.confidence)) : 0.5, status: r.status === "pending" ? "pending" : "confirmed", createdAt: typeof r.createdAt === "string" ? r.createdAt : new Date().toISOString(), deletedAt: r.deletedAt ?? null };
}
function normalizeTask(t) {
  if (!t || t.kind !== "task" || !isId(t.id) || typeof t.title !== "string" || !isDate(t.dueAt)) return null;
  return { ...t, position: Number.isFinite(t.position) ? Math.max(1, Math.min(5, Math.round(t.position))) : 2, status: ["open", "done", "paused"].includes(t.status) ? t.status : "open", createdAt: typeof t.createdAt === "string" ? t.createdAt : new Date().toISOString(), doneAt: t.doneAt ?? null, deletedAt: t.deletedAt ?? null };
}
function normalizeMessage(m) {
  if (!m || !isId(m.id) || typeof m.text !== "string" || !["user", "assistant"].includes(m.role)) return null;
  const out = { ...m, pending: Array.isArray(m.pending) ? m.pending.filter(isId) : undefined };
  if (["model", "mock", "local"].includes(m.mode)) out.mode = m.mode;
  else delete out.mode;
  if (Array.isArray(m.clarifications)) {
    out.clarifications = m.clarifications.map(normalizeClarification).filter(Boolean);
    if (!out.clarifications.length) delete out.clarifications;
  } else {
    delete out.clarifications;
  }
  if (m.receipt && typeof m.receipt === "object") {
    const statuses = ["applied", "pending", "clarification", "noop", "empty"];
    out.receipt = {
      status: statuses.includes(m.receipt.status) ? m.receipt.status : "empty",
      changed: Math.max(0, Number(m.receipt.changed) || 0),
      pending: Math.max(0, Number(m.receipt.pending) || 0),
      noop: Math.max(0, Number(m.receipt.noop) || 0),
      clarifications: Math.max(0, Number(m.receipt.clarifications) || 0),
    };
  } else {
    delete out.receipt;
  }
  return out;
}

function normalizeClarification(c) {
  if (!c || !isId(c.id) || typeof c.question !== "string") return null;
  if (!["task_target", "record_target"].includes(c.kind)) return null;
  if (!["pending", "resolved", "cancelled"].includes(c.status)) return null;
  const intents = ["complete_task", "delete_task", "confirm_event", "deny_event", "delete_event", "confirm_rest", "deny_rest", "delete_rest"];
  if (!intents.includes(c.intent)) return null;
  const candidates = (Array.isArray(c.candidates) ? c.candidates : []).slice(0, 5).map((candidate) => {
    if (!candidate || !isId(candidate.id) || typeof candidate.label !== "string" || !candidate.label) return null;
    const item = { id: candidate.id, label: candidate.label.slice(0, 120), kind: ["task", "event", "rest"].includes(candidate.kind) ? candidate.kind : "task" };
    if (typeof candidate.title === "string") item.title = candidate.title.slice(0, 120);
    if (isDate(candidate.dueAt)) item.dueAt = candidate.dueAt;
    if (typeof candidate.quote === "string") item.quote = candidate.quote.slice(0, 200);
    if (isDate(candidate.date)) item.date = candidate.date;
    return item;
  }).filter(Boolean);
  if (!candidates.length) return null;
  const out = {
    id: c.id,
    kind: c.kind,
    intent: c.intent,
    question: c.question.slice(0, 200),
    sourceText: typeof c.sourceText === "string" ? c.sourceText.slice(0, 200) : "",
    candidates,
    status: c.status,
    createdAt: typeof c.createdAt === "string" ? c.createdAt : new Date().toISOString(),
  };
  if (isDate(c.answerDate)) out.answerDate = c.answerDate;
  if (typeof c.resolvedAt === "string") out.resolvedAt = c.resolvedAt;
  if (c.resolution && typeof c.resolution === "object") {
    out.resolution = {
      text: typeof c.resolution.text === "string" ? c.resolution.text.slice(0, 200) : "",
      ...(typeof c.resolution.targetId === "string" ? { targetId: c.resolution.targetId } : {}),
      ...(typeof c.resolution.op === "string" ? { op: c.resolution.op } : {}),
    };
  }
  return out;
}
function normalize(p) {
  return {
    version: 2,
    events: (Array.isArray(p.events) ? p.events : []).map(normalizeEvent).filter(Boolean),
    rests: (Array.isArray(p.rests) ? p.rests : []).map(normalizeRest).filter(Boolean),
    tasks: (Array.isArray(p.tasks) ? p.tasks : []).map(normalizeTask).filter(Boolean),
    chat: (Array.isArray(p.chat) ? p.chat : []).map(normalizeMessage).filter(Boolean),
    audit: (Array.isArray(p.audit) ? p.audit : []).filter((a) => a && isId(a.id) && isId(a.targetId) && typeof a.action === "string"),
  };
}

const isObject = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const isLedger = (v) => isObject(v) && ["events", "rests", "tasks", "chat", "audit"].some((key) => Array.isArray(v[key]));

// 恢复沿用存储层的 normalize：v1 备份走同一条迁移，未知字段和坏记录按现有规则过滤。
export function parsePersonalBackup(text) {
  if (typeof text !== "string" || !text.trim()) return { ok: false, code: "invalid_file", message: "文件无效：文件为空或无法读取。" };
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, code: "invalid_file", message: "文件无效：不是有效的 JSON。" };
  }
  if (!isObject(data)) return { ok: false, code: "invalid_file", message: "文件无效：没有找到账本数据。" };
  if (data.scope != null && data.scope !== "personal") return { ok: false, code: "invalid_file", message: "文件无效：这不是个人账本备份。" };
  const ledger = isObject(data.records) ? data.records : data;
  if (!isLedger(ledger)) return { ok: false, code: "invalid_file", message: "文件无效：缺少账本字段。" };
  const version = ledger.version == null ? 1 : ledger.version;
  if (!Number.isInteger(version) || version < 1) return { ok: false, code: "invalid_file", message: "文件无效：版本号无法识别。" };
  if (version > PERSONAL_VERSION) return { ok: false, code: "unsupported_version", message: `版本暂不支持：备份为 v${version}，当前支持 v1 与 v${PERSONAL_VERSION}。` };
  return { ok: true, version, ledger: normalize(ledger) };
}

export function loadPersonal() {
  try {
    const current = localStorage.getItem(KEY);
    if (current) return normalize(JSON.parse(current));
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (!legacy) return emptyPersonal();
    const migrated = normalize(JSON.parse(legacy));
    localStorage.setItem(KEY, JSON.stringify(migrated));
    return migrated;
  } catch {
    return emptyPersonal();
  }
}

export function savePersonal(p) {
  try {
    localStorage.setItem(KEY, JSON.stringify(normalize(p)));
    return true;
  } catch {
    // 存储不可用（隐私模式/配额）时返回失败，由调用方提示未保存
    return false;
  }
}

export function clearPersonal() {
  try { localStorage.removeItem(KEY); localStorage.removeItem(LEGACY_KEY); } catch {}
  return emptyPersonal();
}

let cachedClientId = "";
export function getClientId() {
  if (cachedClientId) return cachedClientId;
  try {
    cachedClientId = localStorage.getItem("pe.client.v1") || genId("client");
    localStorage.setItem("pe.client.v1", cachedClientId);
  } catch {
    cachedClientId = genId("client");
  }
  return cachedClientId;
}

let seq = 0;
export function genId(prefix) {
  try {
    const cryptoApi = globalThis.crypto;
    if (cryptoApi && typeof cryptoApi.randomUUID === "function") return `${prefix}_${cryptoApi.randomUUID()}`;
  } catch {}
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq.toString(36)}`;
}