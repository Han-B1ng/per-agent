// P0 验收 harness：双视口连续录屏 + 核心闭环 + 涨跌停/同日上限/复算/撤销 + 降级 + model-stub + 休息确认。
// 自包含：自托管 P0 服务与 stub 上游，仅需测试依赖（playwright + 浏览器），无需外部 npm start。
// 证据输出：assets/videos/p0-*.webm、assets/screenshots/p0-*.png、assets/acceptance-results.json
import { chromium } from "playwright";
import http from "node:http";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createApp } from "../../server/index.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
let B = process.env.PE_BASE_URL || ""; // 可选：指向外部已启动服务；默认自托管
let mainApp = null;
const results = [];
function check(name, pass, detail) {
  results.push({ name, pass: !!pass, detail: String(detail).slice(0, 400) });
  console.log(`${pass ? "PASS" : "FAIL"} ${name} :: ${detail}`);
}
const shot = (page, n) => page.screenshot({ path: path.join(ROOT, `assets/screenshots/p0-${n}.png`) });
const quote = (page) => page.textContent("#quote-value").then((t) => parseFloat(t.replace(/,/g, "")));
const listen = (s) => new Promise((r) => s.listen(0, "127.0.0.1", () => r(s)));
const base = (s) => `http://127.0.0.1:${s.address().port}`;

async function newPage(browser, { width = 1440, height = 900, video = null, seed = null, url = B } = {}) {
  const opts = { viewport: { width, height } };
  if (video) { mkdirSync(video, { recursive: true }); opts.recordVideo = { dir: video, size: { width, height } }; }
  const context = await browser.newContext(opts);
  if (seed) await context.addInitScript((s) => localStorage.setItem("pe.personal.v1", s), seed);
  const page = await context.newPage();
  const errs = [];
  const net = [];
  page.on("pageerror", (e) => errs.push("pageerror " + e.message));
  page.on("console", (m) => {
    const u = (m.location() || {}).url || "";
    if (m.type() !== "error" || u.includes("favicon")) return;
    if (/Failed to load resource/.test(m.text())) net.push(m.text());
    else errs.push(m.text());
  });
  page.on("requestfailed", (r) => { if (!r.url().includes("favicon")) net.push("requestfailed " + r.url()); });
  page._errs = errs;
  page._net = net;
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  return { context, page };
}
async function closeVideo(context, page, dest) {
  const v = page.video();
  await context.close();
  if (v && dest) renameSync(await v.path(), dest);
}
const send = async (page, text) => { await page.fill("#entry", text); await page.press("#entry", "Enter"); await page.waitForTimeout(900); };
const marketState = (page) => page.evaluate(() => {
  const cs = getComputedStyle(document.querySelector(".market"));
  const r = document.querySelector(".market").getBoundingClientRect();
  return { mode: document.querySelector(".workspace").dataset.mode, transform: cs.transform, opacity: cs.opacity, filter: cs.filter, w: r.width, h: r.height, x: r.x, y: r.y };
});
const openLastCandle = async (page) => {
  // focus 模式下行情为背景（不可点），先返回行情
  if ((await marketState(page)).mode === "focus") { await page.click("#view-toggle"); await page.waitForTimeout(900); }
  const b = await page.locator("#candles").boundingBox();
  await page.mouse.click(b.x + b.width - 60, b.y + b.height / 2);
  await page.waitForTimeout(600);
};

if (!B) { mainApp = await listen(createApp({ env: {} })); B = base(mainApp); }
const browser = await chromium.launch({ headless: true, ...(process.env.PE_CHANNEL ? { channel: process.env.PE_CHANNEL } : {}) });

