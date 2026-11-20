// Agent 交流协议的应用侧纯函数：候选匹配、澄清解析、歧义守卫与回执。
// 浏览器、Node 单测共用；不碰 DOM、存储或计分。
import { resolveDate } from "./date.js";

export const PROTOCOL_LIMITS = Object.freeze({
  openTasks: 200,
  pendingEvents: 200,
  pendingRests: 200,
  clarifications: 5,
  candidates: 5,
  turns: 10,
  turnChars: 1500,
  questionChars: 200,
  sourceChars: 200,
  labelChars: 120,
});

const CANCEL_RE = /^(不是|不是这个|不对|记错|算了|取消|不用了|不记了|先不|没有的事|不处理)[。！!～~\s]*$/;
const VAGUE_PAST_RE = /前阵子|之前|有一次|上次|前些日子|前段时间/;
const EXPLICIT_DATE_RE = /昨天|昨日|前天|大前天|今天|今日|上周|周[一二三四五六日天]|礼拜|\d{1,2}月\d{1,2}日|\d{4}-\d{1,2}-\d{1,2}|\d+\s*天前/;
const NOT_DONE_RE = /还没|还没有|没交|未交|没完成|未完成|还没完成|没做|没写|没有做|尚未|不算/;
const NEGATED_DELETE_RE = /没删|还没删|不删|别删|不要删/;
const QUESTION_RE = /[吗呢?？]|是否/;
const TASK_COMPLETE_RE = /交了|交完|提交了|完成|做完|搞定|写完|通过|已交|已经交/;
const TASK_DELETE_RE = /删|删除|移除|去掉|不要了|取消/;
const DEMONSTRATIVE_RE = /那个|这个|这条|那条|该目标|这个目标|这条目标|这一项|那一项/;
const RECORD_DENY_RE = /不是|不对|否认|不记|别记|删|删除|取消|没有的事/;

export function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\s，。！？、,.!?;；:：'"“”‘’()（）【】\[\]{}<>《》·]/g, "");
}

function longestCommonSubstring(a, b) {
  if (!a || !b) return 0;
  let best = 0;
  let prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    const current = new Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j += 1) {
      if (a[i - 1] === b[j - 1]) {
        current[j] = prev[j - 1] + 1;
        if (current[j] > best) best = current[j];
      }
    }
    prev = current;
  }
  return best;
}

function dueKey(value) {
  return normalizeText(String(value || "").replace(/-/g, ""));
}

export function taskMatchScore(text, task) {
  const source = normalizeText(text);
  const title = normalizeText(task.title || task.label || "");
  if (!source || !title) return 0;
  let score = longestCommonSubstring(source, title);
  if (source.includes(title)) score += 4;
  if (title.includes(source) && source.length >= 2) score += 1;
  if (task.id && source.includes(normalizeText(task.id))) score += 8;
  if (task.dueAt) {
    const key = dueKey(task.dueAt);
    if (source.includes(key) || source.includes(key.slice(4))) score += 4;
  }
  return score;
}

export function matchTaskCandidates(text, tasks) {
  const scored = (tasks || [])
    .map((task) => ({ task, score: taskMatchScore(text, task) }))
    .filter((entry) => entry.score >= 2)
    .sort((a, b) => b.score - a.score);
  if (!scored.length) return { candidates: [], ambiguous: false, score: 0 };
  const max = scored[0].score;
  const top = scored.filter((entry) => entry.score === max);
  return { candidates: top.map((entry) => entry.task), ambiguous: top.length > 1, score: max };
}

function ordinalIndex(text, length) {
  const value = normalizeText(text);
  if (/前者|前一个|第1个|第一个/.test(value)) return 0;
  if ((/后者|后一个|第2个|第二个/.test(value)) && length > 1) return 1;
  const match = value.match(/第([一二三四五1-5])个/);
  if (!match) return -1;
  const map = { 一: 0, 二: 1, 三: 2, 四: 3, 五: 4 };
  const index = map[match[1]] ?? Number(match[1]) - 1;
  return Number.isInteger(index) && index >= 0 && index < length ? index : -1;
}

