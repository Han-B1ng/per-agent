import { chromium } from "playwright";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createApp } from "../../server/index.mjs";
import { shiftDate } from "../../web/engine.js";

const ROOT = path.resolve(import.meta.dirname, "../..");
const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass: !!pass, detail: String(detail).slice(0, 500) });
  console.log(`${pass ? "PASS" : "FAIL"} ${name} :: ${detail}`);
};
const listen = (s) => new Promise((r) => s.listen(0, "127.0.0.1", () => r(s)));
const app = await listen(createApp({ env: {} }));
const B = `http://127.0.0.1:${app.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.PE_CHANNEL ? { channel: process.env.PE_CHANNEL } : {}) });
const quote = (page) => page.textContent("#quote-value").then((t) => parseFloat(t.replace(/,/g, "")));
const today = async (page) => page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; });
const go = async (page, name) => { await page.click(`[data-page-target="${name}"]`); await page.waitForTimeout(250); };
const send = async (page, text, wait = 800) => { await page.fill("#entry", text); await page.press("#entry", "Enter"); await page.waitForTimeout(wait); };
const shot = (page, name) => page.screenshot({ path: path.join(ROOT, `assets/screenshots/${name}.png`) });

async function newPage({ width = 1440, height = 900, seed = null, video = null, init = null } = {}) {
  const opts = { viewport: { width, height } };
  if (video) { mkdirSync(video, { recursive: true }); opts.recordVideo = { dir: video, size: { width, height } }; }
  const context = await browser.newContext(opts);
  if (seed) await context.addInitScript((s) => localStorage.setItem("pe.personal.v1", s), seed);
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page._errors = errors;
  await page.goto(B, { waitUntil: "networkidle" });
  await page.waitForTimeout(350);
  return { context, page };
}
async function closeVideo(context, page, dest) {
  const video = page.video();
  await context.close();
  if (video && dest) renameSync(await video.path(), dest);
}
async function createGoal(page, title, offset = 7) {
  const t = await today(page);
  await page.click("#goal-add-open");
  await page.fill("#goal-title-input", title);
  await page.fill("#goal-due-input", shiftDate(t, offset));
  await page.click("#goal-form button[type=submit]");
  await page.waitForTimeout(250);
}

/* 真实运行视觉对照：样例完整数据下的两个新页面 */
{
  const { context, page } = await newPage();
  await shot(page, "v02-market");
  await go(page, "goals");
  const groups = await page.evaluate(() => [...document.querySelectorAll(".goal-group")].map((g) => ({ open: g.open, visible: !!g.offsetHeight })));
  check("视觉/A 目标中心未完成与已完成同屏", groups.length === 2 && groups.every((g) => g.open && g.visible), JSON.stringify(groups));
  check("视觉/A 样例含进行中逾期与已完成", (await page.locator(".goal-card").count()) === 4 && (await page.locator(".badge.overdue").count()) === 1 && (await page.locator(".badge.done").count()) === 1, `cards=${await page.locator(".goal-card").count()}`);
  await shot(page, "v02-goals");
  await go(page, "records");
  check("视觉/A 成长记录含行为情绪休息任务完成", await page.locator(".record-row").count() > 20 && (await page.locator(".record-type").allTextContents()).some((t) => t.includes("任务完成")), `rows=${await page.locator(".record-row").count()}`);
  await shot(page, "v02-records");
  check("视觉/A 控制台无错误", page._errors.length === 0, page._errors.join("|") || "clean");
  await context.close();
}

/* A：真实新增两个目标、幂等完成、两组/记录/指数/刷新一致 */
{
  const { context, page } = await newPage();
  await page.click("#view-personal");
  await go(page, "goals");
  await createGoal(page, "完成论文第三章", 7);
  await createGoal(page, "复习英语考试", 10);
  check("A 创建两个目标", (await page.locator("#active-goals .goal-card").count()) === 2 && (await page.locator("#done-goal-count").textContent()) === "0", await page.locator("#active-goal-count").textContent());
  await page.locator("#active-goals .goal-card").first().locator("button", { hasText: "完成" }).evaluate((b) => { b.click(); b.click(); });
  await page.waitForTimeout(400);
  check("A 双击完成后未完成/已完成各一组", (await page.locator("#active-goals .goal-card").count()) === 1 && (await page.locator("#done-goals .goal-card").count()) === 1, `${await page.locator("#active-goal-count").textContent()}/${await page.locator("#done-goal-count").textContent()}`);
  await go(page, "records");
  const completions = page.locator(".record-row", { hasText: "任务完成" });
  check("A 成长记录只有一笔完成事实", await completions.count() === 1, await completions.count());
  await go(page, "market");
  check("A 周 K 只有一笔完成增益", Math.abs((await quote(page)) - 1006) < 0.05, await quote(page));
  await page.reload({ waitUntil: "networkidle" });
  await page.click("#view-personal");
  await go(page, "goals");
  await page.locator("#done-goals .goal-card button", { hasText: "详情" }).click();
  await page.locator("#drawer-body button", { hasText: "关联成长记录" }).click();
  await page.waitForTimeout(300);
  check("A 刷新后目标详情可定位唯一关联记录", (await page.locator(".record-row").count()) === 1 && !(await page.locator("#record-link-chip").getAttribute("hidden")), await page.locator("#record-link-chip").textContent());
  check("A 控制台无错误", page._errors.length === 0, page._errors.join("|") || "clean");
  await context.close();
}

/* B：D39 完成前历史逾期收盘与明细保持 */
{
  const { context, page } = await newPage();
  const t = await today(page);
  const due = shiftDate(t, -2);
  await context.addInitScript((s) => localStorage.setItem("pe.personal.v1", JSON.stringify(s)), { events: [], rests: [], tasks: [{ id: "v02_overdue", kind: "task", title: "逾期目标", dueAt: due, position: 3, status: "open", createdAt: `${due}T09:00:00.000Z`, doneAt: null, deletedAt: null }], chat: [] });
  await page.reload({ waitUntil: "networkidle" });
  await page.click("#view-personal");
  const canvas = await page.locator("#candles").boundingBox();
  await page.mouse.click(canvas.x + canvas.width - 60, canvas.y + canvas.height / 2);
  await page.waitForTimeout(300);
  const before = await page.locator(".day-block").allTextContents();
  await page.click("#tab-tasks");
  await page.locator(".task-row button", { hasText: "标记完成" }).click();
  await page.click("#tab-detail");
  const after = await page.locator(".day-block").allTextContents();
  const yesterday = shiftDate(t, -1);
  const findDay = (blocks, d) => blocks.find((b) => b.includes(d)) || "";
  check("B D39 历史收盘/逾期明细保留", findDay(before, yesterday).replace("完成任务", "") === findDay(after, yesterday).replace("完成任务", ""), `${findDay(before, yesterday)} => ${findDay(after, yesterday)}`);
  check("B 完成日只有一笔完成增益", after.filter((b) => b.includes("完成任务")).length === 1 && !findDay(after, t).includes("逾期损耗"), findDay(after, t));
  await context.close();
}

/* C/D：pending 补日期、聊天同步、情绪/行为筛选与跨周修正 */
{
  const { context, page } = await newPage();
  await send(page, "前阵子跑过五公里");
  const before = await quote(page);
  await go(page, "records");
  check("C 旧日期 pending 不计分且记录可处理", before === 1000 && (await page.locator(".record-row", { hasText: "待确认" }).count()) === 1, before);
  const old = shiftDate(await today(page), -7);
  await page.locator(".pending-editor input").fill(old);
  await page.locator(".pending-editor button", { hasText: "确认" }).click();
  await page.waitForTimeout(350);
  check("C 记录页补日期后只生效一次", (await page.locator(".record-row").count()) === 1 && !(await page.locator(".record-row").textContent()).includes("待确认"), await page.locator(".record-row").textContent());
  await go(page, "market");
  check("C 聊天确认卡同步消失", (await page.locator(".msg-card .card-btn.primary").count()) === 0 && (await quote(page)) > 1000, await quote(page));
  await send(page, "今天有点焦虑，但还是去跑了五公里。");
  await go(page, "records");
  await page.selectOption("#record-type", "emotion");
  check("D 情绪记录可筛选且贡献为零", (await page.locator(".record-row").count()) === 1 && (await page.locator(".record-value").textContent()).includes("0.00%"), await page.locator(".record-row").textContent());
  await page.selectOption("#record-type", "behavior");
  const running = page.locator(".record-row", { hasText: "但还是去跑了五公里" });
  await running.locator("button", { hasText: "详情" }).click();
  await page.locator(".edit-form input[type=date]").fill(shiftDate(await today(page), -7));
  await page.locator(".edit-form button", { hasText: "保存修正" }).click();
  await page.waitForTimeout(300);
  check("D 跑步日期可按生效日修正并留轨迹", (await page.locator("#drawer-body").textContent()).includes("correct_event") && (await page.locator("#drawer-body").textContent()).includes("correct_event") === true, await page.locator("#drawer-sub").textContent());
  await page.locator("#drawer-body button", { hasText: "打开计分明细" }).click();
  await page.waitForTimeout(300);
  check("D 目标周明细对应原文和 +1%", (await page.locator("#drawer-body").textContent()).includes("五公里") && (await page.locator("#drawer-body").textContent()).includes("+1.00%"), (await page.locator("#drawer-body").textContent()).slice(-500));
  await page.click("#drawer-close");
  await page.waitForTimeout(500);
  await go(page, "market");
  if (await page.locator("#view-toggle").isVisible()) { await page.click("#view-toggle"); await page.waitForTimeout(900); }
  const canvas = await page.locator("#candles").boundingBox();
  await page.mouse.click(canvas.x + canvas.width - 60, canvas.y + canvas.height / 2);
  await page.waitForTimeout(300);
  const originalWeek = await page.locator("#drawer-body").textContent();
  check("D 原周不再保留跑步行为，情绪仍在原周", !originalWeek.includes("但还是去跑了五公里") && originalWeek.includes("情绪记录"), originalWeek.slice(-500));
  await page.click("#drawer-close");
  await go(page, "records");
  await page.fill("#record-keyword", "不存在的关键字");
  check("D 无搜索结果是真实空态", (await page.locator(".record-empty").textContent()).includes("没有符合"), await page.locator(".record-empty").textContent());
  check("C/D 控制台无错误", page._errors.length === 0, page._errors.join("|") || "clean");
  await context.close();
}

/* pending 休息：记录页确认与否认共用聊天动作 */
for (const mode of ["confirm", "deny"]) {
  const t = new Date().toISOString().slice(0, 10);
  const seed = JSON.stringify({ events: [], rests: [{ id: `rest_${mode}`, kind: "rest", date: t, quote: "想休息一天", confidence: 0.4, status: "pending", createdAt: `${t}T10:00:00.000Z`, deletedAt: null }], tasks: [], chat: [{ id: `msg_${mode}`, role: "assistant", text: "确认休息吗", pending: [`rest_${mode}`] }] });
  const { context, page } = await newPage({ seed });
  await page.click("#view-personal");
  await go(page, "records");
  await page.locator(".pending-editor button", { hasText: mode === "confirm" ? "确认" : "否认" }).click();
  await go(page, "market");
  const q = await quote(page);
  const cardGone = (await page.locator(".msg-card").count()) === 0;
  check(`C pending 休息${mode === "confirm" ? "确认生效" : "否认退出"}`, cardGone && (mode === "confirm" ? q > 1000 : q === 1000), `quote=${q} cardGone=${cardGone}`);
  await context.close();
}

/* E：等待、超时失败、账本不变、原记录页重试 */
{
  const { context, page } = await newPage();
  await page.route("**/api/extract", async (route) => { await new Promise((r) => setTimeout(r, 500)); await route.continue(); });
  await page.fill("#entry", "今天跑了五公里");
  await page.press("#entry", "Enter");
  await page.waitForTimeout(100);
  await go(page, "records");
  check("E 等待抽取状态真实可见", (await page.locator("#record-service-state").textContent()).includes("等待"), await page.locator("#record-service-state").textContent());
  await page.waitForTimeout(650);
  await page.unroute("**/api/extract");
  await page.route("**/api/extract", (route) => route.fulfill({ status: 504, contentType: "application/json", body: JSON.stringify({ ok: false, error: { code: "timeout", message: "模拟模型超时，这条没有录入。" } }) }));
  await send(page, "今天完成了数据库课设。", 500);
  await go(page, "records");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("pe.personal.v2")).events.map((e) => e.quote));
  check("E 超时失败不误录入且可重试", (await page.locator("#record-service-state").textContent()).includes("模拟模型超时") && stored.filter((q) => q.includes("数据库")).length === 0, JSON.stringify(stored));
  await page.unroute("**/api/extract");
  await page.locator("#record-service-state button", { hasText: "重试" }).click();
  await page.waitForTimeout(800);
  await go(page, "market");
  check("E 恢复后重试成功且只记一次", (await quote(page)) > 1000, await quote(page));
  check("E 控制台无脚本错误", page._errors.length === 0, page._errors.join("|") || "clean");
  await context.close();
}

/* v1 迁移、暂停状态、空账本、样例隔离与导出范围 */
{
  const t = new Date().toISOString().slice(0, 10);
  const seed = JSON.stringify({
    events: [{ id: "old_behavior", kind: "event", eventType: "behavior", polarity: "positive", intensity: 2, occurredAt: t, quote: "旧行为原文", tags: [], confidence: 0.9, status: "confirmed", createdAt: `${t}T08:00:00.000Z`, deletedAt: null }],
    rests: [{ id: "old_pending_rest", kind: "rest", date: t, quote: "旧待确认休息", confidence: 0.4, status: "pending", createdAt: `${t}T08:00:00.000Z`, deletedAt: null }],
    tasks: [
      { id: "old_done", kind: "task", title: "旧已完成目标", dueAt: t, position: 3, status: "done", createdAt: `${t}T07:00:00.000Z`, doneAt: `${t}T09:00:00.000Z`, deletedAt: null },
      { id: "old_paused", kind: "task", title: "旧暂停目标", dueAt: t, position: 2, status: "paused", createdAt: `${t}T07:00:00.000Z`, doneAt: null, deletedAt: null },
    ], chat: [],
  });
  const { context, page } = await newPage({ seed });
  await page.click("#view-personal");
  const version = await page.evaluate(() => JSON.parse(localStorage.getItem("pe.personal.v2")).version);
  await go(page, "goals");
  check("迁移 v1 行为/pending休息/完成/暂停均可读", version === 2 && (await page.locator(".badge.paused").count()) === 1 && (await page.locator("#done-goals .goal-card").count()) === 1, `version=${version}`);
  await go(page, "records");
  check("迁移记录包含旧行为与 pending 休息", (await page.locator(".record-row").count()) === 3, await page.locator(".record-row").count());
  await page.click("#settings-open");
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#drawer-body button", { hasText: "导出我的 JSON" }).click();
  const download = await downloadPromise;
  check("迁移导出只标记个人范围", download.suggestedFilename().includes("personal"), download.suggestedFilename());
  await page.locator("#drawer-body button", { hasText: "清空我的记录" }).click();
  await page.locator("#drawer-body button", { hasText: "确定清空" }).click();
  const cleared = await page.evaluate(() => ({ v1: localStorage.getItem("pe.personal.v1"), v2: JSON.parse(localStorage.getItem("pe.personal.v2")) }));
  check("清空只移除个人新旧账本", cleared.v1 === null && cleared.v2.events.length === 0 && cleared.v2.tasks.length === 0, JSON.stringify(cleared));
  await page.click("#drawer-close");
  await page.click("#view-sample");
  check("样例与个人切换/清空隔离", !(await page.locator(".page-data-tag").first().textContent()).includes("我的") && (await page.locator(".record-row").count()) > 20, await page.locator(".record-row").count());
  await context.close();
}
{
  const { context, page } = await newPage();
  await page.click("#view-personal");
  await go(page, "records");
  check("空账本有真实引导状态", (await page.locator(".record-empty").textContent()).includes("账本还没有"), await page.locator(".record-empty").textContent());
  await context.close();
}

/* F：双桌面视口连续录屏；侧栏、缩窗、长消息均由实际布局触发 */
for (const [width, height] of [[1440, 900], [1440, 720]]) {
  const tag = `${width}x${height}`;
  const { context, page } = await newPage({ width, height, video: path.join(ROOT, `assets/videos/v02-market-${tag}`) });
  const market = () => page.evaluate(() => { const r = document.querySelector(".market").getBoundingClientRect(); return { mode: document.querySelector(".workspace").dataset.mode, x: r.x, y: r.y, w: r.width, h: r.height, transform: getComputedStyle(document.querySelector(".market")).transform }; });
  await go(page, "goals");
  await go(page, "market");
  const initial = await market();
  await page.click("#entry");
  await page.waitForTimeout(300);
  const focused = await market();
  check(`F[${tag}] 侧栏往返后首次聚焦图表不动`, initial.x === focused.x && initial.y === focused.y && initial.w === focused.w && initial.h === focused.h && focused.transform === initial.transform, JSON.stringify(focused));
  await page.setViewportSize({ width: 1100, height: Math.max(620, height - 100) });
  await page.waitForTimeout(400);
  check(`F[${tag}] 缩窗未按消息条数误触专注`, (await market()).mode === "market", JSON.stringify(await market()));
  await page.setViewportSize({ width, height });
  await send(page, "长消息换行验证。".repeat(180), 900);
  const overflow = await page.evaluate(() => ({ mode: document.querySelector(".workspace").dataset.mode, messages: document.querySelector(".conversation").scrollHeight, available: document.querySelector(".stage").clientHeight - document.querySelector(".market").offsetHeight - 12, scrollable: document.querySelector(".message-scroll").scrollHeight > document.querySelector(".message-scroll").clientHeight, composerBottom: document.querySelector(".composer").getBoundingClientRect().bottom, vh: innerHeight }));
  check(`F[${tag}] 长消息实际溢出才进入专注`, overflow.mode === "focus" && overflow.messages > overflow.available && overflow.scrollable && overflow.composerBottom <= overflow.vh, JSON.stringify(overflow));
  check(`F[${tag}] 控制台无错误`, page._errors.length === 0, page._errors.join("|") || "clean");
  await closeVideo(context, page, path.join(ROOT, `assets/videos/v02-market-${tag}.webm`));
}

/* F：手机窄屏三页面、详情和发送 */
{
  const { context, page } = await newPage({ width: 390, height: 844, video: path.join(ROOT, "assets/videos/v02-mobile-390x844") });
  const openMobile = async (name) => { await page.click("#nav-menu"); await page.click(`[data-page-target="${name}"]`); await page.waitForTimeout(250); };
  await openMobile("goals");
  await page.locator(".goal-card button", { hasText: "详情" }).first().click();
  check("F[mobile] 目标详情可打开", await page.locator("#drawer").isVisible(), await page.locator("#drawer-title").textContent());
  await page.click("#drawer-close");
  await openMobile("records");
  await page.locator(".record-row button", { hasText: "详情" }).first().click();
  check("F[mobile] 记录详情可打开", await page.locator("#drawer").isVisible(), await page.locator("#drawer-title").textContent());
  await page.click("#drawer-close");
  await openMobile("market");
  await send(page, "今天跑了五公里");
  const bottom = await page.evaluate(() => document.querySelector(".composer").getBoundingClientRect().bottom <= innerHeight);
  check("F[mobile] 可发消息且输入框留视口底部", bottom && (await quote(page)) > 1000, `quote=${await quote(page)} bottom=${bottom}`);
  check("F[mobile] 控制台无错误", page._errors.length === 0, page._errors.join("|") || "clean");
  await closeVideo(context, page, path.join(ROOT, "assets/videos/v02-mobile-390x844.webm"));
}

/* PR#3 P1：清空后在途旧响应不得恢复账本、对话或存储 */
{
  const { context, page } = await newPage();
  const day = await today(page);
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route("**/api/extract", async (route) => {
    await gate;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, mode: "model", reply: "旧响应不应成功", items: [{ op: "add_event", event: { eventType: "behavior", polarity: "positive", intensity: 3, occurredAt: day, quote: "清空后不得写回", confidence: 0.9 } }] }) });
  });
  await page.fill("#entry", "今天跑了五公里");
  await page.press("#entry", "Enter");
  await page.waitForTimeout(100);
  await page.click("#settings-open");
  await page.locator("#drawer-body button", { hasText: "清空我的记录" }).click();
  await page.locator("#drawer-body button", { hasText: "确定清空" }).click();
  release();
  await page.waitForTimeout(700);
  const cleared = await page.evaluate(() => ({ stored: JSON.parse(localStorage.getItem("pe.personal.v2")), messages: document.querySelectorAll(".messages .message").length, quote: document.querySelector("#quote-value").textContent }));
  check("PR#3 P1 清空作废在途响应，旧响应不写回", cleared.stored.events.length === 0 && cleared.stored.rests.length === 0 && cleared.stored.tasks.length === 0 && cleared.stored.chat.length === 0 && cleared.messages === 0 && cleared.quote === "1,000.0", JSON.stringify(cleared));
  check("PR#3 P1 控制台无错误", page._errors.length === 0, page._errors.join("|") || "clean");
  await context.close();
}

/* PR#3 P2：等待中否认后，确认+新增混合批次整批拒绝并提示重试 */
{
  const day = new Date().toISOString().slice(0, 10);
  const seed = JSON.stringify({ events: [{ id: "conflict_pending", kind: "event", eventType: "behavior", polarity: "positive", intensity: 3, occurredAt: day, quote: "待确认旧事件", tags: [], confidence: 0.4, status: "pending", createdAt: `${day}T08:00:00.000Z`, deletedAt: null }], rests: [], tasks: [], chat: [{ id: "conflict_msg", role: "assistant", text: "确认这条吗", pending: ["conflict_pending"] }] });
  const { context, page } = await newPage({ seed });
  await page.click("#view-personal");
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route("**/api/extract", async (route) => {
    await gate;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, mode: "model", reply: "模型全部成功", items: [{ op: "confirm_event", id: "conflict_pending" }, { op: "add_event", event: { eventType: "behavior", polarity: "positive", intensity: 3, occurredAt: day, quote: "不应部分入账", confidence: 0.9 } }] }) });
  });
  await page.fill("#entry", "确认并新增");
  await page.press("#entry", "Enter");
  await page.waitForTimeout(100);
  await page.locator(".msg-card .card-btn.ghost").click();
  release();
  await page.waitForTimeout(700);
  const conflict = await page.evaluate(() => ({ stored: JSON.parse(localStorage.getItem("pe.personal.v2")), chat: document.querySelector(".messages").textContent }));
  check("PR#3 P2 冲突批次原子回滚且界面提示重试", conflict.stored.events.length === 1 && conflict.stored.events[0].deletedAt && !conflict.stored.events.some((e) => e.quote === "不应部分入账") && conflict.chat.includes("整批未写入") && !conflict.chat.includes("模型全部成功") && conflict.chat.includes("重试"), JSON.stringify(conflict));
  check("PR#3 P2 控制台无错误", page._errors.length === 0, page._errors.join("|") || "clean");
  await context.close();
}

/* PR#3 P2：跨午夜后请求、手动完成和走势重算使用新本地日期 */
{
  const init = () => {
    const NativeDate = Date;
    let current = new NativeDate(2026, 10, 19, 23, 59, 30).getTime();
    class MockDate extends NativeDate {
      constructor(...args) { super(...(args.length ? args : [current])); }
      static now() { return current; }
    }
    window.Date = MockDate;
    window.__crossMidnight = () => {
      current = new NativeDate(2026, 10, 20, 0, 1, 0).getTime();
      document.dispatchEvent(new Event("visibilitychange"));
    };
  };
  const { context, page } = await newPage({ init });
  const requestDates = [];
  page.on("request", (request) => {
    if (!request.url().includes("/api/extract")) return;
    const body = request.postDataJSON();
    requestDates.push(body.context.today);
  });
  await page.click("#view-personal");
  await send(page, "今天跑了五公里");
  await page.evaluate(() => window.__crossMidnight());
  await page.waitForTimeout(350);
  await go(page, "goals");
  await createGoal(page, "跨日目标", 7);
  await page.locator("#active-goals .goal-card button", { hasText: "完成" }).click();
  await send(page, "今天跑了五公里");
  const crossed = await page.evaluate(() => JSON.parse(localStorage.getItem("pe.personal.v2")));
  await go(page, "market");
  if (await page.locator("#view-toggle").isVisible()) { await page.click("#view-toggle"); await page.waitForTimeout(900); }
  const canvas = await page.locator("#candles").boundingBox();
  await page.mouse.click(canvas.x + canvas.width - 60, canvas.y + canvas.height / 2);
  await page.waitForTimeout(300);
  const lastDay = await page.locator(".day-block .d").last().textContent();
  check("PR#3 P2 跨午夜后发送/完成/重算均用新日期", requestDates.join(",") === "2026-11-19,2026-11-20" && crossed.events.map((e) => e.occurredAt).join(",") === "2026-11-19,2026-11-20" && crossed.tasks[0].doneAt.startsWith("2026-11-20") && lastDay === "2026-11-20", JSON.stringify({ requestDates, eventDates: crossed.events.map((e) => e.occurredAt), doneAt: crossed.tasks[0].doneAt, lastDay }));
  check("PR#3 P2 跨日控制台无错误", page._errors.length === 0, page._errors.join("|") || "clean");
  await context.close();
}

await browser.close();
app.close();
writeFileSync(path.join(ROOT, "assets/v02-acceptance-results.json"), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} v0.2 checks passed`);
process.exit(failed.length ? 1 : 0);
