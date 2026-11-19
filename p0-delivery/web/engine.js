// 个人成长指数引擎 —— 前端纯函数（D11）：确定性、同输入同输出、可离线复算。
// 口径权威：docs/design/agent-engine-spec-v0.1.md（D18–D36）。
// 不碰 DOM / 存储 / Date.now / 随机数；日期一律 "YYYY-MM-DD" 字符串，内部 UTC 运算。

export const WEIGHTS = {
  // v0.1 讨论起点，临时取值（P4 权重校准待用户确认）
  base: [0.002, 0.005, 0.01, 0.018, 0.03], // intensity 1..5
  completion: 0.006, // × position/3（D25 只计完成增益）
  overdueDaily: 0.004, // × position/3，每日
  overdueCapPerTask: 0.02, // 临时取值：规格只说"设上限"未给数值，待拍板
  clamp: 0.06, // D26 单日涨跌停 ±6%
  restDaily: 0.0005, // D24 停牌期内每日 +0.05%
  restProtectionDays: 7, // D23 保护期 7 天
  silenceDecay: 0.001, // D22 每日 -0.1%
  silenceGraceDays: 3, // 连续第 4 个无事件日起衰减
  dailyScoringCap: 8, // D27 同日计分上限
  floor: 100,
  baseline: 1000,
};

const DAY = 86400000;

