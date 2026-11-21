// 本周复盘派生：只读账本 + 引擎输出，不持久化、不重新计分。
// 周边界、周开盘/收盘、完成增益与待确认隔离全部以 computeAll 的 weeks/days 为准。
import { parseDate, shiftDate, weekStartOf } from "../../../../web/engine.js";
import { getGoals } from "../../../../web/ledger.js";
import type { ComputeResult, EngineLine, LedgerRecords, WeekResult } from "../../types";

export type ContributionStatus = "counted" | "pending" | "zero" | "capped";
export type OngoingStatus = "open" | "overdue" | "paused";

export interface ReviewContribution {
  key: string;
  type: string;
  lineId: string | null;
  targetId: string | null;
  label: string;
  quote: string | null;
  contribution: number;
  note: string | null;
  status: ContributionStatus;
  dates: string[];
  firstDate: string;
  lastDate: string;
}

export interface ReviewCompletedGoal {
  taskId: string;
  title: string;
  doneAt: string;
  doneDate: string;
  dueAt: string;
  position: number;
  contribution: number;
}

export interface ReviewOngoingGoal {
  taskId: string;
  title: string;
  status: OngoingStatus;
  dueAt: string;
  position: number;
}

export interface ReviewWeekSummary {
  weekKey: string;
  weekStart: string;
  weekEnd: string;
  isCurrent: boolean;
  hasWeekData: boolean;
  open: number;
  close: number;
  high: number;
  low: number;
  change: number;
  changePct: number;
  rawTotal: number;
  adjustment: number;
  dayCount: number;
  sparkline: number[];
}

export interface WeeklyReview {
  week: ReviewWeekSummary;
  completed: ReviewCompletedGoal[];
  ongoing: ReviewOngoingGoal[];
  contributions: ReviewContribution[];
  completedCount: number;
  ongoingCount: number;
  pendingCount: number;
  isEmpty: boolean;
}

export interface ReviewWeekOption {
  weekKey: string;
  weekStart: string;
  weekEnd: string;
  index: number;
  isCurrent: boolean;
}

const TYPE_ORDER: Record<string, number> = {
  completion: 0,
  event: 1,
  rest: 2,
  emotion: 3,
  pending: 4,
  pending_rest: 5,
  overdue: 6,
  decay: 7,
};

function dateOf(iso: string | null): string {
  return String(iso || "").slice(0, 10);
}

function contributionKey(line: EngineLine): string {
  if (line.type === "decay") return "decay";
  return `${line.type}:${line.id ?? line.label}`;
}

function contributionStatus(line: EngineLine): ContributionStatus {
  if (line.type === "pending" || line.type === "pending_rest") return "pending";
  if (line.type === "emotion") return "zero";
  if (line.contribution === 0) return "capped";
  return "counted";
}

function targetIdOf(line: EngineLine): string | null {
  return line.type === "completion" || line.type === "overdue" ? line.id : null;
}

function aggregateContributions(week: WeekResult | null): ReviewContribution[] {
  const rows = new Map<string, ReviewContribution>();
  for (const day of week?.days ?? []) {
    for (const line of day.lines) {
      const key = contributionKey(line);
      let row = rows.get(key);
      if (!row) {
        row = {
          key,
          type: line.type,
          lineId: line.id,
          targetId: targetIdOf(line),
          label: line.label,
          quote: line.quote,
          contribution: 0,
          note: line.note,
          status: contributionStatus(line),
          dates: [],
          firstDate: day.date,
          lastDate: day.date,
        };
        rows.set(key, row);
      }
      row.contribution += line.contribution;
      if (line.note) row.note = line.note;
      if (!row.dates.includes(day.date)) row.dates.push(day.date);
      if (day.date < row.firstDate) row.firstDate = day.date;
      if (day.date > row.lastDate) row.lastDate = day.date;
      if (row.status !== "pending" && contributionStatus(line) === "pending") row.status = "pending";
    }
  }
  return [...rows.values()].sort(
    (a, b) =>
      a.firstDate.localeCompare(b.firstDate) ||
      (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9) ||
      a.key.localeCompare(b.key),
  );
}

export function listReviewWeeks(result: ComputeResult): ReviewWeekOption[] {
  const current = weekStartOf(result.today);
  return result.weeks.map((week, index) => ({
    weekKey: week.weekStart,
    weekStart: week.weekStart,
    weekEnd: week.weekEnd,
    index,
    isCurrent: week.weekStart === current,
  }));
}

export function deriveWeeklyReview(
  records: LedgerRecords,
  result: ComputeResult,
  options: { weekStart?: string } = {},
): WeeklyReview {
  const currentWeekStart = weekStartOf(result.today);
  const weekKey = weekStartOf(options.weekStart || result.today);
  const week = result.weeks.find((candidate) => candidate.weekStart === weekKey) ?? null;
  const isCurrent = weekKey === currentWeekStart;
  const weekEnd = week?.weekEnd ?? (isCurrent ? result.today : shiftDate(weekKey, 6));
  const open = week?.open ?? result.latest;
  const close = week?.close ?? result.latest;
  const change = close - open;
  const changePct = open > 0 ? change / open : 0;
  const contributions = aggregateContributions(week);
  const rawTotal = contributions.reduce((sum, row) => sum + row.contribution, 0);
  const adjustment = (week?.days ?? []).reduce((sum, day) => sum + day.adjustment, 0);

  const completionContributions = new Map<string, number>();
  for (const row of contributions) {
    if (row.type === "completion" && row.lineId) completionContributions.set(row.lineId, row.contribution);
  }

  const completed = records.tasks
    .filter((task) => {
      if (task.deletedAt != null || task.status !== "done" || !task.doneAt) return false;
      const doneDate = dateOf(task.doneAt);
      return doneDate >= weekKey && doneDate <= weekEnd;
    })
    .sort((a, b) => String(b.doneAt).localeCompare(String(a.doneAt)) || a.id.localeCompare(b.id))
    .map((task) => ({
      taskId: task.id,
      title: task.title,
      doneAt: task.doneAt as string,
      doneDate: dateOf(task.doneAt),
      dueAt: task.dueAt,
      position: task.position,
      contribution: completionContributions.get(task.id) ?? 0,
    }));

  const goals = getGoals(records, weekEnd);
  const ongoing = goals.active
    .filter((goal) => dateOf(goal.createdAt) <= weekEnd)
    .map((goal) => ({
      taskId: goal.id,
      title: goal.title,
      status: goal.displayStatus as OngoingStatus,
      dueAt: goal.dueAt,
      position: goal.position,
    }));

  return {
    week: {
      weekKey,
      weekStart: weekKey,
      weekEnd,
      isCurrent,
      hasWeekData: week != null,
      open,
      close,
      high: week?.high ?? close,
      low: week?.low ?? close,
      change,
      changePct,
      rawTotal,
      adjustment,
      dayCount: week?.days.length ?? 0,
      sparkline: week?.days.length ? [week.open, ...week.days.map((day) => day.close)] : [open, close],
    },
    completed,
    ongoing,
    contributions,
    completedCount: completed.length,
    ongoingCount: ongoing.length,
    pendingCount: contributions.filter((row) => row.status === "pending").length,
    isEmpty: completed.length === 0 && ongoing.length === 0 && contributions.length === 0,
  };
}

export function formatWeekRange(start: string, end: string): string {
  const fmt = (value: string) => {
    const date = new Date(parseDate(value));
    return `${date.getUTCMonth() + 1}月${date.getUTCDate()}日`;
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

export function formatShortDate(value: string): string {
  return `${Number(value.slice(5, 7))}.${value.slice(8, 10)}`;
}
