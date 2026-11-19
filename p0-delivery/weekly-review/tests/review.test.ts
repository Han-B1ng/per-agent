import { describe, expect, it } from "vitest";
import { applyItems, computeAll, shiftDate, WEIGHTS, weekStartOf } from "../src/core";
import { deriveWeeklyReview, listReviewWeeks } from "../src/review";
import { buildReviewFixture, emptyLedger } from "../src/scenarios";
import type { ComputeResult, ReviewLedger, WeekResult } from "../src/types";

const TODAY = "2026-11-19";
const WEEK_START = "2026-11-16";
const PREVIOUS_WEEK = "2026-11-09";
const NOW = "2026-11-19T20:00:00.000Z";

function engineFor(records: ReviewLedger): ComputeResult {
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

    expect(review.completed.map((goal) => goal.taskId)).toEqual(["task_done_current"]);
    expect(review.completedCount).toBe(1);
    expect(review.ongoing.map((goal) => goal.taskId)).toEqual([
      "task_overdue_report",
      "task_active_paper",
      "task_paused_listening",
    ]);
    expect(review.ongoing.map((goal) => goal.status)).toEqual(["overdue", "open", "paused"]);
    expect(review.ongoingCount).toBe(3);
    expect(review.completed[0].title).toBe("完成数据库课设答辩");
    expect(review.ongoing.find((goal) => goal.taskId === "task_active_paper")?.dueAt).toBe(shiftDate(TODAY, 9));
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
    expect(review.completed.map((goal) => goal.taskId)).toEqual(["task_done_current", "task_done_earlier"]);
  });

  it("同周完成增益、情绪与待确认记录与周 K 涨跌及明细一致", () => {
    const records = buildReviewFixture(TODAY);
    const result = engineFor(records);
    const week = weekOf(result);
    const review = deriveWeeklyReview(records, result, { weekStart: WEEK_START });

    expect(review.week.open).toBeCloseTo(week.open, 10);
    expect(review.week.close).toBeCloseTo(week.close, 10);
    expect(review.week.changePct).toBeCloseTo((week.close - week.open) / week.open, 12);
    expect(review.week.close).toBeCloseTo(result.latest, 10);
    expect(review.week.rawTotal).toBeCloseTo(rawTotalOf(week), 10);
    expect(review.week.adjustment).toBeCloseTo(
      week.days.reduce((sum, day) => sum + day.adjustment, 0),
      10,
    );
    expect(review.contributions.reduce((sum, row) => sum + row.contribution, 0)).toBeCloseTo(rawTotalOf(week), 10);

    const completionRows = review.contributions.filter((row) => row.type === "completion");
    expect(completionRows).toHaveLength(1);
    expect(completionRows[0].targetId).toBe("task_done_current");
    expect(completionRows[0].contribution).toBeCloseTo(WEIGHTS.completion * (3 / 3), 12);
    expect(review.completed[0].contribution).toBeCloseTo(completionRows[0].contribution, 12);

    const emotion = review.contributions.find((row) => row.type === "emotion");
    expect(emotion?.lineId).toBe("evt_review_note");
    expect(emotion?.contribution).toBe(0);
    expect(emotion?.status).toBe("zero");

    const pending = review.contributions.find((row) => row.type === "pending");
    expect(pending?.lineId).toBe("evt_pending_writing");
    expect(pending?.contribution).toBe(0);
    expect(pending?.status).toBe("pending");
    expect(review.pendingCount).toBe(1);

    const engineLines = week.days.flatMap((day) => day.lines);
    expect(engineLines.filter((line) => line.id === "evt_pending_writing").every((line) => line.contribution === 0)).toBe(true);
    expect(engineLines.filter((line) => line.id === "evt_review_note").every((line) => line.contribution === 0)).toBe(true);
  });

  it("待确认记录不影响账本起点、指数与沉默衰减（D40）", () => {
    const records = buildReviewFixture(TODAY);
    const withoutPending = structuredClone(records);
    withoutPending.events = withoutPending.events.filter((event) => event.id !== "evt_pending_writing");
    const withResult = engineFor(records);
    const withoutResult = engineFor(withoutPending);

    expect(withResult.latest).toBeCloseTo(withoutResult.latest, 12);
    expect(withResult.startDate).toBe(withoutResult.startDate);
    expect(withResult.weeks.at(-1)?.close).toBeCloseTo(withoutResult.weeks.at(-1)?.close ?? 0, 12);
  });

  it("跨周时完成事实只落在实际完成周", () => {
    const records = buildReviewFixture(TODAY);
    const result = engineFor(records);
    const current = deriveWeeklyReview(records, result, { weekStart: WEEK_START });
    const previous = deriveWeeklyReview(records, result, { weekStart: PREVIOUS_WEEK });

    expect(current.completed.map((goal) => goal.taskId)).not.toContain("task_done_previous");
    expect(previous.completed.map((goal) => goal.taskId)).toEqual(["task_done_previous"]);
    expect(
      current.contributions.some((row) => row.type === "completion" && row.targetId === "task_done_previous"),
    ).toBe(false);
    expect(
      previous.contributions.some((row) => row.type === "completion" && row.targetId === "task_done_previous"),
    ).toBe(true);
    expect(previous.week.weekStart).toBe(PREVIOUS_WEEK);
    expect(previous.week.isCurrent).toBe(false);
    expect(current.week.isCurrent).toBe(true);
  });

  it("空账本得到零变化周与空分组", () => {
    const records = emptyLedger();
    const result = engineFor(records);
    const review = deriveWeeklyReview(records, result, { weekStart: WEEK_START });

    expect(review.isEmpty).toBe(true);
    expect(review.completed).toEqual([]);
    expect(review.ongoing).toEqual([]);
    expect(review.contributions).toEqual([]);
    expect(review.week.open).toBe(1000);
    expect(review.week.close).toBe(1000);
    expect(review.week.changePct).toBe(0);
    expect(review.week.weekKey).toBe(WEEK_START);
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
    expect(write.applied).toBe(true);
    const correctedResult = engineFor(corrected);
    const correctedReview = deriveWeeklyReview(corrected, correctedResult, { weekStart: WEEK_START });
    const previousReview = deriveWeeklyReview(corrected, correctedResult, { weekStart: PREVIOUS_WEEK });

    expect(correctedReview.contributions.some((row) => row.lineId === "evt_run")).toBe(false);
    expect(previousReview.contributions.some((row) => row.lineId === "evt_run")).toBe(true);
    expect(correctedReview.week.close).not.toBeCloseTo(before.week.close, 10);
    expect(correctedReview.week.changePct).toBeCloseTo(
      (weekOf(correctedResult).close - weekOf(correctedResult).open) / weekOf(correctedResult).open,
      12,
    );
    expect(correctedReview.week.rawTotal).toBeCloseTo(rawTotalOf(weekOf(correctedResult)), 10);
  });

  it("撤销完成目标后，完成增益与已完成分组一起消失", () => {
    const records = buildReviewFixture(TODAY);
    const before = deriveWeeklyReview(records, engineFor(records), { weekStart: WEEK_START });

    const undone = structuredClone(records);
    const write = applyItems(undone, [{ op: "delete_task", id: "task_done_current" }], { today: TODAY, now: NOW });
    expect(write.applied).toBe(true);
    const undoneResult = engineFor(undone);
    const review = deriveWeeklyReview(undone, undoneResult, { weekStart: WEEK_START });

    expect(review.completed.map((goal) => goal.taskId)).not.toContain("task_done_current");
    expect(review.contributions.some((row) => row.type === "completion" && row.targetId === "task_done_current")).toBe(false);
    expect(review.week.close).toBeLessThan(before.week.close);
    expect(review.week.changePct).toBeCloseTo(
      (weekOf(undoneResult).close - weekOf(undoneResult).open) / weekOf(undoneResult).open,
      12,
    );
  });

  it("否认待确认记录后复盘重算并移除待确认项", () => {
    const records = buildReviewFixture(TODAY);
    const before = deriveWeeklyReview(records, engineFor(records), { weekStart: WEEK_START });

    const denied = structuredClone(records);
    const write = applyItems(denied, [{ op: "deny_event", id: "evt_pending_writing" }], { today: TODAY, now: NOW });
    expect(write.applied).toBe(true);
    const review = deriveWeeklyReview(denied, engineFor(denied), { weekStart: WEEK_START });

    expect(review.contributions.some((row) => row.lineId === "evt_pending_writing")).toBe(false);
    expect(review.pendingCount).toBe(0);
    expect(review.week.close).toBeCloseTo(before.week.close, 12);
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
    expect(first.changed).toBe(1);
    expect(second.changed).toBe(0);

    const result = engineFor(records);
    const review = deriveWeeklyReview(records, result, { weekStart: WEEK_START });
    const rows = review.contributions.filter((row) => row.type === "completion" && row.targetId === "task_active_paper");
    expect(rows).toHaveLength(1);
    expect(rows[0].contribution).toBeCloseTo(WEIGHTS.completion * (3 / 3), 12);
    expect(review.completed.some((goal) => goal.taskId === "task_active_paper")).toBe(true);
    expect(review.ongoing.some((goal) => goal.taskId === "task_active_paper")).toBe(false);
  });

  it("周标识来自引擎周边界，并标记当前周", () => {
    const records = buildReviewFixture(TODAY);
    const result = engineFor(records);
    const weeks = listReviewWeeks(result);
    expect(weeks.at(-1)?.weekKey).toBe(weekStartOf(TODAY));
    expect(weeks.at(-1)?.isCurrent).toBe(true);
    expect(weeks.some((week) => week.weekKey === PREVIOUS_WEEK && !week.isCurrent)).toBe(true);
  });
});
