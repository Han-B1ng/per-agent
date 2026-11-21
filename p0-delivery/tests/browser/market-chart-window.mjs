import { chromium } from "playwright";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createApp } from "../../server/index.mjs";
import { computeAll, shiftDate, weekStartOf } from "../../web/engine.js";

const ROOT = path.resolve(import.meta.dirname, "../..");
const DOCS = path.resolve(ROOT, "../docs/ui-handoff");
const SHOTS = path.join(DOCS, "screenshots");
const VIDEOS = path.join(DOCS, "videos");
const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass: Boolean(pass), detail: String(detail).slice(0, 500) });
  console.log(`${pass ? "PASS" : "FAIL"} ${name} :: ${detail}`);
};
const listen = (server) => new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const today = localToday();
const currentWeekStart = weekStartOf(today);

function makeRecords(count) {
  const events = [];
  for (let i = 0; i < count; i++) {
    const weekStart = shiftDate(currentWeekStart, -7 * i);
    const date = shiftDate(weekStart, 3);
    events.push({
      id: `chart_week_${i}`,
      kind: "event",
      eventType: "behavior",
      polarity: "positive",
      intensity: 1,
      occurredAt: date,
      quote: `第 ${count - i} 周记录`,
      tags: [],
      confidence: 0.9,
      status: "confirmed",
      createdAt: `${date}T08:00:00.000Z`,
      deletedAt: null,
    });
  }
  return { events, rests: [], tasks: [], chat: [] };
}

function expectedWeeks(count) {
  return computeAll(makeRecords(count), { today }).weeks;
}

const fmtDate = (value) => value.slice(5).replace("-", ".");
function rangeOf(weeks, start, end) {
  return `${fmtDate(weeks[start].weekStart)}–${fmtDate(weeks[end - 1].weekEnd)} · ${end - start} 周`;
}
function drawerRange(week) {
  return `${week.weekStart} ~ ${week.weekEnd} · 周 K`;
}

const server = await listen(createApp({ env: {} }));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
mkdirSync(SHOTS, { recursive: true });
mkdirSync(VIDEOS, { recursive: true });

async function newPage(records, { width = 1440, height = 900, theme = "dark", video = null } = {}) {
  const opts = { viewport: { width, height }, deviceScaleFactor: 1 };
  if (video) {
    mkdirSync(video, { recursive: true });
    opts.recordVideo = { dir: video, size: { width, height } };
  }
  const context = await browser.newContext(opts);
  await context.addInitScript(({ seed, themeName }) => {
    localStorage.setItem("pe.personal.v1", seed);
    localStorage.setItem("pe.theme.v1", themeName);
  }, { seed: JSON.stringify(records), themeName: theme });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && !/Failed to load resource/.test(message.text())) errors.push(message.text()); });
  page._errors = errors;
  await page.goto(base, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    const button = document.querySelector("#view-personal");
    if (button?.getAttribute("aria-pressed") !== "true") button?.click();
  });
  await page.waitForTimeout(450);
  return { context, page };
}

async function chartState(page) {
  return page.evaluate(() => ({
    range: document.querySelector(".chart-range")?.textContent.trim(),
    label: document.querySelector("#candles")?.getAttribute("aria-label"),
    olderDisabled: document.querySelector('[data-testid="chart-older"]')?.disabled,
    newerDisabled: document.querySelector('[data-testid="chart-newer"]')?.disabled,
  }));
}

async function clickCandle(page, index, count) {
  const box = await page.locator("#candles").boundingBox();
  const left = 7;
  const right = box.width - 51;
  const step = (right - left) / count;
  await page.mouse.click(box.x + left + (index + 0.5) * step, box.y + box.height * 0.55);
  await page.waitForTimeout(300);
  const sub = (await page.locator("#drawer-sub").textContent()).trim();
  await page.click("#drawer-close");
  await page.waitForTimeout(600);
  return sub;
}

async function clickDetail(page) {
  await page.click('[data-testid="chart-detail"]');
  await page.waitForTimeout(300);
  const sub = (await page.locator("#drawer-sub").textContent()).trim();
  await page.click("#drawer-close");
  await page.waitForTimeout(600);
  return sub;
}

async function setTheme(page, name) {
  await page.click("#settings-open");
  await page.waitForTimeout(200);
  await page.click(`[data-testid="theme-${name}"]`);
  await page.waitForTimeout(300);
  await page.click("#drawer-close");
  await page.waitForTimeout(700);
}

