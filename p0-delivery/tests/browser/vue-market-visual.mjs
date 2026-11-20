import { chromium } from "playwright";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createApp } from "../../server/index.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass: !!pass, detail: String(detail).slice(0, 400) });
  console.log(`${pass ? "PASS" : "FAIL"} ${name} :: ${detail}`);
};
const listen = (s) => new Promise((r) => s.listen(0, "127.0.0.1", () => r(s)));
const app = await listen(createApp({ env: {} }));
const B = `http://127.0.0.1:${app.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.PE_CHANNEL ? { channel: process.env.PE_CHANNEL } : {}) });
const shot = (page, name) => page.screenshot({ path: path.join(ROOT, `assets/screenshots/${name}.png`) });
const send = async (page, text, wait = 800) => { await page.fill("#entry", text); await page.press("#entry", "Enter"); await page.waitForTimeout(wait); };
const mode = (page) => page.evaluate(() => document.querySelector(".workspace").dataset.mode);

async function newPage({ width, height, scale = 1, seed = null, video = null }) {
  const opts = { viewport: { width, height }, deviceScaleFactor: scale };
  if (video) { mkdirSync(video, { recursive: true }); opts.recordVideo = { dir: video, size: { width, height } }; }
  const context = await browser.newContext(opts);
  if (seed) await context.addInitScript((s) => localStorage.setItem("pe.personal.v1", JSON.stringify(s)), seed);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page._errors = errors;
  await page.goto(B, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  return { context, page };
}
async function closeVideo(context, page, dest) {
  const video = page.video();
  await context.close();
  if (video && dest) renameSync(await video.path(), dest);
}

for (const [width, height, scale] of [[1440, 900, 2], [1440, 720, 1], [390, 844, 2]]) {
  const tag = `${width}x${height}`;
  const { context, page } = await newPage({ width, height, scale, video: path.join(ROOT, `assets/videos/vue-market-${tag}`) });
  await shot(page, `vue-market-${tag}-idle`);
  const header = await page.evaluate(() => {
    const bar = document.querySelector(".topbar").getBoundingClientRect();
    const title = document.querySelector("#page-title").getBoundingClientRect();
    return { barTop: bar.top, barBottom: bar.bottom, titleTop: title.top, titleBottom: title.bottom, font: getComputedStyle(document.querySelector("#page-title")).fontSize };
  });
  check(`视觉[${tag}] 页头标题完整不裁切`, header.titleTop >= header.barTop && header.titleBottom <= header.barBottom && header.titleTop >= 0 && header.font === "15px", JSON.stringify(header));
  await page.locator(".topbar").screenshot({ path: path.join(ROOT, `assets/screenshots/vue-header-${tag}.png`) });
  const dpr = await page.evaluate(() => { const c = document.querySelector("#candles"); const r = c.getBoundingClientRect(); return { ratio: window.devicePixelRatio, width: c.width, css: Math.round(r.width), weeks: document.querySelector("#data-tag").textContent }; });
  check(`视觉[${tag}] 空闲首屏与高DPR画布`, dpr.width >= dpr.css * dpr.ratio - 2, JSON.stringify(dpr));
  const before = await page.evaluate(() => { const r = document.querySelector(".market").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  await page.click("#entry");
  await page.waitForTimeout(350);
  const after = await page.evaluate(() => { const r = document.querySelector(".market").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, mode: document.querySelector(".workspace").dataset.mode }; });
  check(`视觉[${tag}] 首次聚焦图表不动`, before.x === after.x && before.y === after.y && before.w === after.w && before.h === after.h && after.mode === "market", JSON.stringify(after));
  const clickOnly = await page.evaluate(() => ({ collapsed: Boolean(document.querySelector(".conversation.is-collapsed")), focused: document.activeElement?.id }));
  check(`视觉[${tag}] 点击输入框只聚焦不展开聊天`, clickOnly.collapsed && clickOnly.focused === "entry", JSON.stringify(clickOnly));
  await shot(page, `vue-market-${tag}-input-focus`);
  await send(page, "今天跑了五公里。");
  await shot(page, `vue-market-${tag}-messages`);
  check(`视觉[${tag}] 短消息后最新回复可读`, (await page.locator(".message").count()) >= 2, await page.locator(".message").count());
  if (width > 760) {
    await page.setViewportSize({ width: width - 320, height: height - 120 });
    await page.waitForTimeout(450);
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(450);
  } else {
    await page.setViewportSize({ width, height: 620 });
    await page.waitForTimeout(450);
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(450);
  }
  if (await page.locator("#view-toggle").isVisible()) { await page.click("#view-toggle"); await page.waitForTimeout(900); }
  for (let i = 0; i < 3 && (await mode(page)) !== "focus"; i++) await send(page, "长消息换行验证。".repeat(180), 900);
  const focusState = await page.evaluate(() => ({ mode: document.querySelector(".workspace").dataset.mode, scrollable: document.querySelector(".message-scroll").scrollHeight > document.querySelector(".message-scroll").clientHeight, composerBottom: document.querySelector(".composer").getBoundingClientRect().bottom, vh: innerHeight, transform: getComputedStyle(document.querySelector(".market")).transform, opacity: getComputedStyle(document.querySelector(".market")).opacity }));
  check(`视觉[${tag}] 实际溢出进入专注且输入框不跳动`, focusState.mode === "focus" && focusState.scrollable && focusState.composerBottom <= focusState.vh && focusState.transform.includes("1.24"), JSON.stringify(focusState));
  await shot(page, `vue-market-${tag}-focus`);
  if (await page.locator("#view-toggle").isVisible()) { await page.click("#view-toggle"); await page.waitForTimeout(900); }
  check(`视觉[${tag}] 返回行情保留消息`, (await mode(page)) === "market" && (await page.locator(".message").count()) >= 2, await mode(page));
  await shot(page, `vue-market-${tag}-returned`);
  check(`视觉[${tag}] 控制台无错误`, page._errors.length === 0, page._errors.join("|") || "clean");
  await closeVideo(context, page, path.join(ROOT, `assets/videos/vue-market-${tag}.webm`));
}

{
  const today = new Date().toISOString().slice(0, 10);
  const seed = { events: [], rests: [], tasks: [{ id: "single_task", kind: "task", title: "本周目标", dueAt: today, position: 3, status: "open", createdAt: `${today}T08:00:00.000Z`, doneAt: null, deletedAt: null }], chat: [] };
  const { context, page } = await newPage({ width: 1440, height: 900, seed });
  await page.click("#view-personal");
  await page.waitForTimeout(400);
  const single = await page.evaluate(() => ({ note: document.querySelector(".single-week-note")?.textContent ?? "", weeks: document.querySelectorAll("#candles").length }));
  check("视觉 单根周K提示", single.note.includes("目前只有本周记录"), JSON.stringify(single));
  await shot(page, "vue-market-single-week");
  await context.close();
}

await browser.close();
app.close();
writeFileSync(path.join(ROOT, "assets/vue-visual-results.json"), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} visual checks passed`);
process.exit(failed.length ? 1 : 0);