export function taskCandidate(task) {
  const due = task.dueAt ? ` · ${String(task.dueAt).slice(5).replace("-", ".")} 到期` : "";
  return {
    id: task.id,
    label: `${task.title}${due}`,
    kind: "task",
    title: task.title,
    dueAt: task.dueAt,
  };
}

export function recordCandidate(record, kind) {
  const date = kind === "rest" ? record.date : record.occurredAt;
  return {
    id: record.id,
    label: `${record.quote} · ${date}`,
    kind,
    quote: record.quote,
    date,
  };
}

export function taskClarification(text, tasks, { intent = "complete_task", question } = {}) {
  return {
    op: "request_clarification",
    clarification: {
      kind: "task_target",
      intent,
      question: question || `有 ${tasks.length} 个相近目标，你说的是哪一个？`,
      sourceText: String(text || "").slice(0, PROTOCOL_LIMITS.sourceChars),
      candidates: tasks.slice(0, PROTOCOL_LIMITS.candidates).map(taskCandidate),
    },
  };
}

export function recordClarification(text, records, kind, { intent, question } = {}) {
  return {
    op: "request_clarification",
    clarification: {
      kind: "record_target",
      intent: intent || (kind === "rest" ? "confirm_rest" : "confirm_event"),
      question: question || `有 ${records.length} 条待确认记录，你说的是哪一条？`,
      sourceText: String(text || "").slice(0, PROTOCOL_LIMITS.sourceChars),
      candidates: records.slice(0, PROTOCOL_LIMITS.candidates).map((record) => recordCandidate(record, kind)),
    },
  };
}

export function isCancelText(text) {
  return CANCEL_RE.test(String(text || "").trim());
}

function isQuestionText(text) {
  const source = String(text || "").trim();
  return QUESTION_RE.test(source) && !/^(确认|是的|对|没错)/.test(source);
}

export function isQuestionOnlyText(text) {
  return isQuestionText(text) && !hasAdditionalIntent(String(text || ""));
}

function explicitTaskSelection(text, candidate, ordinal) {
  if (ordinal >= 0) return true;
  const source = normalizeText(text);
  const title = normalizeText(candidate?.title || candidate?.label || "");
  const id = normalizeText(candidate?.id || "");
  if (id && source.includes(id)) return true;
  if (title && source.includes(title)) return true;
  return DEMONSTRATIVE_RE.test(String(text || ""));
}

function strongTaskSelection(text, candidate, ordinal) {
  if (ordinal >= 0) return true;
  const source = normalizeText(text);
  const id = normalizeText(candidate?.id || "");
  return Boolean(id && source.includes(id)) || DEMONSTRATIVE_RE.test(String(text || ""));
}

function resolveTaskCandidate(clarification, text, today) {
  const source = String(text || "");
  if (clarification.intent === "complete_task" && NOT_DONE_RE.test(source)) {
    return { status: "negative", reason: "not_done" };
  }
  if (clarification.intent === "delete_task" && NEGATED_DELETE_RE.test(source)) {
    return { status: "negative", reason: "not_deleted" };
  }
  if (isQuestionText(source)) return { status: "unrelated" };

  const candidates = clarification.candidates || [];
  const ordinal = ordinalIndex(source, candidates.length);
  const match = ordinal < 0
    ? matchTaskCandidates(source, candidates.map((candidate) => ({
      id: candidate.id,
      title: candidate.title || candidate.label || "",
      dueAt: candidate.dueAt,
    })))
    : null;
  if (match?.ambiguous) return { status: "ambiguous", candidates: match.candidates };
  const candidate = ordinal >= 0
    ? candidates[ordinal]
    : candidates.find((entry) => entry.id === match.candidates[0]?.id);
  if (!candidate) return { status: "unrelated" };
  if (!explicitTaskSelection(source, candidate, ordinal)) return { status: "unrelated" };

  const actionWords = clarification.intent === "complete_task" ? TASK_COMPLETE_RE.test(source) : TASK_DELETE_RE.test(source);
  const extraIntent = hasAdditionalIntent(source);
  if (extraIntent && !actionWords && !strongTaskSelection(source, candidate, ordinal)) {
    return { status: "unrelated" };
  }
  if (!actionWords && !explicitTaskSelection(source, candidate, ordinal)) return { status: "unrelated" };

  const item = { op: clarification.intent, id: candidate.id };
  if (clarification.intent === "complete_task") {
    const date = resolveDate(source, today);
    item.doneAt = date && date <= today ? date : today;
  }
  return { status: "resolved", item, candidate };
}