export function parseDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function fmtDate(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function shiftDate(s, n) {
  return fmtDate(parseDate(s) + n * DAY);
}

export function weekStartOf(s) {
  const dow = (new Date(parseDate(s)).getUTCDay() + 6) % 7; // 周一=0
  return shiftDate(s, -dow);
}

function dateOf(iso) {
  return String(iso).slice(0, 10);
}

function sign(polarity) {
  return polarity === "positive" ? 1 : polarity === "negative" ? -1 : 0;
}

function alive(r) {
  return r && r.deletedAt == null;
}

export function computeAll(records, { today, startDate } = {}) {
  const events = (records.events || []).filter(alive);
  const rests = (records.rests || []).filter(alive);
  const tasks = (records.tasks || []).filter(alive);

  let start = today;
  const candidates = [today];
  // 账本起点只由「已确认」记录决定：pending 事件/休息不得提前起点、不得触发沉默衰减（返工①）。
  for (const e of events) if (e.status === "confirmed") candidates.push(e.occurredAt);
  for (const r of rests) if (r.status === "confirmed") candidates.push(r.date);
  for (const t of tasks) {
    candidates.push(dateOf(t.createdAt));
    if (t.dueAt && (t.status === "open" || t.status === "done")) candidates.push(t.dueAt);
    if (t.status === "done" && t.doneAt) candidates.push(dateOf(t.doneAt));
  }
  start = candidates.reduce((a, b) => (parseDate(a) <= parseDate(b) ? a : b));
  if (startDate && parseDate(startDate) < parseDate(start)) start = startDate;
  if (parseDate(start) > parseDate(today)) start = today;

  const eventsByDate = new Map();
  for (const e of events) {
    if (!eventsByDate.has(e.occurredAt)) eventsByDate.set(e.occurredAt, []);
    eventsByDate.get(e.occurredAt).push(e);
  }
  for (const list of eventsByDate.values()) {
    // 同日稳定排序键：createdAt 升序，再按 id（临时协议，规格缺口待拍板）
    list.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
  const confirmedRests = rests.filter((r) => r.status !== "pending");
  const restsByDate = new Map();
  for (const r of confirmedRests) {
    if (!restsByDate.has(r.date)) restsByDate.set(r.date, []);
    restsByDate.get(r.date).push(r);
  }
  const doneByDate = new Map();
  for (const t of tasks) {
    if (t.status === "done" && t.doneAt) {
      const d = dateOf(t.doneAt);
      if (!doneByDate.has(d)) doneByDate.set(d, []);
      doneByDate.get(d).push(t);
    }
  }
  // 逾期按「历史窗口」重建，与当前状态解耦：完成后保留完成前已结算的逾期（D39 / 返工②）。
  // D39 口径 A（用户 2026-11-17 定稿）：完成当日只计一次完成增益、不再计逾期（end=doneAt-1）。
  const overdueTasks = tasks
    .filter((t) => t.dueAt && (t.status === "open" || t.status === "done"))
    .map((t) => ({ t, endMs: t.status === "done" && t.doneAt ? parseDate(dateOf(t.doneAt)) - DAY : parseDate(today) }));
  const overdueAccrued = new Map();

  const days = [];
  let prevClose = WEIGHTS.baseline;
  let silenceCount = 0;

  for (let ms = parseDate(start); ms <= parseDate(today); ms += DAY) {
    const date = fmtDate(ms);
    const open = prevClose;
    const dayEvents = eventsByDate.get(date) || [];
    const confirmedToday = dayEvents.filter((e) => e.status === "confirmed");

    const scored = [];
    const overCap = [];
    const emotions = [];
    const pendings = [];
    let scoredCount = 0;
    for (const e of dayEvents) {
      if (e.status === "pending") {
        pendings.push(line("pending", e, 0, "待确认 · 未计分"));
      } else if (e.eventType === "emotion") {
        emotions.push(line("emotion", e, 0, "情绪记录 · 不计分"));
      } else if (scoredCount < WEIGHTS.dailyScoringCap) {
        scoredCount += 1;
        scored.push(line("event", e, sign(e.polarity) * WEIGHTS.base[e.intensity - 1], null));
      } else {
        overCap.push(line("event", e, 0, "超出当日上限"));
      }
    }

    const completions = (doneByDate.get(date) || []).map((t) => ({
      type: "completion",
      id: t.id,
      label: "完成任务",
      quote: t.title,
      polarity: null,
      intensity: null,
      contribution: WEIGHTS.completion * (t.position / 3),
      note: null,
    }));

    const overdues = [];
    for (const { t, endMs } of overdueTasks) {
      if (parseDate(t.dueAt) >= ms || ms > endMs) continue;
      const daily = WEIGHTS.overdueDaily * (t.position / 3);
      const accrued = overdueAccrued.get(t.id) || 0;
      const remaining = Math.max(0, WEIGHTS.overdueCapPerTask - accrued);
      const take = Math.min(daily, remaining);
      overdueAccrued.set(t.id, accrued + take);
      overdues.push({
        type: "overdue",
        id: t.id,
        label: "逾期损耗",
        quote: t.title,
        polarity: null,
        intensity: null,
        contribution: -take,
        note: remaining - take <= 1e-12 ? "逾期损耗已达上限" : null,
      });
    }

    const protecting = confirmedRests.filter((r) => parseDate(r.date) <= ms && ms < parseDate(r.date) + WEIGHTS.restProtectionDays * DAY);
    const restToday = restsByDate.get(date) || [];
    const restLines = protecting.length
      ? [{ type: "rest", id: protecting[0].id, label: "停牌恢复", quote: protecting[0].quote, polarity: null, intensity: null, contribution: WEIGHTS.restDaily, note: "停牌保护期内" }]
      : [];
    const pendingRestLines = rests
      .filter((r) => r.status === "pending" && r.date === date)
      .map((r) => ({ type: "pending_rest", id: r.id, label: "待确认休息", quote: r.quote, polarity: null, intensity: null, contribution: 0, note: "待确认 · 未计分" }));

    // 任何 confirmed 事件（含情绪）或休息标记都打破沉默（D21；rest 打破沉默为临时口径）
    if (confirmedToday.length > 0 || restToday.length > 0) silenceCount = 0;
    else silenceCount += 1;
    const decayLines = [];
    if (protecting.length === 0 && silenceCount >= WEIGHTS.silenceGraceDays + 1) {
      decayLines.push({ type: "decay", id: null, label: "沉默衰减", quote: null, polarity: null, intensity: null, contribution: -WEIGHTS.silenceDecay, note: `连续第 ${silenceCount} 个无事件日` });
    }

    const lines = [...scored, ...overCap, ...emotions, ...pendings, ...pendingRestLines, ...completions, ...overdues, ...restLines, ...decayLines];
    const raw = lines.reduce((s, l) => s + l.contribution, 0);
    const actual = Math.max(-WEIGHTS.clamp, Math.min(WEIGHTS.clamp, raw));
    const adjustment = actual - raw;
    const close = Math.max(WEIGHTS.floor, open * (1 + actual));
    days.push({
      date,
      open,
      high: Math.max(open, close),
      low: Math.min(open, close),
      close,
      raw,
      adjustment,
      actual,
      eventCount: confirmedToday.length,
      lines,
    });
    prevClose = close;
  }

  const weeks = [];
  for (const day of days) {
    const ws = weekStartOf(day.date);
    let week = weeks[weeks.length - 1];
    if (!week || week.weekStart !== ws) {
      week = { weekStart: ws, weekEnd: day.date, open: day.open, high: day.open, low: day.open, close: day.close, volume: 0, days: [] };
      weeks.push(week);
    }
    week.weekEnd = day.date;
    week.high = Math.max(week.high, day.high);
    week.low = Math.min(week.low, day.low);
    week.close = day.close;
    week.volume += day.eventCount;
    week.days.push(day);
  }

  const last = weeks[weeks.length - 1];
  return {
    startDate: start,
    today,
    days,
    weeks,
    latest: prevClose,
    weekChangePct: last ? (last.close - last.open) / last.open : 0,
  };
}

function line(type, e, contribution, note) {
  return {
    type,
    id: e.id,
    label: type === "emotion" ? "情绪记录" : type === "pending" ? "待确认事件" : `行为 · ${e.polarity === "positive" ? "正向" : e.polarity === "negative" ? "负向" : "中性"} 强度${e.intensity}`,
    quote: e.quote,
    polarity: e.polarity,
    intensity: e.intensity,
    contribution,
    note,
  };
}