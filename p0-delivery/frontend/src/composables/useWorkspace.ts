import { computed, reactive, ref } from "vue";
import {
  applyItems, buildSampleRecords, clearPersonal, computeAll, findRecord, genId, getClientId,
  getGoals, getTimeline, health, loadPersonal, savePersonal, send, shiftDate, weekStartOf, SAMPLE_META,
} from "../core";
import type {
  ChatMessage, ComputeResult, DataView, DrawerState, ExtractContext, ExtractItem, GoalView,
  LedgerRecords, ModelState, Page, PersonalLedger, RecordFilters, TimelineRow,
} from "../types";

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function useWorkspace() {
  const today = ref(localToday());
  const personal = ref<PersonalLedger>(loadPersonal());
  const sample = ref(buildSampleRecords(today.value));
  const view = ref<DataView>("sample");
  const page = ref<Page>("market");
  const focusMode = ref(false);
  const focusLocked = ref(false);
  const busy = ref(false);
  const typing = ref(false);
  const modelState = ref<ModelState>("mock");
  const navOpen = ref(false);
  const draft = ref("");
  const clearArmed = ref(false);
  const goalFormOpen = ref(false);
  const recordTaskId = ref("");
  const composerFocusSignal = ref(0);
  const lastExtract = ref<{ status: "waiting" | "success" | "failed"; text?: string; message?: string; mode?: string } | null>(null);
  const lastFailed = ref<ChatMessage | null>(null);
  const generation = ref(0);
  const activeRequest = ref<number | null>(null);
  let requestSeq = 0;

  const drawer = reactive<DrawerState>({ open: false, mode: "week", week: null, id: null, tab: "detail" });
  const filters = reactive<RecordFilters>({ from: "", to: "", keyword: "", type: "all", taskId: "", includeDeleted: false });

  const records = computed<LedgerRecords>(() => (view.value === "sample" ? sample.value : personal.value));
  const editable = computed(() => view.value === "personal");
  const result = computed<ComputeResult>(() => computeAll(records.value, { today: today.value }));
  const goals = computed(() => getGoals(records.value, today.value));
  const timeline = computed<TimelineRow[]>(() => getTimeline(records.value, result.value, { ...filters, taskId: recordTaskId.value }));
  const hasMessages = computed(() => personal.value.chat.length > 0 || typing.value);
  const currentWeek = computed(() => (drawer.week == null ? null : result.value.weeks[drawer.week] ?? null));
  const selectedGoal = computed<GoalView | null>(() => {
    if (!drawer.id) return null;
    return [...goals.value.active, ...goals.value.done].find((g) => g.id === drawer.id) ?? null;
  });
  const selectedRecord = computed(() => (drawer.id ? findRecord(records.value, drawer.id) : null));
  const selectedTimelineRow = computed(() => getTimeline(records.value, result.value, { includeDeleted: true }).find((r) => r.id === drawer.id) ?? null);
  const auditHistory = computed(() => personal.value.audit.filter((a) => a.targetId === drawer.id).slice().reverse());
  const linkedTaskTitle = computed(() => records.value.tasks.find((t) => t.id === recordTaskId.value)?.title ?? recordTaskId.value);

  function refreshToday(): boolean {
    const next = localToday();
    if (next === today.value) return false;
    today.value = next;
    sample.value = buildSampleRecords(next);
    return true;
  }
  function persist() {
    savePersonal(personal.value);
  }
  function commit(items: ExtractItem[]) {
    refreshToday();
    const write = applyItems(personal.value, items, { today: today.value });
    persist();
    return write;
  }
  function setFocus(active: boolean) {
    focusMode.value = active;
    focusLocked.value = !active;
  }
  function setView(next: DataView) {
    view.value = next;
    closeDrawer();
  }
  function setPage(next: Page, options: { taskId?: string } = {}) {
    page.value = next;
    recordTaskId.value = next === "records" ? options.taskId ?? "" : "";
    navOpen.value = false;
    if (next !== "market") focusMode.value = false;
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
    const index = result.value.weeks.findIndex((w) => w.weekStart === weekStartOf(date));
    if (index >= 0) openWeek(index);
    else {
      setPage("market");
      const next = result.value.weeks.findIndex((w) => w.weekStart === weekStartOf(date));
      if (next >= 0) openWeek(next);
    }
  }
  function clearPersonalData() {
    generation.value += 1;
    activeRequest.value = null;
    busy.value = false;
    typing.value = false;
    personal.value = clearPersonal();
    clearArmed.value = false;
    lastExtract.value = null;
    lastFailed.value = null;
    persist();
  }
  function resetChat() {
    personal.value.chat = [];
    lastExtract.value = null;
    lastFailed.value = null;
    persist();
    focusMode.value = false;
    composerFocusSignal.value += 1;
  }
  function buildContext(): ExtractContext {
    refreshToday();
    return {
      today: today.value,
      now: new Date().toISOString(),
      clientId: getClientId(),
      openTasks: personal.value.tasks.filter((t) => t.status === "open" && t.deletedAt == null).map((t) => ({ id: t.id, title: t.title, dueAt: t.dueAt, position: t.position })),
      pendingEvents: personal.value.events.filter((e) => e.status === "pending" && e.deletedAt == null).map((e) => ({ id: e.id, quote: e.quote, occurredAt: e.occurredAt, eventType: e.eventType, polarity: e.polarity, intensity: e.intensity })),
      pendingRests: personal.value.rests.filter((r) => r.status === "pending" && r.deletedAt == null).map((r) => ({ id: r.id, quote: r.quote, date: r.date })),
      turns: personal.value.chat.filter((m) => !m.failed && m.text).slice(-10).map((m) => ({ role: m.role, content: m.text })),
    };
  }
  function recordFailure(text: string, error: { code: string; message: string }) {
    const failed: ChatMessage = { id: genId("msg"), role: "assistant", text: error.message, failed: { text, code: error.code } };
    personal.value.chat.push(failed);
    lastFailed.value = failed;
    lastExtract.value = { status: "failed", message: error.message };
    if (error.code !== "conflict") modelState.value = "degraded";
  }
  async function sendText(text: string, options: { skipUser?: boolean; useMock?: boolean } = {}) {
    if (busy.value) return;
    focusLocked.value = false;
    refreshToday();
    if (view.value === "sample") setView("personal");
    const requestGeneration = generation.value;
    const requestId = ++requestSeq;
    activeRequest.value = requestId;
    busy.value = true;
    lastExtract.value = { status: "waiting", text };
    if (!options.skipUser) personal.value.chat.push({ id: genId("msg"), role: "user", text });
    typing.value = true;
    const response = await send(text, buildContext(), { useMock: options.useMock });
    if (requestGeneration !== generation.value || requestId !== activeRequest.value) return;
    activeRequest.value = null;
    typing.value = false;
    busy.value = false;
    if (response.ok) {
      const write = commit(response.items);
      if (!write.applied) {
        recordFailure(text, { code: "conflict", message: "账本已变化，这次操作整批未写入。请按最新记录重试。" });
      } else {
        personal.value.chat.push({ id: genId("msg"), role: "assistant", text: response.reply, pending: write.newPending, mode: response.mode });
        lastExtract.value = { status: "success", mode: response.mode };
        modelState.value = response.mode === "model" ? "model" : "mock";
      }
    } else {
      recordFailure(text, response.error);
    }
    persist();
    composerFocusSignal.value += 1;
  }
  function retryFailed(message: ChatMessage, useMock: boolean) {
    if (!message.failed) return;
    personal.value.chat = personal.value.chat.filter((m) => m.id !== message.id);
    lastFailed.value = null;
    lastExtract.value = null;
    persist();
    void sendText(message.failed.text, { skipUser: true, useMock });
  }
  function confirmPending(id: string, kind: "event" | "rest", date?: string) {
    commit([{ op: kind === "rest" ? "confirm_rest" : "confirm_event", id, ...(date ? (kind === "rest" ? { date } : { occurredAt: date }) : {}) } as ExtractItem]);
  }
  function denyPending(id: string, kind: "event" | "rest") {
    commit([{ op: kind === "rest" ? "deny_rest" : "deny_event", id } as ExtractItem]);
  }
  function deleteRecord(id: string, kind: "event" | "rest") {
    commit([{ op: kind === "rest" ? "delete_rest" : "delete_event", id } as ExtractItem]);
  }
  function completeTask(id: string) {
    commit([{ op: "complete_task", id }]);
  }
  function deleteTask(id: string) {
    commit([{ op: "delete_task", id }]);
  }
  function addGoal(title: string, dueAt: string, position: number) {
    if (!title.trim() || !dueAt) return;
    if (view.value === "sample") setView("personal");
    commit([{ op: "add_task", task: { title: title.trim(), dueAt, position, confidence: 1 } }]);
    goalFormOpen.value = false;
  }
  function correctRecord(id: string, kind: "event" | "rest", date: string, quote: string) {
    commit([{ op: kind === "rest" ? "correct_rest" : "correct_event", id, ...(kind === "rest" ? { date } : { occurredAt: date }), quote } as ExtractItem]);
  }
  function clearFilters() {
    filters.from = "";
    filters.to = "";
    filters.keyword = "";
    filters.type = "all";
    filters.includeDeleted = false;
    recordTaskId.value = "";
  }
  function exportCurrent() {
    refreshToday();
    const payload = { scope: view.value, exportedAt: new Date().toISOString(), records: records.value };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `personal-economy-${view.value}-${today.value}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function checkHealth() {
    const h = await health();
    modelState.value = h.mode === "model" ? "model" : h.mode === "mock" ? "mock" : "offline";
  }
  function findPending(id: string) {
    const event = personal.value.events.find((e) => e.id === id && e.status === "pending" && e.deletedAt == null);
    if (event) return { record: event, kind: "event" as const };
    const rest = personal.value.rests.find((r) => r.id === id && r.status === "pending" && r.deletedAt == null);
    if (rest) return { record: rest, kind: "rest" as const };
    return null;
  }

  return {
    today, personal, sample, view, page, focusMode, focusLocked, busy, typing, modelState, navOpen, draft,
    clearArmed, goalFormOpen, recordTaskId, composerFocusSignal, lastExtract, lastFailed, drawer, filters,
    records, editable, result, goals, timeline, hasMessages, currentWeek, selectedGoal, selectedRecord,
    selectedTimelineRow, auditHistory, linkedTaskTitle, SAMPLE_META,
    refreshToday, persist, commit, setFocus, setView, setPage, openWeek, openEntity, closeDrawer,
    openWeekForDate, clearPersonalData, resetChat, sendText, retryFailed, confirmPending, denyPending,
    deleteRecord, completeTask, deleteTask, addGoal, correctRecord, clearFilters, exportCurrent,
    checkHealth, findPending, shiftDate,
  };
}

export type Workspace = ReturnType<typeof useWorkspace>;
