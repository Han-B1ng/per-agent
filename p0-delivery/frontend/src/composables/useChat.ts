import { computed, ref } from "vue";
import {
  buildReceipt, clarificationItem, genId, getClientId, hasAdditionalIntent, health, isQuestionOnlyText,
  normalizeClarification, noOpReply, planAgentItems, resolveClarificationReply, sanitizeAgentReply, send,
  validateAgentWrites, validateClarificationAgainstLedger,
} from "../core";
import type { ChatMessage, Clarification, ExtractContext, ExtractItem, ModelState } from "../types";
import type { LedgerWorkspace } from "./useLedger";
import type { NavigationWorkspace } from "./useNavigation";

export function useChat(ledger: LedgerWorkspace, navigation: NavigationWorkspace) {
  const draft = ref("");
  const busy = ref(false);
  const typing = ref(false);
  const modelState = ref<ModelState>("mock");
  const lastExtract = ref<{ status: "waiting" | "success" | "failed"; text?: string; message?: string; mode?: string } | null>(null);
  const lastFailed = ref<ChatMessage | null>(null);
  const composerExtra = ref(0);
  const composerFocusSignal = ref(0);
  const generation = ref(0);
  const activeRequest = ref<number | null>(null);
  let requestSeq = 0;

  const hasMessages = computed(() => ledger.api.personal.value.chat.length > 0 || typing.value);

  function activeClarifications(): Array<{ message: ChatMessage; clarification: Clarification }> {
    const out: Array<{ message: ChatMessage; clarification: Clarification }> = [];
    for (const message of ledger.api.personal.value.chat) {
      if (message.role !== "assistant" || !message.clarifications) continue;
      for (const clarification of message.clarifications) {
        if (clarification.status === "pending") out.push({ message, clarification });
      }
    }
    return out;
  }
  function buildContext(excludeText = ""): ExtractContext {
    ledger.api.refreshToday();
    const turns = ledger.api.personal.value.chat.filter((message) => !message.failed && message.text).map((message) => ({ role: message.role, content: message.text }));
    if (excludeText) {
      for (let index = turns.length - 1; index >= 0; index -= 1) {
        if (turns[index].role === "user" && turns[index].content === excludeText) {
          turns.splice(index, 1);
          break;
        }
      }
    }
    return {
      today: ledger.api.today.value,
      now: new Date().toISOString(),
      clientId: getClientId(),
      openTasks: ledger.api.personal.value.tasks.filter((task) => task.status === "open" && task.deletedAt == null).map((task) => ({ id: task.id, title: task.title, dueAt: task.dueAt, position: task.position })),
      pendingEvents: ledger.api.personal.value.events.filter((event) => event.status === "pending" && event.deletedAt == null).map((event) => ({ id: event.id, quote: event.quote, occurredAt: event.occurredAt, eventType: event.eventType, polarity: event.polarity, intensity: event.intensity })),
      pendingRests: ledger.api.personal.value.rests.filter((rest) => rest.status === "pending" && rest.deletedAt == null).map((rest) => ({ id: rest.id, quote: rest.quote, date: rest.date })),
      clarifications: activeClarifications().slice(-5).map(({ clarification }) => ({
        id: clarification.id,
        kind: clarification.kind,
        intent: clarification.intent,
        question: clarification.question,
        sourceText: clarification.sourceText,
        candidates: clarification.candidates,
      })),
      turns: turns.slice(-10).map((message) => ({ ...message, content: message.content.slice(0, 1500) })),
    };
  }
  function recordFailure(text: string, error: { code: string; message: string }) {
    const failed: ChatMessage = { id: genId("msg"), role: "assistant", text: error.message, failed: { text, code: error.code } };
    ledger.api.personal.value.chat.push(failed);
    lastFailed.value = failed;
    lastExtract.value = { status: "failed", message: error.message };
    if (error.code !== "conflict") modelState.value = "degraded";
  }
  function markClarification(message: ChatMessage, clarification: Clarification, status: "resolved" | "cancelled", resolution?: Clarification["resolution"]) {
    // applyItems 会重建账本快照；写入后必须按稳定 ID 重新定位，不能持有旧对象。
    const currentMessage = ledger.api.personal.value.chat.find((entry) => entry.id === message.id);
    const current = currentMessage?.clarifications?.find((entry) => entry.id === clarification.id);
    if (!current) return;
    current.status = status;
    current.resolvedAt = new Date().toISOString();
    if (resolution) current.resolution = resolution;
    ledger.api.persist();
  }
  function targetLabel(item: ExtractItem): string {
    if (!("id" in item)) return "";
    return ledger.api.personal.value.tasks.find((task) => task.id === item.id)?.title
      || ledger.api.personal.value.events.find((event) => event.id === item.id)?.quote
      || ledger.api.personal.value.rests.find((rest) => rest.id === item.id)?.quote
      || "";
  }
  function finishClarification(message: ChatMessage, clarification: Clarification, item: ExtractItem, label = "") {
    ledger.api.refreshToday();
    const errors = validateAgentWrites([item], { today: ledger.api.today.value });
    if (errors.length) {
      recordFailure(clarification.sourceText || label, { code: "bad_output", message: errors[0] });
      ledger.api.persist();
      return;
    }
    const write = ledger.api.commit([item]);
    const receipt = buildReceipt({ writes: [item], result: write, clarifications: 0 });
    if (!write.applied) {
      markClarification(message, clarification, "cancelled", { text: write.errors[0] || "记录已变化", op: item.op, targetId: "id" in item ? item.id : undefined });
      recordFailure(clarification.sourceText || label, { code: "conflict", message: write.errors[0] || "账本已变化，这条没有写入。" });
      ledger.api.persist();
      return;
    }
    markClarification(message, clarification, "resolved", { text: label || clarification.sourceText, op: item.op, targetId: "id" in item ? item.id : undefined });
    const text = receipt.status === "noop"
      ? noOpReply(receipt)
      : item.op === "complete_task"
        ? `「${targetLabel(item) || label}」已完成，记下了。`
        : "好，按这条处理了。";
    ledger.api.personal.value.chat.push({ id: genId("msg"), role: "assistant", text, mode: "local", receipt, ...(write.newPending.length ? { pending: write.newPending } : {}) });
    lastExtract.value = { status: "success", mode: "local" };
    ledger.api.persist();
  }
  function tryResolveClarification(text: string): "none" | "resolved" | "cancelled" | "ambiguous" {
    const active = activeClarifications();
    if (!active.length) return "none";
    const results = active.map(({ message, clarification }) => ({
      message,
      clarification,
      result: resolveClarificationReply(clarification, text, ledger.api.today.value),
    }));
    const resolved = results.filter((entry) => ["resolved", "cancelled", "negative"].includes(entry.result.status));
    if (resolved.length > 1) {
      ledger.api.personal.value.chat.push({ id: genId("msg"), role: "assistant", text: "还有多个待确认事项，你想先处理哪一个？", mode: "local" });
      ledger.api.persist();
      return "ambiguous";
    }
    if (resolved.length === 1) {
      const { message, clarification, result } = resolved[0];
      if (result.status === "negative") {
        if (result.reason === "not_target") {
          ledger.api.personal.value.chat.push({ id: genId("msg"), role: "assistant", text: "好，不处理这个候选，也不会自动选择另一个。请明确选择要处理的目标。", mode: "local" });
          ledger.api.persist();
          return "ambiguous";
        }
        const reply = result.reason === "not_done"
          ? "这个目标还没完成，我先不标记。"
          : result.reason === "not_deleted"
            ? "这个目标还没删除，我先不动。"
            : "好，这条待确认记录先不处理。";
        markClarification(message, clarification, "cancelled", { text: reply, op: clarification.intent });
        ledger.api.personal.value.chat.push({ id: genId("msg"), role: "assistant", text: reply, mode: "local" });
        ledger.api.persist();
        return "cancelled";
      }
      if (result.status === "cancelled") {
        markClarification(message, clarification, "cancelled", { text: "用户取消", op: clarification.intent });
        ledger.api.personal.value.chat.push({ id: genId("msg"), role: "assistant", text: "好，这条先不处理。", mode: "local" });
        ledger.api.persist();
        return "cancelled";
      }
      if (result.item) finishClarification(message, clarification, result.item);
      return "resolved";
    }
    if (results.some((entry) => entry.result.status === "ambiguous")) {
      ledger.api.personal.value.chat.push({ id: genId("msg"), role: "assistant", text: "还是有点分不清，你指的是哪一个？可以直接说目标名、第几个或到期日。", mode: "local" });
      ledger.api.persist();
      return "ambiguous";
    }
    if (isQuestionOnlyText(text)) {
      ledger.api.personal.value.chat.push({ id: genId("msg"), role: "assistant", text: "你是想确认这一项，还是在问状态？如果要处理，请明确说「数据库那个，确认完成」。", mode: "local" });
      ledger.api.persist();
      return "ambiguous";
    }
    return "none";
  }
  function resolveClarificationCandidate(messageId: string, clarificationId: string, candidateId: string) {
    const message = ledger.api.personal.value.chat.find((entry) => entry.id === messageId);
    const clarification = message?.clarifications?.find((entry) => entry.id === clarificationId && entry.status === "pending");
    const candidate = clarification?.candidates.find((entry) => entry.id === candidateId);
    if (!message || !clarification || !candidate) return;
    ledger.api.refreshToday();
    finishClarification(message, clarification, clarificationItem(clarification, candidateId, ledger.api.today.value), candidate.title || candidate.quote || candidate.label);
  }
  function cancelClarification(messageId: string, clarificationId: string) {
    const message = ledger.api.personal.value.chat.find((entry) => entry.id === messageId);
    const clarification = message?.clarifications?.find((entry) => entry.id === clarificationId && entry.status === "pending");
    if (!message || !clarification) return;
    markClarification(message, clarification, "cancelled", { text: "用户取消", op: clarification.intent });
    ledger.api.personal.value.chat.push({ id: genId("msg"), role: "assistant", text: "好，这条先不处理。", mode: "local" });
    ledger.api.persist();
  }
  function applyAgentResponse(text: string, response: { reply: string; items: ExtractItem[]; mode: "model" | "mock" }) {
    const openTasks = ledger.api.personal.value.tasks.filter((task) => task.status === "open" && task.deletedAt == null).map((task) => ({ id: task.id, title: task.title, dueAt: task.dueAt }));
    const pendingEvents = ledger.api.personal.value.events.filter((event) => event.status === "pending" && event.deletedAt == null);
    const pendingRests = ledger.api.personal.value.rests.filter((rest) => rest.status === "pending" && rest.deletedAt == null);
    const plan = planAgentItems(response.items, text, { today: ledger.api.today.value, openTasks });
    const invalid = plan.clarifications.flatMap((clarification) => validateClarificationAgainstLedger(clarification, { openTasks, pendingEvents, pendingRests }));
    const writeErrors = validateAgentWrites(plan.writes, { today: ledger.api.today.value, text });
    if (invalid.length || writeErrors.length) {
      recordFailure(text, { code: "bad_output", message: invalid[0] || writeErrors[0] || "模型返回与当前账本不一致，这条没有录入。" });
      return;
    }
    const write = plan.writes.length
      ? ledger.api.commit(plan.writes)
      : { newPending: [], changed: 0, errors: [], applied: true };
    if (!write.applied) {
      recordFailure(text, { code: "conflict", message: "账本已变化，这次操作整批未写入。请按最新记录重试。" });
      return;
    }
    const now = new Date().toISOString();
    const clarifications = plan.clarifications
      .map((clarification) => normalizeClarification(clarification, { now, today: ledger.api.today.value, text, createId: genId }))
      .filter((clarification): clarification is Clarification => Boolean(clarification));
    for (const item of plan.writes) {
      if (!("id" in item)) continue;
      for (const { message, clarification } of activeClarifications()) {
        if (clarification.candidates.some((candidate) => candidate.id === item.id)) {
          markClarification(message, clarification, "resolved", { text, op: item.op, targetId: item.id });
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
    ledger.api.personal.value.chat.push(message);
    lastExtract.value = { status: "success", mode: response.mode };
    modelState.value = response.mode === "model" ? "model" : "mock";
    ledger.api.persist();
  }
  async function sendText(text: string, options: { skipUser?: boolean; useMock?: boolean } = {}) {
    if (busy.value) return;
    ledger.api.refreshToday();
    const wasSample = ledger.api.view.value === "sample";
    const writesBefore = ledger.internal.writeCount();
    const requestGeneration = generation.value;
    const requestId = ++requestSeq;
    activeRequest.value = requestId;
    busy.value = true;
    let context = buildContext(options.skipUser ? text : "");
    if (!options.skipUser) ledger.api.personal.value.chat.push({ id: genId("msg"), role: "user", text });
    navigation.api.setFocus(true);
    const local = tryResolveClarification(text);
    if (local !== "none") {
      const continueWithModel = (local === "resolved" || local === "cancelled") && hasAdditionalIntent(text);
      if (!continueWithModel) {
        activeRequest.value = null;
        busy.value = false;
        if (wasSample && ledger.internal.writeCount() > writesBefore) navigation.api.setView("personal");
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
    ledger.api.persist();
    if (wasSample && ledger.internal.writeCount() > writesBefore) navigation.api.setView("personal");
    composerFocusSignal.value += 1;
  }
  function retryFailed(message: ChatMessage, useMock: boolean) {
    if (!message.failed) return;
    ledger.api.personal.value.chat = ledger.api.personal.value.chat.filter((entry) => entry.id !== message.id);
    lastFailed.value = null;
    lastExtract.value = null;
    ledger.api.persist();
    void sendText(message.failed.text, { skipUser: true, useMock });
  }
  async function checkHealth() {
    const response = await health();
    modelState.value = response.mode === "model" ? "model" : response.mode === "mock" ? "mock" : "offline";
  }
  function resetChat() {
    ledger.api.personal.value.chat = [];
    lastExtract.value = null;
    lastFailed.value = null;
    ledger.api.persist();
    composerFocusSignal.value += 1;
  }
  function clearInFlight() {
    generation.value += 1;
    activeRequest.value = null;
    busy.value = false;
    typing.value = false;
    lastExtract.value = null;
    lastFailed.value = null;
  }
  function requestFocus() {
    composerFocusSignal.value += 1;
  }

  const api = {
    draft, busy, typing, modelState, lastExtract, lastFailed, composerExtra, composerFocusSignal, hasMessages,
    sendText, retryFailed, resolveClarificationCandidate, cancelClarification, checkHealth, resetChat,
  };
  const internal = { clearInFlight, requestFocus };
  return { api, internal };
}

export type ChatWorkspace = ReturnType<typeof useChat>;