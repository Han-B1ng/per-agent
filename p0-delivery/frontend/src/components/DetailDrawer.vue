<script setup lang="ts">
import { computed, inject, ref, watch } from "vue";
import type { Workspace } from "../composables/useWorkspace";
import type { EngineLine } from "../types";

const ws = inject<Workspace>("workspace")!;
const {
  drawer, currentWeek, selectedGoal, selectedRecord, selectedTimelineRow, auditHistory, editable,
  records, result, personal, clearArmed, view, today, closeDrawer, openEntity, openWeekForDate,
  setPage, completeTask, deleteTask, deleteRecord, confirmPending, denyPending, correctRecord,
  clearPersonalData, exportCurrent,
} = ws;
const editDate = ref("");
const editQuote = ref("");
const fmtIndex = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtPct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(2)}%`;
const fmtContrib = (c: number) => `${c > 0 ? "+" : ""}${(c * 100).toFixed(2)}%`;
const contribClass = (c: number) => (c > 0 ? "pos" : c < 0 ? "neg" : "zero");
const title = computed(() => {
  if (drawer.mode === "goal") return "目标详情";
  if (drawer.mode === "record") return selectedRecord.value?.kind === "task" ? "任务完成事实" : "成长记录详情";
  if (drawer.mode === "settings") return "设置与数据";
  return drawer.tab === "detail" ? "计算明细" : "持仓任务";
});
const sub = computed(() => {
  if (drawer.mode === "week") return currentWeek.value ? `${currentWeek.value.weekStart} ~ ${currentWeek.value.weekEnd} · 周 K` : "—";
  if (drawer.mode === "settings") return view.value === "sample" ? "样例只读" : "个人账本 · localStorage v2";
  return drawer.id ?? "—";
});
const taskList = computed(() => records.value.tasks.filter((t) => t.deletedAt == null));
const recordDate = computed(() => selectedTimelineRow.value?.date ?? (selectedRecord.value?.kind === "task" && selectedRecord.value.doneAt ? String(selectedRecord.value.doneAt).slice(0, 10) : "—"));
watch(selectedRecord, (record) => {
  if (!record || record.kind === "task") return;
  editDate.value = record.kind === "rest" ? record.date : record.occurredAt;
  editQuote.value = record.quote;
}, { immediate: true });
function lineHasRecord(line: EngineLine) {
  return Boolean(line.id && ["event", "emotion", "pending", "rest", "pending_rest", "completion"].includes(line.type));
}
function saveCorrection() {
  const record = selectedRecord.value;
  if (!record || record.kind === "task") return;
  correctRecord(record.id, record.kind, editDate.value, editQuote.value);
}
function confirmEdited() {
  const record = selectedRecord.value;
  if (!record || record.kind === "task") return;
  confirmPending(record.id, record.kind, editDate.value);
}
function removeSelected() {
  const record = selectedRecord.value;
  if (!record || record.kind === "task") return;
  if (record.status === "pending") denyPending(record.id, record.kind);
  else deleteRecord(record.id, record.kind);
}
</script>

<template>
  <Transition name="scrim"><div v-if="drawer.open" class="drawer-scrim show" id="drawer-scrim" @click="closeDrawer"></div></Transition>
  <Transition name="drawer">
    <aside v-if="drawer.open" class="drawer show" id="drawer" aria-label="详情与设置">
      <header class="drawer-head">
        <div><h2 id="drawer-title">{{ title }}</h2><p class="drawer-sub" id="drawer-sub">{{ sub }}</p></div>
        <button class="drawer-close" id="drawer-close" type="button" aria-label="关闭明细" @click="closeDrawer">×</button>
      </header>
      <div class="drawer-tabs" role="tablist" :hidden="drawer.mode !== 'week'">
        <button id="tab-detail" role="tab" type="button" :aria-selected="drawer.tab === 'detail'" @click="drawer.tab = 'detail'">本周明细</button>
        <button id="tab-tasks" role="tab" type="button" :aria-selected="drawer.tab === 'tasks'" @click="drawer.tab = 'tasks'">持仓任务</button>
      </div>
      <div class="drawer-body" id="drawer-body" tabindex="0">
        <template v-if="drawer.mode === 'week' && currentWeek && drawer.tab === 'detail'">
          <dl class="week-ohlc">
            <div><dt>开</dt><dd>{{ fmtIndex(currentWeek.open) }}</dd></div>
            <div><dt>高</dt><dd>{{ fmtIndex(currentWeek.high) }}</dd></div>
            <div><dt>低</dt><dd>{{ fmtIndex(currentWeek.low) }}</dd></div>
            <div><dt>收</dt><dd>{{ fmtIndex(currentWeek.close) }}</dd></div>
          </dl>
          <p class="week-vol">当周事件 {{ currentWeek.volume }} 条 · 收盘 {{ fmtIndex(currentWeek.close) }}（{{ fmtPct((currentWeek.close - currentWeek.open) / currentWeek.open) }}）</p>
          <div v-for="day in currentWeek.days" :key="day.date" class="day-block">
            <div class="day-head"><span class="d">{{ day.date }}</span><span class="c">收 {{ fmtIndex(day.close) }}</span></div>
            <div class="three-stage"><span class="seg raw">原始 {{ fmtContrib(day.raw) }}</span><span class="arrow">→</span><span class="seg adj">涨跌停 {{ fmtContrib(day.adjustment) }}</span><span class="arrow">→</span><span class="seg act" :class="contribClass(day.actual)">实际 {{ fmtContrib(day.actual) }}</span></div>
            <div v-if="!day.lines.length" class="drawer-empty">当日无记录</div>
            <div v-for="(line, index) in day.lines" :key="`${line.id ?? line.type}-${index}`" class="line-row">
              <div class="l"><div class="lab">{{ line.label }}</div><div v-if="line.quote" class="q">{{ line.quote }}</div><div v-if="line.note" class="note">{{ line.note }}</div></div>
              <div class="r">
                <span class="contrib" :class="contribClass(line.contribution)">{{ fmtContrib(line.contribution) }}</span>
                <button v-if="lineHasRecord(line)" class="mini-btn" type="button" @click="openEntity('record', line.id!)">记录</button>
                <template v-if="editable && line.id">
                  <button v-if="['event', 'emotion', 'rest'].includes(line.type)" class="mini-btn danger" type="button" @click="deleteRecord(line.id!, line.type === 'rest' ? 'rest' : 'event')">撤销</button>
                  <template v-if="line.type === 'pending' || line.type === 'pending_rest'">
                    <button class="mini-btn" type="button" @click="confirmPending(line.id!, line.type === 'pending_rest' ? 'rest' : 'event')">确认</button>
                    <button class="mini-btn danger" type="button" @click="denyPending(line.id!, line.type === 'pending_rest' ? 'rest' : 'event')">否认</button>
                  </template>
                </template>
              </div>
            </div>
          </div>
        </template>
        <template v-else-if="drawer.mode === 'week' && drawer.tab === 'tasks'">
          <div v-if="!taskList.length" class="drawer-empty">还没有持仓任务。可在目标中心新增，或说一句「要在…前完成」。</div>
          <div v-for="task in taskList" :key="task.id" class="task-row">
            <div class="t"><span>{{ task.title }}</span><span class="badge" :class="task.status === 'done' ? 'done' : task.status === 'paused' ? 'paused' : task.dueAt < today ? 'overdue' : 'open'">{{ task.status === "done" ? "已完成" : task.status === "paused" ? "暂停" : task.dueAt < today ? "逾期" : "进行中" }}</span></div>
            <div class="meta"><span>截止 {{ task.dueAt }}</span><span class="pos-dots">仓位 {{ "●".repeat(task.position) }}{{ "○".repeat(5 - task.position) }}</span><span v-if="task.doneAt">完成于 {{ String(task.doneAt).slice(0, 10) }}</span></div>
            <div class="card-actions">
              <button v-if="editable && task.status === 'open'" class="card-btn" type="button" @click="completeTask(task.id)">标记完成</button>
              <button class="card-btn ghost" type="button" @click="openEntity('goal', task.id)">目标详情</button>
              <button v-if="editable" class="card-btn ghost" type="button" @click="deleteTask(task.id)">删除</button>
            </div>
          </div>
        </template>
        <template v-else-if="drawer.mode === 'goal' && selectedGoal">
          <div class="detail-stack">
            <section class="detail-card">
              <h3>{{ selectedGoal.title }}</h3>
              <p>状态：{{ selectedGoal.displayStatus === "done" ? "已完成" : selectedGoal.displayStatus === "paused" ? "暂停" : selectedGoal.displayStatus === "overdue" ? "逾期" : "进行中" }}</p>
              <p>到期日：{{ selectedGoal.dueAt }} · 仓位：{{ selectedGoal.position }}/5</p>
              <p v-if="selectedGoal.doneAt">完成日期：{{ String(selectedGoal.doneAt).slice(0, 10) }}</p>
              <div class="detail-actions">
                <button class="action-btn" type="button" @click="setPage('records', { taskId: selectedGoal.id })">关联成长记录</button>
                <button class="action-btn" type="button" @click="openWeekForDate(selectedGoal.doneAt ? String(selectedGoal.doneAt).slice(0, 10) : today)">计分明细</button>
              </div>
            </section>
            <section v-if="editable && selectedGoal.deletedAt == null" class="detail-card">
              <h3>目标操作</h3>
              <div class="detail-actions">
                <button v-if="selectedGoal.status === 'open'" class="action-btn primary" type="button" @click="completeTask(selectedGoal.id)">标记完成</button>
                <button class="action-btn danger" type="button" @click="deleteTask(selectedGoal.id)">删除目标</button>
              </div>
            </section>
          </div>
        </template>
        <template v-else-if="drawer.mode === 'record' && selectedRecord">
          <div class="detail-stack">
            <section class="detail-card">
              <h3>原文</h3>
              <p>{{ selectedRecord.kind === "task" ? selectedRecord.title : selectedRecord.quote }}</p>
              <p>生效日期：{{ recordDate }}</p>
              <p>生效值：{{ fmtContrib(selectedTimelineRow?.contribution ?? 0) }} · 状态：{{ selectedTimelineRow?.status ?? (selectedRecord.kind === "task" ? selectedRecord.status : selectedRecord.status) }}</p>
              <p>关联 ID：{{ selectedRecord.id }}</p>
              <div class="detail-actions">
                <button v-if="selectedRecord.kind === 'task'" class="action-btn" type="button" @click="openEntity('goal', selectedRecord.id)">返回目标</button>
                <button class="action-btn" type="button" @click="openWeekForDate(recordDate === '—' ? today : recordDate)">打开计分明细</button>
              </div>
            </section>
            <section v-if="editable && selectedRecord.deletedAt == null && selectedRecord.kind !== 'task'" class="detail-card">
              <h3>{{ selectedRecord.status === "pending" ? "补充与确认" : "修正" }}</h3>
              <form class="edit-form" @submit.prevent="saveCorrection">
                <label>生效日期<input v-model="editDate" type="date" required></label>
                <label>原文<textarea v-model="editQuote" rows="3" maxlength="200"></textarea></label>
                <div class="detail-actions">
                  <button class="action-btn primary" type="submit">保存修正</button>
                  <button v-if="selectedRecord.status === 'pending'" class="action-btn primary" type="button" @click="confirmEdited">按此日期确认</button>
                  <button class="action-btn danger" type="button" @click="removeSelected">{{ selectedRecord.status === "pending" ? "否认" : "撤销" }}</button>
                </div>
              </form>
            </section>
            <section v-if="editable && auditHistory.length" class="detail-card">
              <h3>变更轨迹</h3>
              <ul class="audit-list"><li v-for="entry in auditHistory.slice(0, 12)" :key="entry.id">{{ entry.at }} · {{ entry.action }}</li></ul>
            </section>
          </div>
        </template>
        <template v-else-if="drawer.mode === 'settings'">
          <div class="detail-stack">
            <section class="detail-card">
              <h3>数据范围</h3>
              <p class="export-note">{{ view === "sample" ? "当前导出只包含虚构样例，不会触碰个人账本。样例不可清空或修改。" : "当前导出只包含个人账本。清空会同时移除 v1/v2 个人数据，不影响样例。" }}</p>
              <div class="detail-actions">
                <button class="action-btn" type="button" @click="exportCurrent">{{ view === "sample" ? "导出样例 JSON" : "导出我的 JSON" }}</button>
                <template v-if="editable">
                  <button v-if="!clearArmed" class="action-btn danger" type="button" @click="clearArmed = true">清空我的记录</button>
                  <template v-else>
                    <button class="action-btn danger" type="button" @click="clearPersonalData">确定清空</button>
                    <button class="action-btn" type="button" @click="clearArmed = false">取消</button>
                  </template>
                </template>
              </div>
            </section>
          </div>
        </template>
      </div>
    </aside>
  </Transition>
</template>
