import { chromium } from "playwright";
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createApp } from "../../server/index.mjs";
import { shiftDate } from "../../web/engine.js";

const ROOT = path.resolve(import.meta.dirname, "../..");
const DOCS = path.resolve(ROOT, "../docs/ui-handoff");
const SHOTS = path.join(DOCS, "screenshots");
const VIDEOS = path.join(DOCS, "videos");
const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass: Boolean(pass), detail: String(detail).slice(0, 700) });
  console.log(`${pass ? "PASS" : "FAIL"} ${name} :: ${detail}`);
};
const listen = (server) => new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const today = localToday();
const day = (n) => shiftDate(today, n);

function seedLedger({ chatCount = 2 } = {}) {
  const quotes = [
    [-62, "读完了一章专业书", 1], [-55, "把课设的数据库表设计写完了", 2], [-48, "去操场跑了五公里", 3],
    [-40, "整理了一周笔记", 1], [-31, "论文第二节写完了", 2], [-24, "和朋友散步聊天", 1],
    [-17, "复习了两章专业课", 2], [-10, "早上跑步五公里", 3], [-4, "看了部纪录片", 1],
  ];
  const events = quotes.map(([offset, quote, intensity], index) => ({
    id: `ui_evt_${index}`,
    kind: "event",
    eventType: "behavior",
    polarity: "positive",
    intensity,
    occurredAt: day(offset),
    quote,
    tags: [],
    confidence: 0.9,
    status: "confirmed",
    createdAt: `${day(offset)}T12:00:00.000Z`,
    deletedAt: null,
  }));
  events.push({ id: "ui_evt_today", kind: "event", eventType: "behavior", polarity: "positive", intensity: 3, occurredAt: today, quote: "今天早上跑了五公里", tags: [], confidence: 0.9, status: "confirmed", createdAt: `${today}T08:00:00.000Z`, deletedAt: null });
  events.push({ id: "ui_evt_emo", kind: "event", eventType: "emotion", polarity: "neutral", intensity: 2, occurredAt: today, quote: "新的一天，状态还行", tags: [], confidence: 0.9, status: "confirmed", createdAt: `${today}T08:05:00.000Z`, deletedAt: null });
  const tasks = [
    { id: "ui_task_db", kind: "task", title: "写完论文第三章", dueAt: day(3), position: 3, status: "open", createdAt: `${day(-20)}T09:00:00.000Z`, doneAt: null, deletedAt: null },
    { id: "ui_task_report", kind: "task", title: "交操作系统实验报告", dueAt: day(-3), position: 2, status: "open", createdAt: `${day(-14)}T09:00:00.000Z`, doneAt: null, deletedAt: null },
    { id: "ui_task_notes", kind: "task", title: "整理计网静态路由笔记", dueAt: day(-5), position: 1, status: "done", createdAt: `${day(-18)}T09:00:00.000Z`, doneAt: `${day(-4)}T10:00:00.000Z`, deletedAt: null },
    { id: "ui_task_read", kind: "task", title: "完成数据库表结构设计", dueAt: day(-7), position: 2, status: "done", createdAt: `${day(-25)}T09:00:00.000Z`, doneAt: `${day(-6)}T10:00:00.000Z`, deletedAt: null },
  ];
  const chat = [
    { id: "ui_msg_u1", role: "user", text: "今天有点焦虑，但还是去跑了五公里。" },
    { id: "ui_msg_a1", role: "assistant", text: "记下了。情绪已记录，跑步已计入成长指数。" },
    { id: "ui_msg_u2", role: "user", text: "这周跑步这件事，我还能在哪里看到？" },
    { id: "ui_msg_a2", role: "assistant", text: "在「成长记录」里可以找到这次跑步。打开对应日期的周 K 明细，也能看到它对指数的贡献。" },
    { id: "ui_msg_u3", role: "user", text: "那今天的焦虑会让指数变动吗？" },
    { id: "ui_msg_a3", role: "assistant", text: "焦虑会作为情绪记录保留，不参与计分。这次进入指数的是跑步这项行为。" },
    { id: "ui_msg_u4", role: "user", text: "明白了，明天继续。" },
    { id: "ui_msg_a4", role: "assistant", text: "好，明天想记录时再来找我。" },
  ].slice(0, chatCount * 2);
  return { events, rests: [{ id: "ui_rest", kind: "rest", date: day(-2), quote: "请假休息一天", confidence: 0.9, status: "confirmed", createdAt: `${day(-2)}T09:00:00.000Z`, deletedAt: null }], tasks, chat };
}