async function hoverLine(page, index, count) {
  const box = await page.locator("#candles").boundingBox();
  const left = 7;
  const right = box.width - 51;
  const step = (right - left) / count;
  const x = left + (index + 0.5) * step;
  await page.mouse.move(box.x + x, box.y + box.height * 0.55);
  await page.waitForTimeout(200);
  const sampled = await page.evaluate(({ x }) => {
    const canvas = document.querySelector("#candles");
    const rect = canvas.getBoundingClientRect();
    const ratio = canvas.width / rect.width;
    const ctx = canvas.getContext("2d");
    const token = getComputedStyle(document.documentElement).getPropertyValue("--pe-color-chart-history-selection").trim();
    const grid = getComputedStyle(document.documentElement).getPropertyValue("--pe-color-chart-grid").trim();
    const hex = (value) => {
      const raw = value.replace("#", "");
      return [parseInt(raw.slice(0, 2), 16), parseInt(raw.slice(2, 4), 16), parseInt(raw.slice(4, 6), 16)];
    };
    const target = hex(token);
    let nearest = { delta: 999, rgb: null, alpha: 0, px: 0, py: 0 };
    let matches = 0;
    for (let px = Math.floor(x * ratio) - 2; px <= Math.ceil(x * ratio) + 2; px++) {
      for (let py = Math.round(20 * ratio); py < canvas.height - Math.round(40 * ratio); py++) {
        const [r, g, b, a] = ctx.getImageData(px, py, 1, 1).data;
        if (a < 200) continue;
        const delta = Math.abs(r - target[0]) + Math.abs(g - target[1]) + Math.abs(b - target[2]);
        if (delta < nearest.delta) nearest = { delta, rgb: [r, g, b], alpha: a, px, py };
        if (delta <= 15) matches += 1;
      }
    }
    return { token, grid, ratio, nearest, matches };
  }, { x });
  return sampled;
}

/* 1 周：窗口只有一根周 K，两端都不可翻页 */
{
  const weeks = expectedWeeks(1);
  const { context, page } = await newPage(makeRecords(1));
  const state = await chartState(page);
  check("1 周：默认只展示本周", state.range === rangeOf(weeks, 0, 1) && state.olderDisabled && state.newerDisabled, JSON.stringify(state));
  check("1 周：唯一周 K 点选与明细一致", (await clickCandle(page, 0, 1)) === drawerRange(weeks[0]), drawerRange(weeks[0]));
  check("1 周：控制台无错误", page._errors.length === 0, page._errors.join(" | ") || "clean");
  await context.close();
}

/* 13 周：全部展示，两端翻页均禁用 */
{
  const weeks = expectedWeeks(13);
  const { context, page } = await newPage(makeRecords(13));
  const state = await chartState(page);
  check("13 周：全部展示且无翻页", state.range === rangeOf(weeks, 0, 13) && state.olderDisabled && state.newerDisabled, JSON.stringify(state));
  const first = await clickCandle(page, 0, 13);
  const last = await clickCandle(page, 12, 13);
  check("13 周：窗口两端点选与明细一致", first === drawerRange(weeks[0]) && last === drawerRange(weeks[12]), JSON.stringify({ first, last }));
  check("13 周：控制台无错误", page._errors.length === 0, page._errors.join(" | ") || "clean");
  await context.close();
}

