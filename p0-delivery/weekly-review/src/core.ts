// 现有交付包的引擎/账本是纯 ESM JavaScript；这里只做类型收口，
// 不复制任何计分或账本逻辑（引擎仍是唯一权威）。
export { WEIGHTS, computeAll, parseDate, fmtDate, shiftDate, weekStartOf } from "../../web/engine.js";
export { applyItems, getGoals } from "../../web/ledger.js";