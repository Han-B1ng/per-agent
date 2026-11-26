import * as extractor from "../../web/extractor.js";
import type { ExtractContext, ExtractResponse } from "./types";

export { WEIGHTS, computeAll, shiftDate, weekStartOf } from "../../web/engine.js";
export { applyItems, getGoals, getTimeline, findRecord } from "../../web/ledger.js";
export { loadPersonal, loadPersonalState, savePersonal, parsePersonalBackup, clearPersonal, emptyPersonal, genId, getClientId } from "../../web/store.js";
export { SAMPLE_META, buildSampleRecords } from "../../web/sample-data.js";
export { createChart } from "../../web/chart.js";
export type { ChartHandle } from "../../web/chart.js";
export { health } from "../../web/extractor.js";
export {
  planAgentItems, resolveClarificationReply, normalizeClarification, clarificationItem,
  validateClarificationAgainstLedger, buildReceipt, noOpReply, validateAgentWrites,
  sanitizeAgentReply, hasAdditionalIntent, isQuestionOnlyText,
} from "../../web/agent-protocol.js";
export type { PlanResult, Resolution, ClarificationInput } from "../../web/agent-protocol.js";

export async function send(text: string, context: ExtractContext, options: { useMock?: boolean } = {}): Promise<ExtractResponse> {
  const response = await extractor.send(text, context, options);
  if (response.ok === true && typeof response.reply === "string" && Array.isArray(response.items)) return response;
  if (response.ok === false && response.error?.message) return response;
  return { ok: false, error: { code: "bad_output", message: "模型返回格式异常，这条没有录入。可以重试。" } };
}