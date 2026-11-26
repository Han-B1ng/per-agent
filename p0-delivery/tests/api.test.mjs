import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "../server/index.mjs";
import { resolveDate } from "../server/mock.mjs";

const TODAY = "2026-11-17";
function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}
const base = (s) => `http://127.0.0.1:${s.address().port}`;
async function post(url, body) {
  const res = await fetch(url + "/api/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, json: await res.json() };
}
function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), "pe-static-"));
  writeFileSync(path.join(dir, "index.html"), "<!doctype html><title>fixture</title>");
  return dir;
}
// 静态根在临时目录的子层，同级放越界文件，根内再放一个指向它的符号链接。
function guardedFixture() {
  const dir = mkdtempSync(path.join(tmpdir(), "pe-static-guard-"));
  const root = path.join(dir, "public");
  mkdirSync(path.join(root, "assets"), { recursive: true });
  writeFileSync(path.join(root, "index.html"), "<!doctype html><title>fixture</title>");
  writeFileSync(path.join(root, "assets", "app.js"), "console.log(1)");
  const outside = path.join(dir, "secret.txt");
  writeFileSync(outside, "top-secret");
  symlinkSync(outside, path.join(root, "leak.js"));
  return { root, outside };
}
function ctx(over = {}) { return { today: TODAY, openTasks: [], pendingEvents: [], turns: [], ...over }; }

// 可控 stub 上游（模拟 OpenAI /chat/completions）
function stub(handler) {
  const s = http.createServer(async (req, res) => {
    let raw = "";
    for await (const c of req) raw += c;
    const reqBody = JSON.parse(raw || "{}");
    await handler(req, res, reqBody);
  });
  return s;
}
const okUpstream = (payload) => stub((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }));
});

test("health 无 key → mock", async () => {
  const s = await listen(createApp({ env: {}, staticRoot: fixture() }));
  const r = await fetch(base(s) + "/api/health").then((r) => r.json());
  assert.equal(r.mode, "mock");
  s.close();
});

test("mock 验收句1 → emotion+behavior 两 item，无 score 字段", async () => {
  const s = await listen(createApp({ env: {}, staticRoot: fixture() }));
  const { json } = await post(base(s), { text: "今天有点焦虑，但还是去跑了五公里", context: ctx() });
  assert.equal(json.ok, true);
  assert.equal(json.mode, "mock");
  assert.equal(json.items.length, 2);
  const types = json.items.map((i) => i.event.eventType).sort();
  assert.deepEqual(types, ["behavior", "emotion"]);
  assert.equal(json.items.find((i) => i.event.eventType === "emotion").event.polarity, "neutral");
  assert.ok(!JSON.stringify(json.items).includes("score"));
  s.close();
});

test("mock 验收句2 → 低置信追问；补日期上周三 → confirm_event 正确 ISO", async () => {
  const s = await listen(createApp({ env: {}, staticRoot: fixture() }));
  const a = await post(base(s), { text: "前阵子跑过一次五公里", context: ctx() });
  assert.ok(a.json.items[0].event.confidence < 0.6);
  assert.match(a.json.reply, /哪天|日期/);
  const pend = [{ id: "evt_p1", quote: "跑过一次五公里", occurredAt: TODAY, eventType: "behavior", polarity: "positive", intensity: 3 }];
  const b = await post(base(s), { text: "上周三", context: ctx({ pendingEvents: pend }) });
  assert.equal(b.json.items[0].op, "confirm_event");
  assert.equal(b.json.items[0].id, "evt_p1");
  assert.equal(b.json.items[0].occurredAt, "2026-11-11"); // 2026-11-17 周二，上周三=11-11
  s.close();
});

test("resolveDate 各种相对词", () => {
  assert.equal(resolveDate("昨天", TODAY), "2026-11-16");
  assert.equal(resolveDate("前天", TODAY), "2026-11-15");
  assert.equal(resolveDate("三天前", TODAY), "2026-11-14");
  assert.equal(resolveDate("上周三", TODAY), "2026-11-11");
  assert.equal(resolveDate("11月12日", TODAY), "2026-11-12");
  assert.equal(resolveDate("2026-11-01", TODAY), "2026-11-01");
});