const server = await listen(createApp({ env: {} }));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.PE_CHANNEL ? { channel: process.env.PE_CHANNEL } : {}) });
await mkdir(SHOTS, { recursive: true });
await mkdir(VIDEOS, { recursive: true });

async function newPage({ width = 1440, height = 900, seed = null, video = null } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, ...(video ? { recordVideo: { dir: video, size: { width, height } } } : {}) });
  if (seed) await context.addInitScript((value) => localStorage.setItem("pe.personal.v1", JSON.stringify(value)), seed);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && !/Failed to load resource/.test(message.text())) errors.push(message.text()); });
  page._errors = errors;
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForTimeout(350);
  return { context, page };
}
const personal = async (page) => {
  if ((await page.locator("#view-personal").getAttribute("aria-pressed")) !== "true") {
    await page.click("#view-personal");
    await page.waitForTimeout(250);
  }
};
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name) });
const state = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("pe.personal.v2")));
const quote = async (page) => Number((await page.textContent("#quote-value")).replace(/,/g, ""));
const send = async (page, text, wait = 900) => {
  await page.fill("#entry", text);
  await page.press("#entry", "Enter");
  await page.waitForTimeout(wait);
};
const go = async (page, name) => { await page.click(`[data-page-target="${name}"]`); await page.waitForTimeout(250); };

/* 01 default */
{
  const { context, page } = await newPage();
  await shot(page, "01-market.png");
  check("01 行情默认展示指数、周K与单行输入", (await page.locator(".market-card").count()) === 1 && (await page.locator("#candles").isVisible()) && (await page.locator(".conversation").isVisible()) === false, "");
  await context.close();
}

/* 24 input focus: click only focuses; chat appears after first send */
{
  const { context, page } = await newPage({ seed: seedLedger({ chatCount: 1 }) });
  await personal(page);
  check("24 发送前聊天历史与快捷提示收起", (await page.locator(".conversation").isVisible()) === false && (await page.locator(".quick-actions").count()) === 0, "");
  const before = await page.evaluate(() => ({ chart: document.querySelector(".market").getBoundingClientRect().toJSON(), input: document.querySelector(".composer").getBoundingClientRect().top }));
  await page.click("#entry");
  await page.waitForTimeout(350);
  const clicked = await page.evaluate(() => ({ chart: document.querySelector(".market").getBoundingClientRect().toJSON(), input: document.querySelector(".composer").getBoundingClientRect().top, mode: document.querySelector(".workspace").dataset.mode, focused: document.activeElement?.id, collapsed: Boolean(document.querySelector(".conversation.is-collapsed")) }));
  await shot(page, "24-input-focus.png");
  check("24 点击输入框只改变聚焦样式", clicked.mode === "market" && clicked.focused === "entry" && clicked.collapsed && before.input === clicked.input && before.chart.y === clicked.chart.y && before.chart.height === clicked.chart.height, JSON.stringify({ before, clicked }));
  await context.close();
}

/* 24b effective send enters focus immediately */
{
  const { context, page } = await newPage({ seed: seedLedger({ chatCount: 0 }) });
  await personal(page);
  const chartHeight = await page.evaluate(() => document.querySelector(".chart").offsetHeight);
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route("**/api/extract", async (route) => { await gate; await route.continue(); });
  await page.fill("#entry", "今天跑了五公里。");
  await page.click(".send");
  await page.waitForTimeout(250);
  const immediate = await page.evaluate(() => ({
    mode: document.querySelector(".workspace").dataset.mode,
    userMessage: [...document.querySelectorAll(".message")].some((message) => message.textContent.includes("今天跑了五公里")),
    typing: Boolean(document.querySelector(".typing")),
    conversation: Boolean(document.querySelector(".conversation.is-focus")?.getBoundingClientRect().height),
    returnVisible: Boolean(document.querySelector("#view-toggle")?.getBoundingClientRect().width),
    quoteVisible: Boolean(document.querySelector("#focus-quote")?.getBoundingClientRect().width),
    cardBackground: getComputedStyle(document.querySelector(".market-card")).backgroundImage,
    chartHeight: document.querySelector(".chart").offsetHeight,
    quick: Boolean(document.querySelector(".quick-actions")?.getBoundingClientRect().height),
    draft: document.querySelector("#entry").value,
  }));
  check("24 有效发送立即进入专注并显示用户消息/等待", immediate.mode === "focus" && immediate.userMessage && immediate.typing && immediate.conversation && immediate.returnVisible && immediate.quoteVisible && immediate.cardBackground === "none" && immediate.quick && immediate.draft === "" && Math.abs(immediate.chartHeight - chartHeight) < 1, JSON.stringify({ chartHeight, immediate }));
  release();
  await page.waitForTimeout(1200);
  const replied = await page.evaluate(() => ({ messages: document.querySelectorAll(".message").length, typing: Boolean(document.querySelector(".typing")), transcript: document.querySelector(".messages")?.textContent ?? "" }));
  check("24 响应到达后保留完整对话", replied.messages >= 2 && !replied.typing && replied.transcript.includes("今天跑了五公里"), JSON.stringify(replied));
  await page.fill("#entry", "草稿保留");
  const messages = await page.locator(".message").count();
  await page.click("#view-toggle");
  await page.waitForTimeout(800);
  const returned = await page.evaluate(() => ({ mode: document.querySelector(".workspace").dataset.mode, collapsed: Boolean(document.querySelector(".conversation.is-collapsed")), draft: document.querySelector("#entry").value, messages: document.querySelectorAll(".message").length, quick: Boolean(document.querySelector(".quick-actions")), chartBackground: getComputedStyle(document.querySelector(".market-card")).backgroundImage }));
  check("24 返回行情收起聊天并保留历史/草稿", returned.mode === "market" && returned.collapsed && returned.draft === "草稿保留" && returned.messages === messages && !returned.quick && returned.chartBackground !== "none", JSON.stringify({ returned, messages }));
  await context.close();
}

