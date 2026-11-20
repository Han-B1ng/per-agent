import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createApp } from "../../server/index.mjs";
import { computeAll, shiftDate } from "../../web/engine.js";
import { resolveDate, resolveDueDate } from "../../web/date.js";

const ROOT = path.resolve(import.meta.dirname, "../..");
const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass: Boolean(pass), detail: String(detail).slice(0, 600) });
  console.log(`${pass ? "PASS" : "FAIL"} ${name} :: ${detail}`);
};
const listen = (server) => new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
const today = "2026-11-20";
const app = await listen(createApp({ env: {} }));
const B = `http://127.0.0.1:${app.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.PE_CHANNEL ? { channel: process.env.PE_CHANNEL } : {}) });

async function newPage({ width = 1440, height = 900, seed = null, recordVideo = false } = {}) {
  const context = await browser.newContext({ timezoneId: "Asia/Shanghai", viewport: { width, height }, ...(recordVideo ? { recordVideo: { dir: path.join(ROOT, "assets/videos"), size: { width, height } } } : {}) });
  if (seed) await context.addInitScript((value) => localStorage.setItem("pe.personal.v1", JSON.stringify(value)), seed);
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date(`${today}T12:00:00+08:00`));
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && !/Failed to load resource/.test(message.text())) errors.push(message.text()); });
  page._errors = errors;
  await page.goto(B, { waitUntil: "networkidle" });
  await page.waitForTimeout(350);
  return { context, page };
}
async function ensurePersonal(page) {
  if ((await page.locator("#view-personal").getAttribute("aria-pressed")) !== "true") {
    await page.click("#view-personal");
    await page.waitForTimeout(300);
  }
}
const quote = async (page) => Number((await page.textContent("#quote-value")).replace(/,/g, ""));
const state = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("pe.personal.v2")));
const send = async (page, text, wait = 900) => {
  await page.fill("#entry", text);
  await page.press("#entry", "Enter");
  await page.waitForTimeout(wait);
};
const lastAssistant = (page) => page.locator('.message[data-author="assistant"]').last();
const receipt = (page) => page.locator('[data-testid="agent-receipt"]').last();

/* A. 新增目标 → 唯一完成 → 重复完成不重复增益 */
{
  const { context, page } = await newPage();
  await ensurePersonal(page);
  const before = await quote(page);
  await send(page, "我想周五交数据库课设");
  await ensurePersonal(page);
  let data = await state(page);
  const goal = data.tasks.find((task) => task.title === "交数据库课设");
  check("A 新增目标落账并带未来到期日", Boolean(goal) && goal.status === "open" && goal.dueAt === resolveDueDate("周五", today), `${goal?.dueAt} / expect ${resolveDueDate("周五", today)}`);
  check("A 新增目标不改变指数", Math.abs((await quote(page)) - before) < 0.02, `${before} → ${await quote(page)}`);
  check("A 写入成功后才出现回执", (await receipt(page).innerText()).includes("已写入 1 项"), await receipt(page).innerText());

  await send(page, "数据库课设交了");
  data = await state(page);
  const done = data.tasks.find((task) => task.id === goal.id);
  const afterComplete = await quote(page);
  check("A 唯一目标完成并只记一笔", done.status === "done" && data.audit.filter((entry) => entry.action === "complete_task" && entry.targetId === goal.id).length === 1, JSON.stringify({ status: done.status, audits: data.audit.length }));
  check("A 完成增益进入指数", afterComplete > before + 0.1, `${before} → ${afterComplete}`);
  const completionLines = data.audit.filter((entry) => entry.action === "complete_task" && entry.targetId === goal.id).length;
  check("A 完成事实只有一次", completionLines === 1, completionLines);

  await send(page, "数据库课设交了");
  check("A 重复完成后指数不再增加", Math.abs((await quote(page)) - afterComplete) < 0.02, `${afterComplete} → ${await quote(page)}`);

  await page.reload({ waitUntil: "networkidle" });
  await ensurePersonal(page);
  check("A 刷新后完成状态与指数保持", Math.abs((await quote(page)) - afterComplete) < 0.02 && (await state(page)).tasks.find((task) => task.id === goal.id).status === "done", await quote(page));
  check("A 控制台无错误", page._errors.length === 0, page._errors.join("|") || "clean");
  await context.close();
}

/* B. 同名目标 + 多意图 → 跑步先入账，课设待澄清；刷新后回答只完成目标 */
{
  const seed = {
    events: [],
    rests: [],
    tasks: [
      { id: "task_db", kind: "task", title: "数据库课设", dueAt: shiftDate(today, 3), position: 3, status: "open", createdAt: `${shiftDate(today, -10)}T08:00:00.000Z`, doneAt: null, deletedAt: null },
      { id: "task_algo", kind: "task", title: "算法课设", dueAt: shiftDate(today, 5), position: 3, status: "open", createdAt: `${shiftDate(today, -8)}T08:00:00.000Z`, doneAt: null, deletedAt: null },
    ],
    chat: [],
  };
  const { context, page } = await newPage({ seed });
  await ensurePersonal(page);
  const before = await quote(page);
  await send(page, "课设交了，今天还跑了五公里");
  await ensurePersonal(page);
  let data = await state(page);
  const running = data.events.filter((event) => event.quote.includes("五公里"));
  check("B 明确事项跑步先入账", running.length === 1 && running[0].status === "confirmed", JSON.stringify(running.map((event) => event.quote)));
  check("B 跑步改变指数但课设仍未完成", (await quote(page)) > before && data.tasks.every((task) => task.status === "open"), `${before} → ${await quote(page)}`);
  check("B 同名课设生成澄清卡片", (await page.locator('[data-testid="clarification-card"]').count()) === 1 && (await page.locator(".clarification-actions [data-candidate-id]").count()) === 2, await page.locator(".clarification-actions [data-candidate-id]").allInnerTexts());
  check("B 回执显示已写入与待澄清", (await receipt(page).innerText()).includes("已写入 1 项") && (await receipt(page).innerText()).includes("待澄清 1 项"), await receipt(page).innerText());

  await page.reload({ waitUntil: "networkidle" });
  await ensurePersonal(page);
  check("B 刷新后澄清与跑步状态恢复", (await page.locator('[data-testid="clarification-card"]').count()) === 1 && (await state(page)).events.length === 1, await page.locator('[data-testid="clarification-card"]').count());

  const afterRunning = await quote(page);
  await send(page, "数据库那个");
  data = await state(page);
  const db = data.tasks.find((task) => task.id === "task_db");
  const algo = data.tasks.find((task) => task.id === "task_algo");
  check("B 后续回答只完成匹配目标", db.status === "done" && algo.status === "open", `${db.status}/${algo.status}`);
  check("B 跑步不重复入账", data.events.length === 1 && data.events.filter((event) => event.quote.includes("五公里")).length === 1, data.events.length);
  check("B 澄清卡片关闭且回执生效", (await page.locator('[data-testid="clarification-card"]').count()) === 0 && (await receipt(page).innerText()).includes("已写入 1 项"), `cards=${await page.locator('[data-testid="clarification-card"]').count()} receipt=${await receipt(page).innerText()}`);
  check("B 完成增益只增加一次", (await quote(page)) > afterRunning, `${afterRunning} → ${await quote(page)}`);
  await page.reload({ waitUntil: "networkidle" });
  await ensurePersonal(page);
  check("B 刷新后澄清保持已解决", (await page.locator('[data-testid="clarification-card"]').count()) === 0 && (await state(page)).tasks.find((task) => task.id === "task_db").status === "done", await page.locator('[data-testid="clarification-card"]').count());
  check("B 控制台无错误", page._errors.length === 0, page._errors.join("|") || "clean");
  await context.close();
}

/* C. 模糊日期 → pending 追问；刷新后恢复；补日期后按历史日重算 */
{
  const { context, page } = await newPage();
  await ensurePersonal(page);
  const before = await quote(page);
  await send(page, "前阵子跑过五公里");
  await ensurePersonal(page);
  let data = await state(page);
  check("C 模糊日期先 pending 且不计分", Math.abs((await quote(page)) - before) < 0.02 && data.events.length === 1 && data.events[0].status === "pending", `${before} → ${await quote(page)} / ${data.events[0]?.status}`);
  check("C 回执标明待确认", (await receipt(page).innerText()).includes("待确认 1 项"), await receipt(page).innerText());
  check("C 聊天出现待确认卡", (await page.locator(".msg-card .card-btn.primary").count()) === 1, await page.locator(".msg-card .card-btn.primary").count());

  await page.reload({ waitUntil: "networkidle" });
  await ensurePersonal(page);
  check("C 刷新后 pending 状态恢复", (await page.locator(".msg-card .card-btn.primary").count()) === 1 && (await state(page)).events[0].status === "pending", (await state(page)).events[0]?.status);

  const historyDate = resolveDate("上周三", today);
  await send(page, "上周三");
  data = await state(page);
  check("C 补日期后确认且日期正确", data.events.length === 1 && data.events[0].status === "confirmed" && data.events[0].occurredAt === historyDate, `${data.events[0]?.status} / ${data.events[0]?.occurredAt}`);
  check("C 确认后待确认卡消失", (await page.locator(".msg-card .card-btn.primary").count()) === 0, await page.locator(".msg-card .card-btn.primary").count());
  check("C 确认后按历史日重算指数", (await quote(page)) !== before, `${before} → ${await quote(page)}`);
  check("C 控制台无错误", page._errors.length === 0, page._errors.join("|") || "clean");
  await context.close();
}

/* D. 重复确认 / 目标已完成 / 未知 ID / 非法日期 / 模型虚假成功措辞 */
{
  const pending = {
    events: [{ id: "evt_dup", kind: "event", eventType: "behavior", polarity: "positive", intensity: 3, occurredAt: today, quote: "待确认跑步", tags: [], confidence: 0.4, status: "pending", createdAt: `${today}T08:00:00.000Z`, deletedAt: null }],
    rests: [],
    tasks: [{ id: "task_done_old", kind: "task", title: "之前完成的目标", dueAt: shiftDate(today, -1), position: 3, status: "done", createdAt: `${shiftDate(today, -10)}T08:00:00.000Z`, doneAt: `${today}T09:00:00.000Z`, deletedAt: null }],
    chat: [{ id: "msg_dup", role: "assistant", text: "确认这条吗", pending: ["evt_dup"] }],
  };
  const { context, page } = await newPage({ seed: pending });
  await ensurePersonal(page);
  const before = await quote(page);
  await page.locator(".msg-card .card-btn.primary").evaluate((button) => { button.click(); button.click(); });
  await page.waitForTimeout(900);
  const data = await state(page);
  check("D 重复确认只生效一次", data.events[0].status === "confirmed" && data.audit.filter((entry) => entry.action === "confirm_event").length === 1, `events=${data.audit.filter((entry) => entry.action === "confirm_event").length}`);
  const expected = computeAll(data, { today }).latest;
  check("D 重复确认不重复计分", Math.abs((await quote(page)) - expected) < 0.05, `ui=${await quote(page)} expected=${expected} before=${before}`);

  await page.route("**/api/extract", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, mode: "model", reply: "目标已完成，已计入指数。", items: [{ op: "complete_task", id: "task_done_old", doneAt: today }] }),
  }));
  await send(page, "再完成一次", 900);
  check("D 已完成目标只回执未重复入账", (await receipt(page).innerText()).includes("未重复入账 1 项") && (await lastAssistant(page).innerText()).includes("之前已经处理过"), await lastAssistant(page).innerText());
  await page.unroute("**/api/extract");

  await page.route("**/api/extract", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, mode: "model", reply: "已经记好了", items: [{ op: "complete_task", id: "task_missing", doneAt: today }] }),
  }));
  const quoteBeforeUnknown = await quote(page);
  const eventsBeforeUnknown = (await state(page)).events.length;
  await send(page, "完成不存在的目标", 900);
  check("D 未知 ID 不写入并给出失败反馈", (await quote(page)) === quoteBeforeUnknown && (await state(page)).events.length === eventsBeforeUnknown && (await page.locator(".msg-card.failed").count()) === 1, await page.locator(".msg-card.failed").innerText());
  await page.unroute("**/api/extract");

  await page.route("**/api/extract", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, mode: "model", reply: "记下了", items: [{ op: "add_event", event: { eventType: "behavior", polarity: "positive", intensity: 2, occurredAt: "2099-01-01", quote: "未来事件", tags: [], confidence: 0.9 } }] }),
  }));
  await send(page, "明天跑了五公里", 900);
  check("D 非法未来日期被应用拒绝", (await page.locator(".msg-card.failed").count()) >= 1 && !(await state(page)).events.some((event) => event.quote === "未来事件"), await page.locator(".msg-card.failed").last().innerText());
  await page.unroute("**/api/extract");

  await page.route("**/api/extract", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, mode: "model", reply: "目标已完成，已计入指数。", items: [] }),
  }));
  await send(page, "随便聊聊", 900);
  check("D 无写入时模型不能宣称已完成", !(await lastAssistant(page).innerText()).includes("已计入") && (await lastAssistant(page).innerText()).includes("还没有写入"), await lastAssistant(page).innerText());
  check("D 控制台无错误", page._errors.length === 0, page._errors.join("|") || "clean");
  await context.close();
}

/* E. 手机宽度澄清卡可读、点击候选可完成目标 */
{
  const seed = {
    events: [], rests: [],
    tasks: [
      { id: "task_db", kind: "task", title: "数据库课设", dueAt: shiftDate(today, 3), position: 3, status: "open", createdAt: `${today}T08:00:00.000Z`, doneAt: null, deletedAt: null },
      { id: "task_algo", kind: "task", title: "算法课设", dueAt: shiftDate(today, 5), position: 3, status: "open", createdAt: `${today}T08:00:00.000Z`, doneAt: null, deletedAt: null },
    ],
    chat: [],
  };
  const { context, page } = await newPage({ width: 390, height: 844, seed });
  await send(page, "课设交了");
  await ensurePersonal(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check("E 手机宽度无横向溢出", overflow <= 1, `overflow=${overflow}px`);
  const card = page.locator('[data-testid="clarification-card"]');
  check("E 手机澄清卡可见且按钮可点", (await card.count()) === 1 && (await card.locator("[data-candidate-id]").count()) === 2, await card.innerText());
  await card.locator('[data-candidate-id="task_db"]').click();
  await page.waitForTimeout(500);
  const data = await state(page);
  check("E 点击候选完成正确目标", data.tasks.find((task) => task.id === "task_db").status === "done" && data.tasks.find((task) => task.id === "task_algo").status === "open", JSON.stringify(data.tasks.map((task) => [task.id, task.status])));
  check("E 手机控制台无错误", page._errors.length === 0, page._errors.join("|") || "clean");
  await context.close();
}

/* F. 澄清答复里同时带新动作：先完成目标，剩余明确事项继续入账 */
{
  const seed = {
    events: [], rests: [],
    tasks: [
      { id: "task_db", kind: "task", title: "数据库课设", dueAt: shiftDate(today, 3), position: 3, status: "open", createdAt: `${today}T08:00:00.000Z`, doneAt: null, deletedAt: null },
      { id: "task_algo", kind: "task", title: "算法课设", dueAt: shiftDate(today, 5), position: 3, status: "open", createdAt: `${today}T08:00:00.000Z`, doneAt: null, deletedAt: null },
    ],
    chat: [],
  };
  const { context, page } = await newPage({ seed });
  await ensurePersonal(page);
  await send(page, "课设交了");
  await send(page, "数据库那个，今天还跑了五公里");
  const data = await state(page);
  check("F 澄清答复中的目标先完成", data.tasks.find((task) => task.id === "task_db").status === "done", JSON.stringify(data.tasks.map((task) => [task.id, task.status])));
  check("F 同一句剩余行为继续入账", data.events.length === 1 && data.events[0].quote.includes("五公里") && data.events[0].status === "confirmed", JSON.stringify(data.events.map((event) => event.quote)));
  check("F 同一句不完成未匹配目标", data.tasks.find((task) => task.id === "task_algo").status === "open", data.tasks.find((task) => task.id === "task_algo").status);
  check("F 控制台无错误", page._errors.length === 0, page._errors.join("|") || "clean");
  await context.close();
}

/* G. 否定/新动作不得借助候选标题完成目标 */
{
  const seed = {
    events: [], rests: [],
    tasks: [
      { id: "task_db", kind: "task", title: "数据库课设", dueAt: shiftDate(today, 3), position: 3, status: "open", createdAt: `${today}T08:00:00.000Z`, doneAt: null, deletedAt: null },
      { id: "task_algo", kind: "task", title: "算法课设", dueAt: shiftDate(today, 5), position: 3, status: "open", createdAt: `${today}T08:00:00.000Z`, doneAt: null, deletedAt: null },
    ],
    chat: [],
  };
  const { context, page } = await newPage({ seed });
  await ensurePersonal(page);
  await send(page, "课设交了");
  await send(page, "今天复习了数据库");
  let data = await state(page);
  check("G 新动作不会被候选标题误判为完成", data.tasks.find((task) => task.id === "task_db").status === "open" && data.events.some((event) => event.quote.includes("复习")), JSON.stringify(data.tasks.map((task) => [task.id, task.status])));
  check("G 未回答的澄清仍保留", (await page.locator('[data-testid="clarification-card"]').count()) === 1, await page.locator('[data-testid="clarification-card"]').count());
  await send(page, "数据库那个交了吗");
  data = await state(page);
  check("G 疑问句不会被当成完成确认", data.tasks.find((task) => task.id === "task_db").status === "open" && (await page.locator('[data-testid="clarification-card"]').count()) === 1, data.tasks.find((task) => task.id === "task_db").status);

  const beforeReject = await quote(page);
  await send(page, "数据库那个还没交");
  data = await state(page);
  check("G 否定回答不完成目标", data.tasks.find((task) => task.id === "task_db").status === "open", data.tasks.find((task) => task.id === "task_db").status);
  check("G 否定回答给出未完成反馈", (await lastAssistant(page).innerText()).includes("还没完成") && !(await lastAssistant(page).innerText()).includes("已完成"), await lastAssistant(page).innerText());
  check("G 否定回答不增加完成增益", Math.abs((await quote(page)) - beforeReject) < 0.02, `${beforeReject} → ${await quote(page)}`);
  check("G 控制台无错误", page._errors.length === 0, page._errors.join("|") || "clean");
  await context.close();
}

/* H. Stub 模糊日期返回昨天+高置信时仍必须 pending，模型正文不能宣称已计分 */
{
  const { context, page } = await newPage();
  await ensurePersonal(page);
  await page.route("**/api/extract", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, mode: "model", reply: "跑步已计入指数。", items: [{ op: "add_event", event: { eventType: "behavior", polarity: "positive", intensity: 3, occurredAt: shiftDate(today, -1), quote: "前阵子跑过五公里", tags: [], confidence: 0.9 } }] }),
  }));
  const before = await quote(page);
  await send(page, "前阵子跑过五公里");
  const data = await state(page);
  check("H 模糊日期用历史日也不能直接计分", Math.abs((await quote(page)) - before) < 0.02 && data.events.length === 1 && data.events[0].status === "pending", `${before} → ${await quote(page)} / ${data.events[0]?.status} / ${data.events[0]?.occurredAt}`);
  check("H 回执与正文不矛盾", (await receipt(page).innerText()).includes("待确认 1 项") && !(await lastAssistant(page).innerText()).includes("已计入") && (await lastAssistant(page).innerText()).includes("不计分"), await lastAssistant(page).innerText());
  check("H 控制台无错误", page._errors.length === 0, page._errors.join("|") || "clean");
  await context.close();
}

/* I. 歧义删除保持 delete_task，选择候选后删除而不是完成 */
{
  const seed = {
    events: [], rests: [],
    tasks: [
      { id: "task_db", kind: "task", title: "数据库课设", dueAt: shiftDate(today, 3), position: 3, status: "open", createdAt: `${today}T08:00:00.000Z`, doneAt: null, deletedAt: null },
      { id: "task_algo", kind: "task", title: "算法课设", dueAt: shiftDate(today, 5), position: 3, status: "open", createdAt: `${today}T08:00:00.000Z`, doneAt: null, deletedAt: null },
    ],
    chat: [],
  };
  const { context, page } = await newPage({ seed });
  await ensurePersonal(page);
  await page.route("**/api/extract", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, mode: "model", reply: "删掉哪个课设？", items: [{ op: "delete_task", id: "task_db" }] }),
  }));
  const before = await quote(page);
  await send(page, "删掉课设");
  check("I 歧义删除生成澄清", (await page.locator('[data-testid="clarification-card"]').count()) === 1, await page.locator('[data-testid="clarification-card"]').count());
  await page.locator('[data-candidate-id="task_db"]').click();
  await page.waitForTimeout(500);
  const data = await state(page);
  const deleted = data.tasks.find((task) => task.id === "task_db");
  check("I 选择候选执行删除而非完成", Boolean(deleted.deletedAt) && deleted.status !== "done" && data.tasks.find((task) => task.id === "task_algo").status === "open", JSON.stringify(deleted));
  check("I 删除不产生完成增益", Math.abs((await quote(page)) - before) < 0.02, `${before} → ${await quote(page)}`);
  check("I 控制台无错误", page._errors.length === 0, page._errors.join("|") || "clean");
  await context.close();
}

/* J. 多条 pending 时，带日期的新事件仍入账，不被旧记录澄清吞掉 */
{
  const seed = {
    events: [
      { id: "evt_old_a", kind: "event", eventType: "behavior", polarity: "positive", intensity: 2, occurredAt: today, quote: "旧待确认A", tags: [], confidence: 0.4, status: "pending", createdAt: `${today}T08:00:00.000Z`, deletedAt: null },
      { id: "evt_old_b", kind: "event", eventType: "behavior", polarity: "positive", intensity: 2, occurredAt: today, quote: "旧待确认B", tags: [], confidence: 0.4, status: "pending", createdAt: `${today}T08:01:00.000Z`, deletedAt: null },
    ],
    rests: [], tasks: [],
    chat: [{ id: "msg_old", role: "assistant", text: "两条待确认", pending: ["evt_old_a", "evt_old_b"] }],
  };
  const { context, page } = await newPage({ seed });
  await ensurePersonal(page);
  await send(page, "今天还跑了五公里");
  const data = await state(page);
  check("J 带日期的新事件正常入账", data.events.length === 3 && data.events.some((event) => event.quote.includes("今天还跑了五公里") && event.status === "confirmed"), JSON.stringify(data.events.map((event) => [event.quote, event.status])));
  check("J 旧 pending 不被吞掉", data.events.filter((event) => event.status === "pending").length === 2 && (await page.locator(".msg-card .card-btn.primary").count()) === 2, await page.locator(".msg-card .card-btn.primary").count());
  check("J 控制台无错误", page._errors.length === 0, page._errors.join("|") || "clean");
  await context.close();
}

{
  const seed = {
    events: [], rests: [], chat: [],
    tasks: [
      { id: "task_db", kind: "task", title: "数据库课设", dueAt: "2026-11-21", position: 3, status: "open", createdAt: `${today}T08:00:00.000Z`, doneAt: null, deletedAt: null },
      { id: "task_algo", kind: "task", title: "算法课设", dueAt: "2026-11-24", position: 3, status: "open", createdAt: `${today}T08:00:00.000Z`, doneAt: null, deletedAt: null },
    ],
  };
  const { context, page } = await newPage({ seed, recordVideo: true });
  await ensurePersonal(page);
  const before = await quote(page);
  await send(page, "课设交了");
  const beforeDenial = await state(page);
  await send(page, "不是数据库那个");
  let data = await state(page);
  check("K 否认候选不改账本、不写完成日期", JSON.stringify(data.tasks) === JSON.stringify(beforeDenial.tasks) && data.audit.length === beforeDenial.audit.length && data.events.length === 0, JSON.stringify(data.tasks));
  check("K 否认候选不改变指数", (await quote(page)) === before, `${before} → ${await quote(page)}`);
  check("K 否认候选不宣称已完成且继续澄清", !(await lastAssistant(page).innerText()).includes("已完成") && (await page.locator('[data-testid="clarification-card"]').count()) === 1, await lastAssistant(page).innerText());
  await page.reload({ waitUntil: "networkidle" });
  await ensurePersonal(page);
  check("K 刷新后否认仍未入账", (await state(page)).tasks.every((task) => task.status === "open" && task.doneAt === null) && (await quote(page)) === before, await quote(page));
  await send(page, "算法那个");
  data = await state(page);
  const completed = data.tasks.find((task) => task.id === "task_algo");
  check("K 明确肯定后只完成算法目标且日期正确", completed.status === "done" && completed.doneAt.slice(0, 10) === today && data.tasks.find((task) => task.id === "task_db").status === "open" && data.audit.filter((entry) => entry.action === "complete_task").length === 1, JSON.stringify(data.tasks));
  check("K 仅肯定完成后计一次增益", (await quote(page)) > before && Math.abs((await quote(page)) - computeAll(data, { today }).latest) < 0.05, `${before} → ${await quote(page)}`);
  check("K 控制台无错误", page._errors.length === 0, page._errors.join("|") || "clean");
  await context.close();
  await page.video().saveAs(path.join(ROOT, "assets/videos/pr10-p1-negation.webm"));
}

{
  const { context, page } = await newPage({ recordVideo: true });
  await ensurePersonal(page);
  const before = await quote(page);
  await page.route("**/api/extract", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ ok: true, mode: "model", reply: "跑步已计入指数。", items: [{ op: "add_event", event: { eventType: "behavior", polarity: "positive", intensity: 3, occurredAt: "2026-11-19", quote: "跑过五公里", tags: [], confidence: 0.9 } }] }),
  }));
  await send(page, "前阵子跑过五公里");
  let data = await state(page);
  check("L 缩短引文仍待确认且没有确认审计", data.events.length === 1 && data.events[0].status === "pending" && data.audit.every((entry) => entry.action !== "confirm_event"), JSON.stringify(data.events));
  check("L 模型猜昨天不产生当天或历史贡献", (await quote(page)) === before && computeAll(data, { today }).days.every((day) => day.lines.every((line) => line.id !== data.events[0].id)), `${before} → ${await quote(page)}`);
  check("L 待确认回执不宣称计分", !(await lastAssistant(page).innerText()).includes("已计入") && (await receipt(page).innerText()).includes("待确认"), await lastAssistant(page).innerText());
  await page.unroute("**/api/extract");
  await page.reload({ waitUntil: "networkidle" });
  await ensurePersonal(page);
  check("L 刷新后仍待确认且指数不变", (await state(page)).events[0].status === "pending" && (await quote(page)) === before, await quote(page));
  await send(page, "上周三");
  data = await state(page);
  check("L 补日期后实际入账为十一月十一日", data.events.length === 1 && data.events[0].status === "confirmed" && data.events[0].occurredAt === "2026-11-11", JSON.stringify(data.events));
  const expected = computeAll({ ...data, events: [{ ...data.events[0], status: "confirmed", occurredAt: "2026-11-11" }] }, { today });
  check("L 补日期后指数等于历史重算值", (await quote(page)) !== before && Math.abs((await quote(page)) - expected.latest) < 0.05, `${before} → ${await quote(page)} / expected=${expected.latest}`);
  check("L 控制台无错误", page._errors.length === 0, page._errors.join("|") || "clean");
  await context.close();
  await page.video().saveAs(path.join(ROOT, "assets/videos/pr10-p1-short-quote.webm"));
}

for (const reload of [false, true]) {
  for (const selection of ["click", "text"]) {
    const label = `M ${reload ? "刷新后" : "直接"}${selection === "click" ? "点击" : "文字选择"}`;
    const seed = {
      events: [
        { id: "evt_a", kind: "event", eventType: "behavior", polarity: "positive", intensity: 3, occurredAt: today, quote: "前阵子跑过五公里", tags: [], confidence: 0.4, status: "pending", createdAt: `${today}T08:00:00.000Z`, deletedAt: null },
        { id: "evt_b", kind: "event", eventType: "behavior", polarity: "positive", intensity: 2, occurredAt: today, quote: "前阵子读过一本书", tags: [], confidence: 0.4, status: "pending", createdAt: `${today}T08:01:00.000Z`, deletedAt: null },
      ],
      rests: [], tasks: [], chat: [{ id: "msg_pending", role: "assistant", text: "两条记录待确认", pending: ["evt_a", "evt_b"] }],
    };
    const recordVideo = reload && selection === "click";
    const { context, page } = await newPage({ seed, recordVideo });
    await ensurePersonal(page);
    const before = await quote(page);
    await send(page, "上周三");
    let data = await state(page);
    const clarification = data.chat.flatMap((message) => message.clarifications || []).find((entry) => entry.status === "pending");
    check(`${label} 保存补充日期但尚不入账`, clarification?.answerDate === "2026-11-11" && data.events.every((event) => event.status === "pending") && (await quote(page)) === before, JSON.stringify(clarification));
    if (reload) {
      await page.reload({ waitUntil: "networkidle" });
      await ensurePersonal(page);
      await page.click("#entry");
      await page.waitForTimeout(300);
    }
    if (selection === "click") {
      await page.locator('[data-candidate-id="evt_a"]').click();
      await page.waitForTimeout(500);
    } else {
      await send(page, "第一个");
    }
    data = await state(page);
    const event = data.events.find((entry) => entry.id === "evt_a");
    const other = data.events.find((entry) => entry.id === "evt_b");
    const audits = data.audit.filter((entry) => entry.action === "confirm_event");
    check(`${label} 只确认所选记录且实际日期正确`, event.status === "confirmed" && event.occurredAt === "2026-11-11" && other.status === "pending" && other.occurredAt === today && audits.length === 1 && audits[0].after.occurredAt === "2026-11-11", JSON.stringify({ event, other, audits }));
    const expected = computeAll({ ...data, events: seed.events.map((entry) => entry.id === "evt_a" ? { ...entry, status: "confirmed", occurredAt: "2026-11-11" } : entry) }, { today });
    const actual = computeAll(data, { today });
    check(`${label} 指数及逐日贡献按历史日期重算`, (await quote(page)) !== before && Math.abs((await quote(page)) - expected.latest) < 0.05 && JSON.stringify(actual.days) === JSON.stringify(expected.days), `${before} → ${await quote(page)} / expected=${expected.latest}`);
    const after = await quote(page);
    await page.reload({ waitUntil: "networkidle" });
    await ensurePersonal(page);
    data = await state(page);
    check(`${label} 再刷新保持日期且不重复计分`, data.events.find((entry) => entry.id === "evt_a").occurredAt === "2026-11-11" && data.audit.filter((entry) => entry.action === "confirm_event").length === 1 && (await quote(page)) === after && (await page.locator('[data-testid="clarification-card"]').count()) === 0, `${after} → ${await quote(page)}`);
    check(`${label} 控制台无错误`, page._errors.length === 0, page._errors.join("|") || "clean");
    await context.close();
    if (recordVideo) await page.video().saveAs(path.join(ROOT, "assets/videos/pr10-p1-saved-date.webm"));
  }
}

await browser.close();
app.close();
mkdirSync(path.join(ROOT, "assets"), { recursive: true });
writeFileSync(path.join(ROOT, "assets/agent-protocol-results.json"), JSON.stringify({ generatedAt: new Date().toISOString(), today, checks: results }, null, 2));
const failed = results.filter((result) => !result.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exitCode = 1;
