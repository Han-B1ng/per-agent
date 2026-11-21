// 数据驱动周 K 渲染器：沿用已确认样板的视觉语言（配色/字体/边距/当前周高亮），
// 改为由引擎 weeks 驱动 + 悬停十字 + 点击唤出明细。
const UP = "#82c6a3", DOWN = "#c88c97", GRID = "#ffffff12", LABEL = "#90939f", HL = "#ffffff05", HOVER = "#ffffff0a";
const cssVar = (canvas, name, fallback) => {
  const value = getComputedStyle(canvas.parentElement || canvas).getPropertyValue(name).trim();
  return value || fallback;
};

export function createChart(canvas, { onSelect } = {}) {
  const ctx = canvas.getContext("2d");
  const plot = canvas.parentElement;
  let weeks = [];
  let hover = -1;
  let geom = null;
  let mode = "full";
  let highlightLast = true;

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
    const bare = mode === "bare";
    const up = cssVar(canvas, "--pe-color-chart-up", UP);
    const down = cssVar(canvas, "--pe-color-chart-down", DOWN);
    const grid = cssVar(canvas, "--pe-color-chart-grid", GRID);
    const labelColor = cssVar(canvas, "--pe-color-text-muted", LABEL);
    const highlight = cssVar(canvas, "--pe-color-chart-period-highlight", HL);
    const hoverColor = cssVar(canvas, "--pe-color-surface-selected", HOVER);
    const guide = cssVar(canvas, "--pe-color-chart-guide", "#8dd8ad66");
    const marker = cssVar(canvas, "--pe-color-chart-marker", "#8dd8ad");
    const historySelection = cssVar(canvas, "--pe-color-chart-history-selection", "#58606d");
    const inverse = cssVar(canvas, "--pe-color-text-inverse", "#0b0c0e");
    const primaryText = cssVar(canvas, "--pe-color-text-primary", "#e4e6eb");
    const left = bare ? 2 : 7;
    const right = bare ? width - 2 : width - 51;
    const top = bare ? 2 : 8;
    const bottom = bare ? height - 2 : height - 23;
    let min = Infinity, max = -Infinity;
    for (const w of weeks) { min = Math.min(min, w.low); max = Math.max(max, w.high); }
    const pad = (max - min) * 0.08 || 10;
    const { lo, hi, ticks } = niceTicks(min - pad, max + pad);
    const y = (v) => bottom - ((v - lo) / (hi - lo)) * (bottom - top);
    const step = (right - left) / weeks.length;
    geom = { left, right, top, bottom, step, y, lo, hi };

    if (!bare) {
      ctx.font = '10px ui-monospace, Menlo, monospace';
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      for (const v of ticks) {
        const ly = y(v);
        if (ly < top - 1 || ly > bottom + 1) continue;
        ctx.strokeStyle = grid;
        ctx.beginPath(); ctx.moveTo(left, ly); ctx.lineTo(right, ly); ctx.stroke();
        ctx.fillStyle = labelColor;
        ctx.fillText(Math.round(v).toLocaleString("en-US"), right + 10, ly);
      }
      // 当前周高亮；浏览历史窗口时不把窗口末周误标为当前周
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = highlight;
      if (highlightLast && weeks.length) ctx.fillRect(left + (weeks.length - 1) * step, top, step, bottom - top);
      if (hover >= 0 && hover < weeks.length) {
        ctx.fillStyle = hoverColor;
        ctx.fillRect(left + hover * step, top, step, bottom - top);
      }
      ctx.restore();
    }

    weeks.forEach((w, i) => {
      const x = left + (i + 0.5) * step;
      const color = w.close >= w.open ? up : down;
      const bw = Math.min(bare ? 24 : 18, step * (bare ? 0.36 : 0.47));
      ctx.strokeStyle = color; ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(x, y(w.high)); ctx.lineTo(x, y(w.low)); ctx.stroke();
      ctx.fillRect(x - bw / 2, Math.min(y(w.open), y(w.close)), bw, Math.max(2, Math.abs(y(w.open) - y(w.close))));
    });

    if (!bare) {
      // 当前价水平线与右侧价签
      const last = weeks[weeks.length - 1];
      const cy = y(last.close);
      ctx.strokeStyle = guide;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(left, cy); ctx.lineTo(right, cy); ctx.stroke();
      ctx.setLineDash([]);
      const label = last.close.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      ctx.font = '10px ui-monospace, Menlo, monospace';
      const labelWidth = Math.max(42, ctx.measureText(label).width + 14);
      const lx = width - labelWidth - 2;
      ctx.fillStyle = marker;
      ctx.beginPath();
      ctx.roundRect(lx, cy - 9, labelWidth, 18, 4);
      ctx.fill();
      ctx.fillStyle = inverse;
      ctx.textAlign = "center";
      ctx.fillText(label, lx + labelWidth / 2, cy);

      // 悬停十字与读数
      if (hover >= 0 && hover < weeks.length) {
        const w = weeks[hover];
        const x = left + (hover + 0.5) * step;
        ctx.strokeStyle = historySelection;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = primaryText;
        ctx.textAlign = x > width / 2 ? "right" : "left";
        const tx = x > width / 2 ? x - 8 : x + 8;
        ctx.fillText(`收 ${w.close.toFixed(1)}`, tx, top + 8);
      }

      ctx.textAlign = "center";
      ctx.fillStyle = labelColor;
      const labelIdx = pickLabels(weeks.length);
      for (const i of labelIdx) {
        const d = weeks[i].weekStart;
        ctx.fillText(`${d.slice(5, 7)}.${d.slice(8, 10)}`, left + (i + 0.5) * step, bottom + 13);
      }
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

  function onMove(e) {
    const r = canvas.getBoundingClientRect();
    const i = indexAt(e.clientX - r.left);
    if (i !== hover) { hover = i; redraw(); }
    canvas.style.cursor = i >= 0 ? "pointer" : "default";
  }
  function onLeave() { hover = -1; redraw(); }
  function onClick(e) {
    const r = canvas.getBoundingClientRect();
    const i = indexAt(e.clientX - r.left);
    if (i >= 0 && onSelect) onSelect(i);
  }
  canvas.addEventListener("mousemove", onMove);
  canvas.addEventListener("mouseleave", onLeave);
  canvas.addEventListener("click", onClick);

  function redraw() {
    const r = plot.getBoundingClientRect();
    draw(r.width, r.height);
  }
  const observer = new ResizeObserver(() => redraw());
  observer.observe(plot);

  return {
    render(nextWeeks) { weeks = nextWeeks; hover = -1; redraw(); },
    setMode(nextMode) { mode = nextMode === "bare" ? "bare" : "full"; redraw(); },
    setHighlightLast(next) { highlightLast = next !== false; redraw(); },
    redraw,
    destroy() {
      observer.disconnect();
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseleave", onLeave);
      canvas.removeEventListener("click", onClick);
    },
  };
}