/* 720 Enter sends into focus too */
{
  const { context, page } = await newPage({ seed: seedLedger({ chatCount: 0 }), width: 1440, height: 720 });
  await personal(page);
  const before = await page.evaluate(() => ({ chart: document.querySelector(".market").getBoundingClientRect().toJSON(), input: document.querySelector(".composer").getBoundingClientRect().top }));
  await page.click("#entry");
  await page.waitForTimeout(350);
  const clicked = await page.evaluate(() => ({ chart: document.querySelector(".market").getBoundingClientRect().toJSON(), input: document.querySelector(".composer").getBoundingClientRect().top, mode: document.querySelector(".workspace").dataset.mode, focused: document.activeElement?.id, collapsed: Boolean(document.querySelector(".conversation.is-collapsed")) }));
  check("720 点击输入框只聚焦不展开聊天", clicked.mode === "market" && clicked.focused === "entry" && clicked.collapsed && before.input === clicked.input && before.chart.height === clicked.chart.height, JSON.stringify({ before, clicked }));
  await send(page, "今天跑了五公里。");
  const sent = await page.evaluate(() => ({ mode: document.querySelector(".workspace").dataset.mode, conversation: Boolean(document.querySelector(".conversation.is-focus")?.getBoundingClientRect().height), quote: Boolean(document.querySelector("#focus-quote")?.getBoundingClientRect().width), returnVisible: Boolean(document.querySelector("#view-toggle")?.getBoundingClientRect().width), messages: document.querySelectorAll(".message").length, quick: Boolean(document.querySelector(".quick-actions")?.getBoundingClientRect().height) }));
  check("720 回车发送直接进入专注", sent.mode === "focus" && sent.conversation && sent.quote && sent.returnVisible && sent.messages >= 2 && sent.quick, JSON.stringify(sent));
  await context.close();
}

/* Sample chat enters focus without switching data */
{
  const { context, page } = await newPage();
  const sample = await page.evaluate(() => ({ view: document.querySelector("#view-sample").getAttribute("aria-pressed"), quote: document.querySelector("#quote-value").textContent, candles: Boolean(document.querySelector("#candles")) }));
  await page.click("#entry");
  await send(page, "你好");
  await page.waitForTimeout(300);
  const chatOnly = await page.evaluate(() => ({ mode: document.querySelector(".workspace").dataset.mode, view: document.querySelector("#view-sample").getAttribute("aria-pressed"), personal: document.querySelector("#view-personal").getAttribute("aria-pressed"), focusQuote: document.querySelector("#focus-quote")?.textContent ?? "", conversation: Boolean(document.querySelector(".conversation.is-focus")?.getBoundingClientRect().height), transcript: document.querySelector(".messages")?.textContent ?? "", events: JSON.parse(localStorage.getItem("pe.personal.v2") || "{}").events?.length ?? 0 }));
  check("样例闲聊保持样例数据并进入专注", chatOnly.mode === "focus" && sample.view === "true" && chatOnly.view === "true" && chatOnly.personal === "false" && chatOnly.focusQuote === sample.quote && chatOnly.events === 0 && chatOnly.conversation && chatOnly.transcript.includes("你好"), JSON.stringify({ sample, chatOnly }));
  await page.click("#view-toggle");
  await page.waitForTimeout(700);
  const returned = await page.evaluate(() => ({ mode: document.querySelector(".workspace").dataset.mode, view: document.querySelector("#view-sample").getAttribute("aria-pressed"), quote: document.querySelector("#quote-value").textContent, candles: Boolean(document.querySelector("#candles")), collapsed: Boolean(document.querySelector(".conversation.is-collapsed")) }));
  check("返回后样例行情保留", returned.mode === "market" && returned.view === "true" && returned.quote === sample.quote && returned.candles && returned.collapsed, JSON.stringify(returned));
  await page.click("#entry");
  await send(page, "今天跑了五公里。");
  await page.waitForTimeout(300);
  const wrote = await page.evaluate(() => ({ mode: document.querySelector(".workspace").dataset.mode, personal: document.querySelector("#view-personal").getAttribute("aria-pressed"), quote: document.querySelector("#focus-quote")?.textContent ?? "", events: JSON.parse(localStorage.getItem("pe.personal.v2") || "{}").events?.length ?? 0 }));
  check("个人记录写入后才切换", wrote.mode === "focus" && wrote.personal === "true" && wrote.events > 0 && wrote.quote !== sample.quote, JSON.stringify(wrote));
  await context.close();
}

