import { genId } from "./store.js";

const alive = (r) => r && r.deletedAt == null;
const dateOf = (iso) => String(iso || "").slice(0, 10);

function audit(records, action, target, before, after, at) {
  records.audit ||= [];
  records.audit.push({ id: genId("audit"), action, targetId: target.id, targetKind: target.kind, before, after, at });
}

function snapshot(r) {
  return r ? JSON.parse(JSON.stringify(r)) : null;
}

export function applyItems(records, items, { today, now = new Date().toISOString(), createId = genId } = {}) {
  const newPending = [];
  const errors = [];
  let changed = 0;
  const commit = (action, target, before, after) => {
    changed += 1;
    audit(records, action, target, before, after, now);
  };

  for (const it of items || []) {
    if (!it || typeof it.op !== "string") { errors.push("无效操作"); continue; }
    if (it.op === "add_event") {
      const e = it.event || {};
      if (!/^\d{4}-\d{2}-\d{2}$/.test(e.occurredAt || "")) { errors.push("事件日期无效"); continue; }
      const status = e.confidence < 0.6 ? "pending" : "confirmed";
      const id = createId("evt");
      const rec = { id, kind: "event", eventType: e.eventType === "emotion" ? "emotion" : "behavior", polarity: e.eventType === "emotion" ? "neutral" : e.polarity, intensity: e.intensity, occurredAt: e.occurredAt, quote: String(e.quote || ""), tags: e.tags || [], confidence: e.confidence, status, createdAt: now, deletedAt: null };
      records.events.push(rec);
      commit("add_event", rec, null, snapshot(rec));
      if (status === "pending") newPending.push(id);
    } else if (it.op === "add_rest") {
      const r = it.rest || {};
      if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date || "")) { errors.push("休息日期无效"); continue; }
      const id = createId("rest");
      const status = r.confidence < 0.6 ? "pending" : "confirmed";
      const rec = { id, kind: "rest", date: r.date, quote: String(r.quote || ""), confidence: r.confidence, status, createdAt: now, deletedAt: null };
      records.rests.push(rec);
      commit("add_rest", rec, null, snapshot(rec));
      if (status === "pending") newPending.push(id);
    } else if (it.op === "add_task") {
      const t = it.task || {};
      if (!String(t.title || "").trim() || !/^\d{4}-\d{2}-\d{2}$/.test(t.dueAt || "")) { errors.push("目标标题或到期日无效"); continue; }
      const rec = { id: createId("task"), kind: "task", title: String(t.title).trim(), dueAt: t.dueAt, position: t.position, status: "open", createdAt: now, doneAt: null, deletedAt: null };
      records.tasks.push(rec);
      commit("add_task", rec, null, snapshot(rec));
    } else if (["confirm_event", "correct_event", "deny_event", "delete_event"].includes(it.op)) {
      const e = records.events.find((x) => x.id === it.id && alive(x));
      if (!e) { errors.push("事件不存在或已撤销"); continue; }
      const before = snapshot(e);
      if (it.op === "confirm_event") {
        if (e.status !== "pending") continue;
        e.status = "confirmed";
        e.confidence = 1;
        if (it.occurredAt) e.occurredAt = it.occurredAt;
      } else if (it.op === "correct_event") {
        if (it.occurredAt) e.occurredAt = it.occurredAt;
        if (typeof it.quote === "string" && it.quote.trim()) e.quote = it.quote.trim();
      } else {
        e.deletedAt = now;
      }
      commit(it.op, e, before, snapshot(e));
    } else if (["confirm_rest", "correct_rest", "deny_rest", "delete_rest"].includes(it.op)) {
      const r = records.rests.find((x) => x.id === it.id && alive(x));
      if (!r) { errors.push("休息记录不存在或已撤销"); continue; }
      const before = snapshot(r);
      if (it.op === "confirm_rest") {
        if (r.status !== "pending") continue;
        r.status = "confirmed";
        r.confidence = 1;
        if (it.date) r.date = it.date;
      } else if (it.op === "correct_rest") {
        if (it.date) r.date = it.date;
        if (typeof it.quote === "string" && it.quote.trim()) r.quote = it.quote.trim();
      } else {
        r.deletedAt = now;
      }
      commit(it.op, r, before, snapshot(r));
    } else if (it.op === "complete_task") {
      const t = records.tasks.find((x) => x.id === it.id && alive(x));
      if (!t) { errors.push("目标不存在或已删除"); continue; }
      if (t.status === "done") continue;
      if (t.status !== "open") { errors.push("当前状态不能完成"); continue; }
      const before = snapshot(t);
      t.status = "done";
      t.doneAt = it.doneAt || today;
      commit("complete_task", t, before, snapshot(t));
    } else if (it.op === "delete_task") {
      const t = records.tasks.find((x) => x.id === it.id && alive(x));
      if (!t) { errors.push("目标不存在或已删除"); continue; }
      const before = snapshot(t);
      t.deletedAt = now;
      commit("delete_task", t, before, snapshot(t));
    } else {
      errors.push(`不支持的操作：${it.op}`);
    }
  }
  return { newPending, changed, errors };
}