/* ===== A. 桌面交互（双视口连续录屏）===== */
for (const [w, h] of [[1440, 900], [1440, 720]]) {
  const tag = `${w}x${h}`;
  const { context, page } = await newPage(browser, { width: w, height: h, video: path.join(ROOT, `assets/videos/p0-interact-${tag}`) });
  const s0 = await marketState(page);
  check(`A[${tag}] 首屏样例`, s0.mode === "market" && (await page.textContent("#data-tag")).includes("样例"), await page.textContent("#quote-value"));
  await page.click("#entry"); await page.waitForTimeout(900);
  const s1 = await marketState(page);
  check(`A[${tag}] 首次点输入框K线不动`, s1.transform === s0.transform && s1.w === s0.w && s1.h === s0.h && s1.x === s0.x && s1.y === s0.y, JSON.stringify(s1));
  await send(page, "今天跑了五公里。");
  check(`A[${tag}] 单条消息未溢出仍market`, (await marketState(page)).mode === "market", "");
  for (const t of ["今天完成了数据库课设。", "今天有点累，想休息一天。", "晚上和室友吃了火锅。", "回宿舍收尾了作业。", "睡前看了半小时书。", "早上小跑到教室。", "课间问懂了上次的问题。", "下午又跑了三公里。"]) await send(page, t);
  const s2 = await marketState(page);
  check(`A[${tag}] 溢出后focus放大渐隐`, s2.mode === "focus" && s2.transform.includes("1.24") && parseFloat(s2.opacity) < 0.2 && s2.filter.includes("blur"), `${s2.transform} ${s2.opacity} ${s2.filter}`);
  const sc = await page.evaluate(() => {
    const s = document.querySelector(".message-scroll"); const c = document.querySelector(".composer").getBoundingClientRect();
    return { scrollable: s.scrollHeight > s.clientHeight, atBottom: s.scrollTop + s.clientHeight >= s.scrollHeight - 2, cb: c.bottom, vh: innerHeight };
  });
  check(`A[${tag}] 消息独立滚动+输入框留底部`, sc.scrollable && sc.atBottom && sc.cb <= sc.vh, JSON.stringify(sc));
  await shot(page, `interact-${tag}-focus`);
  await page.evaluate(() => { document.querySelector(".message-scroll").scrollTop = 0; }); await page.waitForTimeout(300);
  await shot(page, `interact-${tag}-scrollback`);
  await page.click("#view-toggle"); await page.waitForTimeout(1000);
  check(`A[${tag}] 返回行情恢复`, (await marketState(page)).mode === "market", "");
  await page.keyboard.press("Escape"); await page.waitForTimeout(300);
  check(`A[${tag}] 控制台0报错`, page._errs.length === 0 && page._net.length === 0, [...page._errs, ...page._net].join("|") || "clean");
  await closeVideo(context, page, path.join(ROOT, `assets/videos/p0-interact-${tag}.webm`));
}

