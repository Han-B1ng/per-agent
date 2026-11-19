import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import * as mock from "../server/mock.mjs";
import { validateExtractItems, sanitizeItems } from "../server/model.mjs";
import { resolveDate, resolveDueDate } from "../web/date.js";
import {
  buildReceipt,
  guardAmbiguousTaskWrites,
  hasAdditionalIntent,
  matchTaskCandidates,
  normalizeClarification,
  planAgentItems,
  resolveClarificationReply,
  sanitizeAgentReply,
  validateAgentWrites,
  validateClarificationAgainstLedger,
} from "../web/agent-protocol.js";

const TODAY = "2026-11-19";
const TASKS = [
  { id: "task_db", title: "数据库课设", dueAt: "2026-11-21", position: 3 },
  { id: "task_algo", title: "算法课设", dueAt: "2026-11-24", position: 3 },
];
const CLARIFICATION = {
  id: "clr_1",
  kind: "task_target",
  intent: "complete_task",
  question: "有两个课设目标，你说的是哪一个？",
  sourceText: "课设交了",
  status: "pending",
  createdAt: "2026-11-19T10:00:00.000Z",
  candidates: [
    { id: "task_db", label: "数据库课设 · 11.21 到期", kind: "task", title: "数据库课设", dueAt: "2026-11-21" },
    { id: "task_algo", label: "算法课设 · 11.24 到期", kind: "task", title: "算法课设", dueAt: "2026-11-24" },
  ],
};

test("协议示例文件可解析，且示例回包通过服务端校验", () => {
  const file = path.resolve(import.meta.dirname, "fixtures/agent-protocol-examples.json");
  const examples = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(examples.today, TODAY);
  for (const key of ["newGoal", "uniqueCompletion", "ambiguousMultiIntent", "vagueDate"]) {
    const example = examples.examples[key];
    const errors = validateExtractItems(example.response.items, { ...example.context, text: example.input });
    assert.deepEqual(errors, [], `${key}: ${errors.join(";")}`);
    const clean = sanitizeItems(example.response.items, { ...example.context, text: example.input });
    assert.ok(clean.length >= 1, key);
  }
});

test("新增目标 / 完成已有目标 / 记录已发生的事三意图区分", () => {
  const goal = mock.extract("我想周五交数据库课设", { today: TODAY, openTasks: [] });
  assert.equal(goal.items.length, 1);
  assert.equal(goal.items[0].op, "add_task");
  assert.equal(goal.items[0].task.dueAt, "2026-11-20");
  assert.equal(goal.items[0].task.title, "交数据库课设");

  const completed = mock.extract("数据库课设交了", { today: TODAY, openTasks: [TASKS[0]] });
  assert.deepEqual(completed.items, [{ op: "complete_task", id: "task_db", doneAt: TODAY }]);

  const recorded = mock.extract("今天跑了五公里", { today: TODAY });
  assert.equal(recorded.items[0].op, "add_event");
  assert.equal(recorded.items[0].event.occurredAt, TODAY);

  const missingDue = mock.extract("我想交数据库课设", { today: TODAY, openTasks: [] });
  assert.deepEqual(missingDue.items, []);
  assert.match(missingDue.reply, /哪天|日期/);
});

test("同名目标 + 多意图：跑步入账，课设交应用澄清", () => {
  const response = mock.extract("课设交了，今天还跑了五公里", { today: TODAY, openTasks: TASKS });
  assert.equal(response.items.some((item) => item.op === "complete_task"), false);
  const event = response.items.find((item) => item.op === "add_event");
  assert.ok(event, JSON.stringify(response.items));
  const clarification = response.items.find((item) => item.op === "request_clarification");
  assert.ok(clarification, JSON.stringify(response.items));
  assert.equal(clarification.clarification.kind, "task_target");
  assert.deepEqual(clarification.clarification.candidates.map((candidate) => candidate.id), ["task_db", "task_algo"]);
  assert.equal(clarification.clarification.sourceText, "课设交了");
  assert.deepEqual(validateExtractItems(response.items, { today: TODAY, openTasks: TASKS, pendingEvents: [], pendingRests: [] }), []);
});

