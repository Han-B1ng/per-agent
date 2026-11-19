// 本地持久化：个人记录与样例严格分离。v2 原地迁移 v1，迁移前保留原键以便回退。
const KEY = "pe.personal.v2";
const LEGACY_KEY = "pe.personal.v1";

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
  return { ...m, pending: Array.isArray(m.pending) ? m.pending.filter(isId) : undefined };
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
  } catch {
    // 存储不可用（隐私模式/配额）时保持内存态，不阻断交互
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
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq.toString(36)}`;
}