/* ===== B. 核心闭环（Mock）：情绪/行为分离 + pending 追问 + 确认只一次 + 撤销 + 刷新 ===== */
{
  const { context, page } = await newPage(browser, { video: path.join(ROOT, "assets/videos/p0-core") });
  await send(page, "今天有点焦虑，但还是去跑了五公里。");
  const q1 = await quote(page);
  check("B 行为计分情绪不计分 → 1010", Math.abs(q1 - 1010) < 0.05, q1);
  await openLastCandle(page);
  const lines = await page.evaluate(() => [...document.querySelectorAll(".line-row")].map((r) => ({ lab: r.querySelector(".lab").textContent, contrib: r.querySelector(".contrib").textContent })));
  check("B 明细含行为+1%与情绪0%", lines.some((l) => l.contrib === "+1.00%") && lines.some((l) => l.contrib === "0.00%" && l.lab.includes("情绪")), JSON.stringify(lines));
  await shot(page, "core-detail");
  await page.click("#drawer-close"); await page.waitForTimeout(500);
  await send(page, "前阵子跑过一次五公里");
  const q2 = await quote(page);
  const hasCard = await page.evaluate(() => !!document.querySelector(".msg-card .card-btn.primary"));
  check("B 模糊过去→pending追问且不计分", Math.abs(q2 - 1010) < 0.05 && hasCard, `quote=${q2} card=${hasCard}`);
  await shot(page, "core-pending");
  await page.click(".msg-card .card-btn.primary"); await page.waitForTimeout(700);
  const q3 = await quote(page);
  check("B 确认后计一次 → 1020.0(同日raw相加)", Math.abs(q3 - 1020.0) < 0.05, q3);
  const cardGone = await page.evaluate(() => !document.querySelector(".msg-card .card-btn.primary"));
  check("B 确认后卡片消失(不重复应用)", cardGone, "");
  await openLastCandle(page);
  const before = await page.evaluate(() => document.querySelector(".week-ohlc div:last-child dd").textContent);
  await page.click(".line-row .mini-btn.danger"); await page.waitForTimeout(600);
  const after = await page.evaluate(() => document.querySelector(".week-ohlc div:last-child dd").textContent);
  const q4 = await quote(page);
  check("B 撤销后图表+明细一起更新", before !== after && Math.abs(q4 - 1010) < 0.05, `before=${before} after=${after} quote=${q4}`);
  await shot(page, "core-undo");
  await page.click("#drawer-close"); await page.waitForTimeout(400);
  await page.reload({ waitUntil: "networkidle" }); await page.waitForTimeout(500);
  await page.click("#view-personal"); await page.waitForTimeout(400);
  const q5 = await quote(page);
  const msgs = await page.evaluate(() => document.querySelectorAll(".message").length);
  check("B 刷新后记录/确认态/指数一致", Math.abs(q5 - 1010) < 0.05 && msgs >= 4, `quote=${q5} msgs=${msgs}`);
  check("B 控制台0报错", page._errs.length === 0 && page._net.length === 0, [...page._errs, ...page._net].join("|") || "clean");
  await closeVideo(context, page, path.join(ROOT, "assets/videos/p0-core.webm"));
}

