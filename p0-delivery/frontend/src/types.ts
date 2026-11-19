export type Page = "market" | "goals" | "records";
export type DataView = "sample" | "personal";
export type DrawerMode = "week" | "goal" | "record" | "settings";
export type ModelState = "model" | "mock" | "degraded" | "offline";
export type RecordStatus = "pending" | "confirmed";
export type TaskStatus = "open" | "done" | "paused";
export type EventType = "behavior" | "emotion";
export type Polarity = "positive" | "negative" | "neutral";

export interface EventRecord {
  id: string;
  kind: "event";
  eventType: EventType;
  polarity: Polarity;
  intensity: number;
  occurredAt: string;
  quote: string;
  tags: string[];
  confidence: number;
  status: RecordStatus;
  createdAt: string;
  deletedAt: string | null;
}

export interface RestRecord {
  id: string;
  kind: "rest";
  date: string;
  quote: string;
  confidence: number;
  status: RecordStatus;
  createdAt: string;
  deletedAt: string | null;
}

export interface TaskRecord {
  id: string;
  kind: "task";
  title: string;
  dueAt: string;
  position: number;
  status: TaskStatus;
  createdAt: string;
  doneAt: string | null;
  deletedAt: string | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  pending?: string[];
  mode?: "model" | "mock";
  failed?: { text: string; code: string };
}

export interface AuditEntry {
  id: string;
  action: string;
  targetId: string;
  targetKind: string;
  before: unknown;
  after: unknown;
  at: string;
}

export interface PersonalLedger {
  version: 2;
  events: EventRecord[];
  rests: RestRecord[];
  tasks: TaskRecord[];
  chat: ChatMessage[];
  audit: AuditEntry[];
}

export interface SampleLedger {
  events: EventRecord[];
  rests: RestRecord[];
  tasks: TaskRecord[];
}

export type LedgerRecords = PersonalLedger | SampleLedger;
export type AnyRecord = EventRecord | RestRecord | TaskRecord;

export interface EngineLine {
  type: string;
  id: string | null;
  label: string;
  quote: string | null;
  polarity: Polarity | null;
  intensity: number | null;
  contribution: number;
  note: string | null;
}

export interface DayResult {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  raw: number;
  adjustment: number;
  actual: number;
  eventCount: number;
  lines: EngineLine[];
}

export interface WeekResult {
  weekStart: string;
  weekEnd: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  days: DayResult[];
}

export interface ComputeResult {
  startDate: string;
  today: string;
  days: DayResult[];
  weeks: WeekResult[];
  latest: number;
  weekChangePct: number;
}

export type ExtractItem =
  | { op: "add_event"; event: Omit<EventRecord, "id" | "kind" | "status" | "createdAt" | "deletedAt"> }
  | { op: "add_rest"; rest: Omit<RestRecord, "id" | "kind" | "status" | "createdAt" | "deletedAt"> }
  | { op: "add_task"; task: { title: string; dueAt: string; position: number; confidence: number } }
  | { op: "confirm_event" | "deny_event" | "delete_event"; id: string; occurredAt?: string }
  | { op: "confirm_rest" | "deny_rest" | "delete_rest"; id: string; date?: string }
  | { op: "complete_task" | "delete_task"; id: string; doneAt?: string }
  | { op: "correct_event"; id: string; occurredAt?: string; quote?: string }
  | { op: "correct_rest"; id: string; date?: string; quote?: string };

export interface ExtractContext {
  today: string;
  now: string;
  clientId: string;
  openTasks: Array<Pick<TaskRecord, "id" | "title" | "dueAt" | "position">>;
  pendingEvents: Array<Pick<EventRecord, "id" | "quote" | "occurredAt" | "eventType" | "polarity" | "intensity">>;
  pendingRests: Array<Pick<RestRecord, "id" | "quote" | "date">>;
  turns: Array<{ role: "user" | "assistant"; content: string }>;
}

export type ExtractResponse =
  | { ok: true; mode: "model" | "mock"; reply: string; items: ExtractItem[]; cached?: boolean; provider?: string; requestId?: string; durationMs?: number }
  | { ok: false; error: { code: string; message: string } };

export interface WriteResult {
  newPending: string[];
  changed: number;
  errors: string[];
  applied: boolean;
}

export interface GoalView extends TaskRecord {
  displayStatus: "open" | "overdue" | "paused" | "done";
}

export interface TimelineRow {
  id: string;
  kind: "event" | "rest" | "task";
  type: "behavior" | "emotion" | "rest" | "completion";
  date: string;
  quote: string;
  status: RecordStatus | "deleted";
  contribution: number;
  note: string;
  taskId?: string;
  record: AnyRecord;
}

export interface RecordFilters {
  from: string;
  to: string;
  keyword: string;
  type: "all" | "behavior" | "emotion" | "rest" | "completion";
  taskId: string;
  includeDeleted: boolean;
}

export interface DrawerState {
  open: boolean;
  mode: DrawerMode;
  week: number | null;
  id: string | null;
  tab: "detail" | "tasks";
}
