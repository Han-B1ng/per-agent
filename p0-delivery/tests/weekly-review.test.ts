import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeAll, shiftDate, WEIGHTS, weekStartOf } from "../web/engine.js";
import { applyItems } from "../web/ledger.js";
import { deriveWeeklyReview, listReviewWeeks } from "../frontend/src/features/weekly-review/review.ts";
import { buildReviewFixture, emptyLedger } from "./fixtures/weekly-review.ts";
import type { ComputeResult, LedgerRecords, WeekResult } from "../frontend/src/types.ts";

const TODAY = "2026-11-19";
const WEEK_START = "2026-11-16";
const PREVIOUS_WEEK = "2026-11-09";
const NOW = "2026-11-19T20:00:00.000Z";

function assertClose(actual: number, expected: number, precision: number) {
  assert.ok(Math.abs(actual - expected) < 0.5 * 10 ** -precision, `${actual} is not close to ${expected}`);
}

function engineFor(records: LedgerRecords): ComputeResult {
  return computeAll(records, { today: TODAY });
}

function weekOf(result: ComputeResult, start = WEEK_START): WeekResult {
  const week = result.weeks.find((candidate) => candidate.weekStart === start);
  if (!week) throw new Error(`missing week ${start}`);
  return week;
}

function rawTotalOf(week: WeekResult): number {
  return week.days.reduce((sum, day) => sum + day.lines.reduce((daySum, line) => daySum + line.contribution, 0), 0);
}

