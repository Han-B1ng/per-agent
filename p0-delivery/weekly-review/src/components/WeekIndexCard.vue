<script setup lang="ts">
import { computed } from "vue";
import type { ReviewWeekSummary } from "../review";
import { formatPct, formatPoints, pctClass } from "../format";
import { formatShortDate, formatWeekRange } from "../review";

const props = defineProps<{ week: ReviewWeekSummary }>();

const emit = defineEmits<{
  (event: "open-week", payload: { weekStart: string; weekEnd: string }): void;
}>();

const changeClass = computed(() => pctClass(props.week.changePct));
const arrow = computed(() => (props.week.change > 0 ? "↗" : props.week.change < 0 ? "↘" : "→"));
const rangeLabel = computed(() => formatWeekRange(props.week.weekStart, props.week.weekEnd));
const asOfLabel = computed(() =>
  props.week.isCurrent ? `截至今天 ${formatShortDate(props.week.weekEnd)}` : `已收盘 ${formatShortDate(props.week.weekEnd)}`,
);
const spark = computed(() => {
  const values = props.week.sparkline;
  const width = 280;
  const height = 78;
  const padding = 5;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min;
  const flat = spread < 1e-9;
  const points = values.map((value, index) => {
    const x = padding + ((width - padding * 2) * index) / Math.max(1, values.length - 1);
    const y = flat ? height / 2 : height - padding - ((height - padding * 2) * (value - min)) / spread;
    return [x, y] as const;
  });
  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${padding},${height - padding} ${line} ${width - padding},${height - padding}`;
  const last = points[points.length - 1];
  return { line, area, lastX: last[0], lastY: last[1] };
});

function openWeek() {
  emit("open-week", { weekStart: props.week.weekStart, weekEnd: props.week.weekEnd });
}
</script>

<template>
  <article class="index-card" data-testid="index-card" aria-labelledby="index-title">
    <header class="index-head">
      <div>
        <p class="index-eyebrow">WEEKLY INDEX</p>
        <h2 id="index-title">本周指数变化</h2>
      </div>
      <span class="asof" :class="{ current: week.isCurrent }">{{ asOfLabel }}</span>
    </header>

    <p class="week-range">{{ rangeLabel }} · {{ week.dayCount }} 个交易日</p>

    <div class="index-value-line">
      <strong data-testid="index-close">{{ formatPoints(week.close) }}</strong>
      <span class="index-change" :class="changeClass" data-testid="index-change">
        <span aria-hidden="true">{{ arrow }}</span>{{ formatPct(week.changePct) }}
      </span>
    </div>

    <dl class="index-stats">
      <div>
        <dt>周开盘</dt>
        <dd data-testid="index-open">{{ formatPoints(week.open) }}</dd>
      </div>
      <div>
        <dt>{{ week.isCurrent ? "当前点位" : "周收盘" }}</dt>
        <dd>{{ formatPoints(week.close) }}</dd>
      </div>
      <div>
        <dt>周内区间</dt>
        <dd>{{ formatPoints(week.low) }} – {{ formatPoints(week.high) }}</dd>
      </div>
    </dl>

    <div class="spark-wrap" aria-hidden="true">
      <svg viewBox="0 0 280 78" preserveAspectRatio="none">
        <polygon class="spark-area" :class="changeClass" :points="spark.area" />
        <polyline class="spark-line" :class="changeClass" :points="spark.line" />
        <circle class="spark-dot" :class="changeClass" :cx="spark.lastX" :cy="spark.lastY" r="2.6" />
      </svg>
    </div>

    <footer class="index-foot">
      <p>
        计分合计 <b :class="pctClass(week.rawTotal)">{{ formatPct(week.rawTotal) }}</b>
        <span v-if="Math.abs(week.adjustment) > 0.0000001"> · 限幅 {{ formatPct(week.adjustment) }}</span>
      </p>
      <button type="button" class="week-open" data-testid="week-open" @click="openWeek">
        查看周 K 明细 <span aria-hidden="true">→</span>
      </button>
    </footer>

    <p v-if="!week.hasWeekData" class="index-missing">账本尚未覆盖这一周；这里只展示当前指数，不补造行情。</p>
  </article>
</template>

<style scoped>
.index-card {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--line);
  border-radius: 15px;
  padding: 18px 19px 15px;
  background:
    radial-gradient(ellipse at 82% 0%, #8dd8ad12, transparent 55%),
    linear-gradient(155deg, #ffffff08, #ffffff02);
  box-shadow: inset 0 1px #ffffff05;
  min-width: 0;
}
.index-head {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 12px;
}
.index-eyebrow {
  margin: 0 0 5px;
  color: var(--muted);
  font: 8px ui-monospace, Menlo, monospace;
  letter-spacing: 0.24em;
}
.index-head h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 560;
  letter-spacing: -0.02em;
}
.asof {
  padding: 3px 8px;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--muted);
  font-size: 9px;
  white-space: nowrap;
}
.asof.current {
  color: #d8c98d;
  border-color: #d8c98d33;
  background: #d8c98d0d;
}
.week-range {
  margin: 7px 0 0;
  color: var(--muted);
  font: 10px ui-monospace, Menlo, monospace;
}
.index-value-line {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 14px;
}
.index-value-line strong {
  font-size: clamp(30px, 4.2vw, 42px);
  line-height: 1;
  font-weight: 560;
  letter-spacing: -0.06em;
  font-variant-numeric: tabular-nums;
}
.index-change {
  font: 12px ui-monospace, Menlo, monospace;
}
.pos { color: var(--up); }
.neg { color: var(--down); }
.zero { color: var(--muted); }
.index-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 18px 30px;
  margin: 15px 0 0;
}
.index-stats dt {
  color: var(--muted);
  font-size: 9px;
  white-space: nowrap;
}
.index-stats dd {
  margin: 4px 0 0;
  font: 11px ui-monospace, Menlo, monospace;
  white-space: nowrap;
}
.spark-wrap {
  flex: 1 1 64px;
  min-height: 64px;
  margin: 12px 0 0;
}
.spark-wrap svg {
  display: block;
  width: 100%;
  height: 100%;
}
.spark-area {
  fill: #8dd8ad12;
}
.spark-area.neg { fill: #c88c9712; }
.spark-area.zero { fill: #a0a1a90f; }
.spark-line {
  fill: none;
  stroke: #8dd8ad;
  stroke-width: 1.4;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}
.spark-line.neg { stroke: #c88c97; }
.spark-line.zero { stroke: #a0a1a9; }
.spark-dot { fill: #8dd8ad; }
.spark-dot.neg { fill: #c88c97; }
.spark-dot.zero { fill: #a0a1a9; }
.index-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding-top: 11px;
  border-top: 1px solid var(--line);
}
.index-foot p {
  margin: 0;
  color: var(--muted);
  font-size: 9px;
}
.index-foot b {
  font: 10px ui-monospace, Menlo, monospace;
  font-weight: 500;
}
.week-open {
  border: 1px solid #ffffff24;
  border-radius: 8px;
  background: #ffffff08;
  color: var(--text);
  padding: 6px 10px;
  font-size: 10px;
  white-space: nowrap;
}
.week-open:hover {
  background: #ffffff14;
  border-color: #ffffff3a;
}
.index-missing {
  margin: 10px 0 0;
  color: #d8c98d;
  font-size: 10px;
  line-height: 1.6;
}
</style>