function resolveRecordCandidate(clarification, text, today) {
  const source = String(text || "");
  if (["confirm_event", "confirm_rest"].includes(clarification.intent) && RECORD_DENY_RE.test(source)) {
    return { status: "negative", reason: "denied" };
  }
  if (isQuestionText(source)) return { status: "unrelated" };
  const candidates = clarification.candidates || [];
  const ordinal = ordinalIndex(source, candidates.length);
  const match = ordinal < 0
    ? matchTaskCandidates(source, candidates.map((entry) => ({
      id: entry.id,
      title: entry.quote || entry.label || "",
      dueAt: entry.date,
    })))
    : null;
  if (match?.ambiguous) return { status: "ambiguous", candidates: match.candidates };
  const candidate = ordinal >= 0 ? candidates[ordinal] : candidates.find((entry) => entry.id === match.candidates[0]?.id);
  if (!candidate) return { status: "unrelated" };

  const sourceNorm = normalizeText(source);
  const quoteNorm = normalizeText(candidate.quote || candidate.label || "");
  const isStrong = ordinal >= 0 || (candidate.id && sourceNorm.includes(normalizeText(candidate.id))) || DEMONSTRATIVE_RE.test(source) || (quoteNorm && sourceNorm.includes(quoteNorm));
  if (hasAdditionalIntent(source) && !isStrong) return { status: "unrelated" };
  if (!isStrong) return { status: "unrelated" };

  const item = { op: clarification.intent, id: candidate.id };
  const date = resolveDate(source, today);
  if (clarification.intent === "confirm_event" && date && date <= today) item.occurredAt = date;
  if (clarification.intent === "confirm_rest" && date && date <= today) item.date = date;
  return { status: "resolved", item, candidate };
}

export function resolveClarificationReply(clarification, text, today) {
  if (!clarification || clarification.status !== "pending") return { status: "inactive" };
  if (isCancelText(text)) return { status: "cancelled" };
  if (clarification.kind === "task_target") return resolveTaskCandidate(clarification, text, today);
  if (clarification.kind === "record_target") return resolveRecordCandidate(clarification, text, today);
  return { status: "unrelated" };
}

export function normalizeClarification(clarification, { now = new Date().toISOString(), createId } = {}) {
  if (!clarification || typeof clarification !== "object") return null;
  const kinds = new Set(["task_target", "record_target"]);
  if (!kinds.has(clarification.kind)) return null;
  if (!["complete_task", "delete_task", "confirm_event", "deny_event", "delete_event", "confirm_rest", "deny_rest", "delete_rest"].includes(clarification.intent)) return null;
  if (typeof clarification.question !== "string" || !clarification.question.trim()) return null;
  if (!Array.isArray(clarification.candidates) || clarification.candidates.length < 1) return null;
  const candidates = clarification.candidates.slice(0, PROTOCOL_LIMITS.candidates).map((candidate) => ({
    id: String(candidate?.id || ""),
    label: String(candidate?.label || candidate?.title || candidate?.quote || "").slice(0, PROTOCOL_LIMITS.labelChars),
    kind: candidate?.kind === "task" ? "task" : candidate?.kind === "rest" ? "rest" : "event",
    ...(candidate?.title ? { title: String(candidate.title).slice(0, PROTOCOL_LIMITS.labelChars) } : {}),
    ...(candidate?.dueAt ? { dueAt: String(candidate.dueAt).slice(0, 10) } : {}),
    ...(candidate?.quote ? { quote: String(candidate.quote).slice(0, PROTOCOL_LIMITS.sourceChars) } : {}),
    ...(candidate?.date ? { date: String(candidate.date).slice(0, 10) } : {}),
  })).filter((candidate) => candidate.id && candidate.label);
  if (!candidates.length) return null;
  return {
    id: String(clarification.id || (createId ? createId("clr") : "")),
    kind: clarification.kind,
    intent: clarification.intent,
    question: clarification.question.trim().slice(0, PROTOCOL_LIMITS.questionChars),
    sourceText: String(clarification.sourceText || "").trim().slice(0, PROTOCOL_LIMITS.sourceChars),
    candidates,
    status: "pending",
    createdAt: clarification.createdAt || now,
  };
}

