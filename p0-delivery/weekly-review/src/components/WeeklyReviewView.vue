<script setup lang="ts">
import { computed } from "vue";
import ContributionList from "./ContributionList.vue";
import WeekIndexCard from "./WeekIndexCard.vue";
import type { ReviewOngoingGoal, WeeklyReview } from "../review";
import { formatPct } from "../format";
import { formatShortDate, formatWeekRange } from "../review";

const props = defineProps<{ review: WeeklyReview }>();

const emit = defineEmits<{
  (event: "open-goal", taskId: string): void;
  (event: "open-week", payload: { weekStart: string; weekEnd: string; lineId?: string; targetId?: string }): void;
}>();

const rangeLabel = computed(() => formatWeekRange(props.review.week.weekStart, props.review.week.weekEnd));
const asOfLabel = computed(() =>
  props.review.week.isCurrent ? `截至今天 ${formatShortDate(props.review.week.weekEnd)}` : `已收盘 ${formatShortDate(props.review.week.weekEnd)}`,
);
const ongoingLabels: Record<ReviewOngoingGoal["status"], string> = {
  open: "进行中",
  overdue: "已逾期",
  paused: "已暂停",
};

function forwardWeek(payload: { weekStart: string; weekEnd: string; lineId?: string; targetId?: string }) {
  emit("open-week", payload);
}
</script>

<template>
  <section class="review-page" data-testid="weekly-review" :data-week-key="review.week.weekKey" aria-labelledby="review-title">
    <header class="review-heading">
      <div class="review-heading-main">
        <p class="eyebrow">GROWTH RECORDS / WEEKLY</p>
        <h2 id="review-title">
          本周复盘
          <span class="view-tag">成长记录 · 本周</span>
        </h2>
        <p class="review-sub">
          {{ rangeLabel }} · {{ asOfLabel }}。只读取现有账本与引擎输出，不另存一份复盘数据。
        </p>
      </div>
      <div class="review-controls">
        <slot name="week-controls" />
      </div>
    </header>

    <p v-if="review.isEmpty" class="ledger-empty">
      账本还是空的。这个视图不写入任何数据；在目标中心创建目标或用对话记录今天后，指数与复盘会自动重算。
    </p>

    <div class="review-hero-grid">
      <WeekIndexCard :week="review.week" @open-week="forwardWeek" />
      <ContributionList
        :contributions="review.contributions"
        :raw-total="review.week.rawTotal"
        :adjustment="review.week.adjustment"
        :week-start="review.week.weekStart"
        :week-end="review.week.weekEnd"
        @open-week="forwardWeek"
      />
    </div>

    <section class="review-group" data-testid="completed-section" aria-labelledby="completed-title">
      <header class="group-head">
        <div class="group-title">
          <h2 id="completed-title">本周已完成</h2>
          <span class="count">{{ review.completedCount }}</span>
        </div>
        <small>按完成时间倒序</small>
      </header>
      <ul v-if="review.completed.length" class="goal-rows">
        <li v-for="goal in review.completed" :key="goal.taskId">
          <button
            class="goal-row completed-row"
            type="button"
            data-testid="completed-row"
            :data-task-id="goal.taskId"
            :aria-label="`查看已完成目标：${goal.title}`"
            @click="emit('open-goal', goal.taskId)"
          >
            <span class="goal-mark done" aria-hidden="true">✓</span>
            <span class="goal-main">
              <strong>{{ goal.title }}</strong>
              <span class="goal-meta">
                <span>完成于 {{ formatShortDate(goal.doneDate) }}</span>
                <span>到期 {{ formatShortDate(goal.dueAt) }}</span>
                <span>仓位 {{ goal.position }}</span>
              </span>
            </span>
            <span class="goal-value pos">{{ formatPct(goal.contribution) }}<small>完成增益</small></span>
            <span class="goal-chevron" aria-hidden="true">›</span>
          </button>
        </li>
      </ul>
      <p v-else class="group-empty">
        本周还没有完成的目标。完成目标后，完成增益会自动进入指数与本周贡献。
      </p>
    </section>

    <section class="review-group" data-testid="ongoing-section" aria-labelledby="ongoing-title">
      <header class="group-head">
        <div class="group-title">
          <h2 id="ongoing-title">仍在进行</h2>
          <span class="count">{{ review.ongoingCount }}</span>
        </div>
        <small>状态与到期日来自同一账本</small>
      </header>
      <ul v-if="review.ongoing.length" class="goal-rows">
        <li v-for="goal in review.ongoing" :key="goal.taskId">
          <button
            class="goal-row"
            type="button"
            data-testid="ongoing-row"
            :data-task-id="goal.taskId"
            :aria-label="`查看目标：${goal.title}，${ongoingLabels[goal.status]}`"
            @click="emit('open-goal', goal.taskId)"
          >
            <span class="goal-mark" :class="goal.status" aria-hidden="true">
              {{ goal.status === "overdue" ? "!" : goal.status === "paused" ? "Ⅱ" : "·" }}
            </span>
            <span class="goal-main">
              <strong>{{ goal.title }}</strong>
              <span class="goal-meta">
                <span>到期 {{ formatShortDate(goal.dueAt) }}</span>
                <span>仓位 {{ goal.position }}</span>
              </span>
            </span>
            <span class="status-badge" :class="goal.status">{{ ongoingLabels[goal.status] }}</span>
            <span class="goal-chevron" aria-hidden="true">›</span>
          </button>
        </li>
      </ul>
      <p v-else class="group-empty">
        没有仍在进行的目标。可在目标中心新增目标，或在底部对话里创建。
      </p>
    </section>

    <p class="review-footnote">
      本周指数与贡献均来自确定性引擎的周 K 重算；待确认项保留待确认且不计分，完成增益只计一次（D39/D40）。
    </p>
  </section>
