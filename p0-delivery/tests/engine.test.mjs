import test from "node:test";
import assert from "node:assert/strict";
import { computeAll, WEIGHTS, shiftDate, weekStartOf } from "../web/engine.js";
import { buildSampleRecords } from "../web/sample-data.js";

const TODAY = "2026-11-17";
let n = 0;
function ev(over = {}) {
  n += 1;
  return {
    id: `evt_${n}`, kind: "event", eventType: "behavior", polarity: "positive", intensity: 3,
    occurredAt: TODAY, quote: "跑了五公里", tags: [], confidence: 0.9, status: "confirmed",
    createdAt: `${TODAY}T12:${String(n).padStart(2, "0")}:00.000Z`, deletedAt: null, ...over,
  };
}
function emo(over = {}) { return ev({ eventType: "emotion", polarity: "neutral", intensity: 2, quote: "有点焦虑", ...over }); }
function rest(over = {}) { n += 1; return { id: `rest_${n}`, kind: "rest", date: TODAY, quote: "今天休息", confidence: 0.9, status: "confirmed", createdAt: `${TODAY}T12:00:00.000Z`, deletedAt: null, ...over }; }
function task(over = {}) { n += 1; return { id: `task_${n}`, kind: "task", title: "数据库课设", dueAt: shiftDate(TODAY, 5), position: 3, status: "open", createdAt: `${TODAY}T09:00:00.000Z`, doneAt: null, deletedAt: null, ...over }; }
const R = (events = [], rests = [], tasks = []) => ({ events, rests, tasks });
const day = (r, date = TODAY) => r.days.find((d) => d.date === date);

test("确定性：同输入两次全量重算完全一致", () => {
  const rec = R([ev(), emo()], [rest()], [task()]);
  assert.deepEqual(computeAll(rec, { today: TODAY }), computeAll(rec, { today: TODAY }));
});

test("单条 positive intensity3 → close 1010，raw 0.01，adjustment 0", () => {
  const r = computeAll(R([ev()]), { today: TODAY });
  const d = day(r);
  assert.equal(d.raw, 0.01);
  assert.equal(d.adjustment, 0);
  assert.ok(Math.abs(d.close - 1010) < 1e-9);
});

test("仅情绪不计分但打破沉默（重置宽限：其后前3个空闲日无衰减，第4个起恢复）", () => {
  const start = shiftDate(TODAY, -6);
  const r = computeAll(R([emo({ occurredAt: start })]), { today: TODAY });
  assert.equal(day(r, start).close, WEIGHTS.baseline);
  for (let i = 1; i <= 3; i++) assert.equal(day(r, shiftDate(start, i)).actual, 0, `day+${i} 宽限内`);
  for (let i = 4; i <= 6; i++) assert.equal(day(r, shiftDate(start, i)).actual, -0.001, `day+${i} 恢复衰减`);
});

test("涨停：8条 intensity5 → raw .24 actual .06 adj -.18 close 1060；第9条超上限；情绪不占名额", () => {
  const eight = Array.from({ length: 8 }, () => ev({ intensity: 5 }));
  const ninth = ev({ intensity: 5 });
  const r = computeAll(R([...eight, ninth, emo(), emo()]), { today: TODAY });
  const d = day(r);
  assert.ok(Math.abs(d.raw - 0.24) < 1e-9);
  assert.equal(d.actual, 0.06);
  assert.ok(Math.abs(d.adjustment - -0.18) < 1e-9);
  assert.ok(Math.abs(d.close - 1060) < 1e-9);
  const capped = d.lines.find((l) => l.id === ninth.id);
  assert.equal(capped.contribution, 0);
  assert.equal(capped.note, "超出当日上限");
  assert.equal(d.lines.filter((l) => l.type === "event" && l.contribution > 0).length, 8);
});

test("跌停：8条 intensity5 negative → actual -.06 close 940", () => {
  const r = computeAll(R(Array.from({ length: 8 }, () => ev({ intensity: 5, polarity: "negative" }))), { today: TODAY });
  const d = day(r);
  assert.equal(d.actual, -0.06);
  assert.ok(Math.abs(d.close - 940) < 1e-9);
});

test("沉默：前3天 r=0，第4天起每日 -0.001", () => {
  const start = shiftDate(TODAY, -9);
  const r = computeAll(R(), { today: TODAY, startDate: start });
  for (let i = 0; i < 3; i++) assert.equal(day(r, shiftDate(start, i)).actual, 0);
  for (let i = 3; i < 10; i++) assert.equal(day(r, shiftDate(start, i)).actual, -0.001);
});

test("停牌：day1-7 每日 +0.0005，day8 起 -0.001；保护窗内事件照常计分且仍 +0.0005", () => {
  const start = shiftDate(TODAY, -9);
  const r = computeAll(R([ev({ occurredAt: shiftDate(start, 2) })], [rest({ date: start })]), { today: TODAY, startDate: start });
  for (let i = 0; i < 7; i++) {
    const d = day(r, shiftDate(start, i));
    const expect = i === 2 ? 0.01 + 0.0005 : 0.0005;
    assert.ok(Math.abs(d.actual - expect) < 1e-9, `day${i + 1}`);
  }
  for (let i = 7; i < 10; i++) assert.equal(day(r, shiftDate(start, i)).actual, -0.001);
});

