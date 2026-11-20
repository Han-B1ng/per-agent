import test from "node:test";
import assert from "node:assert/strict";
import { emptyPersonal, parsePersonalBackup, savePersonal } from "../web/store.js";

const TODAY = "2026-11-20";
const NOW = "2026-11-20T08:00:00.000Z";

function event(overrides = {}) {
  return {
    id: "evt_restore",
    kind: "event",
    eventType: "behavior",
    polarity: "positive",
    intensity: 3,
    occurredAt: TODAY,
    quote: "跑完五公里",
    tags: [],
    confidence: 0.9,
    status: "confirmed",
    createdAt: NOW,
    deletedAt: null,
    ...overrides,
  };
}

function task(overrides = {}) {
  return {
    id: "task_restore",
    kind: "task",
    title: "完成论文",
    dueAt: TODAY,
    position: 3,
    status: "open",
    createdAt: NOW,
    doneAt: null,
    deletedAt: null,
    ...overrides,
  };
}

function exportPayload(ledger, scope = "personal") {
  return JSON.stringify({ scope, exportedAt: NOW, records: ledger });
}

function useStorage({ failWrite = false } = {}) {
  const values = new Map();
  const state = { failWrite };
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      if (state.failWrite) throw new Error("QuotaExceededError");
      values.set(key, value);
    },
    removeItem: (key) => values.delete(key),
  };
  return { values, state, dispose: () => { delete globalThis.localStorage; } };
}

test("恢复：当前导出的个人备份可直接解析并归一化", (t) => {
  const storage = useStorage();
  t.after(storage.dispose);
  const ledger = emptyPersonal();
  ledger.events.push(event());
  ledger.tasks.push(task());
  ledger.chat.push({ id: "msg_1", role: "user", text: "今天跑步了" });

  const parsed = parsePersonalBackup(exportPayload(ledger));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.version, 2);
  assert.equal(parsed.ledger.version, 2);
  assert.equal(parsed.ledger.events[0].quote, "跑完五公里");
  assert.equal(parsed.ledger.tasks[0].title, "完成论文");
  assert.equal(parsed.ledger.chat[0].text, "今天跑步了");
});

test("恢复：v1 备份沿用现有迁移，缺失版本按 v1 处理", (t) => {
  const storage = useStorage();
  t.after(storage.dispose);
  const legacy = {
    events: [event({ confidence: 0.4, status: "pending" })],
    rests: [],
    tasks: [task({ status: "done", doneAt: NOW })],
    chat: [],
  };
  const parsed = parsePersonalBackup(JSON.stringify(legacy));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.version, 1);
  assert.equal(parsed.ledger.version, 2);
  assert.equal(parsed.ledger.events[0].status, "pending");
  assert.equal(parsed.ledger.tasks[0].status, "done");
});

test("恢复：非 JSON、样例备份和缺少账本字段都归为文件无效", (t) => {
  const storage = useStorage();
  t.after(storage.dispose);
  const cases = [
    ["", "invalid_file"],
    ["{ 不是 JSON", "invalid_file"],
    ["[]", "invalid_file"],
    [exportPayload({ events: [], rests: [], tasks: [] }, "sample"), "invalid_file"],
    [JSON.stringify({ scope: "personal", exportedAt: NOW }), "invalid_file"],
    [JSON.stringify({ version: 2, foo: "bar" }), "invalid_file"],
  ];
  for (const [text, code] of cases) {
    const parsed = parsePersonalBackup(text);
    assert.equal(parsed.ok, false, text);
    assert.equal(parsed.code, code, text);
    assert.match(parsed.message, /文件无效/, text);
  }
});

test("恢复：高于当前版本的备份明确提示版本暂不支持", (t) => {
  const storage = useStorage();
  t.after(storage.dispose);
  const future = exportPayload({ version: 3, events: [], rests: [], tasks: [], chat: [], audit: [] });
  const parsed = parsePersonalBackup(future);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.code, "unsupported_version");
  assert.match(parsed.message, /版本暂不支持/);
  assert.match(parsed.message, /v3/);

  const brokenVersion = parsePersonalBackup(exportPayload({ version: "3", events: [], rests: [], tasks: [] }));
  assert.equal(brokenVersion.ok, false);
  assert.equal(brokenVersion.code, "invalid_file");
});

test("恢复：浏览器写入失败返回 false 且保留原存储", (t) => {
  const storage = useStorage();
  t.after(storage.dispose);
  const original = emptyPersonal();
  original.events.push(event({ id: "evt_original", quote: "原账本记录" }));
  assert.equal(savePersonal(original), true);
  const storedBefore = storage.values.get("pe.personal.v2");

  const next = emptyPersonal();
  next.events.push(event({ id: "evt_next", quote: "待恢复记录" }));
  storage.state.failWrite = true;
  assert.equal(savePersonal(next), false);
  assert.equal(storage.values.get("pe.personal.v2"), storedBefore);

  storage.state.failWrite = false;
  assert.equal(savePersonal(next), true);
  const stored = JSON.parse(storage.values.get("pe.personal.v2"));
  assert.equal(stored.events[0].quote, "待恢复记录");
});