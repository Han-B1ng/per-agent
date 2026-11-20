<script setup lang="ts">
import { computed, inject, reactive, ref } from "vue";
import type { Workspace } from "../composables/useWorkspace";
import type { TimelineRow } from "../types";
import { weekStartOf } from "../core";
import { deriveWeeklyReview, listReviewWeeks } from "../../../weekly-review/src/index";
import WeeklyReviewPanel from "./WeeklyReviewPanel.vue";

const ws = inject<Workspace>("workspace")!;
const { records, timeline, filters, editable, recordTaskId, linkedTaskTitle, lastExtract, lastFailed, result, clearFilters, confirmPending, denyPending, openEntity, openWeekForDate, retryFailed, focusComposer } = ws;
const recordsTab = ref<"list" | "week">("list");
const pendingOnly = ref(false);
const reviewWeekStart = ref("");
const reviewWeeks = computed(() => listReviewWeeks(result.value));
const review = computed(() => deriveWeeklyReview(records.value, result.value, { weekStart: reviewWeekStart.value || undefined }));
const pendingDates = reactive<Record<string, string>>({});
const names: Record<TimelineRow["type"], string> = { behavior: "行为", emotion: "情绪", rest: "休息", completion: "目标完成" };
const statusNames: Record<string, string> = { pending: "待确认", deleted: "已撤销" };
const weeks = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
const pendingCount = computed(() => timeline.value.filter((row) => row.status === "pending").length);
const displayRows = computed(() => pendingOnly.value ? timeline.value.filter((row) => row.status === "pending") : timeline.value);
const groups = computed(() => {
  const out: Array<{ date: string; rows: TimelineRow[] }> = [];
  for (const row of displayRows.value) {
    const last = out[out.length - 1];
    if (last && last.date === row.date) last.rows.push(row);
    else out.push({ date: row.date, rows: [row] });
  }
  return out;
});
const hasFilters = computed(() => Boolean(filters.from || filters.to || filters.keyword || recordTaskId.value || pendingOnly.value || filters.type !== "all"));
function weekLabel(date: string) {
  return weeks[new Date(`${date}T00:00:00Z`).getUTCDay()];
}
function dateFor(row: TimelineRow) {
  return pendingDates[row.id] ?? row.date;
}
function hasWeek(row: TimelineRow) {
  return result.value.weeks.some((week) => week.weekStart === weekStartOf(row.date));
}
function fmtContrib(c: number) {
  return `${c > 0 ? "+" : ""}${(c * 100).toFixed(2)}%`;
}
function openReviewGoal(taskId: string) {
  openEntity("goal", taskId);
}
function openReviewWeek(payload: { weekStart: string; weekEnd: string; lineId?: string; targetId?: string }) {
  openWeekForDate(payload.weekStart);
}
function resetFilters() {
  pendingOnly.value = false;
  clearFilters();
}
function openRow(row: TimelineRow) {
  openEntity("record", row.id);
}
</script>

