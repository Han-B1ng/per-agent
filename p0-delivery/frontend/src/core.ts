import * as engine from "../../web/engine.js";
import * as ledger from "../../web/ledger.js";
import * as store from "../../web/store.js";
import * as extractor from "../../web/extractor.js";
import * as sample from "../../web/sample-data.js";
import * as chart from "../../web/chart.js";
import type {
  AnyRecord, ComputeResult, ExtractContext, ExtractItem, ExtractResponse, GoalView,
  LedgerRecords, PersonalLedger, RecordFilters, SampleLedger, TimelineRow, WeekResult, WriteResult,
} from "./types";

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
export interface ChartHandle {
  render(weeks: WeekResult[]): void;
  redraw(): void;
  destroy(): void;
}
export function createChart(canvas: HTMLCanvasElement, options: { onSelect?: (index: number) => void }): ChartHandle {
  return chart.createChart(canvas, options) as ChartHandle;
}
