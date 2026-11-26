import { computed, reactive, ref } from "vue";
import {
  applyItems, buildSampleRecords, clearPersonal, computeAll, getGoals, getTimeline, loadPersonalState, parsePersonalBackup, savePersonal, shiftDate, SAMPLE_META,
} from "../core";
import type {
  BackupParseResult, CommitResult, DataView, ExtractItem, GoalView, LedgerRecords, PersonalLedger, PersonalLoadState, RecordFilters, RestoreResult, TimelineRow,
} from "../types";

const NOT_SAVED_MESSAGE = "未保存：浏览器写入失败，本次改动没有写入本机。请重试。";

function corruptStorageMessage(state: PersonalLoadState): string {
  if (!state.corrupted) return "";
  if (state.backupSaved && state.backupKey) {
    return `本地账本数据已损坏，已将原始内容备份到浏览器存储键 ${state.backupKey}，当前以空账本启动。`;
  }
  return "本地账本数据已损坏，且无法写入备份键，当前以空账本启动。请先备份当前浏览器数据再继续写入。";
}

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function useLedger() {
  const today = ref(localToday());
  const sample = ref(buildSampleRecords(today.value));
  const initialLoad = loadPersonalState();
  const personal = ref<PersonalLedger>(initialLoad.ledger);
  const view = ref<DataView>("sample");
  const filters = reactive<RecordFilters>({ from: "", to: "", keyword: "", type: "all", taskId: "", includeDeleted: false });
  const recordTaskId = ref("");
  const persistError = ref(corruptStorageMessage(initialLoad));
  let ledgerWrites = 0;

  const records = computed<LedgerRecords>(() => (view.value === "sample" ? sample.value : personal.value));
  const editable = computed(() => view.value === "personal");
  const result = computed(() => computeAll(records.value, { today: today.value }));
  const goals = computed<{ active: GoalView[]; done: GoalView[] }>(() => getGoals(records.value, today.value));
  const timeline = computed<TimelineRow[]>(() => getTimeline(records.value, result.value, { ...filters, taskId: recordTaskId.value }));
  const personalEmpty = computed(() => personal.value.events.length === 0 && personal.value.rests.length === 0 && personal.value.tasks.length === 0);
  const linkedTaskTitle = computed(() => records.value.tasks.find((task) => task.id === recordTaskId.value)?.title ?? recordTaskId.value);

  function refreshToday(): boolean {
    const next = localToday();
    if (next === today.value) return false;
    today.value = next;
    sample.value = buildSampleRecords(next);
    return true;
  }
  function persist(): boolean {
    const saved = savePersonal(personal.value);
    persistError.value = saved ? "" : NOT_SAVED_MESSAGE;
    return saved;
  }
  function dismissPersistError() {
    persistError.value = "";
  }
  function commit(items: ExtractItem[]): CommitResult {
    refreshToday();
    const before = JSON.parse(JSON.stringify(personal.value)) as PersonalLedger;
    const write = applyItems(personal.value, items, { today: today.value });
    if (!write.applied) return { ...write, saved: true };
    if (!savePersonal(personal.value)) {
      personal.value = before;
      persistError.value = NOT_SAVED_MESSAGE;
      return { newPending: [], changed: 0, errors: [NOT_SAVED_MESSAGE], applied: false, saved: false };
    }
    persistError.value = "";
    if (write.changed > 0 || write.newPending.length > 0) ledgerWrites += 1;
    return { ...write, saved: true };
  }
  function inspectBackup(text: string): BackupParseResult {
    return parsePersonalBackup(text);
  }
  function restoreBackup(next: PersonalLedger): RestoreResult {
    if (!savePersonal(next)) {
      return { ok: false, code: "storage_failed", message: "浏览器写入失败：原账本未改动，请检查存储空间或隐私模式后重试。" };
    }
    personal.value = next;
    view.value = "personal";
    clearFilters();
    persistError.value = "";
    return { ok: true };
  }
  function setViewData(next: DataView) {
    view.value = next;
  }
  function writeCount() {
    return ledgerWrites;
  }
  function setRecordTaskId(id: string) {
    recordTaskId.value = id;
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
    if (effectiveDate > today.value) return { ok: false, message: "生效日期不能晚于今天；这条仍待确认。" };
    const item: ExtractItem = kind === "rest"
      ? { op: "confirm_rest", id, date: effectiveDate }
      : { op: "confirm_event", id, occurredAt: effectiveDate };
    const write = commit([item]);
    if (!write.applied) return { ok: false, message: write.errors[0] || "写入失败，这条仍待确认。" };
    return { ok: true };
  }
  function denyPending(id: string, kind: "event" | "rest") {
    const item: ExtractItem = kind === "rest" ? { op: "deny_rest", id } : { op: "deny_event", id };
    commit([item]);
  }
  function deleteRecord(id: string, kind: "event" | "rest") {
    const item: ExtractItem = kind === "rest" ? { op: "delete_rest", id } : { op: "delete_event", id };
    commit([item]);
  }
  function completeTask(id: string) {
    const item: ExtractItem = { op: "complete_task", id };
    return commit([item]);
  }
  function deleteTask(id: string) {
    const item: ExtractItem = { op: "delete_task", id };
    commit([item]);
  }
  function addGoal(title: string, dueAt: string, position: number) {
    if (!title.trim() || !dueAt) return null;
    const item: ExtractItem = { op: "add_task", task: { title: title.trim(), dueAt, position, confidence: 1 } };
    return commit([item]);
  }
  function correctRecord(id: string, kind: "event" | "rest", date: string, quote: string) {
    const item: ExtractItem = kind === "rest"
      ? { op: "correct_rest", id, date, quote }
      : { op: "correct_event", id, occurredAt: date, quote };
    commit([item]);
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
  function findPending(id: string) {
    const event = personal.value.events.find((entry) => entry.id === id && entry.status === "pending" && entry.deletedAt == null);
    if (event) return { record: event, kind: "event" as const };
    const rest = personal.value.rests.find((entry) => entry.id === id && entry.status === "pending" && entry.deletedAt == null);
    if (rest) return { record: rest, kind: "rest" as const };
    return null;
  }
  function clearData() {
    personal.value = clearPersonal();
    persist();
  }

  const api = {
    today, personal, sample, view, records, editable, result, goals, timeline, personalEmpty, filters, recordTaskId, linkedTaskTitle, SAMPLE_META,
    persistError, refreshToday, persist, commit, confirmPending, denyPending, deleteRecord, deleteTask, correctRecord, clearFilters, exportCurrent, findPending,
    shiftDate, inspectBackup, dismissPersistError,
  };
  const internal = {
    completeTask, addGoal, clearData, setViewData, writeCount, setRecordTaskId, restoreBackup,
  };
  return { api, internal };
}

export type LedgerWorkspace = ReturnType<typeof useLedger>;