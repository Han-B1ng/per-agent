// 运行已确认样板（交付目录内 reference-sample/ 快照），实测完整过渡并录屏留证（1440×900 / 1440×720）
import { chromium } from "playwright";
import { mkdirSync, renameSync, readFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SAMPLE_ROOT = path.join(ROOT, "reference-sample");
const URL = "http://127.0.0.1:8124/index.html";

// 自托管样板快照，无需外部服务
const sampleServer = http.createServer((req, res) => {
  const rel = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  try {
    const file = path.join(SAMPLE_ROOT, path.normalize(rel).replace(/^([/\\])+/, ""));
    if (!file.startsWith(SAMPLE_ROOT)) { res.writeHead(404); res.end(); return; }
    const ext = path.extname(file);
    const mime = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript" }[ext] || "application/octet-stream";
    const data = readFileSync(file);
    res.writeHead(200, { "Content-Type": mime + "; charset=utf-8" });
    res.end(data);
  } catch { if (!res.headersSent) res.writeHead(404); res.end(); }
});
await new Promise((r) => sampleServer.listen(8124, "127.0.0.1", r));

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name} :: ${detail}`);
}

async function observe(browser, width, height) {
  const tag = `${width}x${height}`;
  const videoDir = path.join(ROOT, "assets/videos/sample-" + tag);
  mkdirSync(videoDir, { recursive: true });
  const context = await browser.newContext({
    viewport: { width, height },
    recordVideo: { dir: videoDir, size: { width, height } },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    const loc = m.location() || {};
    if (m.type() === "error" && !String(loc.url || "").includes("favicon") && !m.text().includes("favicon")) errors.push(m.text());
  });
  page.on("requestfailed", (r) => { if (!r.url().includes("favicon")) errors.push("requestfailed " + r.url()); });
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);

  const marketState = () => page.evaluate(() => {
    const m = document.querySelector(".market");
    const cs = getComputedStyle(m);
    const r = m.getBoundingClientRect();
    return { mode: document.querySelector(".workspace").dataset.mode, transform: cs.transform, opacity: cs.opacity, filter: cs.filter, rect: { x: r.x, y: r.y, w: r.width, h: r.height } };
  });

  const s0 = await marketState();
  await page.screenshot({ path: path.join(ROOT, `assets/screenshots/sample-${tag}-1-market.png`) });
  check(`[${tag}] 初始为 market 模式`, s0.mode === "market", JSON.stringify(s0));

  // 首次点击输入框：K 线尺寸位置必须不变
  await page.click("#entry");
  await page.waitForTimeout(1000);
  const s1 = await marketState();
  const unchanged = s1.mode === "market" && s1.transform === s0.transform && s1.opacity === s0.opacity &&
    Math.abs(s1.rect.w - s0.rect.w) < 1 && Math.abs(s1.rect.h - s0.rect.h) < 1 && Math.abs(s1.rect.x - s0.rect.x) < 1 && Math.abs(s1.rect.y - s0.rect.y) < 1;
  await page.screenshot({ path: path.join(ROOT, `assets/screenshots/sample-${tag}-2-input-focus.png`) });
  check(`[${tag}] 首次聚焦输入框 K 线不动`, unchanged, JSON.stringify(s1));

  const send = async (text) => {
    await page.fill("#entry", text);
    await page.press("#entry", "Enter");
    await page.waitForTimeout(1000);
  };

  await send("今天跑了五公里。");
  const s2 = await marketState();
  const shortFit = await page.evaluate(() => ({ content: document.querySelector(".conversation")?.scrollHeight ?? 0, available: document.querySelector(".stage").clientHeight - document.querySelector(".market").offsetHeight - 12 }));
  check(`[${tag}] 第一条消息后按实际空间决定状态`, s2.mode === (shortFit.content > shortFit.available + 4 ? "focus" : "market"), JSON.stringify({ s2, shortFit }));
  await page.screenshot({ path: path.join(ROOT, `assets/screenshots/sample-${tag}-3-one-message.png`) });

  await send("今天完成了数据库课设。");
  await send("今天有点累，想休息一天。");
  const s3 = await marketState();
  await page.screenshot({ path: path.join(ROOT, `assets/screenshots/sample-${tag}-4-overflow-focus.png`) });
  check(`[${tag}] 消息溢出后进入 focus`, s3.mode === "focus", JSON.stringify(s3));
  const focused = s3.transform.includes("1.24") && parseFloat(s3.opacity) < 0.2 && s3.filter.includes("blur");
  check(`[${tag}] focus 放大渐隐模糊（scale1.24/opacity.13/blur3px）`, focused, `${s3.transform} ${s3.opacity} ${s3.filter}`);

  const more = [
    "晚上和室友去吃了火锅，聊了很多。",
    "回宿舍把明天要交的作业收尾了。",
    "睡前看了半小时专业书。",
    "早上差点起晚，一路小跑到教室。",
    "课间把上次没懂的地方问清楚了。",
    "下午去操场又跑了三公里。",
    "晚上给家里打了电话。",
    "今天状态不错，事情都推进了一点。",
  ];
  for (const t of more) await send(t);
  const scrollState = await page.evaluate(() => {
    const sc = document.querySelector(".message-scroll");
    const composer = document.querySelector(".composer").getBoundingClientRect();
    const entry = document.querySelector("#entry").getBoundingClientRect();
    return { scrollable: sc.scrollHeight > sc.clientHeight, atBottom: sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2, composerBottom: composer.bottom, entryBottom: entry.bottom, vh: window.innerHeight, mode: document.querySelector(".workspace").dataset.mode };
  });
  await page.screenshot({ path: path.join(ROOT, `assets/screenshots/sample-${tag}-5-scroll.png`) });
  check(`[${tag}] 消息区独立滚动且自动到底`, scrollState.scrollable && scrollState.atBottom, JSON.stringify(scrollState));
  check(`[${tag}] 输入框留在视口底部`, scrollState.entryBottom <= scrollState.vh && scrollState.composerBottom <= scrollState.vh, JSON.stringify(scrollState));

  // 回看：向上滚动消息区，market 背景不受影响
  await page.evaluate(() => { document.querySelector(".message-scroll").scrollTop = 0; });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(ROOT, `assets/screenshots/sample-${tag}-6-scrollback.png`) });

  await page.click("#view-toggle");
  await page.waitForTimeout(1100);
  const s4 = await marketState();
  await page.screenshot({ path: path.join(ROOT, `assets/screenshots/sample-${tag}-7-back-to-market.png`) });
  check(`[${tag}] 返回行情恢复 market`, s4.mode === "market" && parseFloat(s4.opacity) === 1, JSON.stringify(s4));

  check(`[${tag}] 控制台 0 报错`, errors.length === 0, errors.join(" | ") || "clean");

  const video = page.video();
  await context.close();
  const vp = await video.path();
  const dest = path.join(ROOT, `assets/videos/sample-${tag}.webm`);
  renameSync(vp, dest);
  console.log(`VIDEO ${dest}`);
}

const browser = await chromium.launch({ headless: true, ...(process.env.PE_CHANNEL ? { channel: process.env.PE_CHANNEL } : {}) });
await observe(browser, 1440, 900);
await observe(browser, 1440, 720);
await browser.close();
sampleServer.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);