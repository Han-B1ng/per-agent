import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const screenshots = path.join(root, "assets", "screenshots");
const resultsPath = path.join(root, "assets", "weekly-review-acceptance.json");
const today = "2026-11-19";
const currentWeek = "2026-11-16";
const previousWeek = "2026-11-09";

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail: String(detail) });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForServer(base) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(`${base}/`);
      if (response.ok) return;
    } catch {
      // vite 还在启动
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("vite dev server did not start");
}

async function settle(page) {
  await page.locator('[data-testid="weekly-review"]').waitFor();
  await page.evaluate(() => document.fonts.ready);
}

const port = await freePort();
const base = `http://127.0.0.1:${port}`;
const vite = spawn(
  process.execPath,
  [path.join(root, "node_modules", "vite", "bin", "vite.js"), "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
);
let viteLog = "";
vite.stdout.on("data", (chunk) => { viteLog += chunk; });
vite.stderr.on("data", (chunk) => { viteLog += chunk; });

let browser;
try {
  await waitForServer(base);
  await mkdir(screenshots, { recursive: true });
  browser = await chromium.launch();

  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await desktop.newPage();
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(String(error)));

  await page.goto(`${base}/?scene=data&today=${today}`, { waitUntil: "networkidle" });
  await settle(page);

  const rootNode = page.locator('[data-testid="weekly-review"]');
  check("数据预览挂载在 2026-11-16 周", (await rootNode.getAttribute("data-week-key")) === currentWeek, await rootNode.getAttribute("data-week-key"));
  const indexBox = await page.locator('[data-testid="index-card"]').boundingBox();
  const completedBox = await page.locator('[data-testid="completed-section"]').boundingBox();
  const ongoingBox = await page.locator('[data-testid="ongoing-section"]').boundingBox();
  check(
    "首屏顺序为指数变化 → 本周已完成 → 仍在进行",
    Boolean(indexBox && completedBox && ongoingBox && indexBox.y < completedBox.y && completedBox.y < ongoingBox.y),
    `${indexBox?.y} / ${completedBox?.y} / ${ongoingBox?.y}`,
  );

  const openText = await page.locator('[data-testid="index-open"]').innerText();
  const closeText = await page.locator('[data-testid="index-close"]').innerText();
  const changeText = await page.locator('[data-testid="index-change"]').innerText();
  check("指数卡显示周开盘、当前点位和涨跌幅", /^[\d,]+\.\d{2}$/.test(openText.trim()) && /^[\d,]+\.\d{2}$/.test(closeText.trim()) && /[+-]?\d+\.\d{2}%/.test(changeText), `${openText} / ${closeText} / ${changeText}`);

  const completedRows = page.locator('[data-testid="completed-row"]');
  const ongoingRows = page.locator('[data-testid="ongoing-row"]');
  check("本周完成与仍在进行两组同时显示", (await completedRows.count()) === 1 && (await ongoingRows.count()) === 3, `completed=${await completedRows.count()} ongoing=${await ongoingRows.count()}`);
  check("已完成包含本周完成的目标", (await completedRows.first().innerText()).includes("完成数据库课设答辩"));
  check("仍在进行显示目标名、状态和到期日", (await ongoingRows.first().innerText()).includes("补交实验报告") && (await ongoingRows.first().innerText()).includes("已逾期") && (await ongoingRows.first().innerText()).includes("到期"));
  check("已完成增益显示 +0.60%", (await completedRows.first().innerText()).includes("+0.60%"));

  const completionRow = page.locator('[data-testid="contribution-completion"]');
  const pendingRow = page.locator('[data-testid="contribution-row"][data-line-id="evt_pending_writing"]');
  const emotionRow = page.locator('[data-testid="contribution-row"][data-line-id="evt_review_note"]');
  check("贡献列表包含完成增益并关联目标 ID", (await completionRow.getAttribute("data-target-id")) === "task_done_current", await completionRow.getAttribute("data-target-id"));
  check("待确认记录保留待确认且不计分", (await pendingRow.count()) === 1 && (await pendingRow.innerText()).includes("待确认"));
  check("情绪记录出现在贡献列表且贡献为零", (await emotionRow.count()) === 1 && (await emotionRow.innerText()).includes("不计分"));

  await page.screenshot({ path: path.join(screenshots, "weekly-review-data-1440x900.png") });

  await completedRows.first().click();
  await page.locator('[data-testid="host-event"]').waitFor();
  check("点击已完成目标输出稳定目标 ID", (await page.locator('[data-testid="host-event"]').getAttribute("data-event-kind")) === "open-goal" && (await page.locator('[data-testid="host-event"]').getAttribute("data-event-id")) === "task_done_current", await page.locator('[data-testid="host-event"]').getAttribute("data-event-id"));

  await ongoingRows.first().click();
  check("点击仍在进行目标输出稳定目标 ID", (await page.locator('[data-testid="host-event"]').getAttribute("data-event-id")) === "task_overdue_report", await page.locator('[data-testid="host-event"]').getAttribute("data-event-id"));

  await completionRow.click();
  check("点击贡献项输出周标识并携带目标 ID", (await page.locator('[data-testid="host-event"]').getAttribute("data-event-kind")) === "open-week" && (await page.locator('[data-testid="host-event"]').getAttribute("data-event-id")) === currentWeek && (await page.locator('[data-testid="host-event"]').innerText()).includes("task_done_current"), await page.locator('[data-testid="host-event"]').innerText());

  await page.locator('[data-testid="week-open"]').click();
  check("指数卡提供周 K 明细入口", (await page.locator('[data-testid="host-event"]').getAttribute("data-event-kind")) === "open-week" && (await page.locator('[data-testid="host-event"]').getAttribute("data-event-id")) === currentWeek, await page.locator('[data-testid="host-event"]').innerText());

  await page.locator('[data-testid="prev-week"]').click();
  await page.locator('[data-testid="weekly-review"][data-week-key="' + previousWeek + '"]').waitFor();
  check("跨周切换后显示上一周复盘", (await page.locator('[data-testid="weekly-review"]').getAttribute("data-week-key")) === previousWeek);
  check("上一周已完成只包含该周目标", (await page.locator('[data-testid="completed-row"]').first().innerText()).includes("整理实验数据") && !(await page.locator('[data-testid="completed-row"]').allInnerTexts()).some((text) => text.includes("完成数据库课设答辩")));
  await page.locator('[data-testid="completed-row"]').first().click();
  check("跨周点击输出该周目标 ID", (await page.locator('[data-testid="host-event"]').getAttribute("data-event-id")) === "task_done_previous", await page.locator('[data-testid="host-event"]').getAttribute("data-event-id"));
  await page.locator('[data-testid="current-week"]').click();
  await page.locator('[data-testid="weekly-review"][data-week-key="' + currentWeek + '"]').waitFor();

  const empty = await desktop.newPage();
  await empty.goto(`${base}/?scene=empty&today=${today}`, { waitUntil: "networkidle" });
  await settle(empty);
  const emptyOpen = await empty.locator('[data-testid="index-open"]').innerText();
  const emptyClose = await empty.locator('[data-testid="index-close"]').innerText();
  const emptyChange = await empty.locator('[data-testid="index-change"]').innerText();
  check("空账本指数保持 1,000.00 且零涨跌", emptyOpen.trim() === "1,000.00" && emptyClose.trim() === "1,000.00" && emptyChange.includes("0.00%"), `${emptyOpen}/${emptyClose}/${emptyChange}`);
  const emptyText = await empty.locator("body").innerText();
  check(
    "空账本三个分组给出明确空态",
    (await empty.locator('[data-testid="completed-row"]').count()) === 0 &&
      (await empty.locator('[data-testid="ongoing-row"]').count()) === 0 &&
      (await empty.locator('[data-testid="contribution-row"]').count()) === 0 &&
      emptyText.includes("本周还没有完成的目标") &&
      emptyText.includes("没有仍在进行的目标") &&
      emptyText.includes("本周还没有计分记录"),
  );
  await empty.screenshot({ path: path.join(screenshots, "weekly-review-empty-1440x900.png") });

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const phone = await mobile.newPage();
  await phone.goto(`${base}/?scene=data&today=${today}`, { waitUntil: "networkidle" });
  await settle(phone);
  await phone.locator(".content").evaluate((node) => { node.scrollTop = 0; });
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check("手机窄屏无横向溢出", overflow <= 1, `overflow=${overflow}px`);
  const phoneTitleSize = await phone.locator('[data-testid="completed-row"] .goal-main strong').evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
  const phoneRow = await phone.locator('[data-testid="completed-row"]').boundingBox();
  check("手机列表字号与行宽可读", phoneTitleSize >= 12 && Boolean(phoneRow && phoneRow.width <= 390 && phoneRow.x >= 0), `font=${phoneTitleSize}px width=${phoneRow?.width}`);
  await phone.screenshot({ path: path.join(screenshots, "weekly-review-mobile-390x844.png") });
  await phone.locator('[data-testid="completed-section"]').scrollIntoViewIfNeeded();
  await phone.screenshot({ path: path.join(screenshots, "weekly-review-mobile-list-390x844.png") });
  await phone.locator('[data-testid="completed-row"]').click();
  check("手机点击条目输出正确目标 ID", (await phone.locator('[data-testid="host-event"]').getAttribute("data-event-kind")) === "open-goal" && (await phone.locator('[data-testid="host-event"]').getAttribute("data-event-id")) === "task_done_current", await phone.locator('[data-testid="host-event"]').getAttribute("data-event-id"));

  check("浏览器控制台无报错", errors.length === 0, errors.join(" | "));

  await writeFile(
    resultsPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        base,
        today,
        viewports: ["1440x900", "390x844"],
        checks: results,
        screenshots: [
          "assets/screenshots/weekly-review-data-1440x900.png",
          "assets/screenshots/weekly-review-empty-1440x900.png",
          "assets/screenshots/weekly-review-mobile-390x844.png",
          "assets/screenshots/weekly-review-mobile-list-390x844.png",
        ],
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error);
  results.push({ name: "预览验收脚本执行", ok: false, detail: String(error) });
} finally {
  await browser?.close();
  vite.kill("SIGTERM");
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (viteLog && failed.length) console.log(viteLog.slice(-4000));
if (failed.length) process.exitCode = 1;
