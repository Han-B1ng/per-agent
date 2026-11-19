<script setup lang="ts">
import { computed } from "vue";
import type { ReviewContribution } from "../review";
import { formatPct, pctClass } from "../format";
import { formatShortDate } from "../review";

const props = defineProps<{
  contributions: ReviewContribution[];
  rawTotal: number;
  adjustment: number;
  weekStart: string;
  weekEnd: string;
}>();

const emit = defineEmits<{
  (event: "open-week", payload: { weekStart: string; weekEnd: string; lineId?: string; targetId?: string }): void;
}>();

const names: Record<string, string> = {
  completion: "任务完成",
  event: "行为",
  emotion: "情绪",
  pending: "待确认",
  pending_rest: "待确认休息",
  overdue: "逾期",
  rest: "停牌恢复",
  decay: "沉默衰减",
};
const statusNames: Record<string, string> = {
  pending: "待确认 · 未计分",
  zero: "不计分",
  capped: "未计分",
};

const totalClass = computed(() => pctClass(props.rawTotal));

function dateLabel(row: ReviewContribution) {
  if (row.firstDate === row.lastDate) return formatShortDate(row.firstDate);
  return `${formatShortDate(row.firstDate)}–${formatShortDate(row.lastDate)}`;
}

function openWeek(row: ReviewContribution) {
  emit("open-week", {
    weekStart: props.weekStart,
    weekEnd: props.weekEnd,
    lineId: row.lineId ?? undefined,
    targetId: row.targetId ?? undefined,
  });
}
</script>

<template>
  <section class="contribution-panel" aria-labelledby="contribution-title" data-testid="contribution-list">
    <header class="contribution-head">
      <div>
        <h2 id="contribution-title">本周贡献</h2>
        <p>{{ contributions.length ? "点击任一条目查看周 K 明细" : "周 K 明细的逐条来源" }}</p>
      </div>
      <div class="contribution-total" :class="totalClass">
        {{ formatPct(rawTotal) }}
        <small>计分合计</small>
      </div>
    </header>

    <ul v-if="contributions.length" class="contribution-rows">
      <li v-for="row in contributions" :key="row.key">
        <button
          class="contribution-row"
          type="button"
          :class="row.status"
          :data-testid="row.type === 'completion' ? 'contribution-completion' : 'contribution-row'"
          :data-line-id="row.lineId || undefined"
          :data-target-id="row.targetId || undefined"
          :aria-label="`查看周 K 明细：${row.label}${row.quote ? `，${row.quote}` : ''}`"
          @click="openWeek(row)"
        >
          <span class="contribution-icon" aria-hidden="true">{{ row.type === "completion" ? "✓" : row.type === "emotion" ? "○" : row.type === "pending" || row.type === "pending_rest" ? "?" : row.type === "overdue" || row.type === "decay" ? "↓" : "·" }}</span>
          <span class="contribution-main">
            <span class="contribution-title-line">
              <strong>{{ names[row.type] || row.label }}</strong>
              <span v-if="statusNames[row.status]" class="contribution-status">{{ statusNames[row.status] }}</span>
              <span class="contribution-date">{{ dateLabel(row) }}</span>
            </span>
            <span v-if="row.quote" class="contribution-quote">{{ row.quote }}</span>
            <span v-if="row.note && row.note !== statusNames[row.status]" class="contribution-note">{{ row.note }}</span>
          </span>
          <span class="contribution-value" :class="pctClass(row.contribution)">
            {{ formatPct(row.contribution) }}
            <small>周 K ›</small>
          </span>
        </button>
      </li>
    </ul>
    <p v-else class="contribution-empty">
      本周还没有计分记录。情绪与待确认项会出现在这里，但不计入指数。
    </p>

    <p v-if="Math.abs(adjustment) > 0.0000001" class="contribution-footnote">
      计分合计未含单日涨跌停调整 {{ formatPct(adjustment) }}；卡片涨跌幅为限幅后的实际值。
    </p>
    <p v-else-if="contributions.length" class="contribution-footnote">
      计分合计 {{ formatPct(rawTotal) }} 与周 K 逐日明细一致。
    </p>
  </section>
</template>

<style scoped>
.contribution-panel {
  border: 1px solid var(--line);
  border-radius: 14px;
  background: #ffffff03;
  padding: 15px 16px 12px;
  min-width: 0;
}
.contribution-head {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 12px;
  padding-bottom: 11px;
  border-bottom: 1px solid var(--line);
}
.contribution-head h2 {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.contribution-head p {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 10px;
}
.contribution-total {
  font: 12px ui-monospace, Menlo, monospace;
  text-align: right;
  white-space: nowrap;
}
.contribution-total small {
  display: block;
  margin-top: 3px;
  color: var(--muted);
  font: 9px Inter, sans-serif;
}
.pos { color: var(--up); }
.neg { color: var(--down); }
.zero { color: var(--muted); }
.contribution-rows {
  margin: 0;
  padding: 0;
  list-style: none;
}
.contribution-row {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) auto;
  gap: 9px;
  align-items: start;
  width: 100%;
  min-height: 44px;
  padding: 10px 0;
  border: 0;
  border-bottom: 1px solid #ffffff0b;
  background: transparent;
  text-align: left;
}
.contribution-row:last-child { border-bottom: 0; }
.contribution-row:hover .contribution-title-line strong { color: #fff; }
.contribution-row:focus-visible {
  outline: 2px solid #a5b7ce;
  outline-offset: 2px;
  border-radius: 6px;
}
.contribution-icon {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  margin-top: 1px;
  border: 1px solid var(--line);
  border-radius: 6px;
  color: var(--muted);
  font: 10px ui-monospace, Menlo, monospace;
  background: #ffffff07;
}
.contribution-row.pending .contribution-icon {
  color: #d8c98d;
  border-color: #d8c98d3d;
  background: #d8c98d12;
}
.contribution-main { min-width: 0; display: grid; gap: 3px; }
.contribution-title-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.contribution-title-line strong {
  font-size: 11px;
  font-weight: 550;
  transition: color 0.2s;
}
.contribution-status {
  padding: 1px 6px;
  border-radius: 999px;
  background: #d8c98d1f;
  color: #d8c98d;
  font-size: 9px;
}
.contribution-date {
  margin-left: auto;
  color: var(--muted);
  font: 9px ui-monospace, Menlo, monospace;
  white-space: nowrap;
}
.contribution-quote {
  color: var(--muted);
  font-size: 11px;
  line-height: 1.45;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.contribution-note {
  color: #d8c98d;
  font-size: 9px;
}
.contribution-value {
  text-align: right;
  font: 12px ui-monospace, Menlo, monospace;
  white-space: nowrap;
}
.contribution-value small {
  display: block;
  margin-top: 3px;
  color: var(--muted);
  font: 9px Inter, sans-serif;
}
.contribution-empty {
  margin: 0;
  padding: 18px 0 10px;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.7;
}
.contribution-footnote {
  margin: 8px 0 0;
  padding-top: 8px;
  border-top: 1px dashed #ffffff12;
  color: var(--muted);
  font-size: 9px;
  line-height: 1.55;
}
</style>
