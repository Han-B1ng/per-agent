import type { ComputeResult, LedgerRecords } from "../frontend/src/types";

export const WEIGHTS: {
  base: number[];
  completion: number;
  overdueDaily: number;
  overdueCapPerTask: number;
  clamp: number;
  restDaily: number;
  restProtectionDays: number;
  silenceDecay: number;
  silenceGraceDays: number;
  dailyScoringCap: number;
  floor: number;
  baseline: number;
};

export function parseDate(value: string): number;
export function fmtDate(ms: number): string;
export function shiftDate(value: string, days: number): string;
export function weekStartOf(value: string): string;
export function computeAll(records: LedgerRecords, options: { today: string; startDate?: string }): ComputeResult;