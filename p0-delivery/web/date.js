// 中文相对日期解析：记录用过去时，目标到期用将来时。纯函数，按 UTC 日历运算。
import { fmtDate, parseDate, shiftDate, weekStartOf } from "./engine.js";

const WD = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };
const CN = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

function cnNumber(value) {
  return CN[value] != null ? CN[value] : Number(value);
}

export function resolveDate(text, today) {
  const t = String(text).trim();
  let m = t.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
  m = t.match(/(\d{1,2})月(\d{1,2})日/);
  if (m) {
    const y = Number(today.slice(0, 4));
    let iso = `${y}-${String(m[1]).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
    if (parseDate(iso) > parseDate(today)) iso = `${y - 1}-${String(m[1]).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
    return iso;
  }
  if (/大前天/.test(t)) return shiftDate(today, -3);
  if (/前天/.test(t)) return shiftDate(today, -2);
  if (/昨天|昨日/.test(t)) return shiftDate(today, -1);
  if (/今天|今日/.test(t)) return today;
  m = t.match(/([0-9一二两三四五六七八九十]+)\s*天前/);
  if (m) {
    const n = cnNumber(m[1]);
    if (Number.isFinite(n)) return shiftDate(today, -n);
  }
  m = t.match(/上(?:周|礼拜)([一二三四五六日天])/);
  if (m) return shiftDate(weekStartOf(today), (WD[m[1]] - 1) - 7);
  if (/上(?:周|礼拜)/.test(t)) return shiftDate(weekStartOf(today), -7);
  m = t.match(/(?:本(?:周|礼拜)|周|礼拜)([一二三四五六日天])/);
  if (m) {
    let iso = shiftDate(weekStartOf(today), WD[m[1]] - 1);
    if (parseDate(iso) > parseDate(today)) iso = shiftDate(iso, -7);
    return iso;
  }
  return null;
}

// 目标到期日：默认取不早于今天的最近一次；显式 ISO 原样返回，由服务端约束 ≥ today。
export function resolveDueDate(text, today) {
  const t = String(text).trim();
  let m = t.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
  m = t.match(/(\d{1,2})月(\d{1,2})日/);
  if (m) {
    const y = Number(today.slice(0, 4));
    let iso = `${y}-${String(m[1]).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
    if (parseDate(iso) < parseDate(today)) iso = `${y + 1}-${String(m[1]).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
    return iso;
  }
  if (/大后天/.test(t)) return shiftDate(today, 3);
  if (/后天/.test(t)) return shiftDate(today, 2);
  if (/明天|明日/.test(t)) return shiftDate(today, 1);
  if (/今天|今日/.test(t)) return today;
  m = t.match(/([0-9一二两三四五六七八九十]+)\s*天(?:后|以后|之后)/);
  if (m) {
    const n = cnNumber(m[1]);
    if (Number.isFinite(n)) return shiftDate(today, n);
  }
  m = t.match(/([0-9一二两三四五六七八九十]+)\s*(?:周|礼拜)(?:后|以后|之后)/);
  if (m) {
    const n = cnNumber(m[1]);
    if (Number.isFinite(n)) return shiftDate(today, n * 7);
  }
  m = t.match(/下(?:周|礼拜)([一二三四五六日天])/);
  if (m) return shiftDate(weekStartOf(today), 7 + WD[m[1]] - 1);
  m = t.match(/(?:本(?:周|礼拜)|这(?:周|礼拜)|周|礼拜)([一二三四五六日天])/);
  if (m) {
    let iso = shiftDate(weekStartOf(today), WD[m[1]] - 1);
    if (parseDate(iso) < parseDate(today)) iso = shiftDate(iso, 7);
    return iso;
  }
  if (/月底|月末/.test(t)) {
    const [y, mo] = today.split("-").map(Number);
    const last = new Date(Date.UTC(y, mo, 0));
    return fmtDate(last.getTime());
  }
  return null;
}

export function hasExplicitDate(text, today) {
  return resolveDate(text, today) != null || resolveDueDate(text, today) != null;
}