export function validateClarificationAgainstLedger(clarification, { openTasks = [], pendingEvents = [], pendingRests = [] } = {}) {
  const errors = [];
  if (!clarification) return ["澄清缺失"];
  if (!["task_target", "record_target"].includes(clarification.kind)) errors.push("澄清类型无效");
  const candidates = Array.isArray(clarification.candidates) ? clarification.candidates : [];
  if (candidates.length < 1 || candidates.length > PROTOCOL_LIMITS.candidates) errors.push("候选数量无效");
  if (clarification.kind === "task_target") {
    if (!["complete_task", "delete_task"].includes(clarification.intent)) errors.push("目标意图无效");
    const ids = new Set(openTasks.map((task) => task.id));
    for (const candidate of candidates) if (!ids.has(candidate.id)) errors.push(`候选目标不可处理：${candidate.id}`);
  } else if (clarification.kind === "record_target") {
    const isEvent = ["confirm_event", "deny_event", "delete_event"].includes(clarification.intent);
    const isRest = ["confirm_rest", "deny_rest", "delete_rest"].includes(clarification.intent);
    if (!isEvent && !isRest) errors.push("记录意图无效");
    const ids = new Set((isRest ? pendingRests : pendingEvents).map((record) => record.id));
    for (const candidate of candidates) if (!ids.has(candidate.id)) errors.push(`候选记录不可处理：${candidate.id}`);
  }
  return errors;
}

export function clauseAroundQuote(text, quote) {
  const source = String(text || "");
  const needle = String(quote || "").trim();
  if (!source || !needle) return source;
  let index = source.indexOf(needle);
  if (index < 0 && needle.length >= 4) index = source.indexOf(needle.slice(0, 4));
  if (index < 0) return source;
  const start = Math.max(source.lastIndexOf("，", index - 1), source.lastIndexOf(",", index - 1), source.lastIndexOf("。", index - 1), source.lastIndexOf("；", index - 1), source.lastIndexOf(";", index - 1), source.lastIndexOf("\n", index - 1)) + 1;
  const ends = ["，", ",", "。", "；", ";", "\n"].map((mark) => source.indexOf(mark, index + needle.length)).filter((position) => position >= 0);
  const end = ends.length ? Math.min(...ends) : source.length;
  return source.slice(start, end).trim();
}

export function hasDateEvidence(quote, text) {
  const source = String(quote || "").trim();
  return EXPLICIT_DATE_RE.test(source) || EXPLICIT_DATE_RE.test(clauseAroundQuote(text, source));
}

export function isVaguePastItem(quote, text, today) {
  const source = String(quote || "").trim();
  const vague = source ? VAGUE_PAST_RE.test(source) : (VAGUE_PAST_RE.test(String(text || "")) && resolveDate(text, today) == null);
  return vague && !hasDateEvidence(source, text);
}

export function isVaguePastText(text, today) {
  return VAGUE_PAST_RE.test(String(text || "")) && resolveDate(text, today) == null;
}

export function guardAmbiguousTaskWrites(items, text, openTasks) {
  const match = matchTaskCandidates(text, openTasks);
  if (!match.ambiguous) return { items, converted: 0 };
  const candidateIds = new Set(match.candidates.map((task) => task.id));
  let converted = 0;
  const out = [];
  const existing = new Set((items || [])
    .filter((item) => item?.op === "request_clarification" && item.clarification?.kind === "task_target")
    .map((item) => `${item.clarification.intent}:${(item.clarification.candidates || []).map((candidate) => candidate.id).join(",")}`));
  const added = new Set();
  for (const item of items || []) {
    if (item?.op === "complete_task" || item?.op === "delete_task") {
      if (candidateIds.has(item.id)) {
        const key = `${item.op}:${[...candidateIds].join(",")}`;
        if (!existing.has(key) && !added.has(key)) {
          out.push(taskClarification(text, match.candidates, { intent: item.op }));
          added.add(key);
        }
        converted += 1;
        continue;
      }
    }
    out.push(item);
  }
  return { items: out, converted };
}