/* 02 conversation focus */
{
  const { context, page } = await newPage({ seed: seedLedger({ chatCount: 4 }) });
  await personal(page);
  const chartHeightBefore = await page.evaluate(() => document.querySelector(".chart").offsetHeight);
  await send(page, "今天跑了五公里。");
  await page.waitForTimeout(500);
  await shot(page, "02-conversation-focus.png");
  check("02 有效发送进入专注并保留顶部指数", (await page.evaluate(() => document.querySelector(".workspace").dataset.mode)) === "focus" && (await page.locator("#focus-quote").isVisible()) && (await page.locator("#view-toggle").isVisible()), "");
  const focusStyle = await page.evaluate(() => {
    const market = getComputedStyle(document.querySelector(".market"));
    const chartEl = document.querySelector(".chart");
    const chart = getComputedStyle(chartEl);
    const card = getComputedStyle(document.querySelector(".market-card"));
    const toolbar = getComputedStyle(document.querySelector(".chart-toolbar"));
    const summary = getComputedStyle(document.querySelector(".market-summary"));
    return {
      marketTransform: market.transform, marketOpacity: market.opacity, marketFilter: market.filter,
      chartTransform: chart.transform, chartOpacity: chart.opacity, chartFilter: chart.filter, chartHeight: chartEl.offsetHeight,
      cardBackground: card.backgroundImage, cardBorder: card.borderTopColor,
      toolbarOpacity: toolbar.opacity, summaryOpacity: summary.opacity,
    };
  });
  const focusChromeGone = focusStyle.cardBackground === "none" && (focusStyle.cardBorder === "rgba(0, 0, 0, 0)" || focusStyle.cardBorder === "transparent") && parseFloat(focusStyle.toolbarOpacity) === 0 && parseFloat(focusStyle.summaryOpacity) === 0;
  const focusChartOnly = focusStyle.chartTransform.includes("1.24") && parseFloat(focusStyle.chartOpacity) < 0.2 && focusStyle.chartFilter.includes("blur");
  check("02 专注只放大K线且卡片/工具栏退场", focusChartOnly && focusChromeGone && parseFloat(focusStyle.marketOpacity) > 0.9 && !focusStyle.marketTransform.includes("1.24") && !focusStyle.marketFilter.includes("blur"), JSON.stringify(focusStyle));
  check("02 专注不改变K线绘图区高度", Math.abs(focusStyle.chartHeight - chartHeightBefore) < 1, `${chartHeightBefore} -> ${focusStyle.chartHeight}`);
  const focusAlign = await page.evaluate(() => { const c = document.querySelector(".conversation").getBoundingClientRect(); const i = document.querySelector(".composer").getBoundingClientRect(); return { cLeft: c.left, cWidth: c.width, iLeft: i.left, iWidth: i.width }; });
  check("02 专注对话与输入框左右对齐", Math.abs(focusAlign.cLeft - focusAlign.iLeft) < 1 && Math.abs(focusAlign.cWidth - focusAlign.iWidth) < 1, JSON.stringify(focusAlign));
  await page.fill("#entry", "多行输入第一行\n第二行\n第三行\n第四行");
  await page.waitForTimeout(300);
  await page.locator(".message-scroll").evaluate((node) => { node.scrollTop = node.scrollHeight; });
  await page.waitForTimeout(250);
  const focusSpace = await page.evaluate(() => {
    const last = [...document.querySelectorAll(".messages .message")].pop();
    return { messageBottom: last?.getBoundingClientRect().bottom ?? 0, composerTop: document.querySelector(".composer")?.getBoundingClientRect().top ?? 0, extra: getComputedStyle(document.documentElement).getPropertyValue("--composer-extra").trim() };
  });
  check("02 多行输入时最后一条消息不被输入框遮挡", focusSpace.messageBottom <= focusSpace.composerTop - 1, JSON.stringify(focusSpace));
  await context.close();
}