test("完成增益：position3 done 今日 → +0.006，无额外事件", () => {
  const r = computeAll(R([], [], [task({ status: "done", doneAt: `${TODAY}T16:00:00.000Z` })]), { today: TODAY });
  const d = day(r);
  assert.ok(Math.abs(d.actual - 0.006) < 1e-9);
  assert.equal(d.lines.filter((l) => l.type === "completion").length, 1);
  assert.equal(d.lines.filter((l) => l.type === "event").length, 0);
});

test("逾期：position3 due=today-7 → dueAt 次日起每日 -0.004，累计5天封顶 0.02，之后 0", () => {
  const start = shiftDate(TODAY, -9);
  const silenceBreakers = Array.from({ length: 10 }, (_, i) => emo({ occurredAt: shiftDate(start, i) }));
  const r = computeAll(R(silenceBreakers, [], [task({ dueAt: shiftDate(TODAY, -7), position: 3 })]), { today: TODAY, startDate: start });
  const daily = 0.004;
  for (let i = 0; i <= 2; i++) assert.equal(day(r, shiftDate(start, i)).actual, 0, `day${i} 未逾期`);
  for (let i = 3; i <= 7; i++) assert.ok(Math.abs(day(r, shiftDate(start, i)).actual - -daily) < 1e-9, `day${i} 计逾期`);
  for (let i = 8; i <= 9; i++) assert.equal(day(r, shiftDate(start, i)).actual, 0, `day${i} 已封顶`);
});

test("软删除：删一条计分事件后重算 == 从未存在", () => {
  const a = ev(); const b = ev({ intensity: 2 });
  const withDeleted = computeAll(R([a, { ...b, deletedAt: `${TODAY}T13:00:00.000Z` }]), { today: TODAY });
  const without = computeAll(R([a]), { today: TODAY });
  assert.deepEqual(withDeleted.weeks, without.weeks);
});

test("pending 不计分；confirmed 后恰好计一次", () => {
  const p = ev({ status: "pending", confidence: 0.4 });
  const r1 = computeAll(R([p]), { today: TODAY });
  assert.equal(day(r1).actual, 0);
  assert.equal(day(r1).lines.find((l) => l.id === p.id).type, "pending");
  const r2 = computeAll(R([{ ...p, status: "confirmed", confidence: 1 }]), { today: TODAY });
  assert.equal(day(r2).actual, 0.01);
});

test("周聚合：单调上涨周 low==周open、open==上周close、volume 计数", () => {
  const start = shiftDate(TODAY, -13);
  const events = [];
  for (let i = 0; i < 14; i++) events.push(ev({ occurredAt: shiftDate(start, i), intensity: 2 }));
  const r = computeAll(R(events), { today: TODAY, startDate: start });
  for (let i = 1; i < r.weeks.length; i++) {
    assert.ok(Math.abs(r.weeks[i].open - r.weeks[i - 1].close) < 1e-9);
  }
  const up = r.weeks.find((w) => w.days.every((d) => d.close >= d.open));
  assert.ok(Math.abs(up.low - up.open) < 1e-9);
  assert.equal(r.weeks.reduce((s, w) => s + w.volume, 0), 14);
});

test("同日排序稳定：打乱输入顺序，计分前8条恒为 createdAt 最早8条", () => {
  const nine = Array.from({ length: 9 }, (_, i) => ev({ intensity: 5, createdAt: `${TODAY}T12:${String(i).padStart(2, "0")}:00.000Z` }));
  const shuffled = [...nine].reverse();
  const a = computeAll(R(nine), { today: TODAY });
  const b = computeAll(R(shuffled), { today: TODAY });
  assert.deepEqual(a, b);
  const scoredIds = day(a).lines.filter((l) => l.contribution > 0).map((l) => l.id);
  assert.deepEqual(scoredIds, nine.slice(0, 8).map((e) => e.id));
});

test("补录旧日期：startDate 自动前扩且确定", () => {
  const old = shiftDate(TODAY, -20);
  const r = computeAll(R([ev({ occurredAt: old })]), { today: TODAY });
  assert.equal(r.startDate, old);
  assert.equal(day(r, old).actual, 0.01);
});

test("指数下限 100", () => {
  const start = shiftDate(TODAY, -200);
  const events = [];
  for (let i = 0; i < 200; i += 1) events.push(ev({ occurredAt: shiftDate(start, i), intensity: 5, polarity: "negative" }));
  const r = computeAll(R(events), { today: TODAY, startDate: start });
  assert.ok(r.latest >= 100);
});

test("样例数据：确定、>=12周、latest>1050、存在回撤周、无 NaN", () => {
  const a = buildSampleRecords(TODAY);
  assert.deepEqual(a, buildSampleRecords(TODAY));
  const r = computeAll(a, { today: TODAY });
  assert.ok(r.weeks.length >= 12);
  assert.ok(r.latest > 1050 && r.latest < 1300);
  assert.ok(r.weeks.some((w) => w.close < w.open));
  assert.ok(r.days.every((d) => Number.isFinite(d.close) && Number.isFinite(d.raw)));
});

