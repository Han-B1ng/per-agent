// 与迁移 PR（frontend/src/types.ts）同名的账本/引擎结构子集。
// 独立验收时不复制运行时逻辑；合并后可由宿主改指向共享类型。
export type EventType = "behavior" | "emotion";
export type Polarity = "positive" | "negative" | "neutral";
export type RecordStatus = "pending" | "confirmed";
export type TaskStatus = "open" | "done" | "paused";

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

export interface ReviewLedger {
  events: EventRecord[];
  rests: RestRecord[];
  tasks: TaskRecord[];
}

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

export type GoalDisplayStatus = "open" | "overdue" | "paused" | "done";

export interface GoalView extends TaskRecord {
  displayStatus: GoalDisplayStatus;
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

export interface WriteResult {
  newPending: string[];
  changed: number;
  errors: string[];
  applied: boolean;
}
