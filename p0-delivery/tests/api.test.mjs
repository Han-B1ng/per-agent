import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
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

test("model 路径 stub：透传 + sanitize（剥 score/clamp intensity/emotion 强制 neutral）+ 注入校验", async () => {
  let seen = null;
  const up = await listen(stub((req, res, body) => {
    seen = { auth: req.headers.authorization, system: body.messages[0].content };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ reply: "记下了", items: [ { op: "add_event", event: { eventType: "behavior", polarity: "positive", intensity: 9, occurredAt: TODAY, quote: "跑", confidence: 0.9, score: 99 } }, { op: "add_event", event: { eventType: "emotion", polarity: "positive", intensity: 2, occurredAt: TODAY, quote: "焦虑", confidence: 0.8 } } ] }) } }] }));
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

test("非法 JSON 400；超长 text 400；confirm 未知 id 丢弃", async () => {
  const s = await listen(createApp({ env: {}, staticRoot: fixture() }));
  const bad = await fetch(base(s) + "/api/extract", { method: "POST", body: "{not json" });
  assert.equal(bad.status, 400);
  const long = await post(base(s), { text: "x".repeat(1501), context: ctx() });
  assert.equal(long.status, 400);
  const up = await listen(okUpstream({ reply: "r", items: [{ op: "confirm_event", id: "unknown" }] }));
  const s2 = await listen(createApp({ env: { MODEL_API_KEY: "k", MODEL_BASE_URL: base(up) }, staticRoot: fixture() }));
  const r = await post(base(s2), { text: "确认", context: ctx() });
  assert.deepEqual(r.json.items, []);
  up.close(); s2.close(); s.close();
});
test("返工③ model sanitize：confirm_rest/deny_rest 仅接受注入的 pendingRests id", async () => {
  const up = await listen(okUpstream({ reply: "r", items: [ { op: "confirm_rest", id: "r1", date: TODAY }, { op: "deny_rest", id: "unknown" }, { op: "add_rest", rest: { date: TODAY, quote: "想休息", confidence: 0.4 } } ] }));
  const s = await listen(createApp({ env: { MODEL_API_KEY: "k", MODEL_BASE_URL: base(up) }, staticRoot: fixture() }));
  const { json } = await post(base(s), { text: "确认", context: ctx({ pendingRests: [{ id: "r1", quote: "想休息", date: TODAY }] }) });
  assert.equal(json.items.length, 2); // confirm_rest(r1) + add_rest；unknown deny_rest 丢弃
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