export function applyVagueDateGuard(items, text, today) {
  return (items || []).map((item) => {
    if (item?.op === "add_event" && isVaguePastItem(item.event?.quote, text, today) && item.event.confidence >= 0.6) {
      return { ...item, event: { ...item.event, confidence: 0.4 } };
    }
    if (item?.op === "add_rest" && isVaguePastItem(item.rest?.quote, text, today) && item.rest.confidence >= 0.6) {
      return { ...item, rest: { ...item.rest, confidence: 0.4 } };
    }
    return item;
  });
}

export function partitionAgentItems(items) {
  const writes = [];
  const clarifications = [];
  for (const item of items || []) {
    if (item?.op === "request_clarification") {
      if (item.clarification) clarifications.push(item.clarification);
    } else {
      writes.push(item);
    }
  }
  return { writes, clarifications };
}

export function planAgentItems(items, text, { today, openTasks = [] } = {}) {
  const guarded = guardAmbiguousTaskWrites(items, text, openTasks);
  const adjusted = applyVagueDateGuard(guarded.items, text, today);
  const { writes, clarifications } = partitionAgentItems(adjusted);
  return { writes, clarifications, converted: guarded.converted };
}

export function buildReceipt({ writes = [], result, clarifications = 0 }) {
  let changed = Number(result?.changed) || 0;
  const pending = Array.isArray(result?.newPending) ? result.newPending.length : 0;
  const noop = Math.max(0, writes.length - changed);
  let status = "empty";
  if (changed > 0) status = pending > 0 || clarifications > 0 ? "pending" : "applied";
  else if (clarifications > 0) status = "clarification";
  else if (writes.length > 0) status = "noop";
  return { status, changed, pending, noop, clarifications };
}

export function noOpReply(receipt) {
  if (receipt.status === "noop") return "这条之前已经处理过，没有重复入账。";
  if (receipt.status === "clarification") return "我先确认一下，再写入记录。";
  return "";
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function realDate(value) {
  if (!DATE_RE.test(value || "")) return false;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10) === value;
}
function numberIn(value, lo, hi, integer = false) {
  return typeof value === "number" && Number.isFinite(value) && value >= lo && value <= hi && (!integer || Number.isInteger(value));
}

const WRITE_OPS = new Set(["add_event", "add_rest", "add_task", "confirm_event", "deny_event", "delete_event", "confirm_rest", "deny_rest", "delete_rest", "complete_task", "delete_task"]);
const FUTURE_HINT = /周[一二三四五六日天]|下周|本周|这周|礼拜|明天|后天|大后天|\d{1,2}月\d{1,2}日|\d{4}-\d{1,2}-\d{1,2}|\d+\s*天(?:后|以后|之后)|\d+\s*(?:周|礼拜)(?:后|以后|之后)|月底|月末/;