test("澄清后续：唯一候选才解析，排序词与取消都可用", () => {
  const first = resolveClarificationReply(CLARIFICATION, "数据库那个", TODAY);
  assert.equal(first.status, "resolved");
  assert.deepEqual(first.item, { op: "complete_task", id: "task_db", doneAt: TODAY });

  const second = resolveClarificationReply(CLARIFICATION, "第二个", TODAY);
  assert.equal(second.status, "resolved");
  assert.equal(second.item.id, "task_algo");

  const cancelled = resolveClarificationReply(CLARIFICATION, "算了", TODAY);
  assert.equal(cancelled.status, "cancelled");

  const unrelated = resolveClarificationReply(CLARIFICATION, "今天跑了五公里", TODAY);
  assert.equal(unrelated.status, "unrelated");
});

test("模型猜同名目标时，应用守卫丢写入并转澄清；明确目标放行", () => {
  const guessed = [
    { op: "complete_task", id: "task_db", doneAt: TODAY },
    { op: "add_event", event: { eventType: "behavior", polarity: "positive", intensity: 2, occurredAt: TODAY, quote: "跑了五公里", tags: [], confidence: 0.9 } },
  ];
  const planned = planAgentItems(guessed, "课设交了，今天还跑了五公里", { today: TODAY, openTasks: TASKS });
  assert.equal(planned.converted, 1);
  assert.equal(planned.writes.filter((item) => item.op === "complete_task").length, 0);
  assert.equal(planned.writes.filter((item) => item.op === "add_event").length, 1);
  assert.equal(planned.clarifications.length, 1);

  const explicit = [{ op: "complete_task", id: "task_db", doneAt: TODAY }];
  const clear = planAgentItems(explicit, "数据库课设交了", { today: TODAY, openTasks: TASKS });
  assert.equal(clear.converted, 0);
  assert.deepEqual(clear.writes, explicit);
});

test("模糊过去即使模型给高置信，也降为 pending 阈值", () => {
  const items = [{ op: "add_event", event: { eventType: "behavior", polarity: "positive", intensity: 3, occurredAt: TODAY, quote: "前阵子跑过五公里", tags: [], confidence: 0.95 } }];
  const planned = planAgentItems(items, "前阵子跑过五公里", { today: TODAY, openTasks: [] });
  assert.equal(planned.writes.length, 1);
  assert.equal(planned.writes[0].event.confidence, 0.4);
});

test("回执只在写入后给出 applied/pending；重复操作为 noop", () => {
  const writes = [{ op: "complete_task", id: "task_db", doneAt: TODAY }];
  assert.equal(buildReceipt({ writes, result: { changed: 1, newPending: [] }, clarifications: 0 }).status, "applied");
  assert.equal(buildReceipt({ writes, result: { changed: 1, newPending: ["evt_1"] }, clarifications: 0 }).status, "pending");
  assert.equal(buildReceipt({ writes, result: { changed: 0, newPending: [] }, clarifications: 0 }).status, "noop");
  assert.equal(buildReceipt({ writes: [], result: { changed: 0, newPending: [] }, clarifications: 1 }).status, "clarification");
});

test("澄清持久化结构可规范化，并校验候选仍存在", () => {
  const normalized = normalizeClarification({
    kind: "task_target",
    intent: "complete_task",
    question: "哪一个？",
    sourceText: "课设交了",
    candidates: [TASKS[0], TASKS[1]],
  }, { now: "2026-11-19T10:00:00.000Z", createId: () => "clr_fixture" });
  assert.equal(normalized.id, "clr_fixture");
  assert.equal(normalized.status, "pending");
  assert.deepEqual(validateClarificationAgainstLedger(normalized, { openTasks: TASKS, pendingEvents: [], pendingRests: [] }), []);
  assert.match(validateClarificationAgainstLedger(normalized, { openTasks: [TASKS[0]], pendingEvents: [], pendingRests: [] })[0], /不可处理/);
});