test("model 路径 stub：透传 + sanitize（剥 score / emotion 强制 neutral）+ 注入校验", async () => {
  let seen = null;
  const up = await listen(stub((req, res, body) => {
    seen = { auth: req.headers.authorization, system: body.messages[0].content };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ reply: "记下了", items: [ { op: "add_event", event: { eventType: "behavior", polarity: "positive", intensity: 5, occurredAt: TODAY, quote: "跑", confidence: 0.9, score: 99 } }, { op: "add_event", event: { eventType: "emotion", polarity: "positive", intensity: 2, occurredAt: TODAY, quote: "焦虑", confidence: 0.8 } } ] }) } }] }));
  }));
  const s = await listen(createApp({ env: { MODEL_API_KEY: "test-key", MODEL_BASE_URL: base(up), MODEL_NAME: "stub" }, staticRoot: fixture() }));
  const { json } = await post(base(s), { text: "今天跑了五公里", context: ctx({ pendingEvents: [{ id: "p1", quote: "q", occurredAt: TODAY }], openTasks: [{ id: "t1", title: "课设", dueAt: TODAY, position: 3 }] }) });
  assert.equal(json.mode, "model");
  assert.equal(json.items[0].event.intensity, 5);
  assert.ok(!("score" in json.items[0].event));
  assert.equal(json.items[1].event.polarity, "neutral");
  assert.equal(seen.auth, "Bearer test-key");
  assert.match(seen.system, new RegExp(TODAY));
  assert.match(seen.system, /p1/);
  up.close(); s.close();
});

test("model 错误分类：quota / timeout / bad_output", async () => {
  const quotaUp = await listen(stub((req, res) => { res.writeHead(429, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: { message: "insufficient quota" } })); }));
  let s = await listen(createApp({ env: { MODEL_API_KEY: "k", MODEL_BASE_URL: base(quotaUp) }, staticRoot: fixture() }));
  let r = await post(base(s), { text: "a", context: ctx() });
  assert.equal(r.json.error.code, "quota");
  s.close(); quotaUp.close();

  const slowUp = await listen(stub(async (req, res) => { await new Promise((r) => setTimeout(r, 600)); res.writeHead(200); res.end("{}"); }));
  s = await listen(createApp({ env: { MODEL_API_KEY: "k", MODEL_BASE_URL: base(slowUp), MODEL_TIMEOUT_MS: "200" }, staticRoot: fixture() }));
  r = await post(base(s), { text: "b", context: ctx() });
  assert.equal(r.json.error.code, "timeout");
  s.close(); slowUp.close();

  const badUp = await listen(stub((req, res) => { res.writeHead(200); res.end("not json"); }));
  s = await listen(createApp({ env: { MODEL_API_KEY: "k", MODEL_BASE_URL: base(badUp) }, staticRoot: fixture() }));
  r = await post(base(s), { text: "c", context: ctx() });
  assert.equal(r.json.error.code, "bad_output");
  s.close(); badUp.close();
});

test("useMock 强制 mock 即使有 key", async () => {
  const s = await listen(createApp({ env: { MODEL_API_KEY: "k" }, staticRoot: fixture() }));
  const { json } = await post(base(s), { text: "今天跑了五公里", useMock: true, context: ctx() });
  assert.equal(json.mode, "mock");
  s.close();
});

test("限频：31 个不同 text → 第31个 429 rate_limited", async () => {
  const s = await listen(createApp({ env: {}, staticRoot: fixture() }));
  let last;
  for (let i = 0; i < 31; i++) last = await post(base(s), { text: "今天跑了五公里 " + i, context: ctx() });
  assert.equal(last.status, 429);
  assert.equal(last.json.error.code, "rate_limited");
  s.close();
});

test("缓存：同 text+context 第二次 cached:true", async () => {
  const s = await listen(createApp({ env: {}, staticRoot: fixture() }));
  const body = { text: "今天读了半小时书", context: ctx() };
  await post(base(s), body);
  const second = await post(base(s), body);
  assert.equal(second.json.cached, true);
  s.close();
});

