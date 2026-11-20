// 设置页 JSON 恢复验收：导出后恢复、无效文件保留原数据、写入失败保留原账本并可重试。
import { chromium } from "playwright";
import { mkdirSync, mkdtempSync, renameSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../../server/index.mjs";
import { shiftDate } from "../../web/engine.js";

const ROOT = path.resolve(import.meta.dirname, "../..");
const EVIDENCE = path.join(ROOT, "assets/restore-evidence");
const TMP = mkdtempSync(path.join(os.tmpdir(), "pe-restore-"));
mkdirSync(EVIDENCE, { recursive: true });

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass: !!pass, detail: String(detail).slice(0, 500) });
  console.log(`${pass ? "PASS" : "FAIL"} ${name} :: ${detail}`);
};
const listen = (server) => new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
const app = await listen(createApp({ env: {} }));
const BASE = `http://127.0.0.1:${app.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.PE_CHANNEL ? { channel: process.env.PE_CHANNEL } : {}) });

const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
const seedLedger = (quote = "跑步五公里") => JSON.stringify({
  version: 2,
  events: [{
    id: "evt_seed", kind: "event", eventType: "behavior", polarity: "positive", intensity: 3,
    occurredAt: today, quote, tags: [], confidence: 0.9, status: "confirmed",
    createdAt: `${today}T08:00:00.000Z`, deletedAt: null,
  }],
  rests: [],
  tasks: [{
    id: "task_seed", kind: "task", title: "完成论文", dueAt: shiftDate(today, 7), position: 3,
    status: "open", createdAt: `${today}T08:00:00.000Z`, doneAt: null, deletedAt: null,
  }],
  chat: [],
  audit: [],
});

const quote = (page) => page.textContent("#quote-value").then((text) => parseFloat(text.replace(/,/g, "")));
const go = async (page, name) => { await page.click(`[data-page-target="${name}"]`); await page.waitForTimeout(250); };
const openSettings = async (page) => { await page.click("#settings-open"); await page.waitForTimeout(250); };
const send = async (page, text, wait = 1200) => { await page.fill("#entry", text); await page.press("#entry", "Enter"); await page.waitForTimeout(wait); };
const shot = (page, name) => page.screenshot({ path: path.join(EVIDENCE, name) });

async function newPage({ seed = null, video = null } = {}) {
  const options = { viewport: { width: 1440, height: 900 } };
  if (video) { mkdirSync(video, { recursive: true }); options.recordVideo = { dir: video, size: { width: 1440, height: 900 } }; }
  const context = await browser.newContext(options);
  if (seed) await context.addInitScript((value) => localStorage.setItem("pe.personal.v2", value), seed);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !/Failed to load resource/.test(message.text())) errors.push(message.text());
  });
  page._errors = errors;
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(350);
  return { context, page };
}

async function closeWithVideo(context, page, name) {
  const video = page.video();
  await context.close();
  if (video) renameSync(await video.path(), path.join(EVIDENCE, name));
}

async function exportBackup(page, fileName) {
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#drawer-body button", { hasText: "导出我的 JSON" }).click();
  const download = await downloadPromise;
  const target = path.join(TMP, fileName);
  await download.saveAs(target);
  return { download, target };
}

async function failStorageWrites(page) {
  await page.evaluate(() => {
    if (window.__peOriginalSetItem) return;
    window.__peOriginalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key, value) {
      if (key === "pe.personal.v2") throw new DOMException("quota", "QuotaExceededError");
      return window.__peOriginalSetItem.call(this, key, value);
    };
  });
}
async function restoreStorageWrites(page) {
  await page.evaluate(() => {
    if (!window.__peOriginalSetItem) return;
    Storage.prototype.setItem = window.__peOriginalSetItem;
    delete window.__peOriginalSetItem;
  });
}

/* 1. 导出后恢复：清空 → 恢复 → 行情/目标/记录同步 → 刷新一致 */
{
  const { context, page } = await newPage({ seed: seedLedger(), video: path.join(EVIDENCE, "video-main") });
  await page.click("#view-personal");
  await page.waitForTimeout(300);
  const before = await quote(page);
  await openSettings(page);
  const { download, target } = await exportBackup(page, "personal-export.json");
  check("R1 导出的备份标记为个人范围", download.suggestedFilename().includes("personal"), download.suggestedFilename());
  await shot(page, "r1-settings-export.png");

  await page.locator("#drawer-body button", { hasText: "清空我的记录" }).click();
  await page.locator("#drawer-body button", { hasText: "确定清空" }).click();
  await page.waitForTimeout(300);
  const cleared = await page.evaluate(() => JSON.parse(localStorage.getItem("pe.personal.v2")));
  check("R1 清空后原账本为空", cleared.events.length === 0 && cleared.tasks.length === 0, JSON.stringify(cleared));

  await page.setInputFiles("#restore-file", target);
  await page.waitForTimeout(300);
  const summary = await page.locator("#restore-summary").textContent();
  const confirmVisible = await page.locator("#restore-confirm-block").isVisible();
  const storedAfterSelect = await page.evaluate(() => JSON.parse(localStorage.getItem("pe.personal.v2")));
  check("R1 先校验文件再提示覆盖当前个人数据", confirmVisible && summary.includes("覆盖当前个人账本") && summary.includes("不可撤销"), summary);
  check("R1 校验通过前不写入", storedAfterSelect.events.length === 0 && storedAfterSelect.tasks.length === 0, JSON.stringify(storedAfterSelect));
  await shot(page, "r1-restore-confirm.png");

  await page.click("#restore-confirm");
  await page.waitForTimeout(400);
  check("R1 确认后显示恢复成功", (await page.locator("#restore-success").textContent()).includes("已恢复"), await page.locator("#restore-success").textContent());
  await page.click("#drawer-close");
  await page.waitForTimeout(300);
  check("R1 行情恢复原指数", Math.abs((await quote(page)) - before) < 0.05, `${await quote(page)} vs ${before}`);
  await go(page, "goals");
  check("R1 目标中心同步恢复", (await page.locator("#active-goals .goal-card").count()) === 1 && (await page.locator("#active-goals").textContent()).includes("完成论文"), await page.locator("#active-goals").textContent());
  await go(page, "records");
  check("R1 成长记录同步恢复", (await page.locator(".record-row").count()) === 1 && (await page.locator(".record-row").textContent()).includes("跑步五公里"), await page.locator(".record-row").count());
  await shot(page, "r1-records-restored.png");

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  await page.click("#view-personal");
  await page.waitForTimeout(300);
  check("R1 刷新后行情一致", Math.abs((await quote(page)) - before) < 0.05, `${await quote(page)} vs ${before}`);
  await go(page, "goals");
  check("R1 刷新后目标一致", (await page.locator("#active-goals .goal-card").count()) === 1, await page.locator("#active-goals .goal-card").count());
  await go(page, "records");
  check("R1 刷新后记录一致", (await page.locator(".record-row").count()) === 1, await page.locator(".record-row").count());
  check("R1 控制台无错误", page._errors.length === 0, page._errors.join("|") || "clean");
  await closeWithVideo(context, page, "restore-main-flow.webm");
}

/* 2. 无效文件 / 版本暂不支持：明确提示且原账本不变 */
{
  const broken = path.join(TMP, "broken.json");
  const sample = path.join(TMP, "sample.json");
  const future = path.join(TMP, "future.json");
  writeFileSync(broken, "{ \"scope\": \"personal\", ");
  writeFileSync(sample, JSON.stringify({ scope: "sample", exportedAt: new Date().toISOString(), records: { events: [], rests: [], tasks: [] } }));
  writeFileSync(future, JSON.stringify({ scope: "personal", exportedAt: new Date().toISOString(), records: { version: 3, events: [], rests: [], tasks: [], chat: [], audit: [] } }));

  const { context, page } = await newPage({ seed: seedLedger("原始记录") });
  await page.click("#view-personal");
  await page.waitForTimeout(300);
  const before = await quote(page);
  const storedBefore = await page.evaluate(() => localStorage.getItem("pe.personal.v2"));
  await openSettings(page);

  for (const item of [
    { file: broken, code: "invalid_file", text: "不是有效的 JSON" },
    { file: sample, code: "invalid_file", text: "不是个人账本备份" },
    { file: future, code: "unsupported_version", text: "版本暂不支持" },
  ]) {
    await page.setInputFiles("#restore-file", item.file);
    await page.waitForTimeout(250);
    const error = page.locator("#restore-error");
    check(`R2 ${path.basename(item.file)} 有明确错误`, (await error.getAttribute("data-code")) === item.code && (await error.textContent()).includes(item.text), await error.textContent());
    check(`R2 ${path.basename(item.file)} 不进入覆盖确认`, (await page.locator("#restore-confirm-block").count()) === 0, await page.locator("#restore-confirm-block").count());
  }
  await shot(page, "r2-invalid-file.png");

  const storedAfter = await page.evaluate(() => localStorage.getItem("pe.personal.v2"));
  check("R2 无效文件未改动存储", storedAfter === storedBefore, `${storedBefore?.length} -> ${storedAfter?.length}`);
  await page.click("#drawer-close");
  await page.waitForTimeout(250);
  check("R2 原账本指数不变", Math.abs((await quote(page)) - before) < 0.05, `${await quote(page)} vs ${before}`);
  check("R2 控制台无错误", page._errors.length === 0, page._errors.join("|") || "clean");
  await context.close();
}

/* 3. 恢复时浏览器写入失败：原账本保留，恢复确认可重试 */
{
  const { context, page } = await newPage({ seed: seedLedger() });
  await page.click("#view-personal");
  await page.waitForTimeout(300);
  const before = await quote(page);
  await openSettings(page);
  const { target } = await exportBackup(page, "personal-export-retry.json");
  await page.locator("#drawer-body button", { hasText: "清空我的记录" }).click();
  await page.locator("#drawer-body button", { hasText: "确定清空" }).click();
  await page.waitForTimeout(300);
  const storedEmpty = await page.evaluate(() => localStorage.getItem("pe.personal.v2"));

  await failStorageWrites(page);
  await page.setInputFiles("#restore-file", target);
  await page.waitForTimeout(250);
  await page.click("#restore-confirm");
  await page.waitForTimeout(300);
  const error = page.locator("#restore-error");
  check("R3 写入失败与文件/版本错误区分", (await error.getAttribute("data-code")) === "storage_failed" && (await error.textContent()).includes("浏览器写入失败"), await error.textContent());
  check("R3 写入失败提示原账本未改动", (await error.textContent()).includes("原账本未改动"), await error.textContent());
  check("R3 失败后保留确认区可重试", await page.locator("#restore-confirm-block").isVisible(), "");
  const storedAfterFail = await page.evaluate(() => localStorage.getItem("pe.personal.v2"));
  check("R3 写入失败未覆盖存储", storedAfterFail === storedEmpty, `${storedEmpty?.length} -> ${storedAfterFail?.length}`);
  await shot(page, "r3-restore-storage-failed.png");

  await restoreStorageWrites(page);
  await page.click("#restore-confirm");
  await page.waitForTimeout(400);
  check("R3 重试后恢复成功", (await page.locator("#restore-success").textContent()).includes("已恢复"), await page.locator("#restore-success").textContent());
  await page.click("#drawer-close");
  await page.waitForTimeout(250);
  check("R3 重试后行情恢复", Math.abs((await quote(page)) - before) < 0.05, `${await quote(page)} vs ${before}`);
  const storedRestored = await page.evaluate(() => JSON.parse(localStorage.getItem("pe.personal.v2")));
  check("R3 重试后存储一致", storedRestored.events.length === 1 && storedRestored.tasks.length === 1, JSON.stringify(storedRestored).slice(0, 160));
  check("R3 控制台无错误", page._errors.length === 0, page._errors.join("|") || "clean");
  await context.close();
}

/* 4. 普通记账写入失败：提示未保存、无成功回执、保留可重试输入，恢复后可重试 */
{
  const { context, page } = await newPage({ video: path.join(EVIDENCE, "video-retry") });
  await page.click("#view-personal");
  await page.waitForTimeout(300);
  await failStorageWrites(page);
  await send(page, "今天跑了五公里");
  const banner = page.getByTestId("persist-error");
  check("R4 页面提示未保存", (await banner.isVisible()) && (await banner.textContent()).includes("未保存"), await banner.textContent());
  check("R4 不显示成功回执", (await page.locator('[data-testid="agent-receipt"]').count()) === 0, await page.locator('[data-testid="agent-receipt"]').count());
  const failedCard = page.locator('.msg-card.failed[data-code="not_saved"]');
  check("R4 保留可重试的输入", (await failedCard.isVisible()) && (await failedCard.locator("button", { hasText: "重试" }).isVisible()), await failedCard.textContent());
  check("R4 失败时不改变指数", Math.abs((await quote(page)) - 1000) < 0.05, await quote(page));
  const storedFailed = await page.evaluate(() => localStorage.getItem("pe.personal.v2"));
  const failedEvents = storedFailed ? JSON.parse(storedFailed).events.length : 0;
  check("R4 失败时不写入存储", failedEvents === 0, `${failedEvents} events`);
  await shot(page, "r4-write-failed.png");

  await restoreStorageWrites(page);
  await failedCard.locator("button", { hasText: "重试" }).click();
  await page.waitForTimeout(1200);
  check("R4 重试后写入成功", (await quote(page)) > 1000, await quote(page));
  check("R4 重试后显示回执", (await page.locator('[data-testid="agent-receipt"]').count()) === 1, "");
  check("R4 重试后清掉未保存提示", (await page.locator('[data-testid="persist-error"]').count()) === 0 && (await page.locator(".msg-card.failed").count()) === 0, "");
  const storedRetried = await page.evaluate(() => JSON.parse(localStorage.getItem("pe.personal.v2")));
  check("R4 重试后存储有一条事件", storedRetried.events.length === 1, storedRetried.events.length);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  await page.click("#view-personal");
  await page.waitForTimeout(300);
  check("R4 刷新后重试结果保留", (await quote(page)) > 1000, await quote(page));
  check("R4 控制台无错误", page._errors.length === 0, page._errors.join("|") || "clean");
  await closeWithVideo(context, page, "restore-write-retry.webm");
}

/* 5. 目标保存失败：表单不关闭、输入保留，恢复后可再次提交 */
{
  const { context, page } = await newPage();
  await page.click("#view-personal");
  await go(page, "goals");
  await failStorageWrites(page);
  await page.click("#goal-add-open");
  await page.fill("#goal-title-input", "完成数据库课设");
  await page.fill("#goal-due-input", shiftDate(today, 5));
  await page.click("#goal-form button[type=submit]");
  await page.waitForTimeout(300);
  check("R5 保存失败时目标表单保持打开且输入保留", (await page.locator("#goal-form").isVisible()) && (await page.inputValue("#goal-title-input")) === "完成数据库课设", await page.inputValue("#goal-title-input"));
  check("R5 保存失败时提示未保存", (await page.getByTestId("persist-error").textContent()).includes("未保存"), await page.getByTestId("persist-error").textContent());
  check("R5 保存失败时不出现目标卡", (await page.locator("#active-goals .goal-card").count()) === 0, await page.locator("#active-goals .goal-card").count());

  await restoreStorageWrites(page);
  await page.click("#goal-form button[type=submit]");
  await page.waitForTimeout(300);
  check("R5 重试后目标写入", (await page.locator("#active-goals .goal-card").count()) === 1 && (await page.locator("#active-goals").textContent()).includes("完成数据库课设"), await page.locator("#active-goals").textContent());
  check("R5 成功后表单关闭并清空提示", (await page.locator("#goal-form").count()) === 0 && (await page.locator('[data-testid="persist-error"]').count()) === 0, "");
  check("R5 控制台无错误", page._errors.length === 0, page._errors.join("|") || "clean");
  await context.close();
}

await browser.close();
app.close();
writeFileSync(path.join(ROOT, "assets/restore-results.json"), JSON.stringify(results, null, 2));
const failed = results.filter((result) => !result.pass);
console.log(`\n${results.length - failed.length}/${results.length} restore checks passed`);
process.exit(failed.length ? 1 : 0);