/* Focus sequence video: focus → send → direct focus → return */
{
  const videoDir = path.join(ROOT, "dist", "focus-video");
  await mkdir(videoDir, { recursive: true });
  const { context, page } = await newPage({ seed: seedLedger({ chatCount: 0 }), width: 1440, height: 900, video: videoDir });
  await personal(page);
  await page.waitForTimeout(400);
  const chartHeight = await page.evaluate(() => document.querySelector(".chart").offsetHeight);
  await page.route("**/api/extract", async (route) => { await new Promise((resolve) => setTimeout(resolve, 700)); await route.continue(); });
  await page.click("#entry");
  await page.waitForTimeout(500);
  const clicked = await page.evaluate(() => ({ mode: document.querySelector(".workspace").dataset.mode, collapsed: Boolean(document.querySelector(".conversation.is-collapsed")), focused: document.activeElement?.id }));
  check("顺序：点击输入框只聚焦", clicked.mode === "market" && clicked.collapsed && clicked.focused === "entry", JSON.stringify(clicked));
  await page.fill("#entry", "今天读完了一章专业书。");
  await page.click(".send");
  await page.waitForTimeout(250);
  const immediate = await page.evaluate(() => ({
    mode: document.querySelector(".workspace").dataset.mode,
    userMessage: [...document.querySelectorAll(".message")].some((message) => message.textContent.includes("今天读完了一章专业书")),
    typing: Boolean(document.querySelector(".typing")),
    conversation: Boolean(document.querySelector(".conversation.is-focus")?.getBoundingClientRect().height),
    returnVisible: Boolean(document.querySelector("#view-toggle")?.getBoundingClientRect().width),
    quoteVisible: Boolean(document.querySelector("#focus-quote")?.getBoundingClientRect().width),
    change: document.querySelector("#focus-change")?.textContent ?? "",
    cardBackground: getComputedStyle(document.querySelector(".market-card")).backgroundImage,
    chartHeight: document.querySelector(".chart").offsetHeight,
    quick: Boolean(document.querySelector(".quick-actions")?.getBoundingClientRect().height),
  }));
  check("顺序：发送后直接进入专注并显示用户消息/等待", immediate.mode === "focus" && immediate.userMessage && immediate.typing && immediate.conversation && immediate.returnVisible && immediate.quoteVisible && immediate.change.endsWith("%") && immediate.cardBackground === "none" && immediate.quick && Math.abs(immediate.chartHeight - chartHeight) < 1, JSON.stringify({ chartHeight, immediate }));
  await page.waitForTimeout(1300);
  const replied = await page.evaluate(() => ({ messages: document.querySelectorAll(".message").length, typing: Boolean(document.querySelector(".typing")), transcript: document.querySelector(".messages")?.textContent ?? "" }));
  check("顺序：等待结束后对话完整保留", replied.messages >= 2 && !replied.typing && replied.transcript.includes("今天读完了一章专业书"), JSON.stringify(replied));
  const focusStyle = await page.evaluate(() => {
    const market = getComputedStyle(document.querySelector(".market"));
    const chartEl = document.querySelector(".chart");
    const chart = getComputedStyle(chartEl);
    const card = getComputedStyle(document.querySelector(".market-card"));
    const toolbar = getComputedStyle(document.querySelector(".chart-toolbar"));
    const summary = getComputedStyle(document.querySelector(".market-summary"));
    return {
      marketTransform: market.transform, marketOpacity: market.opacity, marketFilter: market.filter,
      chartTransform: chart.transform, chartOpacity: chart.opacity, chartFilter: chart.filter, chartHeight: chartEl.offsetHeight,
      cardBackground: card.backgroundImage, cardBorder: card.borderTopColor,
      toolbarOpacity: toolbar.opacity, summaryOpacity: summary.opacity,
    };
  });
  const chromeGone = focusStyle.cardBackground === "none" && (focusStyle.cardBorder === "rgba(0, 0, 0, 0)" || focusStyle.cardBorder === "transparent") && parseFloat(focusStyle.toolbarOpacity) === 0 && parseFloat(focusStyle.summaryOpacity) === 0;
  const chartOnly = focusStyle.chartTransform.includes("1.24") && parseFloat(focusStyle.chartOpacity) < 0.2 && focusStyle.chartFilter.includes("blur");
  check("顺序：专注只动画K线且卡片/工具栏退场", chartOnly && chromeGone && parseFloat(focusStyle.marketOpacity) > 0.9 && !focusStyle.marketTransform.includes("1.24") && !focusStyle.marketFilter.includes("blur"), JSON.stringify(focusStyle));
  check("顺序：专注不改变K线绘图区高度", Math.abs(focusStyle.chartHeight - chartHeight) < 1, `${chartHeight} -> ${focusStyle.chartHeight}`);
  await page.fill("#entry", "草稿保留");
  const messages = await page.locator(".message").count();
  await page.click("#view-toggle");
  await page.waitForTimeout(800);
  const returned = await page.evaluate(() => ({ mode: document.querySelector(".workspace").dataset.mode, collapsed: Boolean(document.querySelector(".conversation.is-collapsed")), draft: document.querySelector("#entry").value, messages: document.querySelectorAll(".message").length, quick: Boolean(document.querySelector(".quick-actions")), chartBackground: getComputedStyle(document.querySelector(".market-card")).backgroundImage }));
  check("顺序：返回行情收起聊天并保留历史/草稿", returned.mode === "market" && returned.collapsed && returned.draft === "草稿保留" && returned.messages === messages && !returned.quick && returned.chartBackground !== "none", JSON.stringify({ returned, messages }));
  const video = page.video();
  await context.close();
  if (video) {
    const source = await video.path();
    const dest = path.join(VIDEOS, "market-focus-sequence-raw-1440x900.webm");
    await copyFile(source, dest);
    await rm(videoDir, { recursive: true, force: true });
    check("顺序：连续视频已生成", true, dest);
  }
}