test("weekStartOf 周一为首日", () => {
  assert.equal(weekStartOf("2026-11-17"), "2026-11-16"); // 周二
  assert.equal(weekStartOf("2026-11-16"), "2026-11-16"); // 周一
  assert.equal(weekStartOf("2026-11-22"), "2026-11-16"); // 周日
});
/* ===== 返工①：pending 历史记录不提前改变指数 ===== */
test("返工① 空账本+7天前pending事件 → 指数/K线与空账本完全一致", () => {
  const old = shiftDate(TODAY, -7);
  const empty = computeAll(R(), { today: TODAY });
  const withPending = computeAll(R([ev({ occurredAt: old, status: "pending", confidence: 0.4 })]), { today: TODAY });
  assert.deepEqual(withPending.weeks, empty.weeks);
  assert.deepEqual(withPending.days, empty.days);
  assert.equal(withPending.latest, WEIGHTS.baseline);
  assert.equal(withPending.startDate, TODAY);
});
test("返工① pending事件确认后才按确认日期重算；否认后指数不变", () => {
  const old = shiftDate(TODAY, -7);
  const p = ev({ occurredAt: old, status: "pending", confidence: 0.4 });
  const confirmed = computeAll(R([{ ...p, status: "confirmed", confidence: 1 }]), { today: TODAY });
  assert.equal(confirmed.startDate, old);
  assert.ok(Math.abs(confirmed.latest - WEIGHTS.baseline) > 1e-6); // 按确认日期重算后指数改变
  const denied = computeAll(R([{ ...p, deletedAt: `${TODAY}T13:00:00.000Z` }]), { today: TODAY });
  assert.equal(denied.latest, WEIGHTS.baseline);
  assert.equal(denied.startDate, TODAY);
});
test("返工① pending休息同样隔离：不提前起点/无停牌增益；确认生效/否认不变", () => {
  const old = shiftDate(TODAY, -7);
  const empty = computeAll(R(), { today: TODAY });
  const pr = rest({ date: old, status: "pending", confidence: 0.4 });
  const withPending = computeAll(R([], [pr]), { today: TODAY });
  assert.deepEqual(withPending.weeks, empty.weeks);
  assert.equal(withPending.latest, WEIGHTS.baseline);
  const confirmed = computeAll(R([], [{ ...pr, status: "confirmed", confidence: 1 }]), { today: TODAY });
  assert.equal(confirmed.startDate, old);
  assert.ok(confirmed.latest > WEIGHTS.baseline); // 停牌恢复生效
  const denied = computeAll(R([], [{ ...pr, deletedAt: `${TODAY}T13:00:00.000Z` }]), { today: TODAY });
  assert.equal(denied.latest, WEIGHTS.baseline);
});

/* ===== 返工②：完成逾期任务保留历史扣分 ===== */
test("返工② 完成逾期任务：完成前逾期明细与历史收盘保留，完成增益只计一次", () => {
  const due = shiftDate(TODAY, -3);
  const t = task({ dueAt: due, position: 3 });
  const openRun = computeAll(R([], [], [t]), { today: TODAY });
  const doneRun = computeAll(R([], [], [{ ...t, status: "done", doneAt: `${TODAY}T16:00:00.000Z` }]), { today: TODAY });
  // 历史日（due+1 .. today-1）逾期贡献与收盘保持一致
  for (const d of [shiftDate(TODAY, -2), shiftDate(TODAY, -1)]) {
    const a = day(openRun, d), b = day(doneRun, d);
    assert.ok(Math.abs(a.close - b.close) < 1e-9, `历史收盘 ${d}`);
    const oa = a.lines.find((l) => l.type === "overdue");
    const ob = b.lines.find((l) => l.type === "overdue");
    assert.ok(oa && ob && Math.abs(oa.contribution - ob.contribution) < 1e-9, `历史逾期 ${d}`);
  }
  // 完成增益只计一次（doneAt 当日）
  const comp = doneRun.days.flatMap((d) => d.lines).filter((l) => l.type === "completion");
  assert.equal(comp.length, 1);
  assert.ok(Math.abs(comp[0].contribution - 0.006) < 1e-9);
  // D39 口径A：完成当日不再计逾期
  assert.equal(day(doneRun, TODAY).lines.find((l) => l.type === "overdue"), undefined);
});
test("返工② 逾期上限在完成后仍按历史窗口累计封顶", () => {
  const due = shiftDate(TODAY, -9);
  const t = task({ dueAt: due, position: 3 });
  const doneRun = computeAll(R([], [], [{ ...t, status: "done", doneAt: `${TODAY}T16:00:00.000Z` }]), { today: TODAY });
  const overdueSum = doneRun.days.flatMap((d) => d.lines).filter((l) => l.type === "overdue").reduce((s, l) => s + -l.contribution, 0);
  assert.ok(Math.abs(overdueSum - WEIGHTS.overdueCapPerTask) < 1e-9);
});
