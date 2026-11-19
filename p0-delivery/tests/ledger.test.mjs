import test from "node:test";
import assert from "node:assert/strict";
import { applyItems, getGoals, getTimeline } from "../web/ledger.js";
import { computeAll, shiftDate } from "../web/engine.js";
import { emptyPersonal, loadPersonal, clearPersonal } from "../web/store.js";

const TODAY = "2026-11-17";
const NOW = "2026-11-17T12:00:00.000Z";
let seq = 0;
const createId = (p) => `${p}_${++seq}`;

function seed() {
  const r = emptyPersonal();
  applyItems(r, [
    { op: "add_task", task: { title: "目标甲", dueAt: shiftDate(TODAY, 3), position: 3 } },
    { op: "add_task", task: { title: "目标乙", dueAt: shiftDate(TODAY, 5), position: 2 } },
  ], { today: TODAY, now: NOW, createId });
  return r;
}

test("v0.2 A：两个目标同组派生，完成幂等且只有一笔完成事实/增益", () => {
  const r = seed();
  const id = r.tasks[0].id;
  applyItems(r, [{ op: "complete_task", id, doneAt: TODAY }], { today: TODAY, now: NOW, createId });
  const second = applyItems(r, [{ op: "complete_task", id, doneAt: TODAY }], { today: TODAY, now: NOW, createId });
  assert.equal(second.changed, 0);
  const goals = getGoals(r, TODAY);
  assert.equal(goals.active.length, 1);
  assert.equal(goals.done.length, 1);
  const result = computeAll(r, { today: TODAY });
  const timeline = getTimeline(r, result, { type: "completion" });
  assert.equal(timeline.length, 1);
  assert.equal(timeline[0].taskId, id);
  assert.equal(result.days.flatMap((d) => d.lines).filter((l) => l.type === "completion" && l.id === id).length, 1);
  assert.equal(r.events.length, 0);
});

test("v0.2：修正按生效日期重算并留审计，撤销后原文可追溯", () => {
  const r = emptyPersonal();
  applyItems(r, [{ op: "add_event", event: { eventType: "behavior", polarity: "positive", intensity: 3, occurredAt: TODAY, quote: "跑步五公里", confidence: 0.9 } }], { today: TODAY, now: NOW, createId });
  const id = r.events[0].id;
  const yesterday = shiftDate(TODAY, -1);
  applyItems(r, [{ op: "correct_event", id, occurredAt: yesterday }], { today: TODAY, now: NOW, createId });
  const moved = computeAll(r, { today: TODAY });
  assert.ok(moved.days.find((d) => d.date === yesterday).lines.some((l) => l.id === id && l.contribution === 0.01));
  assert.equal(getTimeline(r, moved)[0].date, yesterday);
  assert.equal(r.audit.at(-1).before.occurredAt, TODAY);
  applyItems(r, [{ op: "delete_event", id }], { today: TODAY, now: NOW, createId });
  const result = computeAll(r, { today: TODAY });
  assert.equal(getTimeline(r, result).length, 0);
  const deleted = getTimeline(r, result, { includeDeleted: true });
  assert.equal(deleted[0].quote, "跑步五公里");
  assert.equal(deleted[0].status, "deleted");
});

test("v0.2：pending 补日期在记录查询生效一次，聊天可复用同一动作", () => {
  const r = emptyPersonal();
  applyItems(r, [{ op: "add_event", event: { eventType: "behavior", polarity: "positive", intensity: 3, occurredAt: TODAY, quote: "前阵子跑过五公里", confidence: 0.4 } }], { today: TODAY, now: NOW, createId });
  const id = r.events[0].id;
  const before = computeAll(r, { today: TODAY });
  assert.equal(before.latest, 1000);
  const lastWeek = shiftDate(TODAY, -7);
  applyItems(r, [{ op: "confirm_event", id, occurredAt: lastWeek }], { today: TODAY, now: NOW, createId });
  applyItems(r, [{ op: "confirm_event", id, occurredAt: lastWeek }], { today: TODAY, now: NOW, createId });
  const after = computeAll(r, { today: TODAY });
  assert.equal(after.startDate, lastWeek);
  assert.equal(after.days.flatMap((d) => d.lines).filter((l) => l.id === id && l.type === "event").length, 1);
  assert.equal(getTimeline(r, after)[0].date, lastWeek);
});

test("v0.2：v1 迁移保留行为、pending 休息和已完成任务，清空同时移除新旧键", () => {
  const values = new Map();
  globalThis.localStorage = { getItem: (k) => values.get(k) || null, setItem: (k, v) => values.set(k, v), removeItem: (k) => values.delete(k) };
  const legacy = {
    events: [{ id: "old_e", kind: "event", eventType: "behavior", polarity: "positive", intensity: 2, occurredAt: TODAY, quote: "旧行为", status: "confirmed", createdAt: NOW, deletedAt: null }],
    rests: [{ id: "old_r", kind: "rest", date: TODAY, quote: "旧休息", confidence: 0.4, status: "pending", createdAt: NOW, deletedAt: null }],
    tasks: [{ id: "old_t", kind: "task", title: "旧任务", dueAt: TODAY, position: 3, status: "done", createdAt: NOW, doneAt: NOW, deletedAt: null }],
    chat: [],
  };
  values.set("pe.personal.v1", JSON.stringify(legacy));
  const migrated = loadPersonal();
  assert.equal(migrated.version, 2);
  assert.equal(migrated.events[0].quote, "旧行为");
  assert.equal(migrated.rests[0].status, "pending");
  assert.equal(migrated.tasks[0].status, "done");
  assert.ok(values.has("pe.personal.v2"));
  assert.ok(values.has("pe.personal.v1"));
  clearPersonal();
  assert.equal(values.has("pe.personal.v1"), false);
  assert.equal(values.has("pe.personal.v2"), false);
  delete globalThis.localStorage;
});

test("PR#3 P2：确认冲突时整批回滚，新增记录也不得部分入账", () => {
  const r = emptyPersonal();
  applyItems(r, [{ op: "add_event", event: { eventType: "behavior", polarity: "positive", intensity: 3, occurredAt: TODAY, quote: "待确认事件", confidence: 0.4 } }], { today: TODAY, now: NOW, createId });
  const id = r.events[0].id;
  applyItems(r, [{ op: "deny_event", id }], { today: TODAY, now: NOW, createId });
  const before = JSON.stringify(r);
  const result = applyItems(r, [
    { op: "confirm_event", id },
    { op: "add_event", event: { eventType: "behavior", polarity: "positive", intensity: 3, occurredAt: TODAY, quote: "不应写入的新事件", confidence: 0.9 } },
  ], { today: TODAY, now: NOW, createId });
  assert.equal(result.applied, false);
  assert.equal(result.changed, 0);
  assert.ok(result.errors.length > 0);
  assert.equal(JSON.stringify(r), before);
  assert.equal(r.events.some((e) => e.quote === "不应写入的新事件"), false);
});
