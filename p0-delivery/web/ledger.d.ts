import type {
  AnyRecord, AuditEntry, ComputeResult, EventRecord, ExtractItem, GoalView, LedgerRecords, RecordFilters, RestRecord, TaskRecord, TimelineRow, WriteResult,
} from "../frontend/src/types";

export interface LedgerWriteTarget {
  events: EventRecord[];
  rests: RestRecord[];
  tasks: TaskRecord[];
  audit?: AuditEntry[];
}

export function applyItems(
  records: LedgerWriteTarget,
  items: ExtractItem[],
  options: { today: string; now?: string; createId?: (prefix: string) => string },
): WriteResult;
export function getGoals(records: LedgerRecords, today: string): { active: GoalView[]; done: GoalView[] };
export function getTimeline(records: LedgerRecords, result: ComputeResult | null, filters?: Partial<RecordFilters>): TimelineRow[];
export function findRecord(records: LedgerRecords, id: string): AnyRecord | null;