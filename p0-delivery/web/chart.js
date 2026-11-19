// 数据驱动周 K 渲染器：沿用已确认样板的视觉语言（配色/字体/边距/当前周高亮），
// 改为由引擎 weeks 驱动 + 悬停十字 + 点击唤出明细。
const UP = "#82c6a3", DOWN = "#c88c97", GRID = "#ffffff12", LABEL = "#90939f", HL = "#ffffff05", HOVER = "#ffffff0a";

export function createChart(canvas, { onSelect } = {}) {
  const ctx = canvas.getContext("2d");
  const plot = canvas.parentElement;
  let weeks = [];
  let hover = -1;
  let geom = null;

  function niceTicks(min, max, count = 5) {
    const span = max - min || 1;
    const step = Math.pow(10, Math.floor(Math.log10(span / count)));
    const err = span / count / step;
    const mult = err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1;
    const s = step * mult;
    const lo = Math.floor(min / s) * s;
    const hi = Math.ceil(max / s) * s;
    const ticks = [];
    for (let v = lo; v <= hi + 1e-9; v += s) ticks.push(v);
    return { lo, hi, ticks };
  }

  function draw(width, height) {
    if (width < 100 || height < 32 || !weeks.length) { geom = null; return; }
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const left = 7, right = width - 51, top = 8, bottom = height - 23;
    let min = Infinity, max = -Infinity;
    for (const w of weeks) { min = Math.min(min, w.low); max = Math.max(max, w.high); }
    const pad = (max - min) * 0.08 || 10;
    const { lo, hi, ticks } = niceTicks(min - pad, max + pad);
    const y = (v) => bottom - ((v - lo) / (hi - lo)) * (bottom - top);
    const step = (right - left) / weeks.length;
    geom = { left, right, top, bottom, step, y, lo, hi };

    ctx.font = '10px ui-monospace, Menlo, monospace';
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    for (const v of ticks) {
      const ly = y(v);
      if (ly < top - 1 || ly > bottom + 1) continue;
      ctx.strokeStyle = GRID;
      ctx.beginPath(); ctx.moveTo(left, ly); ctx.lineTo(right, ly); ctx.stroke();
      ctx.fillStyle = LABEL;
      ctx.fillText(Math.round(v).toLocaleString("en-US"), right + 10, ly);
    }
    // 当前周高亮
    ctx.fillStyle = HL;
    ctx.fillRect(left + (weeks.length - 1) * step, top, step, bottom - top);
    if (hover >= 0 && hover < weeks.length) {
      ctx.fillStyle = HOVER;
      ctx.fillRect(left + hover * step, top, step, bottom - top);
    }

    weeks.forEach((w, i) => {
      const x = left + (i + 0.5) * step;
      const color = w.close >= w.open ? UP : DOWN;
      const bw = Math.min(18, step * 0.47);
      ctx.strokeStyle = color; ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(x, y(w.high)); ctx.lineTo(x, y(w.low)); ctx.stroke();
      ctx.fillRect(x - bw / 2, Math.min(y(w.open), y(w.close)), bw, Math.max(2, Math.abs(y(w.open) - y(w.close))));
    });

    // 悬停十字与读数
    if (hover >= 0 && hover < weeks.length) {
      const w = weeks[hover];
      const x = left + (hover + 0.5) * step;
      ctx.strokeStyle = "#ffffff2b";
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#e4e6eb";
      ctx.textAlign = x > width / 2 ? "right" : "left";
      const tx = x > width / 2 ? x - 8 : x + 8;
      ctx.fillText(`收 ${w.close.toFixed(1)}`, tx, top + 8);
    }

    ctx.textAlign = "center";
    ctx.fillStyle = LABEL;
    const labelIdx = pickLabels(weeks.length);
    for (const i of labelIdx) {
      const d = weeks[i].weekStart;
      ctx.fillText(`${d.slice(5, 7)}.${d.slice(8, 10)}`, left + (i + 0.5) * step, bottom + 13);
    }
  }

  function pickLabels(n) {
    const want = Math.min(5, n);
    const out = [];
    for (let k = 0; k < want; k++) out.push(Math.round((k * (n - 1)) / (want - 1 || 1)));
    return [...new Set(out)];
  }

  function indexAt(px) {
    if (!geom) return -1;
    const { left, step } = geom;
    const i = Math.floor((px - left) / step);
    return i >= 0 && i < weeks.length ? i : -1;
  }

  canvas.addEventListener("mousemove", (e) => {
    const r = canvas.getBoundingClientRect();
    const i = indexAt(e.clientX - r.left);
    if (i !== hover) { hover = i; redraw(); }
    canvas.style.cursor = i >= 0 ? "pointer" : "default";
  });
  canvas.addEventListener("mouseleave", () => { hover = -1; redraw(); });
  canvas.addEventListener("click", (e) => {
    const r = canvas.getBoundingClientRect();
    const i = indexAt(e.clientX - r.left);
    if (i >= 0 && onSelect) onSelect(i);
  });

  function redraw() {
    const r = plot.getBoundingClientRect();
    draw(r.width, r.height);
  }
  new ResizeObserver(() => redraw()).observe(plot);

  return {
    render(nextWeeks) { weeks = nextWeeks; hover = -1; redraw(); },
    redraw,
  };
}