describe("本周复盘派生", () => {
  it("一项任务本周完成、另一项仍在进行时，两组同时显示", () => {
    const records = buildReviewFixture(TODAY);
    const review = deriveWeeklyReview(records, engineFor(records), { weekStart: WEEK_START });

    assert.deepEqual(review.completed.map((goal) => goal.taskId), ["task_done_current"]);
    assert.equal(review.completedCount, 1);
    assert.deepEqual(review.ongoing.map((goal) => goal.taskId), [
      "task_overdue_report",
      "task_active_paper",
      "task_paused_listening",
    ]);
    assert.deepEqual(review.ongoing.map((goal) => goal.status), ["overdue", "open", "paused"]);
    assert.equal(review.ongoingCount, 3);
    assert.equal(review.completed[0].title, "完成数据库课设答辩");
    assert.equal(review.ongoing.find((goal) => goal.taskId === "task_active_paper")?.dueAt, shiftDate(TODAY, 9));
  });

  it("完成时间倒序排列本周已完成目标", () => {
    const records = buildReviewFixture(TODAY);
    records.tasks.push({
      id: "task_done_earlier",
      kind: "task",
      title: "提前完成的阅读任务",
      dueAt: shiftDate(TODAY, -2),
      position: 1,
      status: "done",
      createdAt: `${shiftDate(TODAY, -6)}T09:00:00.000Z`,
      doneAt: `${shiftDate(TODAY, -1)}T09:00:00.000Z`,
      deletedAt: null,
    });
    const review = deriveWeeklyReview(records, engineFor(records), { weekStart: WEEK_START });
    assert.deepEqual(review.completed.map((goal) => goal.taskId), ["task_done_current", "task_done_earlier"]);
  });

  it("同周完成增益、情绪与待确认记录与周 K 涨跌及明细一致", () => {
    const records = buildReviewFixture(TODAY);
    const result = engineFor(records);
    const week = weekOf(result);
    const review = deriveWeeklyReview(records, result, { weekStart: WEEK_START });

    assertClose(review.week.open, week.open, 10);
    assertClose(review.week.close, week.close, 10);
    assertClose(review.week.changePct, (week.close - week.open) / week.open, 12);
    assertClose(review.week.close, result.latest, 10);
    assertClose(review.week.rawTotal, rawTotalOf(week), 10);
    assertClose(review.week.adjustment, week.days.reduce((sum, day) => sum + day.adjustment, 0), 10);
    assertClose(review.contributions.reduce((sum, row) => sum + row.contribution, 0), rawTotalOf(week), 10);

    const completionRows = review.contributions.filter((row) => row.type === "completion");
    assert.equal(completionRows.length, 1);
    assert.equal(completionRows[0].targetId, "task_done_current");
    assertClose(completionRows[0].contribution, WEIGHTS.completion * (3 / 3), 12);
    assertClose(review.completed[0].contribution, completionRows[0].contribution, 12);

    const emotion = review.contributions.find((row) => row.type === "emotion");
    assert.equal(emotion?.lineId, "evt_review_note");
    assert.equal(emotion?.contribution, 0);
    assert.equal(emotion?.status, "zero");

    const pending = review.contributions.find((row) => row.type === "pending");
    assert.equal(pending?.lineId, "evt_pending_writing");
    assert.equal(pending?.contribution, 0);
    assert.equal(pending?.status, "pending");
    assert.equal(review.pendingCount, 1);

    const engineLines = week.days.flatMap((day) => day.lines);
    assert.equal(engineLines.filter((line) => line.id === "evt_pending_writing").every((line) => line.contribution === 0), true);
    assert.equal(engineLines.filter((line) => line.id === "evt_review_note").every((line) => line.contribution === 0), true);
  });

  it("待确认记录不影响账本起点、指数与沉默衰减（D40）", () => {
    const records = buildReviewFixture(TODAY);
    const withoutPending = structuredClone(records);
    withoutPending.events = withoutPending.events.filter((event) => event.id !== "evt_pending_writing");
    const withResult = engineFor(records);
    const withoutResult = engineFor(withoutPending);

    assertClose(withResult.latest, withoutResult.latest, 12);
    assert.equal(withResult.startDate, withoutResult.startDate);
    assertClose(withResult.weeks.at(-1)?.close, withoutResult.weeks.at(-1)?.close ?? 0, 12);
  });

  it("跨周时完成事实只落在实际完成周", () => {
    const records = buildReviewFixture(TODAY);
    const result = engineFor(records);
    const current = deriveWeeklyReview(records, result, { weekStart: WEEK_START });
    const previous = deriveWeeklyReview(records, result, { weekStart: PREVIOUS_WEEK });

    assert.equal(current.completed.map((goal) => goal.taskId).includes("task_done_previous"), false);
    assert.deepEqual(previous.completed.map((goal) => goal.taskId), ["task_done_previous"]);
    assert.equal(current.contributions.some((row) => row.type === "completion" && row.targetId === "task_done_previous"), false);
    assert.equal(previous.contributions.some((row) => row.type === "completion" && row.targetId === "task_done_previous"), true);
    assert.equal(previous.week.weekStart, PREVIOUS_WEEK);
    assert.equal(previous.week.isCurrent, false);
    assert.equal(current.week.isCurrent, true);
  });

  it("空账本得到零变化周与空分组", () => {
    const records = emptyLedger();
    const result = engineFor(records);
    const review = deriveWeeklyReview(records, result, { weekStart: WEEK_START });

    assert.equal(review.isEmpty, true);
    assert.deepEqual(review.completed, []);
    assert.deepEqual(review.ongoing, []);
    assert.deepEqual(review.contributions, []);
    assert.equal(review.week.open, 1000);
    assert.equal(review.week.close, 1000);
    assert.equal(review.week.changePct, 0);
    assert.equal(review.week.weekKey, WEEK_START);
  });

  it("纠错跨周后，复盘随账本重算", () => {
    const records = buildReviewFixture(TODAY);
    const before = deriveWeeklyReview(records, engineFor(records), { weekStart: WEEK_START });

    const corrected = structuredClone(records);
    const write = applyItems(
      corrected,
      [{ op: "correct_event", id: "evt_run", occurredAt: shiftDate(TODAY, -8) }],
      { today: TODAY, now: NOW },
    );
    assert.equal(write.applied, true);
    const correctedResult = engineFor(corrected);
    const correctedReview = deriveWeeklyReview(corrected, correctedResult, { weekStart: WEEK_START });
    const previousReview = deriveWeeklyReview(corrected, correctedResult, { weekStart: PREVIOUS_WEEK });

    assert.equal(correctedReview.contributions.some((row) => row.lineId === "evt_run"), false);
    assert.equal(previousReview.contributions.some((row) => row.lineId === "evt_run"), true);
    assert.ok(Math.abs(correctedReview.week.close - before.week.close) >= 0.5 * 10 ** -10);
    assertClose(correctedReview.week.changePct, (weekOf(correctedResult).close - weekOf(correctedResult).open) / weekOf(correctedResult).open, 12);
    assertClose(correctedReview.week.rawTotal, rawTotalOf(weekOf(correctedResult)), 10);
  });

  it("撤销完成目标后，完成增益与已完成分组一起消失", () => {
    const records = buildReviewFixture(TODAY);
    const before = deriveWeeklyReview(records, engineFor(records), { weekStart: WEEK_START });

    const undone = structuredClone(records);
    const write = applyItems(undone, [{ op: "delete_task", id: "task_done_current" }], { today: TODAY, now: NOW });
    assert.equal(write.applied, true);
    const undoneResult = engineFor(undone);
    const review = deriveWeeklyReview(undone, undoneResult, { weekStart: WEEK_START });

    assert.equal(review.completed.map((goal) => goal.taskId).includes("task_done_current"), false);
    assert.equal(review.contributions.some((row) => row.type === "completion" && row.targetId === "task_done_current"), false);
    assert.ok(review.week.close < before.week.close);
    assertClose(review.week.changePct, (weekOf(undoneResult).close - weekOf(undoneResult).open) / weekOf(undoneResult).open, 12);
  });

  it("否认待确认记录后复盘重算并移除待确认项", () => {
    const records = buildReviewFixture(TODAY);
    const before = deriveWeeklyReview(records, engineFor(records), { weekStart: WEEK_START });

    const denied = structuredClone(records);
    const write = applyItems(denied, [{ op: "deny_event", id: "evt_pending_writing" }], { today: TODAY, now: NOW });
    assert.equal(write.applied, true);
    const review = deriveWeeklyReview(denied, engineFor(denied), { weekStart: WEEK_START });

    assert.equal(review.contributions.some((row) => row.lineId === "evt_pending_writing"), false);
    assert.equal(review.pendingCount, 0);
    assertClose(review.week.close, before.week.close, 12);
  });

  it("完成任务只计一次完成增益，重复完成不重复入账", () => {
    const records = buildReviewFixture(TODAY);
    const first = applyItems(
      records,
      [{ op: "complete_task", id: "task_active_paper", doneAt: TODAY }],
      { today: TODAY, now: NOW },
    );
    const second = applyItems(
      records,
      [{ op: "complete_task", id: "task_active_paper", doneAt: TODAY }],
      { today: TODAY, now: NOW },
    );
    assert.equal(first.changed, 1);
    assert.equal(second.changed, 0);

    const result = engineFor(records);
    const review = deriveWeeklyReview(records, result, { weekStart: WEEK_START });
    const rows = review.contributions.filter((row) => row.type === "completion" && row.targetId === "task_active_paper");
    assert.equal(rows.length, 1);
    assertClose(rows[0].contribution, WEIGHTS.completion * (3 / 3), 12);
    assert.equal(review.completed.some((goal) => goal.taskId === "task_active_paper"), true);
    assert.equal(review.ongoing.some((goal) => goal.taskId === "task_active_paper"), false);
  });

  it("周标识来自引擎周边界，并标记当前周", () => {
    const records = buildReviewFixture(TODAY);
    const result = engineFor(records);
    const weeks = listReviewWeeks(result);
    assert.equal(weeks.at(-1)?.weekKey, weekStartOf(TODAY));
    assert.equal(weeks.at(-1)?.isCurrent, true);
    assert.equal(weeks.some((week) => week.weekKey === PREVIOUS_WEEK && !week.isCurrent), true);
  });
});
