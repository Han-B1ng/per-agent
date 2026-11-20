import test from "node:test";
import assert from "node:assert/strict";
import { emptyPersonal, genId, getClientId } from "../web/store.js";
import { applyItems } from "../web/ledger.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

test("genId 保留前缀并优先使用 randomUUID", () => {
  const id = genId("evt");
  assert.ok(id.startsWith("evt_"));
  assert.match(id.slice(4), UUID_RE);
});

test("genId 在缺少 randomUUID 的环境回退到旧格式", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  try {
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: {} });
    assert.match(genId("evt"), /^evt_[0-9a-z]+_[0-9a-z]+$/);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "crypto", descriptor);
    else delete globalThis.crypto;
  }
});

test("已保存的客户端 ID 继续复用", () => {
  const saved = "client_old_saved";
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  try {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: { getItem: (key) => (key === "pe.client.v1" ? saved : null), setItem() {} },
    });
    assert.equal(getClientId(), saved);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor);
    else delete globalThis.localStorage;
  }
});

test("旧格式 ID 与关联关系继续可用", () => {
  const records = emptyPersonal();
  records.events.push({
    id: "evt_old_1", kind: "event", eventType: "behavior", polarity: "positive", intensity: 3,
    occurredAt: "2026-11-19", quote: "旧事件", tags: [], confidence: 0.9, status: "pending",
    createdAt: "2026-11-19T00:00:00.000Z", deletedAt: null,
  });
  const write = applyItems(records, [{ op: "confirm_event", id: "evt_old_1", occurredAt: "2026-11-19" }], { today: "2026-11-20" });
  assert.equal(write.applied, true);
  assert.equal(records.events[0].status, "confirmed");
  assert.equal(records.audit.at(-1).targetId, "evt_old_1");
});