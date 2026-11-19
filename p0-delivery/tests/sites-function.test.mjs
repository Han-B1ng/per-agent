// Sites Function 本地 fixture 测试（免凭据）：stub QCA 上游，验证 handler 路由/sanitize/降级。
// 真实 QCA 执行需部署 + qoder 后端（QODER_PAT），另行记录，不在此冒充。
import test from "node:test";
import assert from "node:assert/strict";
import { createHandler } from "../functions/handler.mjs";

const TODAY = "2026-11-17";
const qcaPayload = {
  reply: "记下了今天的跑步。",
  items: [
    { op: "add_event", event: { eventType: "behavior", polarity: "positive", intensity: 5, occurredAt: TODAY, quote: "跑", confidence: 0.9, score: 99 } },
    { op: "add_event", event: { eventType: "emotion", polarity: "positive", intensity: 2, occurredAt: TODAY, quote: "焦虑", confidence: 0.8 } },
  ],
};
function stubFetch(routes) {
  return async (url, opts = {}) => {
    const u = new URL(url);
    const key = `${opts.method || "GET"} ${u.pathname}`;
    const handler = routes[key] || routes[`${opts.method || "GET"} ${u.pathname}${u.search}`];
    if (!handler) return new Response(JSON.stringify({ error: "unexpected " + key }), { status: 500 });
    const payload = typeof handler === "function" ? handler(opts) : handler;
    return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
  };
}
const qcaRoutes = {
  "GET /api/v1/cloud/models": { data: [{ id: "m1", enabled: true }] },
  "POST /api/v1/cloud/agents": { id: "agent1" },
  "POST /api/v1/cloud/environments": { id: "env1" },
  "POST /api/v1/cloud/sessions": { id: "sess1" },
  "POST /api/v1/cloud/sessions/sess1/events": { id: "ev1" },
  "GET /api/v1/cloud/sessions/sess1/events": { data: [{ type: "agent.message", content: [{ type: "text", text: JSON.stringify(qcaPayload) }] }] },
};
const req = (path, init) => new Request("http://site.local/functions/v1/app" + path, init);
const post = (body) => req("/api/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("function health：有 PAT→model(qca)，无 PAT→mock", async () => {
  const withPat = createHandler({ getToken: () => "fixture", fetchImpl: stubFetch(qcaRoutes) });
  let r = await withPat(req("/api/health"));
  assert.equal((await r.json()).mode, "model");
  const noPat = createHandler({ getToken: () => undefined, fetchImpl: stubFetch({}) });
  r = await noPat(req("/api/health"));
  assert.equal((await r.json()).mode, "mock");
});

test("function extract：QCA 路径透传 + sanitize（剥 score / emotion 强制 neutral）", async () => {
  const h = createHandler({ getToken: () => "fixture", fetchImpl: stubFetch(qcaRoutes) });
  const r = await h(post({ text: "今天跑了五公里", context: { today: TODAY } }));
  const j = await r.json();
  assert.equal(j.ok, true);
  assert.equal(j.mode, "model");
  assert.equal(j.items.length, 2);
  assert.equal(j.items[0].event.intensity, 5);
  assert.ok(!("score" in j.items[0].event));
  assert.equal(j.items[1].event.polarity, "neutral");
});

test("function extract：无 PAT 自动 mock；useMock 强制 mock", async () => {
  const noPat = createHandler({ getToken: () => undefined, fetchImpl: stubFetch({}) });
  let j = await (await noPat(post({ text: "今天有点焦虑，但还是去跑了五公里", context: { today: TODAY } }))).json();
  assert.equal(j.mode, "mock");
  assert.equal(j.items.length, 2);
  const withPat = createHandler({ getToken: () => "fixture", fetchImpl: stubFetch(qcaRoutes) });
  j = await (await withPat(post({ text: "今天跑了五公里", useMock: true, context: { today: TODAY } }))).json();
  assert.equal(j.mode, "mock");
});

test("function extract：QCA 超时→timeout 不录入；非法 body 400；未知路径 404", async () => {
  const slow = createHandler({ getToken: () => "fixture", fetchImpl: stubFetch({ ...qcaRoutes, "GET /api/v1/cloud/sessions/sess1/events": { data: [] } }), now: (() => { let t = 0; return () => (t += 30000); })() });
  let r = await slow(post({ text: "x", context: { today: TODAY } }));
  assert.equal((await r.json()).error.code, "timeout");
  const h = createHandler({ getToken: () => "fixture", fetchImpl: stubFetch(qcaRoutes) });
  r = await h(req("/api/extract", { method: "POST", body: "{bad" }));
  assert.equal(r.status, 400);
  r = await h(req("/api/nope"));
  assert.equal(r.status, 404);
});

test("function extract：非法日期和不可处理引用整次拒绝，不返回部分 items", async () => {
  const invalid = { reply: "错误", items: [{ op: "confirm_rest", id: "unknown-rest" }] };
  const routes = { ...qcaRoutes, "GET /api/v1/cloud/sessions/sess1/events": { data: [{ type: "agent.message", content: [{ type: "text", text: JSON.stringify(invalid) }] }] } };
  const h = createHandler({ getToken: () => "fixture", fetchImpl: stubFetch(routes), logger: { info() {} } });
  const r = await h(post({ text: "确认未知休息", context: { today: TODAY } }));
  assert.equal(r.status, 502);
  const j = await r.json();
  assert.equal(j.ok, false);
  assert.equal(j.error.code, "bad_output");
  assert.equal(j.items, undefined);

  const badDate = { reply: "错误", items: [{ op: "add_event", event: { eventType: "behavior", polarity: "positive", intensity: 3, occurredAt: "2026-02-31", quote: "跑", confidence: 0.9 } }] };
  const badRoutes = { ...qcaRoutes, "GET /api/v1/cloud/sessions/sess1/events": { data: [{ type: "agent.message", content: [{ type: "text", text: JSON.stringify(badDate) }] }] } };
  const h2 = createHandler({ getToken: () => "fixture", fetchImpl: stubFetch(badRoutes), logger: { info() {} } });
  const r2 = await h2(post({ text: "非法日期", context: { today: TODAY } }));
  assert.equal((await r2.json()).error.code, "bad_output");
});

test("function cache：按访客和完整有效上下文隔离", async () => {
  const h = createHandler({ getToken: () => undefined, fetchImpl: stubFetch({}), logger: { info() {} } });
  const context = { today: TODAY, clientId: "visitor-a", openTasks: [], pendingEvents: [], pendingRests: [], turns: [] };
  const first = await (await h(post({ text: "今天跑了五公里", context }))).json();
  const same = await (await h(post({ text: "今天跑了五公里", context }))).json();
  const otherVisitor = await (await h(post({ text: "今天跑了五公里", context: { ...context, clientId: "visitor-b" } }))).json();
  const otherTasks = await (await h(post({ text: "今天跑了五公里", context: { ...context, openTasks: [{ id: "task-new", title: "新目标", dueAt: TODAY, position: 3 }] } }))).json();
  assert.equal(first.cached, undefined);
  assert.equal(same.cached, true);
  assert.equal(otherVisitor.cached, undefined);
  assert.equal(otherTasks.cached, undefined);
});

test("function extract：单访客限流明确返回 rate_limited", async () => {
  const h = createHandler({ getToken: () => undefined, fetchImpl: stubFetch({}), logger: { info() {} } });
  let last;
  for (let i = 0; i < 31; i++) last = await h(post({ text: `今天跑了五公里 ${i}`, context: { today: TODAY } }));
  assert.equal(last.status, 429);
  assert.equal((await last.json()).error.code, "rate_limited");
});