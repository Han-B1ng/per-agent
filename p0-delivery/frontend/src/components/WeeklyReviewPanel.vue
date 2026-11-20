<script setup lang="ts">
import { computed } from "vue";
import type { WeeklyReview } from "../../../weekly-review/src/review";
import { formatPct, formatShortDate, formatWeekRange } from "../../../weekly-review/src/index";

const props = defineProps<{ review: WeeklyReview }>();
const emit = defineEmits<{
  (event: "open-goal", taskId: string): void;
  (event: "open-week", payload: { weekStart: string; weekEnd: string; lineId?: string; targetId?: string }): void;
}>();

const range = computed(() => formatWeekRange(props.review.week.weekStart, props.review.week.weekEnd));
const asOf = computed(() => props.review.week.isCurrent ? `截至 ${formatShortDate(props.review.week.weekEnd)}` : "已收盘");
const statusLabel = { open: "进行中", overdue: "已逾期", paused: "已暂停" } as const;
const pctClass = (value: number) => value > 0 ? "pos" : value < 0 ? "neg" : "zero";

function openWeek() {
  emit("open-week", { weekStart: props.review.week.weekStart, weekEnd: props.review.week.weekEnd });
}
function openContribution(row: WeeklyReview["contributions"][number]) {
  emit("open-week", {
    weekStart: props.review.week.weekStart,
    weekEnd: props.review.week.weekEnd,
    lineId: row.lineId ?? undefined,
    targetId: row.targetId ?? undefined,
  });
}
</script>

<template>
  <section class="weekly-review" data-testid="weekly-review" :data-week-key="review.week.weekKey" aria-labelledby="review-week-title">
    <header class="weekly-head">
      <div>
        <h2 id="review-week-title">{{ range }}</h2>
        <p>{{ asOf }}</p>
      </div>
      <div class="weekly-controls"><slot name="week-controls" /></div>
    </header>

    <div class="weekly-index" data-testid="index-card">
      <div class="weekly-change">
        <span>本周指数变化</span>
        <strong :class="pctClass(review.week.changePct)">{{ formatPct(review.week.changePct) }}</strong>
      </div>
      <div class="weekly-stat"><span>周开盘</span><strong>{{ review.week.open.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) }}</strong></div>
      <div class="weekly-stat"><span>{{ review.week.isCurrent ? "最新点位" : "周收盘" }}</span><strong>{{ review.week.close.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) }}</strong></div>
      <button type="button" class="weekly-week-btn" data-testid="week-open" @click="openWeek">查看周 K <span aria-hidden="true">↗</span></button>
    </div>

    <div class="weekly-columns">
      <section class="weekly-group" data-testid="completed-section">
        <h3>本周已完成</h3>
        <div class="weekly-list">
          <button v-for="goal in review.completed" :key="goal.taskId" type="button" class="weekly-row" data-testid="completed-row" :data-task-id="goal.taskId" @click="emit('open-goal', goal.taskId)">
            <span class="weekly-row-title">{{ goal.title }}</span>
            <span class="weekly-row-meta">{{ formatShortDate(goal.doneDate) }}</span>
            <span class="weekly-arrow" aria-hidden="true">↗</span>
          </button>
          <p v-if="!review.completed.length" class="weekly-empty">本周还没有完成的目标。</p>
        </div>
      </section>
      <section class="weekly-group" data-testid="ongoing-section">
        <h3>仍在进行</h3>
        <div class="weekly-list">
          <button v-for="goal in review.ongoing" :key="goal.taskId" type="button" class="weekly-row" data-testid="ongoing-row" :data-task-id="goal.taskId" @click="emit('open-goal', goal.taskId)">
            <span class="weekly-row-title">{{ goal.title }}</span>
            <span class="weekly-row-meta">{{ statusLabel[goal.status] }} · {{ goal.position }}/5</span>
            <span class="weekly-arrow" aria-hidden="true">↗</span>
          </button>
          <p v-if="!review.ongoing.length" class="weekly-empty">没有仍在进行的目标。</p>
        </div>
      </section>
    </div>

    <section class="weekly-contrib" data-testid="contribution-list">
      <h3>主要贡献</h3>
      <div class="weekly-list">
        <button v-for="row in review.contributions" :key="row.key" type="button" class="weekly-contrib-row" :data-testid="row.type === 'completion' ? 'contribution-completion' : 'contribution-row'" :data-line-id="row.lineId || undefined" :data-target-id="row.targetId || undefined" @click="openContribution(row)">
          <span class="weekly-row-title">{{ row.type === "completion" ? "任务完成" : row.label }}<small v-if="row.quote">「{{ row.quote }}」</small></span>
          <span class="weekly-contrib-value" :class="pctClass(row.contribution)">{{ row.status === "pending" ? "待确认" : formatPct(row.contribution) }}</span>
          <span class="weekly-arrow" aria-hidden="true">↗</span>
        </button>
        <p v-if="!review.contributions.length" class="weekly-empty">本周还没有计分记录。</p>
      </div>
    </section>
  </section>
