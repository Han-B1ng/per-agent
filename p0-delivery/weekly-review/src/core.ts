// 现有交付包的引擎/账本是纯 ESM JavaScript；这里只做类型收口，
// 不复制任何计分或账本逻辑（引擎仍是唯一权威）。
import * as engineModule from "../../web/engine.js";
import * as ledgerModule from "../../web/ledger.js";
import type { ComputeResult, ExtractItem, GoalView, ReviewLedger, WriteResult } from "./types";

type EngineModule = {
  WEIGHTS: Record<string, number>;
  computeAll(records: ReviewLedger, options?: { today?: string; startDate?: string }): ComputeResult;
  parseDate(value: string): number;
  fmtDate(value: number): string;
  shiftDate(value: string, days: number): string;
  weekStartOf(value: string): string;
};

type LedgerModule = {
  applyItems(records: ReviewLedger, items: ExtractItem[], options?: { today?: string; now?: string }): WriteResult;
  getGoals(records: ReviewLedger, today: string): { active: GoalView[]; done: GoalView[] };
};

const engine = engineModule as unknown as EngineModule;
const ledger = ledgerModule as unknown as LedgerModule;

export const WEIGHTS = engine.WEIGHTS;
export const computeAll = engine.computeAll;
export const parseDate = engine.parseDate;
export const fmtDate = engine.fmtDate;
export const shiftDate = engine.shiftDate;
export const weekStartOf = engine.weekStartOf;
export const applyItems = ledger.applyItems;
export const getGoals = ledger.getGoals;