test("缓存：TTL 到期后重新抽取", async () => {
  let clock = 1_000_000;
  const s = await listen(createApp({ env: {}, staticRoot: fixture(), cacheTtl: 1000, now: () => clock }));
  const body = { text: "今天读了半小时书", context: ctx() };
  const first = await post(base(s), body);
  assert.equal(first.json.cached, undefined);
  const second = await post(base(s), body);
  assert.equal(second.json.cached, true);
  clock += 1001;
  const third = await post(base(s), body);
  assert.equal(third.json.ok, true);
  assert.equal(third.json.cached, undefined);
  s.close();
});

test("缓存：超过容量时保留最近使用项，淘汰最久未使用项", async () => {
  const s = await listen(createApp({ env: {}, staticRoot: fixture(), cacheMax: 2 }));
  const req = (text) => post(base(s), { text, context: ctx() });
  assert.equal((await req("今天跑了五公里")).json.cached, undefined);
  assert.equal((await req("今天读了半小时书")).json.cached, undefined);
  assert.equal((await req("今天跑了五公里")).json.cached, true); // 命中后刷新为最近使用
  assert.equal((await req("今天有点焦虑，但还是去跑了五公里")).json.cached, undefined); // 满员插入第三条
  assert.equal((await req("今天跑了五公里")).json.cached, true); // 最近使用过，保留
  assert.equal((await req("今天读了半小时书")).json.cached, undefined); // 最久未用，已被淘汰
  s.close();
});

test("缓存：容量满时先清理过期项再淘汰", async () => {
  let clock = 1_000_000;
  const s = await listen(createApp({ env: {}, staticRoot: fixture(), cacheMax: 2, cacheTtl: 1000, now: () => clock }));
  const req = (text) => post(base(s), { text, context: ctx() });
  await req("今天跑了五公里"); // t0，最早写入
  clock += 900;
  await req("今天读了半小时书"); // t900，仍有效
  clock += 50;
  await req("今天跑了五公里"); // t950 命中，成为最近使用
  clock += 150; // t1100：第一条已过期，第二条未过期
  await req("今天有点焦虑，但还是去跑了五公里");
  assert.equal((await req("今天读了半小时书")).json.cached, true); // 未过期项保留，没有被 LRU 误淘汰
  assert.equal((await req("今天跑了五公里")).json.cached, undefined); // 过期项先被清理，重新抽取
  s.close();
});

test("缓存：不同访客不互相命中", async () => {
  const s = await listen(createApp({ env: {}, staticRoot: fixture() }));
  const text = "今天跑了五公里";
  const visitorA = { text, context: ctx({ clientId: "visitor-a" }) };
  const visitorB = { text, context: ctx({ clientId: "visitor-b" }) };
  assert.equal((await post(base(s), visitorA)).json.cached, undefined);
  assert.equal((await post(base(s), visitorA)).json.cached, true);
  assert.equal((await post(base(s), visitorB)).json.cached, undefined);
  assert.equal((await post(base(s), visitorB)).json.cached, true);
  s.close();
});

test("静态：/ 200 html；穿越 404；未知 404", async () => {
  const s = await listen(createApp({ env: {}, staticRoot: fixture() }));
  const root = await fetch(base(s) + "/");
  assert.equal(root.status, 200);
  assert.match(root.headers.get("content-type"), /text\/html/);
  const trav = await fetch(base(s) + "/../server/model.mjs");
  assert.equal(trav.status, 404);
  const trav2 = await fetch(base(s) + "/%2e%2e/server/model.mjs");
  assert.equal(trav2.status, 404);
  const missing = await fetch(base(s) + "/nope.js");
  assert.equal(missing.status, 404);
  s.close();
});

