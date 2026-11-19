import * as engine from "../../web/engine.js";
import * as ledger from "../../web/ledger.js";
import * as store from "../../web/store.js";
import * as extractor from "../../web/extractor.js";
import * as sample from "../../web/sample-data.js";
import * as chart from "../../web/chart.js";
import * as protocol from "../../web/agent-protocol.js";
import type {
  AgentReceipt, AnyRecord, Clarification, ComputeResult, ExtractContext, ExtractItem, ExtractResponse, GoalView,
  LedgerRecords, PersonalLedger, RecordFilters, SampleLedger, TimelineRow, WeekResult, WriteResult,
} from "./types";

type PlanResult = { writes: ExtractItem[]; clarifications: Array<Omit<Clarification, "id" | "status" | "createdAt" | "resolvedAt" | "resolution">>; converted: number };
type Resolution = { status: "resolved" | "ambiguous" | "cancelled" | "unrelated" | "inactive"; item?: ExtractItem; candidate?: unknown; candidates?: unknown[] };
type ClarificationInput = Omit<Clarification, "id" | "status" | "createdAt" | "resolvedAt" | "resolution">;
type ProtocolModule = {
  planAgentItems(items: ExtractItem[], text: string, options: { today: string; openTasks: Array<{ id: string; title: string; dueAt?: string }> }): PlanResult;
  resolveClarificationReply(clarification: Clarification, text: string, today: string): Resolution;
  normalizeClarification(clarification: ClarificationInput, options: { now?: string; createId: (prefix: string) => string }): Clarification | null;
  validateClarificationAgainstLedger(clarification: ClarificationInput, context: { openTasks: Array<{ id: string }>; pendingEvents: Array<{ id: string }>; pendingRests: Array<{ id: string }> }): string[];
  buildReceipt(input: { writes: ExtractItem[]; result: WriteResult; clarifications: number }): AgentReceipt;
  noOpReply(receipt: AgentReceipt): string;
  validateAgentWrites(items: ExtractItem[], options: { today?: string; text?: string }): string[];
  sanitizeAgentReply(reply: string, receipt: AgentReceipt): string;
};
const protocolApi = protocol as unknown as ProtocolModule;

export const WEIGHTS = engine.WEIGHTS;
export const SAMPLE_META = sample.SAMPLE_META as { label: string; source: string };

export function computeAll(records: LedgerRecords, options: { today: string; startDate?: string }): ComputeResult {
  return engine.computeAll(records, options) as ComputeResult;
}
export function shiftDate(date: string, days: number): string {
  return engine.shiftDate(date, days) as string;
}
export function weekStartOf(date: string): string {
  return engine.weekStartOf(date) as string;
}
export function applyItems(records: PersonalLedger, items: ExtractItem[], options: { today: string; now?: string }): WriteResult {
  return ledger.applyItems(records, items, options) as WriteResult;
}
export function getGoals(records: LedgerRecords, today: string): { active: GoalView[]; done: GoalView[] } {
  return ledger.getGoals(records, today) as { active: GoalView[]; done: GoalView[] };
}
export function getTimeline(records: LedgerRecords, result: ComputeResult | null, filters: Partial<RecordFilters>): TimelineRow[] {
  return ledger.getTimeline(records, result, filters) as TimelineRow[];
}
export function findRecord(records: LedgerRecords, id: string): AnyRecord | null {
  return ledger.findRecord(records, id) as AnyRecord | null;
}
export function loadPersonal(): PersonalLedger {
  return store.loadPersonal() as PersonalLedger;
}
export function savePersonal(records: PersonalLedger): void {
  store.savePersonal(records);
}
export function clearPersonal(): PersonalLedger {
  return store.clearPersonal() as PersonalLedger;
}
export function emptyPersonal(): PersonalLedger {
  return store.emptyPersonal() as PersonalLedger;
}
export function genId(prefix: string): string {
  return store.genId(prefix) as string;
}
export function getClientId(): string {
  return store.getClientId() as string;
}
export function buildSampleRecords(today: string): SampleLedger {
  return sample.buildSampleRecords(today) as SampleLedger;
}
export async function health(): Promise<{ ok: boolean; mode?: string; model?: string | null }> {
  return extractor.health() as Promise<{ ok: boolean; mode?: string; model?: string | null }>;
}
export async function send(text: string, context: ExtractContext, options: { useMock?: boolean } = {}): Promise<ExtractResponse> {
  const response = await extractor.send(text, context, options) as ExtractResponse;
  if (response && response.ok === true && typeof response.reply === "string" && Array.isArray(response.items)) return response;
  if (response && response.ok === false && response.error?.message) return response;
  return { ok: false, error: { code: "bad_output", message: "模型返回格式异常，这条没有录入。可以重试。" } };
}
export function planAgentItems(items: ExtractItem[], text: string, options: { today: string; openTasks: Array<{ id: string; title: string; dueAt?: string }> }): PlanResult {
  return protocolApi.planAgentItems(items, text, options);
}
export function resolveClarificationReply(clarification: Clarification, text: string, today: string): Resolution {
  return protocolApi.resolveClarificationReply(clarification, text, today);
}
export function normalizeClarification(clarification: ClarificationInput, options: { now?: string; createId: (prefix: string) => string }): Clarification | null {
  return protocolApi.normalizeClarification(clarification, options);
}
export function validateClarificationAgainstLedger(clarification: ClarificationInput, context: { openTasks: Array<{ id: string }>; pendingEvents: Array<{ id: string }>; pendingRests: Array<{ id: string }> }): string[] {
  return protocolApi.validateClarificationAgainstLedger(clarification, context);
}
export function buildReceipt(input: { writes: ExtractItem[]; result: WriteResult; clarifications: number }): AgentReceipt {
  return protocolApi.buildReceipt(input);
}
export function noOpReply(receipt: AgentReceipt): string {
  return protocolApi.noOpReply(receipt);
}
export function validateAgentWrites(items: ExtractItem[], options: { today?: string; text?: string } = {}): string[] {
  return protocolApi.validateAgentWrites(items, options);
}
export function sanitizeAgentReply(reply: string, receipt: AgentReceipt): string {
  return protocolApi.sanitizeAgentReply(reply, receipt);
}

export interface ChartHandle {
  render(weeks: WeekResult[]): void;
  redraw(): void;
  destroy(): void;
}
export function createChart(canvas: HTMLCanvasElement, options: { onSelect?: (index: number) => void }): ChartHandle {
  return chart.createChart(canvas, options) as ChartHandle;
}