/* ===== C. 涨跌停 + 同日上限 + 复算确定（种子数据）===== */
{
  const today = await page0Today();
  const evs = [];
  for (let i = 0; i < 9; i++) evs.push({ id: "seed_e" + i, kind: "event", eventType: "behavior", polarity: "positive", intensity: 5, occurredAt: today, quote: "完成大事" + i, tags: [], confidence: 0.95, status: "confirmed", createdAt: `${today}T12:${String(i).padStart(2, "0")}:00.000Z`, deletedAt: null });
  evs.push({ id: "seed_emo", kind: "event", eventType: "emotion", polarity: "neutral", intensity: 2, occurredAt: today, quote: "有点激动", tags: [], confidence: 0.9, status: "confirmed", createdAt: `${today}T12:09:00.000Z`, deletedAt: null });
  const seed = JSON.stringify({ events: evs, rests: [], tasks: [], chat: [] });
  const { context, page } = await newPage(browser, { seed });
  await page.click("#view-personal"); await page.waitForTimeout(400);
  const q = await quote(page);
  check("C 涨停 clamp +6% → 1060", Math.abs(q - 1060) < 0.05, q);
  await openLastCandle(page);
  const segs = await page.evaluate(() => [...document.querySelectorAll(".day-block .three-stage")].pop().querySelectorAll(".seg").length ? [...[...document.querySelectorAll(".day-block .three-stage")].pop().querySelectorAll(".seg")].map((s) => s.textContent) : []);
  check("C 三段式 原始+24% 调整-18% 实际+6%", segs.some((s) => s.includes("+24.00%")) && segs.some((s) => s.includes("-18.00%")) && segs.some((s) => s.includes("+6.00%")), JSON.stringify(segs));
  const capNote = await page.evaluate(() => [...document.querySelectorAll(".line-row .note")].some((n) => n.textContent.includes("超出当日上限")));
  const zeroCount = await page.evaluate(() => [...document.querySelectorAll(".line-row .contrib.zero")].length);
  check("C 第9条超上限贡献0 + 情绪不占名额", capNote && zeroCount >= 2, `capNote=${capNote} zero=${zeroCount}`);
  await shot(page, "limit-up");
  const close1 = await page.evaluate(() => document.querySelector(".week-ohlc div:last-child dd").textContent);
  await page.reload({ waitUntil: "networkidle" }); await page.waitForTimeout(400);
  await page.click("#view-personal"); await page.waitForTimeout(300);
  await openLastCandle(page);
  const close2 = await page.evaluate(() => document.querySelector(".week-ohlc div:last-child dd").textContent);
  check("C 刷新复算同周收盘", close1 === close2, `${close1} == ${close2}`);
  // 撤销一条计分事件 → raw 降 3%，明细与图同步
  await page.click(".line-row .mini-btn.danger"); await page.waitForTimeout(500);
  const capGone = await page.evaluate(() => ![...document.querySelectorAll(".line-row .note")].some((n) => n.textContent.includes("超出当日上限")));
  check("C 撤销1条后上限空缺被补满(超上限标记消失)", capGone, "");
  await page.click(".line-row .mini-btn.danger"); await page.waitForTimeout(500);
  const segs2 = await page.evaluate(() => [...[...document.querySelectorAll(".day-block .three-stage")].pop().querySelectorAll(".seg")].map((s) => s.textContent));
  check("C 再撤销1条原始收益降为21%", segs2.some((s) => s.includes("+21.00%")), JSON.stringify(segs2));
  check("C 控制台0报错", page._errs.length === 0 && page._net.length === 0, [...page._errs, ...page._net].join("|") || "clean");
  await context.close();
}
async function page0Today() {
  const { context, page } = await newPage(browser, {});
  const t = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; });
  await context.close();
  return t;
}
async function page0Shift(n) {
  const t = await page0Today();
  const [y, m, d] = t.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/* ===== D. 降级：model 额度耗尽 → 失败不录入 + 样例仍可用 + 本地识别重试 ===== */
{
  const quotaStub = await listen(http.createServer((req, res) => { res.writeHead(429, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: { message: "insufficient quota" } })); }));
  const app = await listen(createApp({ env: { MODEL_API_KEY: "k", MODEL_BASE_URL: base(quotaStub) } }));
  const { context, page } = await newPage(browser, { url: base(app), video: path.join(ROOT, "assets/videos/p0-degrade") });
  check("D health=model", (await page.textContent("#model-status-text")).includes("模型"), await page.textContent("#model-status-text"));
  await send(page, "今天跑了五公里");
  const failedTag = await page.evaluate(() => !!document.querySelector(".msg-card.failed .fail-tag"));
  const q = await quote(page);
  check("D 额度耗尽→未录入且指数不变", failedTag && Math.abs(q - 1000) < 0.05, `tag=${failedTag} quote=${q}`);
  await shot(page, "degrade-failed");
  await page.click("#view-sample"); await page.waitForTimeout(400);
  const qs = await quote(page);
  check("D 降级后样例仍可查看", qs > 1050, qs);
  await page.click("#view-personal"); await page.waitForTimeout(300);
  await page.click(".msg-card.failed .card-btn.ghost"); await page.waitForTimeout(900);
  const q2 = await quote(page);
  check("D 改用本地识别重试成功录入", Math.abs(q2 - 1010) < 0.05, q2);
  await shot(page, "degrade-retry");
  check("D 控制台0报错", page._errs.length === 0, page._errs.join("|") || "clean");
  await closeVideo(context, page, path.join(ROOT, "assets/videos/p0-degrade.webm"));
  app.close(); quotaStub.close();
}