</template>

<style scoped>
.review-page {
  width: min(1040px, calc(100% - 64px));
  margin: 0 auto;
  padding: clamp(22px, 4dvh, 40px) 0 34px;
}
.review-heading {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 24px;
  margin-bottom: 22px;
}
.eyebrow {
  margin: 0;
  color: var(--muted);
  font: 9px ui-monospace, Menlo, monospace;
  letter-spacing: 0.24em;
}
.review-heading h2 {
  margin: 4px 0 8px;
  color: var(--text);
  font-size: clamp(25px, 3vw, 34px);
  font-weight: 560;
  letter-spacing: -0.045em;
}
.view-tag {
  margin-left: 10px;
  padding: 2px 8px;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--muted);
  font-size: 10px;
  font-weight: 400;
  vertical-align: 4px;
  white-space: nowrap;
}
.review-sub {
  margin: 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.6;
}
.review-controls {
  display: flex;
  gap: 7px;
  align-items: center;
  flex-wrap: wrap;
}
.ledger-empty {
  margin: 0 0 14px;
  padding: 11px 13px;
  border: 1px solid #d8c98d2e;
  border-radius: 10px;
  background: #d8c98d08;
  color: #d8c98d;
  font-size: 11px;
  line-height: 1.65;
}
.review-hero-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(0, 0.92fr);
  gap: 12px;
  align-items: stretch;
}
.review-group {
  margin-top: 14px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: #ffffff03;
  overflow: hidden;
}
.group-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 13px 16px;
  border-bottom: 1px solid var(--line);
}
.group-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.group-head h2 {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
}
.count {
  display: grid;
  place-items: center;
  min-width: 20px;
  height: 20px;
  padding-inline: 5px;
  border-radius: 999px;
  background: #ffffff0d;
  color: var(--muted);
  font: 9px ui-monospace, Menlo, monospace;
}
.group-head small {
  color: var(--muted);
  font-size: 9px;
}
.goal-rows {
  margin: 0;
  padding: 0;
  list-style: none;
}
.goal-row {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr) auto 12px;
  gap: 11px;
  align-items: center;
  width: 100%;
  min-height: 58px;
  padding: 12px 16px;
  border: 0;
  border-bottom: 1px solid #ffffff0b;
  background: transparent;
  text-align: left;
  transition: background 0.18s;
}
.goal-row:last-child { border-bottom: 0; }
.goal-row:hover { background: #ffffff05; }
.goal-row:focus-visible {
  outline: 2px solid #a5b7ce;
  outline-offset: -2px;
  border-radius: 8px;
}
.goal-mark {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 1px solid var(--line);
  border-radius: 7px;
  color: var(--muted);
  font: 11px ui-monospace, Menlo, monospace;
  background: #ffffff06;
}
.goal-mark.done {
  color: var(--up);
  border-color: #8dd8ad33;
  background: #8dd8ad0f;
}
.goal-mark.overdue {
  color: var(--down);
  border-color: #c88c9733;
  background: #c88c970f;
}
.goal-mark.paused {
  color: #d8c98d;
  border-color: #d8c98d33;
  background: #d8c98d0f;
}
.goal-main {
  min-width: 0;
  display: grid;
  gap: 4px;
}
.goal-main strong {
  font-size: 13px;
  font-weight: 530;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
.goal-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  color: var(--muted);
  font: 9px ui-monospace, Menlo, monospace;
}
.goal-value {
  text-align: right;
  font: 12px ui-monospace, Menlo, monospace;
  white-space: nowrap;
}
.goal-value small {
  display: block;
  margin-top: 3px;
  color: var(--muted);
  font: 9px Inter, sans-serif;
}
.pos { color: var(--up); }
.status-badge {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 9px;
  white-space: nowrap;
}
.status-badge.open { color: var(--up); background: #8dd8ad1a; }
.status-badge.overdue { color: var(--down); background: #c88c9720; }
.status-badge.paused { color: #d8c98d; background: #d8c98d1a; }
.goal-chevron {
  color: #55565f;
  font-size: 17px;
  line-height: 1;
}
.group-empty {
  margin: 0;
  padding: 20px 16px;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.7;
}
.review-footnote {
  margin: 14px 2px 0;
  color: #65666f;
  font-size: 9px;
  line-height: 1.7;
}
@media (max-width: 980px) {
  .review-hero-grid { grid-template-columns: 1fr; }
}
@media (max-width: 760px) {
  .review-page {
    width: calc(100% - 28px);
    padding-top: 18px;
  }
  .review-heading {
    display: block;
    margin-bottom: 16px;
  }
  .review-heading h2 { font-size: 26px; }
  .review-controls { margin-top: 12px; }
  .review-hero-grid { gap: 10px; }
  .goal-row {
    grid-template-columns: 24px minmax(0, 1fr) auto;
    gap: 9px;
    padding: 11px 12px;
  }
  .goal-chevron { display: none; }
  .goal-value { font-size: 11px; }
  .status-badge { align-self: start; }
  .group-head { padding-inline: 12px; }
  .group-head small { display: none; }
}
@media (max-width: 390px) {
  .goal-row { grid-template-columns: 22px minmax(0, 1fr); }
  .goal-value, .status-badge { grid-column: 2; justify-self: start; }
}
</style>
