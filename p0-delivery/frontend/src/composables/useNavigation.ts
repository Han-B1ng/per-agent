import { computed, reactive, ref } from "vue";
import { findRecord, getTimeline, weekStartOf } from "../core";
import type { AnyRecord, DataView, DrawerState, GoalView, Page, TimelineRow, WeekResult } from "../types";
import type { LedgerWorkspace } from "./useLedger";

export function useNavigation(ledger: LedgerWorkspace) {
  const page = ref<Page>("market");
  const focusMode = ref(false);
  const navOpen = ref(false);
  const goalFormOpen = ref(false);
  const clearArmed = ref(false);
  const completionRequest = ref<{ id: string; title: string } | null>(null);
  const lastCompletedGoalId = ref("");
  const drawer = reactive<DrawerState>({ open: false, mode: "week", week: null, id: null, tab: "detail" });

  const currentWeek = computed<WeekResult | null>(() => (drawer.week == null ? null : ledger.api.result.value.weeks[drawer.week] ?? null));
  const selectedGoal = computed<GoalView | null>(() => {
    if (!drawer.id) return null;
    return [...ledger.api.goals.value.active, ...ledger.api.goals.value.done].find((goal) => goal.id === drawer.id) ?? null;
  });
  const selectedRecord = computed<AnyRecord | null>(() => (drawer.id ? findRecord(ledger.api.records.value, drawer.id) : null));
  const selectedTimelineRow = computed<TimelineRow | null>(() => (
    drawer.id
      ? getTimeline(ledger.api.records.value, ledger.api.result.value, { includeDeleted: true }).find((row) => row.id === drawer.id) ?? null
      : null
  ));
  const auditHistory = computed(() => ledger.api.personal.value.audit.filter((entry) => entry.targetId === drawer.id).slice().reverse());

  function setFocus(active: boolean) {
    focusMode.value = active;
  }
  function setPage(next: Page, options: { taskId?: string } = {}) {
    page.value = next;
    ledger.internal.setRecordTaskId(next === "records" ? options.taskId ?? "" : "");
    navOpen.value = false;
    if (next !== "market") focusMode.value = false;
    closeDrawer();
  }
  function setView(next: DataView) {
    ledger.internal.setViewData(next);
    closeDrawer();
  }
  function openWeek(index: number) {
    drawer.open = true;
    drawer.mode = "week";
    drawer.week = index;
    drawer.id = null;
    drawer.tab = "detail";
    clearArmed.value = false;
  }
  function openEntity(mode: "goal" | "record" | "settings", id: string) {
    drawer.open = true;
    drawer.mode = mode;
    drawer.id = id;
    drawer.week = null;
    clearArmed.value = false;
  }
  function closeDrawer() {
    drawer.open = false;
    drawer.week = null;
  }
  function openWeekForDate(date: string) {
    const index = ledger.api.result.value.weeks.findIndex((week) => week.weekStart === weekStartOf(date));
    if (index >= 0) {
      openWeek(index);
      return;
    }
    setPage("market");
    const next = ledger.api.result.value.weeks.findIndex((week) => week.weekStart === weekStartOf(date));
    if (next >= 0) openWeek(next);
  }
  function openGoalForm() {
    if (ledger.api.view.value === "sample") ledger.internal.setViewData("personal");
    setPage("goals");
    goalFormOpen.value = true;
  }
  function openFirstActiveGoal() {
    setPage("goals");
    const goal = ledger.api.goals.value.active[0];
    if (goal) openEntity("goal", goal.id);
  }
  function requestCompleteTask(id: string) {
    const goal = [...ledger.api.goals.value.active, ...ledger.api.goals.value.done].find((entry) => entry.id === id);
    if (!goal || goal.status !== "open") return;
    completionRequest.value = { id: goal.id, title: goal.title };
  }
  function cancelCompletion() {
    completionRequest.value = null;
  }
  function completeTask(id: string) {
    const write = ledger.internal.completeTask(id);
    if (write.applied && write.changed > 0) lastCompletedGoalId.value = id;
    return write;
  }
  function confirmCompletion() {
    const request = completionRequest.value;
    if (!request) return;
    completeTask(request.id);
    completionRequest.value = null;
  }
  function clearCompletedNotice() {
    lastCompletedGoalId.value = "";
  }
  function addGoal(title: string, dueAt: string, position: number) {
    if (ledger.api.view.value === "sample") ledger.internal.setViewData("personal");
    ledger.internal.addGoal(title, dueAt, position);
    goalFormOpen.value = false;
  }
  function resetForClear() {
    focusMode.value = false;
    completionRequest.value = null;
    lastCompletedGoalId.value = "";
    clearArmed.value = false;
  }

  const api = {
    page, focusMode, navOpen, goalFormOpen, clearArmed, completionRequest, lastCompletedGoalId, drawer,
    currentWeek, selectedGoal, selectedRecord, selectedTimelineRow, auditHistory,
    setFocus, setPage, setView, openWeek, openEntity, closeDrawer, openWeekForDate,
    openGoalForm, openFirstActiveGoal, requestCompleteTask, cancelCompletion, completeTask, confirmCompletion,
    clearCompletedNotice, addGoal,
  };
  const internal = { resetForClear };
  return { api, internal };
}

export type NavigationWorkspace = ReturnType<typeof useNavigation>;