/* ===== E. model 路径（本地 stub 上游，非真实供应商）结构化返回 ===== */
{
  const today = await page0Today();
  const stub = await listen(http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ reply: "焦虑还愿意出门跑，记下了今天的跑步。", items: [ { op: "add_event", event: { eventType: "emotion", polarity: "neutral", intensity: 2, occurredAt: today, quote: "今天有点焦虑", tags: [], confidence: 0.9 } }, { op: "add_event", event: { eventType: "behavior", polarity: "positive", intensity: 3, occurredAt: today, quote: "去跑了五公里", tags: [], confidence: 0.95 } } ] }) } }] }));
  }));
  const app = await listen(createApp({ env: { MODEL_API_KEY: "k", MODEL_BASE_URL: base(stub), MODEL_NAME: "stub-upstream" } }));
  const { context, page } = await newPage(browser, { url: base(app) });
  check("E health=model(stub)", (await page.textContent("#model-status-text")).includes("模型在线"), await page.textContent("#model-status-text"));
  await send(page, "今天有点焦虑，但还是去跑了五公里");
  const q = await quote(page);
  check("E model路径结构化记录计分→1010", Math.abs(q - 1010) < 0.05, q);
  await openLastCandle(page);
  const n = await page.evaluate(() => document.querySelectorAll(".line-row").length);
  check("E model路径明细2行(情绪+行为)", n === 2, n);
  await shot(page, "model-stub");
  check("E 控制台0报错", page._errs.length === 0 && page._net.length === 0, [...page._errs, ...page._net].join("|") || "clean");
  await context.close(); app.close(); stub.close();
}

/* ===== F. 返工③：低置信度休息标记 追问/确认/否认 + 刷新一致（stub 上游）===== */
{
  const today = await page0Today();
  const restDate = await page0Shift(-2);
  const mkStub = () => listen(http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ reply: "是想标记哪一天休息？确认后我才记入停牌恢复。", items: [{ op: "add_rest", rest: { date: restDate, quote: "想休息一天", confidence: 0.4 } }] }) } }] }));
  }));
  // F1 确认路径
  let stub = await mkStub();
  let app = await listen(createApp({ env: { MODEL_API_KEY: "k", MODEL_BASE_URL: base(stub) } }));
  let { context, page } = await newPage(browser, { url: base(app) });
  await send(page, "今天有点累，想休息一天");
  const qPending = await quote(page);
  const cardTxt = await page.evaluate(() => document.querySelector(".msg-card .card-btn.primary")?.textContent || "");
  check("F 低置信休息→pending追问且无停牌增益", Math.abs(qPending - 1000) < 0.05 && cardTxt.includes("休息"), `quote=${qPending} btn=${cardTxt}`);
  await shot(page, "rest-pending");
  await page.click(".msg-card .card-btn.primary"); await page.waitForTimeout(700);
  const qConf = await quote(page);
  check("F 确认后按确认日期停牌生效一次→1001.5", Math.abs(qConf - 1001.5) < 0.05, qConf);
  await shot(page, "rest-confirm");
  await page.reload({ waitUntil: "networkidle" }); await page.waitForTimeout(400);
  await page.click("#view-personal"); await page.waitForTimeout(300);
  check("F 确认后刷新状态一致", Math.abs((await quote(page)) - 1001.5) < 0.05, await quote(page));
  check("F1 控制台0报错", page._errs.length === 0 && page._net.length === 0, [...page._errs, ...page._net].join("|") || "clean");
  await context.close(); app.close(); stub.close();
  // F2 否认路径
  stub = await mkStub();
  app = await listen(createApp({ env: { MODEL_API_KEY: "k", MODEL_BASE_URL: base(stub) } }));
  ({ context, page } = await newPage(browser, { url: base(app) }));
  await send(page, "今天有点累，想休息一天");
  await page.click(".msg-card .card-btn.ghost"); await page.waitForTimeout(700);
  const qDeny = await quote(page);
  const gone = await page.evaluate(() => !document.querySelector(".msg-card .card-btn.primary"));
  check("F 否认后退出待确认且指数不变", Math.abs(qDeny - 1000) < 0.05 && gone, `quote=${qDeny} gone=${gone}`);
  await page.reload({ waitUntil: "networkidle" }); await page.waitForTimeout(400);
  await page.click("#view-personal"); await page.waitForTimeout(300);
  check("F 否认后刷新状态一致", Math.abs((await quote(page)) - 1000) < 0.05, await quote(page));
  check("F2 控制台0报错", page._errs.length === 0 && page._net.length === 0, [...page._errs, ...page._net].join("|") || "clean");
  await context.close(); app.close(); stub.close();
}