/* Pages and settings */
{
  const { context, page } = await newPage({ seed: seedLedger({ chatCount: 2 }) });
  await personal(page);
  await go(page, "goals");
  await shot(page, "03-goals.png");
  check("03 目标中心同屏未完成与已完成", (await page.locator("#active-goals .goal-card").count()) >= 2 && (await page.locator("#done-goals .goal-card").count()) >= 1, "");
  await page.click("#goal-add-open");
  await page.waitForTimeout(300);
  await shot(page, "08-goal-create.png");
  await page.click("#goal-form-cancel");
  await page.waitForTimeout(200);
  await page.locator("#active-goals .goal-card button", { hasText: "详情" }).first().click();
  await page.waitForTimeout(350);
  await shot(page, "04-goal-detail.png");
  await page.click("#drawer-close");
  await page.waitForTimeout(250);

  await go(page, "records");
  await shot(page, "05-records.png");
  check("05 成长记录按日期分组展示类型与贡献", (await page.locator(".record-row").count()) > 8 && (await page.locator(".record-type").count()) > 0, await page.locator(".record-row").count());
  await page.locator(".record-row").first().click();
  await page.waitForTimeout(300);
  await shot(page, "10-record-detail.png");
  await page.click("#drawer-close");
  await page.waitForTimeout(200);
  await page.fill("#record-keyword", "不存在的关键字");
  await page.waitForTimeout(300);
  await shot(page, "22-records-no-results.png");
  await page.click("#record-clear");
  await page.waitForTimeout(200);
  await page.click("#records-tab-week");
  await page.waitForTimeout(300);
  await shot(page, "06-weekly-review.png");
  check("06 本周复盘显示指数变化、完成/进行与贡献", (await page.locator('[data-testid="weekly-review"]').count()) === 1 && (await page.locator('[data-testid="completed-row"]').count()) >= 1 && (await page.locator('[data-testid="ongoing-row"]').count()) >= 1, "");

  await page.click("#settings-open");
  await page.waitForTimeout(300);
  await shot(page, "11-settings.png");
  check("11 设置展示本机数据与模型连接", (await page.locator("#drawer-body").textContent()).includes("本机数据") && (await page.locator("#drawer-body").textContent()).includes("模型连接"), "");
  await page.click("#drawer-close");
  await context.close();
}