export function validateAgentWrites(items, { today, text } = {}) {
  const errors = [];
  for (const [index, item] of (items || []).entries()) {
    const at = `items[${index}]`;
    if (!item || !WRITE_OPS.has(item.op)) { errors.push(`${at}: 无效写操作`); continue; }
    if (item.op === "add_event") {
      const e = item.event || {};
      if (!["behavior", "emotion"].includes(e.eventType)) errors.push(`${at}: eventType 无效`);
      if (e.eventType === "behavior" && !["positive", "negative", "neutral"].includes(e.polarity)) errors.push(`${at}: polarity 无效`);
      if (!numberIn(e.intensity, 1, 5, true)) errors.push(`${at}: intensity 无效`);
      if (!realDate(e.occurredAt) || (today && e.occurredAt > today)) errors.push(`${at}: occurredAt 无效或晚于今天`);
      if (typeof e.quote !== "string" || !e.quote.trim()) errors.push(`${at}: quote 无效`);
      if (!numberIn(e.confidence, 0, 1)) errors.push(`${at}: confidence 无效`);
    } else if (item.op === "add_rest") {
      const r = item.rest || {};
      if (!realDate(r.date) || (today && r.date > today)) errors.push(`${at}: date 无效或晚于今天`);
      if (typeof r.quote !== "string" || !r.quote.trim()) errors.push(`${at}: quote 无效`);
      if (!numberIn(r.confidence, 0, 1)) errors.push(`${at}: confidence 无效`);
    } else if (item.op === "add_task") {
      const t = item.task || {};
      if (typeof t.title !== "string" || !t.title.trim()) errors.push(`${at}: title 无效`);
      if (!realDate(t.dueAt) || (today && t.dueAt < today)) errors.push(`${at}: dueAt 无效或早于今天`);
      if (text && !FUTURE_HINT.test(String(text))) errors.push(`${at}: 新增目标缺少明确到期日`);
      if (!numberIn(t.position, 1, 5, true)) errors.push(`${at}: position 无效`);
      if (!numberIn(t.confidence, 0, 1)) errors.push(`${at}: confidence 无效`);
    } else if (item.op === "confirm_event") {
      if (typeof item.id !== "string" || !item.id) errors.push(`${at}: 事件 id 无效`);
      if (item.occurredAt != null && (!realDate(item.occurredAt) || (today && item.occurredAt > today))) errors.push(`${at}: occurredAt 无效或晚于今天`);
    } else if (item.op === "confirm_rest") {
      if (typeof item.id !== "string" || !item.id) errors.push(`${at}: 休息 id 无效`);
      if (item.date != null && (!realDate(item.date) || (today && item.date > today))) errors.push(`${at}: date 无效或晚于今天`);
    } else if (item.op === "complete_task") {
      if (typeof item.id !== "string" || !item.id) errors.push(`${at}: 目标 id 无效`);
      if (item.doneAt != null && (!realDate(item.doneAt) || (today && item.doneAt > today))) errors.push(`${at}: doneAt 无效或晚于今天`);
    } else if (typeof item.id !== "string" || !item.id) {
      errors.push(`${at}: id 无效`);
    }
  }
  return errors;
}

const SUCCESS_CLAIM = /已(?:经)?(?:记录|写入|完成|计入|计分|记入|记上)|进(?:了)?(?:今天|当天)的走势|目标已完成|记下了|记上了/;
const ADDITIONAL_INTENT = /跑|公里|健身|锻炼|散步|读完|看书|读书|复习|背单词|熬夜|刷手机|拖延|翘课|早起|休息|摆烂|请假|放假|焦虑|紧张|压力|开心|高兴|快乐|难过|伤心|低落|累|疲惫|烦|烦躁|孤独|想家|我想|我要|计划|打算|准备|删|删除|移除/;

export function hasAdditionalIntent(text) {
  return ADDITIONAL_INTENT.test(String(text || ""));
}

function stripSuccessClaims(reply) {
  return String(reply || "")
    .replace(/[^。！？!?]*?(?:已(?:经)?(?:记录|写入|完成|计入|计分|记入|记上)|进(?:了)?(?:今天|当天)的走势|目标已完成|记下了|记上了)[^。！？!?]*[。！？!?]?/g, "")
    .trim();
}

function receiptNote(receipt) {
  if (receipt.status === "pending") {
    const parts = [];
    if (receipt.pending) parts.push(`${receipt.pending} 项待确认，确认前不计分`);
    if (receipt.clarifications) parts.push(`${receipt.clarifications} 项待澄清`);
    return `部分事项已写入；${parts.join("，")}。`;
  }
  if (receipt.status === "clarification") return "先确认一下，再写入记录。";
  if (receipt.status === "empty") return "这条还没有写入，请再确认一下要记录什么。";
  if (receipt.status === "noop") return noOpReply(receipt);
  return "";
}

export function sanitizeAgentReply(reply, receipt) {
  const source = String(reply || "");
  if (!receipt || receipt.status === "applied") return source;
  if (!SUCCESS_CLAIM.test(source)) return source;
  const remaining = stripSuccessClaims(source);
  const note = receiptNote(receipt);
  return remaining ? `${note}${remaining}` : note;
}
