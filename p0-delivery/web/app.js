import { computeAll, shiftDate } from "./engine.js";
import { buildSampleRecords, SAMPLE_META } from "./sample-data.js";
import { loadPersonal, savePersonal, clearPersonal, genId } from "./store.js";
import * as extractor from "./extractor.js?v=2";
import { createChart } from "./chart.js";

const $ = (s) => document.querySelector(s);
const workspace = $(".workspace");
const stage = $(".stage");
const messages = $(".messages");
const messageScroll = $(".message-scroll");
const heading = $(".conversation-heading");
const budget = $(".conversation-budget");
const composer = $(".composer");
const entry = $("#entry");
const sendBtn = $(".send");
const viewToggle = $("#view-toggle");
const drawer = $("#drawer");
const scrim = $("#drawer-scrim");
const drawerBody = $("#drawer-body");

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const TODAY = localToday();
const fmtIndex = (n) => n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtPct = (x) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(2)}%`;
const fmtContrib = (c) => `${c > 0 ? "+" : ""}${(c * 100).toFixed(2)}%`;

const state = {
  view: "sample",
  personal: loadPersonal(),
  sample: buildSampleRecords(TODAY),
  focusMode: false,
  busy: false,
  typing: false,
  drawerWeek: null,
  drawerTab: "detail",
  clearArmed: false,
  modelState: "mock",
};
let currentResult = null;

const records = () => (state.view === "sample" ? state.sample : state.personal);
const persist = () => savePersonal(state.personal);

/* ---------- 焦点模式：与已确认样板一致 ---------- */
function setFocusMode(active) {
  state.focusMode = active;
  workspace.dataset.mode = active ? "focus" : "market";
  viewToggle.hidden = !active;
}
function exceedsMarketSpace() {
  return messages.offsetHeight > budget.offsetHeight - heading.offsetHeight;
}
function enterFocusIfNeeded() {
  if (!state.focusMode && exceedsMarketSpace()) setFocusMode(true);
}
function scrollChat() {
  messageScroll.scrollTop = messageScroll.scrollHeight;
}

/* ---------- 市场渲染 ---------- */
const chart = createChart($("#candles"), { onSelect: (i) => openDrawer(i) });
function renderMarket() {
  currentResult = computeAll(records(), { today: TODAY });
  const r = currentResult;
  $("#quote-value").textContent = fmtIndex(r.latest);
  const ch = $("#quote-change");
  ch.textContent = fmtPct(r.weekChangePct);
  ch.classList.toggle("neg", r.weekChangePct < 0);
  const w = r.weeks[r.weeks.length - 1];
  $("#stat-open").textContent = w ? fmtIndex(w.open) : "—";
  $("#stat-high").textContent = w ? fmtIndex(w.high) : "—";
  $("#stat-low").textContent = w ? fmtIndex(w.low) : "—";
  $("#data-tag").textContent = state.view === "sample" ? SAMPLE_META.label : "我的记录";
  $("#candles").setAttribute("aria-label", `${state.view === "sample" ? "样例" : "个人"}周 K 走势，最新 ${fmtIndex(r.latest)} 点`);
  chart.render(r.weeks);
}

/* ---------- 对话渲染 ---------- */
function findPending(id) {
  const e = state.personal.events.find((x) => x.id === id && x.status === "pending" && x.deletedAt == null);
  if (e) return { rec: e, kind: "event" };
  const r = state.personal.rests.find((x) => x.id === id && x.status === "pending" && x.deletedAt == null);
  if (r) return { rec: r, kind: "rest" };
  return null;
}
function pendingStill(id) {
  return findPending(id) !== null;
}
function renderChat() {
  messages.replaceChildren();
  for (const m of state.personal.chat) {
    const p = document.createElement("p");
    p.className = "message";
    p.dataset.author = m.role;
    const label = document.createElement("span");
    label.className = "sr-only";
    label.textContent = m.role === "user" ? "你：" : "助手：";
    p.append(label, document.createTextNode(m.text));
    if (m.role === "assistant") {
      const pendingIds = (m.pending || []).filter(pendingStill);
      for (const id of pendingIds) {
        const hit = findPending(id);
        if (hit) p.append(confirmCard(hit.rec, hit.kind));
      }
      if (m.failed) p.append(failedCard(m));
    }
    messages.append(p);
  }
  if (state.typing) {
    const t = document.createElement("p");
    t.className = "message typing";
    t.dataset.author = "assistant";
    t.innerHTML = "<i></i><i></i><i></i> 正在记录…";
    messages.append(t);
  }
  scrollChat();
}
function confirmCard(rec, kind) {
  const isRest = kind === "rest";
  const date = isRest ? rec.date : rec.occurredAt;
  const confirmOp = isRest ? "confirm_rest" : "confirm_event";
  const denyOp = isRest ? "deny_rest" : "deny_event";
  const card = document.createElement("div");
  card.className = "msg-card";
  const q = document.createElement("div");
  q.className = "card-quote";
  q.textContent = `「${rec.quote}」`;
  const meta = document.createElement("div");
  meta.className = "card-meta";
  meta.textContent = `${isRest ? "休息标记" : "事件"}把握不足 · 暂不计分 · 默认记在 ${date}`;
  const actions = document.createElement("div");
  actions.className = "card-actions";
  const yes = document.createElement("button");
  yes.className = "card-btn primary";
  yes.type = "button";
  yes.textContent = isRest ? "确认休息" : "确认计入";
  yes.addEventListener("click", () => { applyItems([{ op: confirmOp, id: rec.id }]); persist(); renderMarket(); renderChat(); renderDrawer(); });
  const no = document.createElement("button");
  no.className = "card-btn ghost";
  no.type = "button";
  no.textContent = "不记了";
  no.addEventListener("click", () => { applyItems([{ op: denyOp, id: rec.id }]); persist(); renderMarket(); renderChat(); renderDrawer(); });
  actions.append(yes, no);
  card.append(q, meta, actions);
  return card;
}
function failedCard(m) {
  const card = document.createElement("div");
  card.className = "msg-card failed";
  const tag = document.createElement("span");
  tag.className = "fail-tag";
  tag.textContent = "未录入";
  const head = document.createElement("div");
  head.className = "card-quote";
  head.append(document.createTextNode("这条没有进入记录。"), tag);
  const actions = document.createElement("div");
  actions.className = "card-actions";
  const retry = document.createElement("button");
  retry.className = "card-btn";
  retry.type = "button";
  retry.textContent = "重试";
  retry.addEventListener("click", () => retryFailed(m, false));
  const mock = document.createElement("button");
  mock.className = "card-btn ghost";
  mock.type = "button";
  mock.textContent = "改用本地识别";
  mock.addEventListener("click", () => retryFailed(m, true));
  actions.append(retry, mock);
  card.append(head, actions);
  return card;
}
function retryFailed(m, useMock) {
  state.personal.chat = state.personal.chat.filter((x) => x.id !== m.id);
  persist();
  sendText(m.failed.text, { skipUser: true, useMock });
}

/* ---------- 状态变更协议（临时协议，按 id 引用）---------- */
function applyItems(items) {
  const newPending = [];
  const now = new Date().toISOString();
  for (const it of items || []) {
    if (it.op === "add_event") {
      const e = it.event;
      const status = e.confidence < 0.6 ? "pending" : "confirmed";
      const id = genId("evt");
      state.personal.events.push({ id, kind: "event", eventType: e.eventType, polarity: e.eventType === "emotion" ? "neutral" : e.polarity, intensity: e.intensity, occurredAt: e.occurredAt, quote: e.quote, tags: e.tags || [], confidence: e.confidence, status, createdAt: now, deletedAt: null });
      if (status === "pending") newPending.push(id);
    } else if (it.op === "add_rest") {
      const r = it.rest;
      const id = genId("rest");
      const status = r.confidence < 0.6 ? "pending" : "confirmed";
      state.personal.rests.push({ id, kind: "rest", date: r.date, quote: r.quote, confidence: r.confidence, status, createdAt: now, deletedAt: null });
      if (status === "pending") newPending.push(id);
    } else if (it.op === "add_task") {
      const t = it.task;
      state.personal.tasks.push({ id: genId("task"), kind: "task", title: t.title, dueAt: t.dueAt, position: t.position, status: "open", createdAt: now, doneAt: null, deletedAt: null });
    } else if (it.op === "confirm_event") {
      const e = state.personal.events.find((x) => x.id === it.id);
      if (e && e.status === "pending") { e.status = "confirmed"; e.confidence = 1; if (it.occurredAt) e.occurredAt = it.occurredAt; }
    } else if (it.op === "deny_event" || it.op === "delete_event") {
      const e = state.personal.events.find((x) => x.id === it.id);
      if (e && e.deletedAt == null) e.deletedAt = now;
    } else if (it.op === "confirm_rest") {
      const r = state.personal.rests.find((x) => x.id === it.id);
      if (r && r.status === "pending") { r.status = "confirmed"; r.confidence = 1; if (it.date) r.date = it.date; }
    } else if (it.op === "deny_rest" || it.op === "delete_rest") {
      const r = state.personal.rests.find((x) => x.id === it.id);
      if (r && r.deletedAt == null) r.deletedAt = now;
    } else if (it.op === "complete_task") {
      const t = state.personal.tasks.find((x) => x.id === it.id);
      if (t && t.status !== "done") { t.status = "done"; t.doneAt = it.doneAt || TODAY; }
    } else if (it.op === "delete_task") {
      const t = state.personal.tasks.find((x) => x.id === it.id);
      if (t && t.deletedAt == null) t.deletedAt = now;
    }
  }
  return newPending;
}

function buildContext() {
  return {
    today: TODAY,
    now: new Date().toISOString(),
    openTasks: state.personal.tasks.filter((t) => t.status === "open" && t.deletedAt == null).map((t) => ({ id: t.id, title: t.title, dueAt: t.dueAt, position: t.position })),
    pendingEvents: state.personal.events.filter((e) => e.status === "pending" && e.deletedAt == null).map((e) => ({ id: e.id, quote: e.quote, occurredAt: e.occurredAt, eventType: e.eventType, polarity: e.polarity, intensity: e.intensity })),
    pendingRests: state.personal.rests.filter((r) => r.status === "pending" && r.deletedAt == null).map((r) => ({ id: r.id, quote: r.quote, date: r.date })),
    turns: state.personal.chat.filter((m) => !m.failed && m.text).slice(-10).map((m) => ({ role: m.role, content: m.text })),
  };
}

/* ---------- 发送闭环 ---------- */
async function sendText(text, { skipUser = false, useMock = false } = {}) {
  if (state.busy) return;
  if (state.view === "sample") setView("personal");
  state.busy = true;
  sendBtn.disabled = true;
  if (!skipUser) state.personal.chat.push({ id: genId("msg"), role: "user", text });
  state.typing = true;
  renderChat();
  enterFocusIfNeeded();
  const res = await extractor.send(text, buildContext(), { useMock });
  state.typing = false;
  state.busy = false;
  if (res.ok) {
    const pending = applyItems(res.items);
    state.personal.chat.push({ id: genId("msg"), role: "assistant", text: res.reply, pending, mode: res.mode });
    setModelState(res.mode === "model" ? "model" : "mock");
  } else {
    state.personal.chat.push({ id: genId("msg"), role: "assistant", text: res.error.message, failed: { text, code: res.error.code } });
    setModelState("degraded");
  }
  persist();
  renderMarket();
  renderChat();
  renderDrawer();
  enterFocusIfNeeded();
  entry.focus({ preventScroll: true });
}

/* ---------- 模型状态 / 隐私告知 ---------- */
function setModelState(s) {
  state.modelState = s;
  const el = $("#model-status");
  el.dataset.state = s;
  $("#model-status-text").textContent = { model: "模型在线", mock: "本地 Mock", degraded: "降级 · 样例可用", offline: "离线 · 样例可用" }[s] || s;
  $("#privacy-note").textContent = s === "model" ? "内容会发给模型服务 · 记录仅存本机" : "本地识别 · 记录仅存本机";
}

/* ---------- 视图切换 ---------- */
function setView(v) {
  state.view = v;
  $("#view-sample").setAttribute("aria-pressed", String(v === "sample"));
  $("#view-personal").setAttribute("aria-pressed", String(v === "personal"));
  closeDrawer();
  renderMarket();
}

/* ---------- 抽屉 ---------- */
function openDrawer(i) {
  state.drawerWeek = i;
  state.drawerTab = "detail";
  state.clearArmed = false;
  drawer.hidden = false;
  scrim.hidden = false;
  requestAnimationFrame(() => { drawer.classList.add("show"); scrim.classList.add("show"); });
  syncTabs();
  renderDrawer();
}
function closeDrawer() {
  if (drawer.hidden) return;
  drawer.classList.remove("show");
  scrim.classList.remove("show");
  state.drawerWeek = null;
  setTimeout(() => { drawer.hidden = true; scrim.hidden = true; }, 460);
}
function syncTabs() {
  $("#tab-detail").setAttribute("aria-selected", String(state.drawerTab === "detail"));
  $("#tab-tasks").setAttribute("aria-selected", String(state.drawerTab === "tasks"));
}
function contribClass(c) { return c > 0 ? "pos" : c < 0 ? "neg" : "zero"; }
function renderDrawer() {
  if (state.drawerWeek == null || !currentResult) return;
  const week = currentResult.weeks[state.drawerWeek];
  if (!week) { closeDrawer(); return; }
  $("#drawer-title").textContent = state.drawerTab === "detail" ? "计算明细" : "持仓任务";
  $("#drawer-sub").textContent = `${week.weekStart} ~ ${week.weekEnd} · 周 K`;
  drawerBody.replaceChildren();
  if (state.drawerTab === "detail") renderDetail(week);
  else renderTasks();
}
function renderDetail(week) {
  const ohlc = document.createElement("dl");
  ohlc.className = "week-ohlc";
  for (const [k, v] of [["开", week.open], ["高", week.high], ["低", week.low], ["收", week.close]]) {
    const d = document.createElement("div");
    const dt = document.createElement("dt"); dt.textContent = k;
    const dd = document.createElement("dd"); dd.textContent = fmtIndex(v);
    d.append(dt, dd); ohlc.append(d);
  }
  const vol = document.createElement("p");
  vol.className = "week-vol";
  vol.textContent = `当周事件 ${week.volume} 条 · 收盘 ${fmtIndex(week.close)}（${fmtPct((week.close - week.open) / week.open)}）`;
  drawerBody.append(ohlc, vol);
  const editable = state.view === "personal";
  for (const day of week.days) {
    const block = document.createElement("div");
    block.className = "day-block";
    const head = document.createElement("div");
    head.className = "day-head";
    const d = document.createElement("span"); d.className = "d"; d.textContent = day.date;
    const c = document.createElement("span"); c.className = "c"; c.textContent = `收 ${fmtIndex(day.close)}`;
    head.append(d, c);
    const stage3 = document.createElement("div");
    stage3.className = "three-stage";
    stage3.append(
      seg(`原始 ${fmtContrib(day.raw)}`, "raw"),
      arrow(),
      seg(`涨跌停 ${fmtContrib(day.adjustment)}`, "adj"),
      arrow(),
      seg(`实际 ${fmtContrib(day.actual)}`, `act ${contribClass(day.actual)}`),
    );
    block.append(head, stage3);
    if (!day.lines.length) {
      const e = document.createElement("div"); e.className = "drawer-empty"; e.textContent = "当日无记录";
      block.append(e);
    }
    for (const line of day.lines) {
      block.append(lineRow(line, editable));
    }
    drawerBody.append(block);
  }
}
function seg(text, cls) { const s = document.createElement("span"); s.className = "seg " + cls; s.textContent = text; return s; }
function arrow() { const s = document.createElement("span"); s.className = "arrow"; s.textContent = "→"; return s; }
function lineRow(line, editable) {
  const row = document.createElement("div");
  row.className = "line-row";
  const l = document.createElement("div"); l.className = "l";
  const lab = document.createElement("div"); lab.className = "lab"; lab.textContent = line.label;
  l.append(lab);
  if (line.quote) { const q = document.createElement("div"); q.className = "q"; q.textContent = line.quote; l.append(q); }
  if (line.note) { const n = document.createElement("div"); n.className = "note"; n.textContent = line.note; l.append(n); }
  const r = document.createElement("div"); r.className = "r";
  const contrib = document.createElement("span");
  contrib.className = "contrib " + contribClass(line.contribution);
  contrib.textContent = fmtContrib(line.contribution);
  r.append(contrib);
  if (editable && line.id) {
    if (line.type === "event") {
      const del = document.createElement("button");
      del.className = "mini-btn danger"; del.type = "button"; del.textContent = "撤销";
      del.addEventListener("click", () => { applyItems([{ op: "delete_event", id: line.id }]); persist(); renderMarket(); renderDrawer(); });
      r.append(del);
    } else if (line.type === "pending" || line.type === "pending_rest") {
      const cOp = line.type === "pending_rest" ? "confirm_rest" : "confirm_event";
      const dOp = line.type === "pending_rest" ? "deny_rest" : "deny_event";
      const yes = document.createElement("button");
      yes.className = "mini-btn"; yes.type = "button"; yes.textContent = "确认";
      yes.addEventListener("click", () => { applyItems([{ op: cOp, id: line.id }]); persist(); renderMarket(); renderChat(); renderDrawer(); });
      const no = document.createElement("button");
      no.className = "mini-btn danger"; no.type = "button"; no.textContent = "否认";
      no.addEventListener("click", () => { applyItems([{ op: dOp, id: line.id }]); persist(); renderMarket(); renderChat(); renderDrawer(); });
      r.append(yes, no);
    }
  }
  row.append(l, r);
  return row;
}
function renderTasks() {
  const list = records().tasks.filter((t) => t.deletedAt == null);
  const editable = state.view === "personal";
  if (!list.length) {
    const e = document.createElement("div"); e.className = "drawer-empty"; e.textContent = "还没有持仓任务。说一句「打算…/要在…前完成」即可录入。";
    drawerBody.append(e);
  }
  for (const t of list) {
    const row = document.createElement("div"); row.className = "task-row";
    const head = document.createElement("div"); head.className = "t";
    const title = document.createElement("span"); title.textContent = t.title;
    const badge = document.createElement("span");
    const overdue = t.status === "open" && t.dueAt < TODAY;
    badge.className = "badge " + (t.status === "done" ? "done" : overdue ? "overdue" : "open");
    badge.textContent = t.status === "done" ? "已完成" : overdue ? "逾期" : "进行中";
    head.append(title, badge);
    const meta = document.createElement("div"); meta.className = "meta";
    const due = document.createElement("span"); due.textContent = `截止 ${t.dueAt}`;
    const pos = document.createElement("span"); pos.className = "pos-dots"; pos.textContent = "仓位 " + "●".repeat(t.position) + "○".repeat(5 - t.position);
    meta.append(due, pos);
    if (t.status === "done" && t.doneAt) { const dn = document.createElement("span"); dn.textContent = `完成于 ${String(t.doneAt).slice(0, 10)}`; meta.append(dn); }
    row.append(head, meta);
    if (editable) {
      const actions = document.createElement("div"); actions.className = "card-actions";
      if (t.status === "open") {
        const done = document.createElement("button"); done.className = "card-btn"; done.type = "button"; done.textContent = "标记完成";
        done.addEventListener("click", () => { applyItems([{ op: "complete_task", id: t.id, doneAt: TODAY }]); persist(); renderMarket(); renderDrawer(); });
        actions.append(done);
      }
      const del = document.createElement("button"); del.className = "card-btn ghost"; del.type = "button"; del.textContent = "删除";
      del.addEventListener("click", () => { applyItems([{ op: "delete_task", id: t.id }]); persist(); renderMarket(); renderDrawer(); });
      actions.append(del);
      row.append(actions);
    }
    drawerBody.append(row);
  }
  if (editable) {
    const foot = document.createElement("div"); foot.className = "drawer-foot";
    if (!state.clearArmed) {
      const b = document.createElement("button"); b.className = "clear-btn"; b.type = "button"; b.textContent = "清空我的记录";
      b.addEventListener("click", () => { state.clearArmed = true; renderDrawer(); });
      foot.append(b);
    } else {
      const wrap = document.createElement("div"); wrap.className = "clear-confirm";
      const txt = document.createElement("span"); txt.textContent = "确定清空全部个人记录？不可恢复。";
      const yes = document.createElement("button"); yes.className = "card-btn primary"; yes.type = "button"; yes.textContent = "确定清空";
      yes.addEventListener("click", () => { state.personal = clearPersonal(); state.clearArmed = false; persist(); renderMarket(); renderChat(); renderDrawer(); });
      const no = document.createElement("button"); no.className = "card-btn ghost"; no.type = "button"; no.textContent = "取消";
      no.addEventListener("click", () => { state.clearArmed = false; renderDrawer(); });
      wrap.append(txt, yes, no);
      foot.append(wrap);
    }
    drawerBody.append(foot);
  }
}

/* ---------- 事件绑定 ---------- */
entry.addEventListener("input", () => { sendBtn.disabled = !entry.value.trim() || state.busy; });
entry.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || e.shiftKey || e.isComposing || e.keyCode === 229) return;
  e.preventDefault();
  composer.requestSubmit();
});
composer.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = entry.value.trim();
  if (!text || state.busy) return;
  entry.value = "";
  sendBtn.disabled = true;
  sendText(text);
});
document.querySelectorAll(".examples button").forEach((b) => {
  b.addEventListener("click", () => { entry.value = b.textContent; sendBtn.disabled = false; entry.focus({ preventScroll: true }); });
});
viewToggle.addEventListener("click", () => { setFocusMode(false); scrollChat(); });
$("#reset").addEventListener("click", () => {
  state.personal.chat = [];
  persist();
  renderChat();
  setFocusMode(false);
  entry.focus({ preventScroll: true });
});
$("#view-sample").addEventListener("click", () => setView("sample"));
$("#view-personal").addEventListener("click", () => setView("personal"));
$("#drawer-close").addEventListener("click", closeDrawer);
scrim.addEventListener("click", closeDrawer);
$("#tab-detail").addEventListener("click", () => { state.drawerTab = "detail"; syncTabs(); renderDrawer(); });
$("#tab-tasks").addEventListener("click", () => { state.drawerTab = "tasks"; syncTabs(); renderDrawer(); });
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!drawer.hidden) closeDrawer();
  else if (state.focusMode) setFocusMode(false);
});
new ResizeObserver(() => enterFocusIfNeeded()).observe(stage);

/* ---------- 启动 ---------- */
setView("sample");
renderChat();
extractor.health().then((h) => {
  setModelState(h.mode === "model" ? "model" : h.mode === "mock" ? "mock" : "offline");
});