/* Themes */
{
  const { context, page } = await newPage({ seed: seedLedger({ chatCount: 1 }) });
  await personal(page);
  const darkCanvas = await page.locator("#candles").evaluate((canvas) => canvas.toDataURL());
  await page.click("#settings-open");
  await page.waitForTimeout(250);
  await page.click('[data-testid="theme-light"]');
  await page.waitForTimeout(350);
  await page.click("#drawer-close");
  await page.waitForTimeout(300);
  const light = await page.evaluate(() => ({ theme: document.documentElement.dataset.peTheme, bg: getComputedStyle(document.body).backgroundColor, stored: localStorage.getItem("pe.theme.v1") }));
  const lightCanvas = await page.locator("#candles").evaluate((canvas) => canvas.toDataURL());
  check("主题：晨雾切换并重绘 Canvas", light.theme === "light" && light.stored === "light" && light.bg === "rgb(243, 243, 239)" && lightCanvas !== darkCanvas, JSON.stringify({ light, changed: lightCanvas !== darkCanvas }));
  await shot(page, "theme-light.png");
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  check("主题：刷新保留选择", (await page.evaluate(() => document.documentElement.dataset.peTheme)) === "light", await page.evaluate(() => document.documentElement.dataset.peTheme));
  await page.click("#settings-open");
  await page.waitForTimeout(200);
  await page.click('[data-testid="theme-midnight"]');
  await page.waitForTimeout(300);
  await page.click("#drawer-close");
  await page.waitForTimeout(250);
  const midnight = await page.evaluate(() => ({ theme: document.documentElement.dataset.peTheme, bg: getComputedStyle(document.body).backgroundColor }));
  check("主题：午夜蓝切换", midnight.theme === "midnight" && midnight.bg === "rgb(13, 21, 36)", JSON.stringify(midnight));
  await shot(page, "theme-midnight.png");
  await page.click("#settings-open");
  await page.click('[data-testid="theme-dark"]');
  await context.close();
}

/* Empty states */
{
  const { context, page } = await newPage();
  await personal(page);
  await shot(page, "20-market-personal-empty.png");
  check("20 个人空账本有行情空态", (await page.locator(".market-empty").isVisible()) && (await page.locator("#stat-open").textContent()) === "—", await page.locator("#stat-open").textContent());
  await go(page, "records");
  await shot(page, "21-records-empty.png");
  check("21 成长记录空态给出记录入口", (await page.locator(".record-empty").textContent()).includes("账本还没有") && (await page.locator(".record-empty button", { hasText: "记一件事" }).isVisible()), "");
  await context.close();
}