<template>
  <main class="page-view records-page" id="records-page" aria-labelledby="records-title">
    <header class="page-heading records-heading">
      <div>
        <h1 id="records-title">成长记录 <span class="data-tag page-data-tag">{{ editable ? "我的记录" : "样例人生" }}</span></h1>
      </div>
    </header>
    <div class="records-tabs" role="tablist" aria-label="成长记录视图">
      <button id="records-tab-list" role="tab" type="button" :aria-selected="recordsTab === 'list'" @click="recordsTab = 'list'">全部记录</button>
      <button id="records-tab-week" role="tab" type="button" :aria-selected="recordsTab === 'week'" @click="recordsTab = 'week'">本周复盘</button>
    </div>

    <template v-if="recordsTab === 'week'">
      <WeeklyReviewPanel :review="review" @open-goal="openReviewGoal" @open-week="openReviewWeek">
        <template #week-controls>
          <label class="review-week-picker"><span>周次</span><select id="review-week-select" v-model="reviewWeekStart"><option value="">本周</option><option v-for="week in reviewWeeks" :key="week.weekKey" :value="week.weekStart">{{ week.weekStart }} ~ {{ week.weekEnd }}</option></select></label>
        </template>
      </WeeklyReviewPanel>
    </template>

    <template v-else>
      <section class="record-filters" aria-label="记录筛选">
        <label class="search-field">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg>
          <input id="record-keyword" v-model="filters.keyword" type="search" placeholder="搜索记录、原文或目标">
        </label>
        <label class="date-filter"><span>日期范围</span><input id="filter-from" v-model="filters.from" type="date" aria-label="开始日期"><input id="filter-to" v-model="filters.to" type="date" aria-label="结束日期"></label>
        <select id="record-type" v-model="filters.type" aria-label="记录类型"><option value="all">全部类型</option><option value="behavior">行为</option><option value="emotion">情绪</option><option value="rest">休息</option><option value="completion">目标完成</option></select>
        <button id="pending-filter" type="button" class="pending-filter" :aria-pressed="pendingOnly" @click="pendingOnly = !pendingOnly">待确认 {{ pendingCount }}</button>
        <button v-if="hasFilters" id="record-clear" type="button" class="clear-btn" @click="resetFilters">清除筛选</button>
        <label class="check-label"><input id="record-include-deleted" v-model="filters.includeDeleted" type="checkbox">显示已撤销</label>
      </section>
      <div id="record-link-chip" class="link-chip" :hidden="!recordTaskId"><span>关联目标：{{ linkedTaskTitle }}</span><button type="button" aria-label="清除关联筛选" @click="recordTaskId = ''">×</button></div>
      <div id="record-service-state" class="service-state" :class="{ failed: lastExtract?.status === 'failed' }" :hidden="!editable || !lastExtract || lastExtract.status === 'success'">
        <template v-if="lastExtract?.status === 'waiting'">正在等待模型抽取；现有账本与指数保持不变。</template>
        <template v-else-if="lastExtract?.status === 'failed'"><span>{{ lastExtract.message }}</span><button v-if="lastFailed" class="mini-btn" type="button" @click="retryFailed(lastFailed, false)">重试</button></template>
      </div>

      <div id="record-list" class="record-list">
        <div v-if="!displayRows.length" class="record-empty">
          <div class="empty-icon" aria-hidden="true">▤</div>
          <template v-if="hasFilters">
            <h3>没有符合筛选条件的记录</h3>
            <p>试试换个关键词，或清除筛选查看全部记录。</p>
            <button class="action-btn" type="button" @click="resetFilters">清除筛选</button>
          </template>
          <template v-else>
            <h3>账本还没有成长记录</h3>
            <p>先记一件今天发生的事，之后就能在这里回看。</p>
            <button class="action-btn primary" type="button" @click="focusComposer">记一件事</button>
          </template>
        </div>
        <section v-for="group in groups" :key="group.date" class="record-date-group">
          <h2 class="record-date"><strong>{{ group.date.slice(5, 7) }} 月 {{ group.date.slice(8, 10) }} 日</strong><span>{{ weekLabel(group.date) }}</span></h2>
          <article v-for="row in group.rows" :key="row.id" class="record-row" :data-record-id="row.id" @click="openRow(row)">
            <div class="record-quote">
              <p>{{ row.quote }}</p>
              <small class="record-id">{{ row.id }}<template v-if="row.taskId"> · 关联 {{ row.taskId }}</template></small>
              <small v-if="row.note" class="record-note">{{ row.note }}</small>
              <div v-if="row.status === 'pending' && editable" class="pending-editor" @click.stop>
                <input type="date" :value="dateFor(row)" aria-label="确认生效日期" @input="pendingDates[row.id] = ($event.target as HTMLInputElement).value">
                <button class="mini-btn" type="button" @click="confirmPending(row.id, row.kind === 'rest' ? 'rest' : 'event', dateFor(row))">确认</button>
                <button class="mini-btn danger" type="button" @click="denyPending(row.id, row.kind === 'rest' ? 'rest' : 'event')">否认</button>
              </div>
            </div>
            <div class="record-type">{{ names[row.type] }}<span v-if="statusNames[row.status]">{{ statusNames[row.status] }}</span></div>
            <div class="record-value" :class="row.status === 'pending' ? 'pending' : row.contribution > 0 ? 'pos' : row.contribution < 0 ? 'neg' : 'zero'">
              <template v-if="row.status === 'pending'">待确认</template>
              <template v-else-if="row.type === 'rest'">查看明细</template>
              <template v-else>{{ fmtContrib(row.contribution) }}</template>
            </div>
            <button class="record-open" type="button" @click.stop="openRow(row)"><span class="sr-only">详情</span><span aria-hidden="true">›</span></button>
          </article>
        </section>
      </div>
    </template>
  </main>
</template>