export function getGoals(records, today) {
  const tasks = records.tasks.filter(alive).map((t) => ({
    ...t,
    displayStatus: t.status === "done" ? "done" : t.status === "paused" ? "paused" : t.dueAt < today ? "overdue" : "open",
  }));
  return {
    active: tasks.filter((t) => t.status !== "done").sort((a, b) => a.dueAt.localeCompare(b.dueAt) || a.id.localeCompare(b.id)),
    done: tasks.filter((t) => t.status === "done").sort((a, b) => dateOf(b.doneAt).localeCompare(dateOf(a.doneAt)) || a.id.localeCompare(b.id)),
  };
}

export function getTimeline(records, result, { from = "", to = "", keyword = "", type = "all", taskId = "", includeDeleted = false } = {}) {
  const dayMap = new Map((result?.days || []).map((d) => [d.date, d]));
  const lineFor = (date, id, types) => (dayMap.get(date)?.lines || []).find((l) => l.id === id && (!types || types.includes(l.type)));
  const rows = [];
  for (const e of records.events) {
    if (!includeDeleted && !alive(e)) continue;
    const line = lineFor(e.occurredAt, e.id, ["event", "emotion", "pending"]);
    rows.push({ id: e.id, kind: "event", type: e.eventType, date: e.occurredAt, quote: e.quote, status: alive(e) ? e.status : "deleted", contribution: line?.contribution || 0, note: line?.note || (!alive(e) ? "已撤销 · 保留历史原文" : ""), record: e });
  }
  for (const r of records.rests) {
    if (!includeDeleted && !alive(r)) continue;
    const line = lineFor(r.date, r.id, ["rest", "pending_rest"]);
    rows.push({ id: r.id, kind: "rest", type: "rest", date: r.date, quote: r.quote, status: alive(r) ? r.status : "deleted", contribution: line?.contribution || 0, note: line?.note || (!alive(r) ? "已撤销 · 保留历史原文" : ""), record: r });
  }
  for (const t of records.tasks) {
    if (t.status !== "done" || !t.doneAt || (!includeDeleted && !alive(t))) continue;
    const date = dateOf(t.doneAt);
    const line = lineFor(date, t.id, ["completion"]);
    rows.push({ id: t.id, kind: "task", type: "completion", date, quote: t.title, status: alive(t) ? "confirmed" : "deleted", contribution: line?.contribution || 0, note: !alive(t) ? "目标已删除 · 完成事实保留追溯" : "任务完成 · 不重复生成行为事件", taskId: t.id, record: t });
  }
  const q = keyword.trim().toLowerCase();
  return rows.filter((r) => {
    if (from && r.date < from) return false;
    if (to && r.date > to) return false;
    if (type !== "all" && r.type !== type) return false;
    if (taskId && r.taskId !== taskId) return false;
    if (q && !`${r.quote} ${r.id} ${r.taskId || ""}`.toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => b.date.localeCompare(a.date) || String(b.record.createdAt || "").localeCompare(String(a.record.createdAt || "")) || a.id.localeCompare(b.id));
}

export function findRecord(records, id) {
  return records.events.find((r) => r.id === id) || records.rests.find((r) => r.id === id) || records.tasks.find((r) => r.id === id) || null;
}