/* Core flow + continuous recording */
{
  const videoDir = path.join(ROOT, "dist", "ui-video");
  await mkdir(videoDir, { recursive: true });
  const { context, page } = await newPage({ seed: seedLedger({ chatCount: 2 }), video: videoDir });
  await personal(page);
  const before = await quote(page);
  await page.click("#entry");
  await page.waitForTimeout(300);
  await send(page, "今天读完了一章专业书。");
  check("核心流程：记录一条行为后指数变化", (await quote(page)) > before && (await state(page)).events.some((event) => event.quote.includes("读完了一章")), `${before} → ${await quote(page)}`);

  await send(page, "前阵子跑过五公里。");
  check("核心流程：模糊日期进入待确认", (await state(page)).events.some((event) => event.quote.includes("前阵子") && event.status === "pending"), "");
  await go(page, "records");
  const pendingRow = page.locator(".record-row", { hasText: "前阵子跑过五公里" }).first();
  await pendingRow.click();
  await page.waitForTimeout(300);
  await shot(page, "09-record-pending.png");
  await page.locator(".edit-form input[type=date]").first().fill("");
  await page.locator("#drawer-body button", { hasText: "按此日期确认" }).click();
  await page.waitForTimeout(250);
  check("待确认：抽屉空日期提示填写并保持 pending", (await state(page)).events.some((event) => event.quote.includes("前阵子") && event.status === "pending") && (await page.locator("#pending-error").textContent()).includes("请填写"), await page.locator("#pending-error").textContent());
  await page.locator(".edit-form input[type=date]").first().fill(day(1));
  await page.locator("#drawer-body button", { hasText: "按此日期确认" }).click();
  await page.waitForTimeout(300);
  check("待确认：抽屉拒绝未来日期并保持 pending", (await state(page)).events.some((event) => event.quote.includes("前阵子") && event.status === "pending") && (await page.locator("#pending-error").isVisible()), await page.locator("#pending-error").textContent());
  await page.click("#drawer-close");
  await page.waitForTimeout(200);
  await pendingRow.locator(".pending-editor input").fill("");
  await pendingRow.locator(".pending-editor button", { hasText: "确认" }).click();
  await page.waitForTimeout(250);
  check("待确认：行内空日期提示填写并保持 pending", (await state(page)).events.some((event) => event.quote.includes("前阵子") && event.status === "pending") && (await pendingRow.locator(".pending-error").textContent()).includes("请填写"), await pendingRow.locator(".pending-error").textContent());
  await pendingRow.locator(".pending-editor input").fill(day(1));
  await pendingRow.locator(".pending-editor button", { hasText: "确认" }).click();
  await page.waitForTimeout(250);
  check("待确认：行内拒绝未来日期并保持 pending", (await state(page)).events.some((event) => event.quote.includes("前阵子") && event.status === "pending") && (await pendingRow.locator(".pending-error").isVisible()), await pendingRow.locator(".pending-error").textContent());
  await pendingRow.locator(".pending-editor input").fill(day(-7));
  await pendingRow.locator(".pending-editor button", { hasText: "确认" }).click();
  await page.waitForTimeout(350);
  check("核心流程：记录页确认后按历史日生效", (await state(page)).events.some((event) => event.quote.includes("前阵子") && event.status === "confirmed" && event.occurredAt === day(-7)), "");

  await go(page, "goals");
  await page.click("#goal-add-open");
  await page.fill("#goal-title-input", "完成数据库课设");
  await page.fill("#goal-due-input", day(5));
  await page.click('#goal-form button[type="submit"]');
  await page.waitForTimeout(350);
  const created = (await state(page)).tasks.find((task) => task.title === "完成数据库课设");
  check("核心流程：新增目标落账", Boolean(created) && created.status === "open", created?.id);
  await page.locator("#active-goals .goal-card", { hasText: "完成数据库课设" }).locator("button", { hasText: "详情" }).click();
  await page.waitForTimeout(300);
  await page.locator(".drawer-footer button", { hasText: "完成目标" }).click();
  await page.waitForTimeout(250);
  const focusInside = await page.evaluate(() => Boolean(document.querySelector(".confirm-dialog")?.contains(document.activeElement)));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  const escaped = await page.evaluate(() => ({ open: Boolean(document.querySelector(".confirm-dialog")), drawer: Boolean(document.querySelector("#drawer")), focus: document.activeElement?.textContent?.trim() }));
  check("弹窗：焦点进入、Esc 优先取消并回到触发按钮", focusInside && !escaped.open && escaped.drawer && escaped.focus.includes("完成目标"), JSON.stringify({ focusInside, escaped }));
  await page.locator(".drawer-footer button", { hasText: "完成目标" }).click();
  await page.waitForTimeout(250);
  await shot(page, "12-goal-complete-confirm.png");
  await page.locator(".confirm-dialog button", { hasText: "确认完成" }).click();
  await page.waitForTimeout(400);
  check("核心流程：完成后出现成功反馈", (await page.locator(".goal-success").isVisible()) && (await state(page)).tasks.find((task) => task.title === "完成数据库课设").status === "done", "");
  await page.click("#drawer-close");
  await page.waitForTimeout(250);
  await shot(page, "13-goal-completed.png");

  await go(page, "records");
  await page.waitForTimeout(250);
  check("核心流程：记录页出现唯一完成事实", (await page.locator(".record-row", { hasText: "完成数据库课设" }).count()) === 1, await page.locator(".record-row", { hasText: "完成数据库课设" }).count());
  await page.click("#records-tab-week");
  await page.waitForTimeout(300);
  check("核心流程：周复盘包含完成目标与贡献", (await page.locator('[data-testid="completed-row"]', { hasText: "完成数据库课设" }).count()) === 1 && (await page.locator('[data-testid="contribution-completion"]').count()) >= 1, "");
  await page.locator('[data-testid="week-open"]').click();
  await page.waitForTimeout(300);
  check("核心流程：周 K 明细可打开", (await page.locator("#drawer-title").textContent()) === "周 K 计算明细", await page.locator("#drawer-title").textContent());
  await page.click("#drawer-close");

  await page.click("#settings-open");
  await page.waitForTimeout(250);
  check("核心流程：设置入口可用", (await page.locator("#drawer-body").textContent()).includes("导出我的 JSON"), "");
  await page.click("#drawer-close");
  await page.waitForTimeout(900);

  const video = page.video();
  await context.close();
  if (video) {
    const source = await video.path();
    const dest = path.join(VIDEOS, "core-flow-1440x900.webm");
    await copyFile(source, dest);
    await rm(videoDir, { recursive: true, force: true });
    check("连续录屏已生成", true, dest);
  }
}

await browser.close();
server.close();
await writeFile(path.join(DOCS, "acceptance.json"), JSON.stringify({ generatedAt: new Date().toISOString(), today, results, screenshots: ["01-market.png", "24-input-focus.png", "02-conversation-focus.png", "03-goals.png", "04-goal-detail.png", "05-records.png", "06-weekly-review.png", "08-goal-create.png", "09-record-pending.png", "10-record-detail.png", "11-settings.png", "12-goal-complete-confirm.png", "13-goal-completed.png", "20-market-personal-empty.png", "21-records-empty.png", "22-records-no-results.png", "theme-light.png", "theme-midnight.png"] }, null, 2));
const failed = results.filter((result) => !result.pass);
console.log(`\n${results.length - failed.length}/${results.length} UI checks passed`);
if (failed.length) process.exitCode = 1;