test("跨周日期解析：记录用过去时，目标到期用将来时", () => {
  assert.equal(resolveDate("上周三", TODAY), "2026-11-11");
  assert.equal(resolveDate("昨天", TODAY), "2026-11-18");
  assert.equal(resolveDueDate("周五", TODAY), "2026-11-20");
  assert.equal(resolveDueDate("下周五", TODAY), "2026-11-27");
  assert.equal(resolveDueDate("明天", TODAY), "2026-11-20");
  assert.equal(resolveDueDate("2026-11-30", TODAY), "2026-11-30");
});

test("同名候选：完整标题唯一，泛称歧义", () => {
  assert.equal(matchTaskCandidates("数据库课设交了", TASKS).ambiguous, false);
  assert.equal(matchTaskCandidates("数据库课设交了", TASKS).candidates[0].id, "task_db");
  assert.equal(matchTaskCandidates("课设交了", TASKS).ambiguous, true);
  assert.deepEqual(matchTaskCandidates("课设交了", TASKS).candidates.map((task) => task.id), ["task_db", "task_algo"]);
  assert.equal(matchTaskCandidates("11.24 那个课设", TASKS).candidates[0].id, "task_algo");
});

test("未知 ID / 未来日期 / 非法候选被服务端整次拒绝", () => {
  const context = { today: TODAY, openTasks: TASKS, pendingEvents: [{ id: "evt_p", quote: "q", occurredAt: TODAY }], pendingRests: [] };
  assert.ok(validateExtractItems([{ op: "confirm_event", id: "evt_unknown" }], context).length > 0);
  assert.ok(validateExtractItems([{ op: "add_event", event: { eventType: "behavior", polarity: "positive", intensity: 2, occurredAt: "2026-11-20", quote: "跑", confidence: 0.9 } }], context).length > 0);
  assert.ok(validateExtractItems([{ op: "request_clarification", clarification: { ...CLARIFICATION, candidates: [{ id: "task_unknown", label: "不存在" }] } }], context).length > 0);
});

test("澄清答复的剩余明确意图可继续交给模型", () => {
  assert.equal(hasAdditionalIntent("数据库那个"), false);
  assert.equal(hasAdditionalIntent("第二个"), false);
  assert.equal(hasAdditionalIntent("数据库那个，今天还跑了五公里"), true);
  assert.equal(hasAdditionalIntent("数据库那个，有点焦虑"), true);
  assert.equal(hasAdditionalIntent("数据库那个，明天休息"), true);
});

test("应用写入前校验：未来日期、非法强度、过去到期日与成功措辞都被拦下", () => {
  const writes = [
    { op: "add_event", event: { eventType: "behavior", polarity: "positive", intensity: 9, occurredAt: "2026-11-20", quote: "跑", confidence: 0.9 } },
    { op: "add_task", task: { title: "旧目标", dueAt: "2026-11-18", position: 2, confidence: 0.9 } },
  ];
  const errors = validateAgentWrites(writes, { today: TODAY });
  assert.ok(errors.some((error) => error.includes("intensity")));
  assert.ok(errors.some((error) => error.includes("dueAt")));
  assert.ok(errors.some((error) => error.includes("occurredAt")));
  const missingDueErrors = validateAgentWrites([{ op: "add_task", task: { title: "没有日期", dueAt: "2026-11-25", position: 2, confidence: 0.9 } }], { today: TODAY, text: "我想交数据库课设" });
  assert.ok(missingDueErrors.some((error) => error.includes("到期日")));
  assert.equal(sanitizeAgentReply("目标已完成，已计入指数。", { status: "empty" }), "这条还没有写入，请再确认一下要记录什么。");
  assert.equal(sanitizeAgentReply("目标已完成。", { status: "applied" }), "目标已完成。");
});