</template>

<style scoped>
.weekly-review { display: grid; gap: 24px; }
.weekly-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; }
.weekly-head h2 { margin: 0; font-size: 19px; font-weight: 560; letter-spacing: -.03em; }
.weekly-head p { margin: 6px 0 0; color: var(--muted); font-size: 10px; }
.weekly-controls { display: flex; align-items: center; gap: 8px; }
.weekly-index { display: grid; grid-template-columns: minmax(220px, 1.2fr) 1fr 1fr auto; gap: 26px; align-items: center; padding: 22px 24px; border: 1px solid var(--line); border-radius: 12px; background: linear-gradient(155deg, #ffffff06, #ffffff02); }
.weekly-change span, .weekly-stat span { display: block; color: var(--muted); font-size: 9px; }
.weekly-change strong { display: block; margin-top: 10px; font: 28px var(--mono); font-weight: 500; letter-spacing: -.03em; }
.weekly-stat strong { display: block; margin-top: 8px; font: 14px var(--mono); font-weight: 500; }
.pos { color: var(--up); }
.neg { color: var(--down); }
.zero { color: var(--muted); }
.weekly-week-btn { padding: 7px 10px; border: 1px solid var(--line); border-radius: 6px; background: #ffffff04; color: var(--text); font-size: 10px; white-space: nowrap; }
.weekly-week-btn:hover { background: #ffffff0b; }
.weekly-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 44px; }
.weekly-group h3, .weekly-contrib h3 { margin: 0 0 14px; font-size: 17px; font-weight: 560; letter-spacing: -.02em; }
.weekly-list { display: grid; gap: 1px; }
.weekly-row, .weekly-contrib-row { display: flex; align-items: center; gap: 16px; width: 100%; min-height: 44px; padding: 9px 12px; border: 1px solid var(--line); border-radius: 7px; background: #ffffff04; color: var(--text); text-align: left; margin-bottom: 8px; }
.weekly-row:hover, .weekly-contrib-row:hover { background: #ffffff08; border-color: #ffffff24; }
.weekly-row-title { flex: 1; min-width: 0; font-size: 11px; font-weight: 500; overflow-wrap: anywhere; }
.weekly-row-title small { display: block; margin-top: 3px; color: var(--muted); font: 9px var(--mono); font-weight: 400; }
.weekly-row-meta { color: var(--muted); font: 9px var(--mono); white-space: nowrap; }
.weekly-arrow { color: var(--muted); font-size: 12px; }
.weekly-contrib { padding-top: 4px; }
.weekly-contrib-row { border: 0; border-bottom: 1px solid var(--line); border-radius: 0; background: transparent; padding-inline: 2px; }
.weekly-contrib-value { color: var(--up); font: 11px var(--mono); white-space: nowrap; }
.weekly-empty { margin: 0; padding: 12px; color: var(--muted); font-size: 10px; border: 1px dashed var(--line); border-radius: 7px; }
@media (max-width: 760px) {
  .weekly-head { align-items: flex-start; flex-direction: column; }
  .weekly-index { grid-template-columns: 1fr 1fr; gap: 18px; padding: 18px; }
  .weekly-change { grid-column: 1 / -1; }
  .weekly-week-btn { grid-column: 1 / -1; justify-self: start; }
  .weekly-columns { grid-template-columns: 1fr; gap: 22px; }
}
</style>
