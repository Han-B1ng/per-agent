// 本地持久化：个人记录与样例严格分离。样例为只读预置（不写存储），个人存 localStorage。
const KEY = "pe.personal.v1";

export function emptyPersonal() {
  return { events: [], rests: [], tasks: [], chat: [] };
}

export function loadPersonal() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyPersonal();
    const p = JSON.parse(raw);
    return {
      events: Array.isArray(p.events) ? p.events : [],
      rests: Array.isArray(p.rests) ? p.rests : [],
      tasks: Array.isArray(p.tasks) ? p.tasks : [],
      chat: Array.isArray(p.chat) ? p.chat : [],
    };
  } catch {
    return emptyPersonal();
  }
}

export function savePersonal(p) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // 存储不可用（隐私模式/配额）时保持内存态，不阻断交互
  }
}

export function clearPersonal() {
  try { localStorage.removeItem(KEY); } catch {}
  return emptyPersonal();
}

let seq = 0;
export function genId(prefix) {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq.toString(36)}`;
}