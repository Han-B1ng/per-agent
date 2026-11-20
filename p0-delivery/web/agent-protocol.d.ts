import type { AgentReceipt, Clarification, ClarificationCandidate, ClarificationIntent, ExtractItem, WriteResult } from "../frontend/src/types";

export const PROTOCOL_LIMITS: Readonly<{
  openTasks: number;
  pendingEvents: number;
  pendingRests: number;
  clarifications: number;
  candidates: number;
  turns: number;
  turnChars: number;
  questionChars: number;
  sourceChars: number;
  labelChars: number;
}>;

export type ClarificationInput = Omit<Clarification, "id" | "status" | "createdAt" | "resolvedAt" | "resolution">;
export type PlanResult = {
  writes: ExtractItem[];
  clarifications: ClarificationInput[];
  converted: number;
};
export type Resolution = {
  status: "resolved" | "ambiguous" | "cancelled" | "negative" | "unrelated" | "inactive";
  reason?: string;
  item?: ExtractItem;
  candidate?: unknown;
  candidates?: unknown[];
};
export type ProtocolTask = { id: string; title?: string; label?: string; dueAt?: string };
export type ProtocolRecord = { id: string; quote: string; occurredAt?: string; date?: string };

export function normalizeText(value: unknown): string;
export function taskMatchScore(text: string, task: ProtocolTask): number;
export function matchTaskCandidates(text: string, tasks: ProtocolTask[]): { candidates: ProtocolTask[]; ambiguous: boolean; score: number };
export function taskCandidate(task: ProtocolTask): ClarificationCandidate;
export function recordCandidate(record: ProtocolRecord, kind: "event" | "rest"): ClarificationCandidate;
export function taskClarification(text: string, tasks: ProtocolTask[], options?: { intent?: ClarificationIntent; question?: string }): ExtractItem;
export function recordClarification(text: string, records: ProtocolRecord[], kind: "event" | "rest", options?: { intent?: ClarificationIntent; question?: string }): ExtractItem;
export function isCancelText(text: string): boolean;
export function isQuestionOnlyText(text: string): boolean;

export function planAgentItems(items: ExtractItem[], text: string, options: { today: string; openTasks?: ProtocolTask[] }): PlanResult;
export function resolveClarificationReply(clarification: Clarification, text: string, today: string): Resolution;
export function normalizeClarification(
  clarification: ClarificationInput,
  options?: { now?: string; today?: string; text?: string; createId?: (prefix: string) => string },
): Clarification | null;
export function clarificationItem(clarification: Clarification, candidateId: string, today: string, text?: string): ExtractItem;
export function validateClarificationAgainstLedger(
  clarification: ClarificationInput,
  context?: {
    openTasks?: Array<{ id: string }>;
    pendingEvents?: Array<{ id: string }>;
    pendingRests?: Array<{ id: string }>;
  },
): string[];
export function clauseAroundQuote(text: string, quote: string): string;
export function hasDateEvidence(quote: string, text: string): boolean;
export function isVaguePastItem(quote: string, text: string): boolean;
export function isVaguePastText(text: string, today: string): boolean;
export function guardAmbiguousTaskWrites(items: ExtractItem[], text: string, openTasks: ProtocolTask[]): { items: ExtractItem[]; converted: number };
export function applyVagueDateGuard(items: ExtractItem[], text: string, today: string): ExtractItem[];
export function partitionAgentItems(items: ExtractItem[]): { writes: ExtractItem[]; clarifications: ClarificationInput[] };
export function buildReceipt(input: { writes?: ExtractItem[]; result: WriteResult; clarifications?: number }): AgentReceipt;
export function noOpReply(receipt: AgentReceipt): string;
export function validateAgentWrites(items: ExtractItem[], options?: { today?: string; text?: string }): string[];
export function sanitizeAgentReply(reply: string, receipt: AgentReceipt): string;
export function hasAdditionalIntent(text: string): boolean;