test("静态防护：真实路径越出根目录（含符号链接）404，正常资源 GET/HEAD 不变", async () => {
  const { root, outside } = guardedFixture();
  const s = await listen(createApp({ env: {}, staticRoot: root }));
  const asset = await fetch(base(s) + "/assets/app.js");
  assert.equal(asset.status, 200);
  assert.equal(await asset.text(), "console.log(1)");
  assert.match(asset.headers.get("content-type"), /text\/javascript/);
  const head = await fetch(base(s) + "/assets/app.js", { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.match(head.headers.get("content-type"), /text\/javascript/);
  assert.equal(await head.text(), "");
  for (const url of ["/%2e%2e/secret.txt", "/%2e%2e/%2e%2e/etc/passwd", "/leak.js", "/%ff"]) {
    const res = await fetch(base(s) + url);
    assert.equal(res.status, 404, url + " 应被拒绝");
    assert.equal(await res.text(), "not found");
  }
  assert.equal(readFileSync(outside, "utf8"), "top-secret"); // 越界目标确实可读，404 来自防护而非文件缺失
  s.close();
});

test("非法 JSON 400；非对象 JSON 400；超长 text 400；confirm 未知 id 整次拒绝", async () => {
  const s = await listen(createApp({ env: {}, staticRoot: fixture() }));
  const bad = await fetch(base(s) + "/api/extract", { method: "POST", body: "{not json" });
  assert.equal(bad.status, 400);
  for (const rawBody of ["null", "[]", "\"hello\"", "123"]) {
    const nonObj = await fetch(base(s) + "/api/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: rawBody });
    assert.equal(nonObj.status, 400, `body=${rawBody} 应返回 400`);
    const nonObjJson = await nonObj.json();
    assert.equal(nonObjJson.ok, false);
    assert.equal(nonObjJson.error.code, "invalid_request");
  }
  const long = await post(base(s), { text: "x".repeat(1501), context: ctx() });
  assert.equal(long.status, 400);
  const up = await listen(okUpstream({ reply: "r", items: [{ op: "confirm_event", id: "unknown" }] }));
  const s2 = await listen(createApp({ env: { MODEL_API_KEY: "k", MODEL_BASE_URL: base(up) }, staticRoot: fixture() }));
  const r = await post(base(s2), { text: "确认", context: ctx() });
  assert.equal(r.json.ok, false);
  assert.equal(r.json.error.code, "bad_output");
  assert.equal(r.json.items, undefined);
  up.close(); s2.close(); s.close();
});
test("返工③ model sanitize：confirm_rest 接受当前 pendingRests id", async () => {
  const up = await listen(okUpstream({ reply: "r", items: [ { op: "confirm_rest", id: "r1", date: TODAY }, { op: "add_rest", rest: { date: TODAY, quote: "想休息", confidence: 0.4 } } ] }));
  const s = await listen(createApp({ env: { MODEL_API_KEY: "k", MODEL_BASE_URL: base(up) }, staticRoot: fixture() }));
  const { json } = await post(base(s), { text: "确认", context: ctx({ pendingRests: [{ id: "r1", quote: "想休息", date: TODAY }] }) });
  assert.equal(json.items.length, 2); // confirm_rest(r1) + add_rest
  assert.equal(json.items[0].op, "confirm_rest");
  assert.equal(json.items[0].date, TODAY);
  assert.equal(json.items[1].rest.confidence, 0.4);
  up.close(); s.close();
});
test("返工③ mock：pendingRests 确认/否认/补日期", async () => {
  const s = await listen(createApp({ env: {}, staticRoot: fixture() }));
  const pr = [{ id: "r1", quote: "想休息", date: TODAY }];
  const yes = await post(base(s), { text: "是的", context: ctx({ pendingRests: pr }) });
  assert.equal(yes.json.items[0].op, "confirm_rest");
  const no = await post(base(s), { text: "不是", context: ctx({ pendingRests: pr }) });
  assert.equal(no.json.items[0].op, "deny_rest");
  const dated = await post(base(s), { text: "上周三", context: ctx({ pendingRests: pr }) });
  assert.equal(dated.json.items[0].op, "confirm_rest");
  assert.equal(dated.json.items[0].date, "2026-11-11");
  s.close();
});

test("Agent 协议 mock：新增目标与同名目标澄清经 HTTP 路径生效", async () => {
  const s = await listen(createApp({ env: {}, staticRoot: fixture() }));
  const goal = await post(base(s), { text: "我想周五交数据库课设", context: ctx() });
  assert.equal(goal.json.mode, "mock");
  assert.equal(goal.json.items[0].op, "add_task");
  assert.equal(goal.json.items[0].task.dueAt, "2026-11-20");

  const tasks = [
    { id: "task_db", title: "数据库课设", dueAt: "2026-11-21", position: 3 },
    { id: "task_algo", title: "算法课设", dueAt: "2026-11-24", position: 3 },
  ];
  const mixed = await post(base(s), { text: "课设交了，今天还跑了五公里", context: ctx({ openTasks: tasks }) });
  assert.equal(mixed.json.ok, true);
  assert.ok(mixed.json.items.some((item) => item.op === "add_event"));
  const clarification = mixed.json.items.find((item) => item.op === "request_clarification");
  assert.ok(clarification);
  assert.deepEqual(clarification.clarification.candidates.map((candidate) => candidate.id), ["task_db", "task_algo"]);
  assert.equal(mixed.json.items.some((item) => item.op === "complete_task"), false);
  s.close();
});

test("Agent 协议 model stub：合法澄清透传，非法候选/未来日期整次拒绝", async () => {
  const tasks = [
    { id: "task_db", title: "数据库课设", dueAt: "2026-11-21", position: 3 },
    { id: "task_algo", title: "算法课设", dueAt: "2026-11-24", position: 3 },
  ];
  const clarificationPayload = {
    reply: "有两个课设，你说的哪一个？",
    items: [{
      op: "request_clarification",
      clarification: {
        kind: "task_target",
        intent: "complete_task",
        question: "哪一个？",
        sourceText: "课设交了",
        candidates: [{ id: "task_db", label: "数据库课设" }, { id: "task_algo", label: "算法课设" }],
      },
    }],
  };
  const up = await listen(okUpstream(clarificationPayload));
  const s = await listen(createApp({ env: { MODEL_API_KEY: "k", MODEL_BASE_URL: base(up) }, staticRoot: fixture() }));
  const ok = await post(base(s), { text: "课设交了", context: ctx({ openTasks: tasks }) });
  assert.equal(ok.json.ok, true);
  assert.equal(ok.json.items[0].op, "request_clarification");
  assert.deepEqual(ok.json.items[0].clarification.candidates.map((candidate) => candidate.id), ["task_db", "task_algo"]);
  up.close();
  s.close();

  const bad = { ...clarificationPayload, items: [{ ...clarificationPayload.items[0], clarification: { ...clarificationPayload.items[0].clarification, candidates: [{ id: "task_unknown", label: "不存在" }] } }] };
  const upBad = await listen(okUpstream(bad));
  const sBad = await listen(createApp({ env: { MODEL_API_KEY: "k", MODEL_BASE_URL: base(upBad) }, staticRoot: fixture() }));
  const rejected = await post(base(sBad), { text: "课设交了", context: ctx({ openTasks: tasks }) });
  assert.equal(rejected.json.ok, false);
  assert.equal(rejected.json.error.code, "bad_output");
  assert.equal(rejected.json.items, undefined);

  const future = { reply: "未来", items: [{ op: "add_event", event: { eventType: "behavior", polarity: "positive", intensity: 2, occurredAt: "2026-11-20", quote: "跑", confidence: 0.9 } }] };
  const upFuture = await listen(okUpstream(future));
  const sFuture = await listen(createApp({ env: { MODEL_API_KEY: "k", MODEL_BASE_URL: base(upFuture) }, staticRoot: fixture() }));
  const futureRes = await post(base(sFuture), { text: "明天跑了五公里", context: ctx() });
  assert.equal(futureRes.json.error.code, "bad_output");
  upBad.close(); sBad.close(); upFuture.close(); sFuture.close();

  const invented = { reply: "创建了", items: [{ op: "add_task", task: { title: "数据库课设", dueAt: "2026-11-26", position: 2, confidence: 0.9 } }] };
  const upInvented = await listen(okUpstream(invented));
  const sInvented = await listen(createApp({ env: { MODEL_API_KEY: "k", MODEL_BASE_URL: base(upInvented) }, staticRoot: fixture() }));
  const inventedRes = await post(base(sInvented), { text: "我想交数据库课设", context: ctx() });
  assert.equal(inventedRes.json.error.code, "bad_output");
  upInvented.close(); sInvented.close();
});

test("Agent 协议：模型缩短引文不能绕过原句的模糊日期", async () => {
  const payload = { reply: "已计入指数", items: [{ op: "add_event", event: { eventType: "behavior", polarity: "positive", intensity: 3, occurredAt: "2026-11-16", quote: "跑过五公里", tags: [], confidence: 0.9 } }] };
  const up = await listen(okUpstream(payload));
  const s = await listen(createApp({ env: { MODEL_API_KEY: "k", MODEL_BASE_URL: base(up) }, staticRoot: fixture() }));
  try {
    const response = await post(base(s), { text: "前阵子跑过五公里，今天读完一本书", context: ctx() });
    assert.equal(response.json.ok, true);
    assert.equal(response.json.items[0].event.quote, "跑过五公里");
    assert.equal(response.json.items[0].event.confidence, 0.4);
  } finally {
    up.close(); s.close();
  }
});

test("Agent 协议：模糊日期按 item 降置信，历史日不能绕过；多条 pending 不吞新事件", async () => {
  const vague = { reply: "记下了", items: [{ op: "add_event", event: { eventType: "behavior", polarity: "positive", intensity: 3, occurredAt: "2026-11-16", quote: "前阵子跑过五公里", tags: [], confidence: 0.9 } }] };
  const up = await listen(okUpstream(vague));
  const s = await listen(createApp({ env: { MODEL_API_KEY: "k", MODEL_BASE_URL: base(up) }, staticRoot: fixture() }));
  const dated = await post(base(s), { text: "前阵子跑过五公里", context: ctx() });
  assert.equal(dated.json.ok, true);
  assert.equal(dated.json.items[0].event.confidence, 0.4);
  up.close(); s.close();

  const mixedPayload = { reply: "记下了", items: [
    { op: "add_event", event: { eventType: "behavior", polarity: "positive", intensity: 3, occurredAt: "2026-11-16", quote: "前阵子跑过五公里", tags: [], confidence: 0.9 } },
    { op: "add_event", event: { eventType: "behavior", polarity: "positive", intensity: 2, occurredAt: "2026-11-17", quote: "今天又跑了三公里", tags: [], confidence: 0.9 } },
  ] };
  const upMixed = await listen(okUpstream(mixedPayload));
  const sMixed = await listen(createApp({ env: { MODEL_API_KEY: "k", MODEL_BASE_URL: base(upMixed) }, staticRoot: fixture() }));
  const mixed = await post(base(sMixed), { text: "前阵子跑过五公里，今天又跑了三公里", context: ctx() });
  assert.equal(mixed.json.items[0].event.confidence, 0.4);
  assert.equal(mixed.json.items[1].event.confidence, 0.9);
  upMixed.close(); sMixed.close();

  const mockServer = await listen(createApp({ env: {}, staticRoot: fixture() }));
  const pendingEvents = [
    { id: "evt_a", quote: "旧事A", occurredAt: TODAY, eventType: "behavior", polarity: "positive", intensity: 2 },
    { id: "evt_b", quote: "旧事B", occurredAt: TODAY, eventType: "behavior", polarity: "positive", intensity: 2 },
  ];
  const fresh = await post(base(mockServer), { text: "今天还跑了五公里", context: ctx({ pendingEvents }) });
  assert.equal(fresh.json.ok, true);
  assert.deepEqual(fresh.json.items.map((item) => item.op), ["add_event"]);
  const datedAnswer = await post(base(mockServer), { text: "上周三", context: ctx({ pendingEvents }) });
  assert.equal(datedAnswer.json.items[0].op, "request_clarification");
  assert.equal(datedAnswer.json.items[0].clarification.kind, "record_target");
  mockServer.close();
});
