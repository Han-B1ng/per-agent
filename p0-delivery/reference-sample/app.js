const workspace = document.querySelector(".workspace");
const stage = document.querySelector(".stage");
const messages = document.querySelector(".messages");
const messageScroll = document.querySelector(".message-scroll");
const heading = document.querySelector(".conversation-heading");
const budget = document.querySelector(".conversation-budget");
const composer = document.querySelector(".composer");
const entry = document.querySelector("#entry");
const send = document.querySelector(".send");
const viewToggle = document.querySelector("#view-toggle");

let focusMode = false;

function setFocusMode(active) {
  focusMode = active;
  workspace.dataset.mode = active ? "focus" : "market";
  viewToggle.hidden = !active;
}

function exceedsMarketSpace() {
  return messages.offsetHeight > budget.offsetHeight - heading.offsetHeight;
}

function enterFocusIfNeeded() {
  if (!focusMode && exceedsMarketSpace()) setFocusMode(true);
}

function addMessage(author, content) {
  const message = document.createElement("p");
  message.className = "message";
  message.dataset.author = author;
  const label = document.createElement("span");
  label.className = "sr-only";
  label.textContent = author === "user" ? "你：" : "助手：";
  message.append(label, document.createTextNode(content));
  messages.append(message);
}

function sampleReply(text) {
  if (/休息|放假/.test(text)) return "记下了，你今天想留点时间休息。";
  if (/跑|公里/.test(text)) return "记下了今天的跑步。";
  if (/完成|课设/.test(text)) return "记下了今天完成的这件事。";
  return "收到，已加入这轮演示对话。";
}

entry.addEventListener("input", () => {
  send.disabled = !entry.value.trim();
});

entry.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing || event.keyCode === 229) return;
  event.preventDefault();
  composer.requestSubmit();
});

composer.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = entry.value.trim();
  if (!text) return;
  addMessage("user", text);
  addMessage("assistant", sampleReply(text));
  enterFocusIfNeeded();
  messageScroll.scrollTop = messageScroll.scrollHeight;
  entry.value = "";
  send.disabled = true;
  entry.focus({ preventScroll: true });
});

document.querySelectorAll(".examples button").forEach((button) => {
  button.addEventListener("click", () => {
    entry.value = button.textContent;
    send.disabled = false;
    entry.focus({ preventScroll: true });
  });
});

viewToggle.addEventListener("click", () => {
  setFocusMode(false);
  messageScroll.scrollTop = messageScroll.scrollHeight;
});

document.querySelector("#reset").addEventListener("click", () => {
  messages.replaceChildren();
  entry.value = "";
  send.disabled = true;
  setFocusMode(false);
  entry.focus({ preventScroll: true });
});

new ResizeObserver(() => enterFocusIfNeeded()).observe(stage);

const candles = [
  [995, 1003, 990, 998], [998, 1010, 994, 1007], [1007, 1014, 1002, 1004],
  [1004, 1025, 1001, 1019], [1019, 1038, 1015, 1030], [1030, 1036, 1009, 1016],
  [1016, 1040, 1012, 1035], [1035, 1059, 1032, 1053], [1053, 1075, 1048, 1068],
  [1068, 1082, 1056, 1061], [1061, 1088, 1058, 1082], [1082, 1109, 1077, 1096.2],
  [1096.2, 1138.4, 1091.8, 1128.6]
];
const canvas = document.querySelector("#candles");
const ctx = canvas.getContext("2d");

function drawChart(width, height) {
  if (width < 100 || height < 32) return;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  const left = 7;
  const right = width - 51;
  const top = 8;
  const bottom = height - 23;
  const step = (right - left) / candles.length;
  const y = (value) => bottom - (value - 980) / 170 * (bottom - top);

  ctx.fillStyle = "#ffffff05";
  ctx.fillRect(left + (candles.length - 1) * step, top, step, bottom - top);
  ctx.font = '10px ui-monospace, Menlo, monospace';
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  for (const value of [980, 1020, 1060, 1100, 1140]) {
    const lineY = y(value);
    ctx.strokeStyle = "#ffffff12";
    ctx.beginPath();
    ctx.moveTo(left, lineY);
    ctx.lineTo(right, lineY);
    ctx.stroke();
    ctx.fillStyle = "#90939f";
    ctx.fillText(value.toLocaleString("en-US"), right + 10, lineY);
  }

  candles.forEach(([open, high, low, close], index) => {
    const x = left + (index + 0.5) * step;
    const color = close >= open ? "#82c6a3" : "#c88c97";
    const bodyWidth = Math.min(18, step * .47);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y(high));
    ctx.lineTo(x, y(low));
    ctx.stroke();
    ctx.fillRect(x - bodyWidth / 2, Math.min(y(open), y(close)), bodyWidth, Math.max(2, Math.abs(y(open) - y(close))));
  });

  ctx.textAlign = "center";
  ctx.fillStyle = "#90939f";
  for (const [index, label] of [[0, "08.17"], [3, "09.07"], [6, "09.28"], [9, "10.19"], [12, "11.09"]]) {
    ctx.fillText(label, left + (index + .5) * step, bottom + 13);
  }
}

const plot = document.querySelector(".plot");
new ResizeObserver(([{ contentRect }]) => drawChart(contentRect.width, contentRect.height)).observe(plot);
