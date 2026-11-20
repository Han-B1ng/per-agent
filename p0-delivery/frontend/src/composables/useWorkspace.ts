import { computed, reactive, ref } from "vue";
import {
  applyItems, buildReceipt, buildSampleRecords, clarificationItem, clearPersonal, computeAll, findRecord, genId, getClientId,
  getGoals, getTimeline, hasAdditionalIntent, health, isQuestionOnlyText, loadPersonal, noOpReply, normalizeClarification, planAgentItems, resolveClarificationReply,
  sanitizeAgentReply, savePersonal, send, shiftDate, validateAgentWrites, validateClarificationAgainstLedger, weekStartOf, SAMPLE_META,
} from "../core";
import type {
  AgentReceipt, ChatMessage, Clarification, ComputeResult, DataView, DrawerState, ExtractContext, ExtractItem, GoalView,
  LedgerRecords, ModelState, Page, PersonalLedger, RecordFilters, Theme, TimelineRow,
} from "../types";

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function storedTheme(): Theme {
  try {
    const value = localStorage.getItem("pe.theme.v1");
    return value === "light" || value === "midnight" ? value : "dark";
  } catch {
    return "dark";
  }
}

export function useWorkspace() {
  const today = ref(localToday());
  const theme = ref<Theme>(storedTheme());
  document.documentElement.dataset.peTheme = theme.value;
  const personal = ref<PersonalLedger>(loadPersonal());
  const sample = ref(buildSampleRecords(today.value));
  const view = ref<DataView>("sample");
  const page = ref<Page>("market");
  const focusMode = ref(false);
  const focusLocked = ref(false);
  const conversationOpen = ref(false);
  const composerExtra = ref(0);
  const completionRequest = ref<{ id: string; title: string } | null>(null);
  const lastCompletedGoalId = ref("");
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
  const personalEmpty = computed(() => personal.value.events.length === 0 && personal.value.rests.length === 0 && personal.value.tasks.length === 0);

  function setTheme(next: Theme) {
    theme.value = next;
    document.documentElement.dataset.peTheme = next;
    try { localStorage.setItem("pe.theme.v1", next); } catch {}
  }
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
    conversationOpen.value = active;
  }
  function openConversation() {
    conversationOpen.value = true;
  }
  function closeConversation() {
    if (focusMode.value) setFocus(false);
    else conversationOpen.value = false;
  }
  function focusComposer() {
    if (view.value === "sample") setView("personal");
    setPage("market");
    composerFocusSignal.value += 1;
  }
  function openGoalForm() {
    if (view.value === "sample") setView("personal");
    setPage("goals");
    goalFormOpen.value = true;
  }
  function openFirstActiveGoal() {
    setPage("goals");
    const goal = goals.value.active[0];
    if (goal) openEntity("goal", goal.id);
  }
  function requestCompleteTask(id: string) {
    const goal = [...goals.value.active, ...goals.value.done].find((entry) => entry.id === id);
    if (!goal || goal.status !== "open") return;
    completionRequest.value = { id: goal.id, title: goal.title };
  }
  function cancelCompletion() {
    completionRequest.value = null;
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
  function setView(next: DataView) {
    view.value = next;
    closeDrawer();
  }
  function setPage(next: Page, options: { taskId?: string } = {}) {
    page.value = next;
    recordTaskId.value = next === "records" ? options.taskId ?? "" : "";
    navOpen.value = false;
    if (next !== "market") {
      focusMode.value = false;
      conversationOpen.value = false;
    }
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
    completionRequest.value = null;
    lastCompletedGoalId.value = "";
    conversationOpen.value = false;
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
  function activeClarifications(): Array<{ message: ChatMessage; clarification: Clarification }> {
    const out: Array<{ message: ChatMessage; clarification: Clarification }> = [];
    for (const message of personal.value.chat) {
      if (message.role !== "assistant" || !message.clarifications) continue;
      for (const clarification of message.clarifications) {
        if (clarification.status === "pending") out.push({ message, clarification });
      }
    }
    return out;
  }
  function buildContext(excludeText = ""): ExtractContext {
    refreshToday();
    const turns = personal.value.chat.filter((m) => !m.failed && m.text).map((m) => ({ role: m.role, content: m.text }));
    if (excludeText) {
      for (let index = turns.length - 1; index >= 0; index -= 1) {
        if (turns[index].role === "user" && turns[index].content === excludeText) {
          turns.splice(index, 1);
          break;
        }
      }
    }
    return {
      today: today.value,
      now: new Date().toISOString(),
      clientId: getClientId(),
      openTasks: personal.value.tasks.filter((t) => t.status === "open" && t.deletedAt == null).map((t) => ({ id: t.id, title: t.title, dueAt: t.dueAt, position: t.position })),
      pendingEvents: personal.value.events.filter((e) => e.status === "pending" && e.deletedAt == null).map((e) => ({ id: e.id, quote: e.quote, occurredAt: e.occurredAt, eventType: e.eventType, polarity: e.polarity, intensity: e.intensity })),
      pendingRests: personal.value.rests.filter((r) => r.status === "pending" && r.deletedAt == null).map((r) => ({ id: r.id, quote: r.quote, date: r.date })),
      clarifications: activeClarifications().slice(-5).map(({ clarification }) => ({
        id: clarification.id,
        kind: clarification.kind,
        intent: clarification.intent,
        question: clarification.question,
        sourceText: clarification.sourceText,
        candidates: clarification.candidates,
      })),
      turns: turns.slice(-10).map((m) => ({ ...m, content: m.content.slice(0, 1500) })),
    };
  }
  function recordFailure(text: string, error: { code: string; message: string }) {
    const failed: ChatMessage = { id: genId("msg"), role: "assistant", text: error.message, failed: { text, code: error.code } };
    personal.value.chat.push(failed);
    lastFailed.value = failed;
    lastExtract.value = { status: "failed", message: error.message };
    if (error.code !== "conflict") modelState.value = "degraded";
  }
  function markClarification(message: ChatMessage, clarification: Clarification, status: "resolved" | "cancelled", resolution?: Clarification["resolution"]) {
    // applyItems 会重建账本快照；写入后必须按稳定 ID 重新定位，不能持有旧对象。
    const currentMessage = personal.value.chat.find((entry) => entry.id === message.id);
    const current = currentMessage?.clarifications?.find((entry) => entry.id === clarification.id);
    if (!current) return;
    current.status = status;
    current.resolvedAt = new Date().toISOString();
    if (resolution) current.resolution = resolution;
    persist();
  }
  function targetLabel(item: ExtractItem): string {
    if (!("id" in item)) return "";
    return personal.value.tasks.find((task) => task.id === item.id)?.title
      || personal.value.events.find((event) => event.id === item.id)?.quote
      || personal.value.rests.find((rest) => rest.id === item.id)?.quote
      || "";
  }
  function finishClarification(message: ChatMessage, clarification: Clarification, item: ExtractItem, label = "") {
    refreshToday();
    const errors = validateAgentWrites([item], { today: today.value });
    if (errors.length) {
      recordFailure(clarification.sourceText || label, { code: "bad_output", message: errors[0] });
      persist();
      return;
    }
    const write = commit([item]);
    const receipt = buildReceipt({ writes: [item], result: write, clarifications: 0 });
    if (!write.applied) {
      markClarification(message, clarification, "cancelled", { text: write.errors[0] || "记录已变化", op: item.op, targetId: "id" in item ? item.id : undefined });
      recordFailure(clarification.sourceText || label, { code: "conflict", message: write.errors[0] || "账本已变化，这条没有写入。" });
      persist();
      return;
    }
    markClarification(message, clarification, "resolved", { text: label || clarification.sourceText, op: item.op, targetId: "id" in item ? item.id : undefined });
    const text = receipt.status === "noop"
      ? noOpReply(receipt)
      : item.op === "complete_task"
        ? `「${targetLabel(item) || label}」已完成，记下了。`
        : "好，按这条处理了。";
    personal.value.chat.push({ id: genId("msg"), role: "assistant", text, mode: "local", receipt, ...(write.newPending.length ? { pending: write.newPending } : {}) });
    lastExtract.value = { status: "success", mode: "local" };
    persist();
  }
  function tryResolveClarification(text: string): "none" | "resolved" | "cancelled" | "ambiguous" {
    const active = activeClarifications();
    if (!active.length) return "none";
    const results = active.map(({ message, clarification }) => ({
      message,
      clarification,
      result: resolveClarificationReply(clarification, text, today.value),
    }));
    const resolved = results.filter((entry) => ["resolved", "cancelled", "negative"].includes(entry.result.status));
    if (resolved.length > 1) {
      personal.value.chat.push({ id: genId("msg"), role: "assistant", text: "还有多个待确认事项，你想先处理哪一个？", mode: "local" });
      persist();
      return "ambiguous";
    }
    if (resolved.length === 1) {
      const { message, clarification, result } = resolved[0];
      if (result.status === "negative") {
        if (result.reason === "not_target") {
          personal.value.chat.push({ id: genId("msg"), role: "assistant", text: "好，不处理这个候选，也不会自动选择另一个。请明确选择要处理的目标。", mode: "local" });
          persist();
          return "ambiguous";
        }
        const reply = result.reason === "not_done"
          ? "这个目标还没完成，我先不标记。"
          : result.reason === "not_deleted"
            ? "这个目标还没删除，我先不动。"
            : "好，这条待确认记录先不处理。";
        markClarification(message, clarification, "cancelled", { text: reply, op: clarification.intent });
        personal.value.chat.push({ id: genId("msg"), role: "assistant", text: reply, mode: "local" });
        persist();
        return "cancelled";
      }
      if (result.status === "cancelled") {
        markClarification(message, clarification, "cancelled", { text: "用户取消", op: clarification.intent });
        personal.value.chat.push({ id: genId("msg"), role: "assistant", text: "好，这条先不处理。", mode: "local" });
        persist();
        return "cancelled";
      }
      if (result.item) finishClarification(message, clarification, result.item);
      return "resolved";
    }
    if (results.some((entry) => entry.result.status === "ambiguous")) {
      personal.value.chat.push({ id: genId("msg"), role: "assistant", text: "还是有点分不清，你指的是哪一个？可以直接说目标名、第几个或到期日。", mode: "local" });
      persist();
      return "ambiguous";
    }
    if (isQuestionOnlyText(text)) {
      personal.value.chat.push({ id: genId("msg"), role: "assistant", text: "你是想确认这一项，还是在问状态？如果要处理，请明确说「数据库那个，确认完成」。", mode: "local" });
      persist();
      return "ambiguous";
    }
    return "none";
  }
  function resolveClarificationCandidate(messageId: string, clarificationId: string, candidateId: string) {
    const message = personal.value.chat.find((entry) => entry.id === messageId);
    const clarification = message?.clarifications?.find((entry) => entry.id === clarificationId && entry.status === "pending");
    const candidate = clarification?.candidates.find((entry) => entry.id === candidateId);
    if (!message || !clarification || !candidate) return;
    refreshToday();
    finishClarification(message, clarification, clarificationItem(clarification, candidateId, today.value), candidate.title || candidate.quote || candidate.label);
  }
  function cancelClarification(messageId: string, clarificationId: string) {
    const message = personal.value.chat.find((entry) => entry.id === messageId);
    const clarification = message?.clarifications?.find((entry) => entry.id === clarificationId && entry.status === "pending");
    if (!message || !clarification) return;
    markClarification(message, clarification, "cancelled", { text: "用户取消", op: clarification.intent });
    personal.value.chat.push({ id: genId("msg"), role: "assistant", text: "好，这条先不处理。", mode: "local" });
    persist();
  }
  function applyAgentResponse(text: string, response: { reply: string; items: ExtractItem[]; mode: "model" | "mock" }) {
    const openTasks = personal.value.tasks.filter((task) => task.status === "open" && task.deletedAt == null).map((task) => ({ id: task.id, title: task.title, dueAt: task.dueAt }));
    const pendingEvents = personal.value.events.filter((event) => event.status === "pending" && event.deletedAt == null);
    const pendingRests = personal.value.rests.filter((rest) => rest.status === "pending" && rest.deletedAt == null);
    const plan = planAgentItems(response.items, text, { today: today.value, openTasks });
    const invalid = plan.clarifications.flatMap((clarification) => validateClarificationAgainstLedger(clarification, { openTasks, pendingEvents, pendingRests }));
    const writeErrors = validateAgentWrites(plan.writes, { today: today.value, text });
    if (invalid.length || writeErrors.length) {
      recordFailure(text, { code: "bad_output", message: invalid[0] || writeErrors[0] || "模型返回与当前账本不一致，这条没有录入。" });
      return;
    }
    const write = plan.writes.length
      ? commit(plan.writes)
      : { newPending: [], changed: 0, errors: [], applied: true };
    if (!write.applied) {
      recordFailure(text, { code: "conflict", message: "账本已变化，这次操作整批未写入。请按最新记录重试。" });
      return;
    }
    const now = new Date().toISOString();
    const clarifications = plan.clarifications
      .map((clarification) => normalizeClarification(clarification, { now, today: today.value, text, createId: genId }))
      .filter((clarification): clarification is Clarification => Boolean(clarification));
    for (const item of plan.writes) {
      if (!("id" in item)) continue;
      for (const { message, clarification } of activeClarifications()) {
        if (clarification.candidates.some((candidate) => candidate.id === item.id)) {
          markClarification(message, clarification, "resolved", { text: text, op: item.op, targetId: item.id });
        }
      }
    }
    const receipt = buildReceipt({ writes: plan.writes, result: write, clarifications: clarifications.length });
    let reply = sanitizeAgentReply(response.reply, receipt);
    if (receipt.status === "noop") reply = noOpReply(receipt);
    else if (plan.converted > 0) reply = "这项有多个相近目标，先确认是哪一个，再写入。";
    const message: ChatMessage = {
      id: genId("msg"),
      role: "assistant",
      text: reply,
      pending: write.newPending,
      mode: response.mode,
      ...(clarifications.length ? { clarifications } : {}),
      ...(receipt.status !== "empty" ? { receipt } : {}),
    };
    personal.value.chat.push(message);
    lastExtract.value = { status: "success", mode: response.mode };
    modelState.value = response.mode === "model" ? "model" : "mock";
    persist();
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
    let context = buildContext(options.skipUser ? text : "");
    if (!options.skipUser) personal.value.chat.push({ id: genId("msg"), role: "user", text });
    openConversation();
    const local = tryResolveClarification(text);
    if (local !== "none") {
      const continueWithModel = (local === "resolved" || local === "cancelled") && hasAdditionalIntent(text);
      if (!continueWithModel) {
        activeRequest.value = null;
        busy.value = false;
        composerFocusSignal.value += 1;
        return;
      }
      context = buildContext(text);
    }
    lastExtract.value = { status: "waiting", text };
    typing.value = true;
    const response = await send(text, context, { useMock: options.useMock });
    if (requestGeneration !== generation.value || requestId !== activeRequest.value) return;
    activeRequest.value = null;
    typing.value = false;
    busy.value = false;
    if (response.ok) applyAgentResponse(text, response);
    else recordFailure(text, response.error);
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
  function realDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
    const [y, m, d] = value.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10) === value;
  }
  function confirmPending(id: string, kind: "event" | "rest", date?: string): { ok: boolean; message?: string } {
    const rest = kind === "rest" ? personal.value.rests.find((entry) => entry.id === id && entry.status === "pending" && entry.deletedAt == null) : null;
    const event = kind === "event" ? personal.value.events.find((entry) => entry.id === id && entry.status === "pending" && entry.deletedAt == null) : null;
    if (!rest && !event) return { ok: false, message: "这条记录已处理或不存在；账本没有变化。" };
    const effectiveDate = date === undefined ? (rest ? rest.date : event!.occurredAt) : date;
    if (!effectiveDate) return { ok: false, message: "请填写生效日期；这条仍待确认。" };
    if (!realDate(effectiveDate)) return { ok: false, message: "生效日期格式无效；这条仍待确认。" };
    if (effectiveDate > today.value) {
      return { ok: false, message: "生效日期不能晚于今天；这条仍待确认。" };
    }
    const write = commit([{ op: kind === "rest" ? "confirm_rest" : "confirm_event", id, ...(kind === "rest" ? { date: effectiveDate } : { occurredAt: effectiveDate }) } as ExtractItem]);
    if (!write.applied) return { ok: false, message: write.errors[0] || "写入失败，这条仍待确认。" };
    return { ok: true };
  }
  function denyPending(id: string, kind: "event" | "rest") {
    commit([{ op: kind === "rest" ? "deny_rest" : "deny_event", id } as ExtractItem]);
  }
  function deleteRecord(id: string, kind: "event" | "rest") {
    commit([{ op: kind === "rest" ? "delete_rest" : "delete_event", id } as ExtractItem]);
  }
  function completeTask(id: string) {
    const write = commit([{ op: "complete_task", id }]);
    if (write.applied && write.changed > 0) lastCompletedGoalId.value = id;
    return write;
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
    today, personal, sample, view, page, theme, focusMode, focusLocked, conversationOpen, composerExtra, completionRequest, lastCompletedGoalId, personalEmpty, busy, typing, modelState, navOpen, draft,
    clearArmed, goalFormOpen, recordTaskId, composerFocusSignal, lastExtract, lastFailed, drawer, filters,
    records, editable, result, goals, timeline, hasMessages, currentWeek, selectedGoal, selectedRecord,
    selectedTimelineRow, auditHistory, linkedTaskTitle, SAMPLE_META,
    refreshToday, persist, commit, setTheme, setFocus, openConversation, closeConversation, focusComposer,
    openGoalForm, openFirstActiveGoal, requestCompleteTask, cancelCompletion, confirmCompletion,
    clearCompletedNotice, setView, setPage, openWeek, openEntity, closeDrawer,
    openWeekForDate, clearPersonalData, resetChat, sendText, retryFailed, confirmPending, denyPending,
    resolveClarificationCandidate, cancelClarification,
    deleteRecord, completeTask, deleteTask, addGoal, correctRecord, clearFilters, exportCurrent,
    checkHealth, findPending, shiftDate,
  };
}

export type Workspace = ReturnType<typeof useWorkspace>;
