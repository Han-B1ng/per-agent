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
  mode?: "model" | "mock" | "local";
  failed?: { text: string; code: string };
  clarifications?: Clarification[];
  receipt?: AgentReceipt;
}

export type ClarificationKind = "task_target" | "record_target";
export type ClarificationIntent = "complete_task" | "delete_task" | "confirm_event" | "deny_event" | "delete_event" | "confirm_rest" | "deny_rest" | "delete_rest";

export interface ClarificationCandidate {
  id: string;
  label: string;
  kind: "task" | "event" | "rest";
  title?: string;
  dueAt?: string;
  quote?: string;
  date?: string;
}

export interface Clarification {
  id: string;
  kind: ClarificationKind;
  intent: ClarificationIntent;
  question: string;
  sourceText: string;
  answerDate?: string;
  candidates: ClarificationCandidate[];
  status: "pending" | "resolved" | "cancelled";
  createdAt: string;
  resolvedAt?: string;
  resolution?: { text: string; targetId?: string; op?: string };
}

export interface AgentReceipt {
  status: "applied" | "pending" | "clarification" | "noop" | "empty";
  changed: number;
  pending: number;
  noop: number;
  clarifications: number;
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
  | { op: "correct_rest"; id: string; date?: string; quote?: string }
  | { op: "request_clarification"; clarification: Omit<Clarification, "id" | "status" | "createdAt" | "resolvedAt" | "resolution"> };

export interface ExtractContext {
  today: string;
  now: string;
  clientId: string;
  openTasks: Array<Pick<TaskRecord, "id" | "title" | "dueAt" | "position">>;
  pendingEvents: Array<Pick<EventRecord, "id" | "quote" | "occurredAt" | "eventType" | "polarity" | "intensity">>;
  pendingRests: Array<Pick<RestRecord, "id" | "quote" | "date">>;
  clarifications: Array<Pick<Clarification, "id" | "kind" | "intent" | "question" | "sourceText" | "candidates">>;
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