/* ===== G. 返工① UI：历史 pending 事件不提前改指数；确认/否认后正确 ===== */
{
  const old = await page0Shift(-7);
  const eid = "g_evt_1";
  const seedBase = { events: [{ id: eid, kind: "event", eventType: "behavior", polarity: "positive", intensity: 3, occurredAt: old, quote: "前阵子跑了五公里", tags: [], confidence: 0.4, status: "pending", createdAt: `${old}T12:00:00.000Z`, deletedAt: null }], rests: [], tasks: [], chat: [{ id: "g_msg", role: "assistant", text: "这是哪天跑的？", pending: [eid] }] };
  let { context, page } = await newPage(browser, { seed: JSON.stringify(seedBase) });
  await page.click("#view-personal"); await page.waitForTimeout(400);
  const q0 = await quote(page);
  check("G 历史pending加入后指数仍1000", Math.abs(q0 - 1000) < 0.05, q0);
  await page.click(".msg-card .card-btn.primary"); await page.waitForTimeout(600);
  const q1 = await quote(page);
  check("G 确认后按7天前重算(≈1005.97)", Math.abs(q1 - 1005.97) < 0.05, q1);
  await context.close();
  ({ context, page } = await newPage(browser, { seed: JSON.stringify(seedBase) }));
  await page.click("#view-personal"); await page.waitForTimeout(400);
  await page.click(".msg-card .card-btn.ghost"); await page.waitForTimeout(600);
  check("G 否认后指数仍1000", Math.abs((await quote(page)) - 1000) < 0.05, await quote(page));
  check("G 控制台0报错", page._errs.length === 0 && page._net.length === 0, [...page._errs, ...page._net].join("|") || "clean");
  await context.close();
}

/* ===== H. 返工② UI：完成逾期任务后历史扣分保留、增益只一次 ===== */
{
  const due = await page0Shift(-2);
  const seed = JSON.stringify({ events: [], rests: [], tasks: [{ id: "h_task", kind: "task", title: "逾期任务", dueAt: due, position: 3, status: "open", createdAt: `${due}T09:00:00.000Z`, doneAt: null, deletedAt: null }], chat: [] });
  const { context, page } = await newPage(browser, { seed });
  await page.click("#view-personal"); await page.waitForTimeout(400);
  const readDays = () => page.evaluate(() => [...document.querySelectorAll(".day-block")].map((b) => ({ date: b.querySelector(".d").textContent, close: b.querySelector(".c").textContent })));
  await openLastCandle(page);
  const before = await readDays();
  await page.click("#tab-tasks"); await page.waitForTimeout(300);
  await page.click(".task-row .card-btn"); await page.waitForTimeout(500); // 标记完成
  await page.click("#tab-detail"); await page.waitForTimeout(300);
  const after = await readDays();
  const hist = [await page0Shift(-1)];
  const preserved = hist.every((d) => { const b = before.find((x) => x.date === d); const a = after.find((x) => x.date === d); return b && a && b.close === a.close; });
  check("H 完成后历史逾期收盘保留", preserved, JSON.stringify({ before, after }));
  const compCount = await page.evaluate(() => [...document.querySelectorAll(".line-row .lab")].filter((l) => l.textContent === "完成任务").length);
  check("H 完成增益只计一次", compCount === 1, compCount);
  await shot(page, "overdue-done");
  check("H 控制台0报错", page._errs.length === 0 && page._net.length === 0, [...page._errs, ...page._net].join("|") || "clean");
  await context.close();
}

await browser.close();
if (mainApp) mainApp.close();
writeFileSync(path.join(ROOT, "assets/acceptance-results.json"), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);