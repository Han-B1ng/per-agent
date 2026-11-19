<script setup lang="ts">
import { computed, inject, reactive } from "vue";
import type { Workspace } from "../composables/useWorkspace";
import type { TimelineRow } from "../types";
import { weekStartOf } from "../core";

const ws = inject<Workspace>("workspace")!;
const { timeline, filters, editable, recordTaskId, linkedTaskTitle, lastExtract, lastFailed, result, clearFilters, confirmPending, denyPending, openEntity, openWeekForDate, retryFailed } = ws;
const pendingDates = reactive<Record<string, string>>({});
const names: Record<TimelineRow["type"], string> = { behavior: "行为", emotion: "情绪", rest: "休息", completion: "任务完成" };
const statusNames: Record<string, string> = { pending: "待确认", deleted: "已撤销" };
const groups = computed(() => {
  const out: Array<{ date: string; rows: TimelineRow[] }> = [];
  for (const row of timeline.value) {
    const last = out[out.length - 1];
    if (last && last.date === row.date) last.rows.push(row);
    else out.push({ date: row.date, rows: [row] });
  }
  return out;
});
const hasFilters = computed(() => Boolean(filters.from || filters.to || filters.keyword || recordTaskId.value || filters.type !== "all"));
function dateFor(row: TimelineRow) {
  return pendingDates[row.id] ?? row.date;
}
function hasWeek(row: TimelineRow) {
  return result.value.weeks.some((w) => w.weekStart === weekStartOf(row.date));
}
function fmtContrib(c: number) {
  return `${c > 0 ? "+" : ""}${(c * 100).toFixed(2)}%`;
}
</script>

<template>
  <main class="page-view" id="records-page" aria-labelledby="records-title">
    <header class="page-heading">
      <div>
        <h1 id="records-title">成长记录 <span class="data-tag page-data-tag">{{ editable ? "我的记录" : "样例人生" }}</span></h1>
        <p>什么时候发生了什么。原文、生效值与计分明细可互相定位。</p>
      </div>
    </header>
    <section class="record-filters" aria-label="记录筛选">
      <label>开始日期<input id="filter-from" v-model="filters.from" type="date"></label>
      <label>结束日期<input id="filter-to" v-model="filters.to" type="date"></label>
      <label class="keyword-label">关键词<input id="record-keyword" v-model="filters.keyword" type="search" placeholder="原文或关联 ID"></label>
      <label>类型<select id="record-type" v-model="filters.type"><option value="all">全部类型</option><option value="behavior">行为</option><option value="emotion">情绪</option><option value="rest">休息</option><option value="completion">任务完成</option></select></label>
      <button id="record-clear" class="action-btn" type="button" @click="clearFilters">清除筛选</button>
      <label class="check-label"><input id="record-include-deleted" v-model="filters.includeDeleted" type="checkbox">显示已撤销</label>
    </section>
    <div id="record-link-chip" class="link-chip" :hidden="!recordTaskId"><span>关联目标：{{ linkedTaskTitle }}</span><button type="button" aria-label="清除关联筛选" @click="recordTaskId = ''">×</button></div>
    <div id="record-service-state" class="service-state" :class="{ failed: lastExtract?.status === 'failed' }" :hidden="!editable || !lastExtract || lastExtract.status === 'success'">
      <template v-if="lastExtract?.status === 'waiting'">正在等待模型抽取；现有账本与指数保持不变。</template>
      <template v-else-if="lastExtract?.status === 'failed'"><span>{{ lastExtract.message }}</span><button v-if="lastFailed" class="mini-btn" type="button" @click="retryFailed(lastFailed, false)">重试</button></template>
    </div>
    <div id="record-list" class="record-list">
      <div v-if="!timeline.length" class="record-empty">{{ hasFilters ? "没有符合筛选条件的记录。可清除日期、关键词、类型或关联筛选。" : "账本还没有成长记录。在底部发一句话，或先在目标中心创建目标。" }}</div>
      <section v-for="group in groups" :key="group.date" class="record-date-group">
        <h2 class="record-date">{{ group.date }}</h2>
        <article v-for="row in group.rows" :key="row.id" class="record-row" :data-record-id="row.id">
          <div class="record-type">{{ names[row.type] }}<span v-if="statusNames[row.status]">{{ statusNames[row.status] }}</span></div>
          <div class="record-quote">
            <p>{{ row.quote }}</p>
            <small>{{ row.id }}<template v-if="row.taskId"> · 关联 {{ row.taskId }}</template></small>
            <small v-if="row.note">{{ row.note }}</small>
            <div v-if="row.status === 'pending' && editable" class="pending-editor">
              <input type="date" :value="dateFor(row)" aria-label="确认生效日期" @input="pendingDates[row.id] = ($event.target as HTMLInputElement).value">
              <button class="mini-btn" type="button" @click="confirmPending(row.id, row.kind === 'rest' ? 'rest' : 'event', dateFor(row))">确认</button>
              <button class="mini-btn danger" type="button" @click="denyPending(row.id, row.kind === 'rest' ? 'rest' : 'event')">否认</button>
            </div>
          </div>
          <div class="record-side">
            <div class="record-value" :class="row.contribution > 0 ? 'pos' : row.contribution < 0 ? 'neg' : 'zero'">{{ fmtContrib(row.contribution) }}<small>生效值</small></div>
            <div class="record-actions">
              <button class="mini-btn" type="button" @click="openEntity('record', row.id)">详情</button>
              <button class="mini-btn" type="button" :disabled="!hasWeek(row)" :title="hasWeek(row) ? undefined : '该日期暂无计分明细'" @click="openWeekForDate(row.date)">周 K</button>
            </div>
          </div>
        </article>
      </section>
    </div>
  </main>
</template>