/* 52 周：默认最近 20 周，前后翻页、两端点选、主题光标 */
{
  const weeks = expectedWeeks(52);
  const videoDir = path.join(ROOT, "assets/videos/market-chart-window");
  const { context, page } = await newPage(makeRecords(52), { video: videoDir });
  let state = await chartState(page);
  check("52 周：默认最近 20 周", state.range === rangeOf(weeks, 32, 52) && !state.olderDisabled && state.newerDisabled, JSON.stringify(state));
  const latestCanvas = await page.locator("#candles").evaluate((canvas) => canvas.toDataURL());
  const latestFirst = await clickCandle(page, 0, 20);
  const latestLast = await clickCandle(page, 19, 20);
  check("52 周：最新窗口两端点选与明细一致", latestFirst === drawerRange(weeks[32]) && latestLast === drawerRange(weeks[51]), JSON.stringify({ latestFirst, latestLast }));
  check("52 周：计算明细指向窗口最后一根周 K", (await clickDetail(page)) === drawerRange(weeks[51]), drawerRange(weeks[51]));

  await page.click('[data-testid="chart-older"]');
  await page.waitForTimeout(250);
  state = await chartState(page);
  const olderCanvas = await page.locator("#candles").evaluate((canvas) => canvas.toDataURL());
  check("52 周：前翻页展示更早 20 周", state.range === rangeOf(weeks, 12, 32) && !state.olderDisabled && !state.newerDisabled && olderCanvas !== latestCanvas, JSON.stringify(state));
  const olderFirst = await clickCandle(page, 0, 20);
  const olderLast = await clickCandle(page, 19, 20);
  check("52 周：更早窗口两端点选与明细一致", olderFirst === drawerRange(weeks[12]) && olderLast === drawerRange(weeks[31]), JSON.stringify({ olderFirst, olderLast }));

  await page.click('[data-testid="chart-older"]');
  await page.waitForTimeout(250);
  state = await chartState(page);
  check("52 周：最早窗口到达左边界", state.range === rangeOf(weeks, 0, 20) && state.olderDisabled && !state.newerDisabled, JSON.stringify(state));
  const oldestFirst = await clickCandle(page, 0, 20);
  const oldestLast = await clickCandle(page, 19, 20);
  check("52 周：最早窗口两端点选与明细一致", oldestFirst === drawerRange(weeks[0]) && oldestLast === drawerRange(weeks[19]), JSON.stringify({ oldestFirst, oldestLast }));

  await page.click('[data-testid="chart-newer"]');
  await page.waitForTimeout(250);
  check("52 周：后翻页对称返回上一窗口", (await chartState(page)).range === rangeOf(weeks, 12, 32), (await chartState(page)).range);
  await page.click('[data-testid="chart-newer"]');
  await page.waitForTimeout(250);
  check("52 周：后翻页回到最新窗口", (await chartState(page)).range === rangeOf(weeks, 32, 52), (await chartState(page)).range);

  const darkHover = await hoverLine(page, 10, 20);
  await page.screenshot({ path: path.join(SHOTS, "market-chart-window-dark.png") });
  check("深色：悬停竖线使用主题 token 并可辨识", darkHover.matches > 20 && darkHover.nearest.delta <= 15 && darkHover.token !== darkHover.grid, JSON.stringify(darkHover));
  await setTheme(page, "light");
  const lightState = await chartState(page);
  const lightHover = await hoverLine(page, 10, 20);
  await page.screenshot({ path: path.join(SHOTS, "market-chart-window-light.png") });
  check("晨雾：切换主题后保留窗口", lightState.range === rangeOf(weeks, 32, 52), JSON.stringify(lightState));
  check("晨雾：悬停竖线随主题更新且区别于网格", lightHover.matches > 20 && lightHover.nearest.delta <= 15 && lightHover.token !== darkHover.token && lightHover.token !== lightHover.grid, JSON.stringify(lightHover));
  check("52 周：控制台无错误", page._errors.length === 0, page._errors.join(" | ") || "clean");

  const video = page.video();
  await context.close();
  if (video) renameSync(await video.path(), path.join(VIDEOS, "market-chart-window-1440x900.webm"));
}

/* 390px：工具栏与图表不横向溢出 */
{
  const { context, page } = await newPage(makeRecords(52), { width: 390, height: 844 });
  const mobile = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    viewport: innerWidth,
    toolbar: document.querySelector(".chart-toolbar")?.getBoundingClientRect().toJSON(),
    olderVisible: Boolean(document.querySelector('[data-testid="chart-older"]')?.getBoundingClientRect().width),
    newerVisible: Boolean(document.querySelector('[data-testid="chart-newer"]')?.getBoundingClientRect().width),
  }));
  check("390px：图表工具栏不横向溢出", mobile.scrollWidth <= mobile.viewport && mobile.olderVisible && mobile.newerVisible, JSON.stringify(mobile));
  await page.click('[data-testid="chart-older"]');
  await page.waitForTimeout(250);
  check("390px：可翻页到更早窗口", (await chartState(page)).range === rangeOf(expectedWeeks(52), 12, 32), (await chartState(page)).range);
  await context.close();
}

await browser.close();
await new Promise((resolve) => server.close(resolve));
writeFileSync(path.join(ROOT, "assets/market-chart-window-results.json"), JSON.stringify(results, null, 2));
const failed = results.filter((result) => !result.pass);
console.log(`\n${results.length - failed.length}/${results.length} chart window checks passed`);
process.exit(failed.length ? 1 : 0);