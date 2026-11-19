import { computeAll, shiftDate, weekStartOf } from "./engine.js";
import { buildSampleRecords, SAMPLE_META } from "./sample-data.js";
import { loadPersonal, savePersonal, clearPersonal, genId, getClientId } from "./store.js";
import { applyItems as applyLedgerItems, getGoals, getTimeline, findRecord } from "./ledger.js";
import * as extractor from "./extractor.js?v=3";
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
let TODAY = localToday();
const fmtIndex = (n) => n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtPct = (x) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(2)}%`;
const fmtContrib = (c) => `${c > 0 ? "+" : ""}${(c * 100).toFixed(2)}%`;
const dateOf = (iso) => String(iso || "").slice(0, 10);

const state = {
  view: "sample",
  page: "market",
  personal: loadPersonal(),
  sample: buildSampleRecords(TODAY),
  focusMode: false,
  busy: false,
  typing: false,
  drawerWeek: null,
  drawerTab: "detail",
  drawerMode: "week",
  drawerId: null,
  clearArmed: false,
  modelState: "mock",
  recordTaskId: "",
  lastExtract: null,
  lastFailed: null,
  generation: 0,
  activeRequest: null,
};
let currentResult = null;
let drawerTimer = null;
let requestSeq = 0;

const records = () => (state.view === "sample" ? state.sample : state.personal);
const persist = () => savePersonal(state.personal);
const editable = () => state.view === "personal";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
function action(text, fn, className = "action-btn") {
  const b = el("button", className, text);
  b.type = "button";
  b.addEventListener("click", fn);
  return b;
}

function refreshToday() {
  const next = localToday();
  if (next === TODAY) return false;
  TODAY = next;
  state.sample = buildSampleRecords(TODAY);
  return true;
}

function applyItems(items) {
  refreshToday();
  const result = applyLedgerItems(state.personal, items, { today: TODAY });
  persist();
  renderAll();
  return result;
}

function clearPersonalData() {
  state.generation += 1;
  state.activeRequest = null;
  state.busy = false;
  state.typing = false;
  state.personal = clearPersonal();
  state.clearArmed = false;
  state.lastExtract = null;
  state.lastFailed = null;
  sendBtn.disabled = !entry.value.trim();
  persist();
  renderAll();
}

function setFocusMode(active) {
  state.focusMode = active;
  workspace.dataset.mode = active ? "focus" : "market";
  viewToggle.hidden = !active;
}
function exceedsMarketSpace() {
  return messages.offsetHeight > budget.offsetHeight - heading.offsetHeight;
}
function enterFocusIfNeeded() {
  if (state.page === "market" && !state.focusMode && exceedsMarketSpace()) setFocusMode(true);
}
function scrollChat() {
  messageScroll.scrollTop = messageScroll.scrollHeight;
}

const chart = createChart($("#candles"), { onSelect: (i) => openDrawer(i) });
function renderMarket() {
  refreshToday();
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
  const label = state.view === "sample" ? SAMPLE_META.label : "我的记录";
  $("#data-tag").textContent = label;
  document.querySelectorAll(".page-data-tag").forEach((n) => { n.textContent = label; });
  $("#candles").setAttribute("aria-label", `${state.view === "sample" ? "样例" : "个人"}周 K 走势，最新 ${fmtIndex(r.latest)} 点`);
  chart.render(r.weeks);
}

function findPending(id) {
  const e = state.personal.events.find((x) => x.id === id && x.status === "pending" && x.deletedAt == null);
  if (e) return { rec: e, kind: "event" };
  const r = state.personal.rests.find((x) => x.id === id && x.status === "pending" && x.deletedAt == null);
  if (r) return { rec: r, kind: "rest" };
  return null;
}
function renderChat() {
  messages.replaceChildren();
  for (const m of state.personal.chat) {
    const p = el("p", "message");
    p.dataset.author = m.role;
    const label = el("span", "sr-only", m.role === "user" ? "你：" : "助手：");
    p.append(label, document.createTextNode(m.text));
    if (m.role === "assistant") {
      for (const id of (m.pending || []).filter((id) => findPending(id))) {
        const hit = findPending(id);
        p.append(confirmCard(hit.rec, hit.kind));
      }
      if (m.failed) p.append(failedCard(m));
    }
    messages.append(p);
  }
  if (state.typing) {
    const t = el("p", "message typing", "正在记录…");
    t.dataset.author = "assistant";
    t.innerHTML = "<i></i><i></i><i></i> 正在记录…";
    messages.append(t);
  }
  scrollChat();
}
function confirmCard(rec, kind) {
  const isRest = kind === "rest";
  const date = isRest ? rec.date : rec.occurredAt;
  const card = el("div", "msg-card");
  card.append(el("div", "card-quote", `「${rec.quote}」`));
  card.append(el("div", "card-meta", `${isRest ? "休息标记" : "事件"}把握不足 · 暂不计分 · 默认记在 ${date}`));
  const actions = el("div", "card-actions");
  const yes = action(isRest ? "确认休息" : "确认计入", () => applyItems([{ op: isRest ? "confirm_rest" : "confirm_event", id: rec.id }]), "card-btn primary");
  const no = action("不记了", () => applyItems([{ op: isRest ? "deny_rest" : "deny_event", id: rec.id }]), "card-btn ghost");
  actions.append(yes, no);
  card.append(actions);
  return card;
}
function failedCard(m) {
  const card = el("div", "msg-card failed");
  const head = el("div", "card-quote", "这条没有进入记录。");
  head.append(el("span", "fail-tag", "未录入"));
  const actions = el("div", "card-actions");
  actions.append(action("重试", () => retryFailed(m, false), "card-btn"));
  actions.append(action("改用本地识别", () => retryFailed(m, true), "card-btn ghost"));
  card.append(head, actions);
  return card;
}
function retryFailed(m, useMock) {
  state.personal.chat = state.personal.chat.filter((x) => x.id !== m.id);
  state.lastFailed = null;
  state.lastExtract = null;
  persist();
  sendText(m.failed.text, { skipUser: true, useMock });
}

function buildContext() {
  refreshToday();
  return {
    today: TODAY,
    now: new Date().toISOString(),
    clientId: getClientId(),
    openTasks: state.personal.tasks.filter((t) => t.status === "open" && t.deletedAt == null).map((t) => ({ id: t.id, title: t.title, dueAt: t.dueAt, position: t.position })),
    pendingEvents: state.personal.events.filter((e) => e.status === "pending" && e.deletedAt == null).map((e) => ({ id: e.id, quote: e.quote, occurredAt: e.occurredAt, eventType: e.eventType, polarity: e.polarity, intensity: e.intensity })),
    pendingRests: state.personal.rests.filter((r) => r.status === "pending" && r.deletedAt == null).map((r) => ({ id: r.id, quote: r.quote, date: r.date })),
    turns: state.personal.chat.filter((m) => !m.failed && m.text).slice(-10).map((m) => ({ role: m.role, content: m.text })),
  };
}

function recordFailure(text, error) {
  const failed = { id: genId("msg"), role: "assistant", text: error.message, failed: { text, code: error.code } };
  state.personal.chat.push(failed);
  state.lastFailed = failed;
  state.lastExtract = { status: "failed", message: error.message };
  if (error.code !== "conflict") setModelState("degraded");
}

async function sendText(text, { skipUser = false, useMock = false } = {}) {
  if (state.busy) return;
  refreshToday();
  if (state.view === "sample") setView("personal");
  const generation = state.generation;
  const requestId = ++requestSeq;
  state.activeRequest = requestId;
  state.busy = true;
  state.lastExtract = { status: "waiting", text };
  sendBtn.disabled = true;
  if (!skipUser) state.personal.chat.push({ id: genId("msg"), role: "user", text });
  state.typing = true;
  renderChat();
  renderRecords();
  enterFocusIfNeeded();
  const res = await extractor.send(text, buildContext(), { useMock });
  if (generation !== state.generation || requestId !== state.activeRequest) return;
  state.activeRequest = null;
  state.typing = false;
  state.busy = false;
  if (res.ok) {
    const write = applyItems(res.items);
    if (!write.applied) {
      recordFailure(text, { code: "conflict", message: "账本已变化，这次操作整批未写入。请按最新记录重试。" });
    } else {
      state.personal.chat.push({ id: genId("msg"), role: "assistant", text: res.reply, pending: write.newPending, mode: res.mode });
      state.lastExtract = { status: "success", mode: res.mode };
      setModelState(res.mode === "model" ? "model" : "mock");
    }
  } else {
    recordFailure(text, res.error);
  }
  persist();
  renderAll();
  enterFocusIfNeeded();
  entry.focus({ preventScroll: true });
}

function setModelState(s) {
  state.modelState = s;
  const status = $("#model-status");
  status.dataset.state = s;
  $("#model-status-text").textContent = { model: "模型在线", mock: "本地 Mock", degraded: "降级 · 样例可用", offline: "离线 · 样例可用" }[s] || s;
  $("#privacy-note").textContent = s === "model" ? "内容会发给模型服务 · 记录仅存本机" : "本地识别 · 记录仅存本机";
}

function setView(v) {
  state.view = v;
  $("#view-sample").setAttribute("aria-pressed", String(v === "sample"));
  $("#view-personal").setAttribute("aria-pressed", String(v === "personal"));
  closeDrawer();
  renderAll();
}
function setPage(page, { taskId = "" } = {}) {
  state.page = page;
  state.recordTaskId = page === "records" ? taskId : "";
  workspace.dataset.page = page;
  workspace.dataset.navOpen = "false";
  $(".stage").hidden = page !== "market";
  $("#goals-page").hidden = page !== "goals";
  $("#records-page").hidden = page !== "records";
  document.querySelectorAll("[data-page-target]").forEach((b) => {
    if (b.dataset.pageTarget === page) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  if (page !== "market") setFocusMode(false);
  closeDrawer();
  renderAll();
}

function showDrawer() {
  if (drawerTimer) { clearTimeout(drawerTimer); drawerTimer = null; }
  drawer.hidden = false;
  scrim.hidden = false;
  requestAnimationFrame(() => { drawer.classList.add("show"); scrim.classList.add("show"); });
}
function openDrawer(i) {
  state.drawerMode = "week";
  state.drawerWeek = i;
  state.drawerId = null;
  state.drawerTab = "detail";
  state.clearArmed = false;
  showDrawer();
  syncTabs();
  renderDrawer();
}
function openEntityDrawer(mode, id) {
  state.drawerMode = mode;
  state.drawerId = id;
  state.drawerWeek = null;
  state.clearArmed = false;
  showDrawer();
  syncTabs();
  renderDrawer();
}
function closeDrawer() {
  if (drawer.hidden) return;
  drawer.classList.remove("show");
  scrim.classList.remove("show");
  state.drawerWeek = null;
  drawerTimer = setTimeout(() => { drawer.hidden = true; scrim.hidden = true; drawerTimer = null; }, 460);
}
function syncTabs() {
  $(".drawer-tabs").hidden = state.drawerMode !== "week";
  $("#tab-detail").setAttribute("aria-selected", String(state.drawerTab === "detail"));
  $("#tab-tasks").setAttribute("aria-selected", String(state.drawerTab === "tasks"));
}
function contribClass(c) { return c > 0 ? "pos" : c < 0 ? "neg" : "zero"; }
function renderDrawer() {
  if (drawer.hidden || !currentResult) return;
  drawerBody.replaceChildren();
  if (state.drawerMode === "goal") return renderGoalDrawer();
  if (state.drawerMode === "record") return renderRecordDrawer();
  if (state.drawerMode === "settings") return renderSettings();
  if (state.drawerWeek == null) return;
  const week = currentResult.weeks[state.drawerWeek];
  if (!week) { closeDrawer(); return; }
  $("#drawer-title").textContent = state.drawerTab === "detail" ? "计算明细" : "持仓任务";
  $("#drawer-sub").textContent = `${week.weekStart} ~ ${week.weekEnd} · 周 K`;
  if (state.drawerTab === "detail") renderDetail(week);
  else renderTasks();
}
function renderDetail(week) {
  const ohlc = el("dl", "week-ohlc");
  for (const [k, v] of [["开", week.open], ["高", week.high], ["低", week.low], ["收", week.close]]) {
    const d = el("div");
    d.append(el("dt", "", k), el("dd", "", fmtIndex(v)));
    ohlc.append(d);
  }
  drawerBody.append(ohlc, el("p", "week-vol", `当周事件 ${week.volume} 条 · 收盘 ${fmtIndex(week.close)}（${fmtPct((week.close - week.open) / week.open)}）`));
  for (const day of week.days) {
    const block = el("div", "day-block");
    const head = el("div", "day-head");
    head.append(el("span", "d", day.date), el("span", "c", `收 ${fmtIndex(day.close)}`));
    const stage3 = el("div", "three-stage");
    stage3.append(seg(`原始 ${fmtContrib(day.raw)}`, "raw"), arrow(), seg(`涨跌停 ${fmtContrib(day.adjustment)}`, "adj"), arrow(), seg(`实际 ${fmtContrib(day.actual)}`, `act ${contribClass(day.actual)}`));
    block.append(head, stage3);
    if (!day.lines.length) block.append(el("div", "drawer-empty", "当日无记录"));
    for (const line of day.lines) block.append(lineRow(line));
    drawerBody.append(block);
  }
}
function seg(text, cls) { return el("span", "seg " + cls, text); }
function arrow() { return el("span", "arrow", "→"); }
function lineRow(line) {
  const row = el("div", "line-row");
  const l = el("div", "l");
  l.append(el("div", "lab", line.label));
  if (line.quote) l.append(el("div", "q", line.quote));
  if (line.note) l.append(el("div", "note", line.note));
  const r = el("div", "r");
  r.append(el("span", "contrib " + contribClass(line.contribution), fmtContrib(line.contribution)));
  if (line.id && ["event", "emotion", "pending", "rest", "pending_rest", "completion"].includes(line.type)) {
    r.append(action("记录", () => openEntityDrawer("record", line.id), "mini-btn"));
  }
  if (editable() && line.id) {
    if (line.type === "event" || line.type === "emotion" || line.type === "rest") {
      r.append(action("撤销", () => applyItems([{ op: line.type === "rest" ? "delete_rest" : "delete_event", id: line.id }]), "mini-btn danger"));
    } else if (line.type === "pending" || line.type === "pending_rest") {
      r.append(action("确认", () => applyItems([{ op: line.type === "pending_rest" ? "confirm_rest" : "confirm_event", id: line.id }]), "mini-btn"));
      r.append(action("否认", () => applyItems([{ op: line.type === "pending_rest" ? "deny_rest" : "deny_event", id: line.id }]), "mini-btn danger"));
    }
  }
  row.append(l, r);
  return row;
}
function renderTasks() {
  const list = records().tasks.filter((t) => t.deletedAt == null);
  if (!list.length) drawerBody.append(el("div", "drawer-empty", "还没有持仓任务。可在目标中心新增，或说一句「要在…前完成」。"));
  for (const t of list) drawerBody.append(taskRow(t));
  if (editable()) {
    const foot = el("div", "drawer-foot");
    if (!state.clearArmed) {
      foot.append(action("清空我的记录", () => { state.clearArmed = true; renderDrawer(); }, "clear-btn"));
    } else {
      const wrap = el("div", "clear-confirm");
      wrap.append(el("span", "", "确定清空全部个人记录？不可恢复。"));
      wrap.append(action("确定清空", clearPersonalData, "card-btn primary"));
      wrap.append(action("取消", () => { state.clearArmed = false; renderDrawer(); }, "card-btn ghost"));
      foot.append(wrap);
    }
    drawerBody.append(foot);
  }
}
function taskRow(t) {
  const row = el("div", "task-row");
  const head = el("div", "t");
  head.append(el("span", "", t.title));
  const goals = getGoals(records(), TODAY);
  const display = [...goals.active, ...goals.done].find((g) => g.id === t.id)?.displayStatus || t.status;
  const names = { done: "已完成", overdue: "逾期", open: "进行中", paused: "暂停" };
  head.append(el("span", `badge ${display}`, names[display] || display));
  const meta = el("div", "meta");
  meta.append(el("span", "", `截止 ${t.dueAt}`), el("span", "pos-dots", `仓位 ${"●".repeat(t.position)}${"○".repeat(5 - t.position)}`));
  if (t.status === "done" && t.doneAt) meta.append(el("span", "", `完成于 ${dateOf(t.doneAt)}`));
  row.append(head, meta);
  const actions = el("div", "card-actions");
  if (editable() && t.status === "open") actions.append(action("标记完成", () => applyItems([{ op: "complete_task", id: t.id }]), "card-btn"));
  actions.append(action("目标详情", () => openEntityDrawer("goal", t.id), "card-btn ghost"));
  if (editable()) actions.append(action("删除", () => applyItems([{ op: "delete_task", id: t.id }]), "card-btn ghost"));
  row.append(actions);
  return row;
}

function renderGoals() {
  const { active, done } = getGoals(records(), TODAY);
  $("#active-goal-count").textContent = active.length;
  $("#done-goal-count").textContent = done.length;
  renderGoalList($("#active-goals"), active, "暂无未完成目标。用右上角「新增目标」创建第一条。");
  renderGoalList($("#done-goals"), done, "暂无已完成目标。完成事实会同时出现在成长记录中。");
  $("#goal-add-open").textContent = editable() ? "新增目标" : "在我的账本新增";
}
function renderGoalList(container, list, emptyText) {
  container.replaceChildren();
  if (!list.length) { container.append(el("div", "goal-empty", emptyText)); return; }
  for (const t of list) {
    const card = el("article", "goal-card");
    card.dataset.goalId = t.id;
    const main = el("div");
    const title = el("div", "goal-title-line");
    title.append(el("h2", "", t.title));
    const names = { done: "已完成", overdue: "逾期", open: "进行中", paused: "暂停" };
    title.append(el("span", `badge ${t.displayStatus}`, names[t.displayStatus]));
    const meta = el("div", "goal-meta");
    meta.append(el("span", "", `到期 ${t.dueAt}`), el("span", "pos-dots", `仓位 ${t.position}/5`), el("span", "", t.id));
    if (t.doneAt) meta.append(el("span", "", `完成 ${dateOf(t.doneAt)}`));
    main.append(title, meta);
    const actions = el("div", "goal-actions");
    actions.append(action("详情", () => openEntityDrawer("goal", t.id)));
    if (editable() && t.status === "open") actions.append(action("完成", () => applyItems([{ op: "complete_task", id: t.id }]), "action-btn primary"));
    card.append(main, actions);
    container.append(card);
  }
}
function renderGoalDrawer() {
  const t = records().tasks.find((x) => x.id === state.drawerId);
  if (!t) { closeDrawer(); return; }
  $("#drawer-title").textContent = "目标详情";
  $("#drawer-sub").textContent = t.id;
  const stack = el("div", "detail-stack");
  const info = el("section", "detail-card");
  info.append(el("h3", "", t.title));
  info.append(el("p", "", `状态：${t.status === "done" ? "已完成" : t.status === "paused" ? "暂停" : t.dueAt < TODAY ? "逾期" : "进行中"}`));
  info.append(el("p", "", `到期日：${t.dueAt} · 仓位：${t.position}/5`));
  if (t.doneAt) info.append(el("p", "", `完成日期：${dateOf(t.doneAt)}`));
  const links = el("div", "detail-actions");
  links.append(action("关联成长记录", () => setPage("records", { taskId: t.id })));
  links.append(action("计分明细", () => openWeekForDate(t.doneAt ? dateOf(t.doneAt) : TODAY)));
  info.append(links);
  stack.append(info);
  if (editable() && t.deletedAt == null) {
    const actions = el("section", "detail-card");
    actions.append(el("h3", "", "目标操作"));
    const row = el("div", "detail-actions");
    if (t.status === "open") row.append(action("标记完成", () => applyItems([{ op: "complete_task", id: t.id }]), "action-btn primary"));
    row.append(action("删除目标", () => applyItems([{ op: "delete_task", id: t.id }]), "action-btn danger"));
    actions.append(row);
    stack.append(actions);
  }
  drawerBody.append(stack);
}

function filters() {
  return { from: $("#filter-from").value, to: $("#filter-to").value, keyword: $("#record-keyword").value, type: $("#record-type").value, taskId: state.recordTaskId, includeDeleted: $("#record-include-deleted").checked };
}
function renderRecords() {
  const list = $("#record-list");
  list.replaceChildren();
  const chip = $("#record-link-chip");
  chip.hidden = !state.recordTaskId;
  if (state.recordTaskId) chip.querySelector("span").textContent = `关联目标：${records().tasks.find((t) => t.id === state.recordTaskId)?.title || state.recordTaskId}`;
  const service = $("#record-service-state");
  service.hidden = true;
  service.className = "service-state";
  service.replaceChildren();
  if (editable() && state.lastExtract?.status === "waiting") {
    service.hidden = false;
    service.textContent = "正在等待模型抽取；现有账本与指数保持不变。";
  } else if (editable() && state.lastExtract?.status === "failed") {
    service.hidden = false;
    service.classList.add("failed");
    service.append(el("span", "", state.lastExtract.message));
    if (state.lastFailed) service.append(action("重试", () => retryFailed(state.lastFailed, false), "mini-btn"));
  }
  const rows = getTimeline(records(), currentResult, filters());
  if (!rows.length) {
    const hasFilters = Object.entries(filters()).some(([k, v]) => !["includeDeleted", "type"].includes(k) && !!v) || filters().type !== "all";
    list.append(el("div", "record-empty", hasFilters ? "没有符合筛选条件的记录。可清除日期、关键词、类型或关联筛选。" : "账本还没有成长记录。在底部发一句话，或先在目标中心创建目标。"));
    return;
  }
  let lastDate = "";
  let group = null;
  for (const row of rows) {
    if (row.date !== lastDate) {
      lastDate = row.date;
      group = el("section", "record-date-group");
      group.append(el("h2", "record-date", row.date));
      list.append(group);
    }
    group.append(recordRow(row));
  }
}
function recordRow(row) {
  const card = el("article", "record-row");
  card.dataset.recordId = row.id;
  const names = { behavior: "行为", emotion: "情绪", rest: "休息", completion: "任务完成" };
  const statusNames = { pending: "待确认", deleted: "已撤销" };
  const type = el("div", "record-type", names[row.type]);
  if (statusNames[row.status]) type.append(el("span", "", statusNames[row.status]));
  const quote = el("div", "record-quote");
  quote.append(el("p", "", row.quote));
  quote.append(el("small", "", `${row.id}${row.taskId ? ` · 关联 ${row.taskId}` : ""}`));
  if (row.note) quote.append(el("small", "", row.note));
  if (row.status === "pending" && editable()) {
    const editor = el("div", "pending-editor");
    const date = document.createElement("input");
    date.type = "date";
    date.value = row.date;
    date.setAttribute("aria-label", "确认生效日期");
    editor.append(date);
    editor.append(action("确认", () => applyItems([{ op: row.kind === "rest" ? "confirm_rest" : "confirm_event", id: row.id, ...(row.kind === "rest" ? { date: date.value } : { occurredAt: date.value }) }]), "mini-btn"));
    editor.append(action("否认", () => applyItems([{ op: row.kind === "rest" ? "deny_rest" : "deny_event", id: row.id }]), "mini-btn danger"));
    quote.append(editor);
  }
  const right = el("div", "record-value " + contribClass(row.contribution), fmtContrib(row.contribution));
  right.append(el("small", "", "生效值"));
  const actions = el("div", "record-actions");
  actions.append(action("详情", () => openEntityDrawer("record", row.id), "mini-btn"));
  const week = action("周 K", () => openWeekForDate(row.date), "mini-btn");
  if (!currentResult.weeks.some((w) => w.weekStart === weekStartOf(row.date))) {
    week.disabled = true;
    week.title = "该日期暂无计分明细";
  }
  actions.append(week);
  const side = el("div", "record-side");
  side.append(right, actions);
  card.append(type, quote, side);
  return card;
}
function renderRecordDrawer() {
  const rec = findRecord(records(), state.drawerId);
  if (!rec) { closeDrawer(); return; }
  const row = getTimeline(records(), currentResult, { includeDeleted: true }).find((r) => r.id === rec.id);
  $("#drawer-title").textContent = rec.kind === "task" ? "任务完成事实" : "成长记录详情";
  $("#drawer-sub").textContent = rec.id;
  const stack = el("div", "detail-stack");
  const info = el("section", "detail-card");
  info.append(el("h3", "", "原文"));
  info.append(el("p", "", rec.kind === "task" ? rec.title : rec.quote));
  info.append(el("p", "", `生效日期：${row?.date || (rec.doneAt ? dateOf(rec.doneAt) : "—")}`));
  info.append(el("p", "", `生效值：${fmtContrib(row?.contribution || 0)} · 状态：${row?.status || rec.status}`));
  info.append(el("p", "", `关联 ID：${rec.id}`));
  const links = el("div", "detail-actions");
  if (rec.kind === "task") links.append(action("返回目标", () => openEntityDrawer("goal", rec.id)));
  links.append(action("打开计分明细", () => openWeekForDate(row?.date || TODAY)));
  info.append(links);
  stack.append(info);
  if (editable() && rec.deletedAt == null && rec.kind !== "task") {
    const edit = el("section", "detail-card");
    edit.append(el("h3", "", rec.status === "pending" ? "补充与确认" : "修正"));
    const form = el("form", "edit-form");
    const dateLabel = el("label", "", "生效日期");
    const date = document.createElement("input");
    date.type = "date";
    date.required = true;
    date.value = rec.kind === "rest" ? rec.date : rec.occurredAt;
    dateLabel.append(date);
    const quoteLabel = el("label", "", "原文");
    const quote = document.createElement("textarea");
    quote.rows = 3;
    quote.maxLength = 200;
    quote.value = rec.quote;
    quoteLabel.append(quote);
    const actions = el("div", "detail-actions");
    actions.append(action("保存修正", () => applyItems([{ op: rec.kind === "rest" ? "correct_rest" : "correct_event", id: rec.id, ...(rec.kind === "rest" ? { date: date.value } : { occurredAt: date.value }), quote: quote.value }]), "action-btn primary"));
    if (rec.status === "pending") actions.append(action("按此日期确认", () => applyItems([{ op: rec.kind === "rest" ? "confirm_rest" : "confirm_event", id: rec.id, ...(rec.kind === "rest" ? { date: date.value } : { occurredAt: date.value }) }]), "action-btn primary"));
    actions.append(action(rec.status === "pending" ? "否认" : "撤销", () => applyItems([{ op: rec.kind === "rest" ? (rec.status === "pending" ? "deny_rest" : "delete_rest") : (rec.status === "pending" ? "deny_event" : "delete_event"), id: rec.id }]), "action-btn danger"));
    form.append(dateLabel, quoteLabel, actions);
    edit.append(form);
    stack.append(edit);
  }
  const history = state.personal.audit.filter((a) => a.targetId === rec.id).slice().reverse();
  if (editable() && history.length) {
    const audits = el("section", "detail-card");
    audits.append(el("h3", "", "变更轨迹"));
    const ul = el("ul", "audit-list");
    for (const a of history.slice(0, 12)) ul.append(el("li", "", `${a.at} · ${a.action}`));
    audits.append(ul);
    stack.append(audits);
  }
  drawerBody.append(stack);
}
function openWeekForDate(date) {
  const ws = weekStartOf(date);
  const index = currentResult.weeks.findIndex((w) => w.weekStart === ws);
  if (index >= 0) openDrawer(index);
  else {
    setPage("market");
    const next = currentResult.weeks.findIndex((w) => w.weekStart === ws);
    if (next >= 0) openDrawer(next);
  }
}

function renderSettings() {
  $("#drawer-title").textContent = "设置与数据";
  $("#drawer-sub").textContent = state.view === "sample" ? "样例只读" : "个人账本 · localStorage v2";
  const stack = el("div", "detail-stack");
  const data = el("section", "detail-card");
  data.append(el("h3", "", "数据范围"));
  data.append(el("p", "export-note", state.view === "sample" ? "当前导出只包含虚构样例，不会触碰个人账本。样例不可清空或修改。" : "当前导出只包含个人账本。清空会同时移除 v1/v2 个人数据，不影响样例。"));
  const actions = el("div", "detail-actions");
  actions.append(action(state.view === "sample" ? "导出样例 JSON" : "导出我的 JSON", exportCurrent));
  if (editable()) {
    if (!state.clearArmed) actions.append(action("清空我的记录", () => { state.clearArmed = true; renderDrawer(); }, "action-btn danger"));
    else {
      actions.append(action("确定清空", clearPersonalData, "action-btn danger"));
      actions.append(action("取消", () => { state.clearArmed = false; renderDrawer(); }));
    }
  }
  data.append(actions);
  stack.append(data);
  drawerBody.append(stack);
}
function exportCurrent() {
  refreshToday();
  const payload = { scope: state.view, exportedAt: new Date().toISOString(), records: records() };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `personal-economy-${state.view}-${TODAY}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderAll() {
  renderMarket();
  renderGoals();
  renderRecords();
  renderChat();
  renderDrawer();
}

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
document.querySelectorAll(".examples button").forEach((b) => b.addEventListener("click", () => { entry.value = b.textContent; sendBtn.disabled = false; entry.focus({ preventScroll: true }); }));
viewToggle.addEventListener("click", () => { setFocusMode(false); scrollChat(); });
$("#reset").addEventListener("click", () => { state.personal.chat = []; state.lastExtract = null; state.lastFailed = null; persist(); renderAll(); setFocusMode(false); entry.focus({ preventScroll: true }); });
$("#view-sample").addEventListener("click", () => setView("sample"));
$("#view-personal").addEventListener("click", () => setView("personal"));
document.querySelectorAll("[data-page-target]").forEach((b) => b.addEventListener("click", () => setPage(b.dataset.pageTarget)));
$("#sidebar-collapse").addEventListener("click", () => {
  const collapsed = workspace.dataset.sidebar === "collapsed";
  workspace.dataset.sidebar = collapsed ? "open" : "collapsed";
  $("#sidebar-collapse").setAttribute("aria-label", collapsed ? "收起侧栏" : "展开侧栏");
  requestAnimationFrame(enterFocusIfNeeded);
});
$("#nav-menu").addEventListener("click", () => { workspace.dataset.navOpen = workspace.dataset.navOpen === "true" ? "false" : "true"; });
$("#settings-open").addEventListener("click", () => openEntityDrawer("settings", "settings"));
$("#drawer-close").addEventListener("click", closeDrawer);
scrim.addEventListener("click", closeDrawer);
$("#tab-detail").addEventListener("click", () => { state.drawerTab = "detail"; syncTabs(); renderDrawer(); });
$("#tab-tasks").addEventListener("click", () => { state.drawerTab = "tasks"; syncTabs(); renderDrawer(); });
$("#goal-add-open").addEventListener("click", () => {
  refreshToday();
  if (!editable()) setView("personal");
  $("#goal-form").hidden = false;
  $("#goal-due-input").value ||= shiftDate(TODAY, 7);
  $("#goal-title-input").focus();
});
$("#goal-form-cancel").addEventListener("click", () => { $("#goal-form").hidden = true; $("#goal-form").reset(); });
$("#goal-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const title = $("#goal-title-input").value.trim();
  const dueAt = $("#goal-due-input").value;
  if (!title || !dueAt) return;
  applyItems([{ op: "add_task", task: { title, dueAt, position: Number($("#goal-position").value) } }]);
  $("#goal-form").hidden = true;
  $("#goal-form").reset();
});
for (const selector of ["#filter-from", "#filter-to", "#record-type", "#record-include-deleted"]) $(selector).addEventListener("change", renderRecords);
$("#record-keyword").addEventListener("input", renderRecords);
$("#record-clear").addEventListener("click", () => {
  for (const selector of ["#filter-from", "#filter-to", "#record-keyword"]) $(selector).value = "";
  $("#record-type").value = "all";
  $("#record-include-deleted").checked = false;
  state.recordTaskId = "";
  renderRecords();
});
$("#record-link-chip button").addEventListener("click", () => { state.recordTaskId = ""; renderRecords(); });
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!drawer.hidden) closeDrawer();
  else if (workspace.dataset.navOpen === "true") workspace.dataset.navOpen = "false";
  else if (state.focusMode) setFocusMode(false);
});
new ResizeObserver(() => enterFocusIfNeeded()).observe(stage);
new ResizeObserver(() => enterFocusIfNeeded()).observe(messages);
document.addEventListener("visibilitychange", () => { if (refreshToday()) renderAll(); });
setInterval(() => { if (refreshToday()) renderAll(); }, 60000);

setPage("market");
renderAll();
extractor.health().then((h) => setModelState(h.mode === "model" ? "model" : h.mode === "mock" ? "mock" : "offline"));
