// 本地持久化：个人记录与样例严格分离。v2 原地迁移 v1，迁移前保留原键以便回退。
const KEY = "pe.personal.v2";
const LEGACY_KEY = "pe.personal.v1";

export function emptyPersonal() {
  return { version: 2, events: [], rests: [], tasks: [], chat: [], audit: [] };
}

function normalize(p) {
  return {
    version: 2,
    events: Array.isArray(p.events) ? p.events : [],
    rests: Array.isArray(p.rests) ? p.rests : [],
    tasks: Array.isArray(p.tasks) ? p.tasks : [],
    chat: Array.isArray(p.chat) ? p.chat : [],
    audit: Array.isArray(p.audit) ? p.audit : [],
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