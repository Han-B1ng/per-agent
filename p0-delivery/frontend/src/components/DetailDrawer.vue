<script setup lang="ts">
import { computed, inject, ref, watch } from "vue";
import type { Workspace } from "../composables/useWorkspace";
import type { EngineLine, GoalView, PersonalLedger } from "../types";

const ws = inject<Workspace>("workspace")!;
const {
  drawer, currentWeek, selectedGoal, selectedRecord, selectedTimelineRow, auditHistory, editable,
  records, result, personal, clearArmed, view, today, modelState, closeDrawer, openEntity, openWeekForDate,
  setPage, deleteTask, deleteRecord, confirmPending, denyPending, correctRecord,
  clearPersonalData, exportCurrent, requestCompleteTask, completionRequest, completeTask, theme, setTheme,
  inspectBackup, restorePersonal,
} = ws;
const themes = [
  { id: "dark", label: "Dark" },
  { id: "light", label: "晨雾" },
  { id: "midnight", label: "午夜蓝" },
] as const;
const editDate = ref("");
const editQuote = ref("");
const pendingError = ref("");
const restoreInput = ref<HTMLInputElement | null>(null);
const pendingRestore = ref<PersonalLedger | null>(null);
const restoreSummary = ref("");
const restoreError = ref<{ code: string; message: string } | null>(null);
const restoreNotice = ref("");
const fmtIndex = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtPct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(2)}%`;
const fmtContrib = (c: number) => `${c > 0 ? "+" : ""}${(c * 100).toFixed(2)}%`;
const contribClass = (c: number) => (c > 0 ? "pos" : c < 0 ? "neg" : "zero");
const statusNames: Record<GoalView["displayStatus"], string> = { open: "进行中", overdue: "已逾期", paused: "已暂停", done: "已完成" };
const modelNames = { model: "模型在线", mock: "本地 Mock", degraded: "模型降级", offline: "离线" } as const;
const title = computed(() => {
  if (drawer.mode === "goal") return selectedGoal.value?.title ?? "目标详情";
  if (drawer.mode === "record") return selectedRecord.value?.kind === "task" ? selectedRecord.value.title : selectedRecord.value?.quote ?? "成长记录详情";
  if (drawer.mode === "settings") return "设置";
  return drawer.tab === "detail" ? "周 K 计算明细" : "持仓任务";
});
const sub = computed(() => {
  if (drawer.mode === "week") return currentWeek.value ? `${currentWeek.value.weekStart} ~ ${currentWeek.value.weekEnd} · 周 K` : "—";
  if (drawer.mode === "settings") return "数据与模型";
  if (drawer.mode === "goal" && selectedGoal.value) return `${statusNames[selectedGoal.value.displayStatus]} · ${selectedGoal.value.dueAt} 到期`;
  if (drawer.mode === "record" && selectedTimelineRow.value) {
    const type = selectedTimelineRow.value.type === "completion" ? "目标完成" : selectedTimelineRow.value.type === "emotion" ? "情绪" : selectedTimelineRow.value.type === "rest" ? "休息" : "行为";
    return `${selectedTimelineRow.value.date} · ${type}${selectedTimelineRow.value.status === "pending" ? " · 待确认" : ""}`;
  }
  return drawer.id ?? "—";
});
const taskList = computed(() => records.value.tasks.filter((t) => t.deletedAt == null));
const recordDate = computed(() => selectedTimelineRow.value?.date ?? (selectedRecord.value?.kind === "task" && selectedRecord.value.doneAt ? String(selectedRecord.value.doneAt).slice(0, 10) : "—"));
watch(selectedRecord, (record) => {
  pendingError.value = "";
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
  const result = confirmPending(record.id, record.kind, editDate.value);
  pendingError.value = result.ok ? "" : result.message || "这条仍待确认。";
}
function removeSelected() {
  const record = selectedRecord.value;
  if (!record || record.kind === "task") return;
  if (record.status === "pending") denyPending(record.id, record.kind);
  else deleteRecord(record.id, record.kind);
}
function completeSelected() {
  if (selectedGoal.value) requestCompleteTask(selectedGoal.value.id);
}
function openGoalWeek() {
  if (!selectedGoal.value) return;
  openWeekForDate(selectedGoal.value.doneAt ? String(selectedGoal.value.doneAt).slice(0, 10) : today.value);
}
function resetRestoreState() {
  pendingRestore.value = null;
  restoreSummary.value = "";
  restoreError.value = null;
  restoreNotice.value = "";
}
watch(() => [drawer.open, drawer.mode] as const, ([open, mode]) => {
  if (open && mode === "settings") resetRestoreState();
});
function pickRestoreFile() {
  restoreInput.value?.click();
}
async function onRestoreFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  resetRestoreState();
  let text: string;
  try {
    text = await file.text();
  } catch {
    restoreError.value = { code: "invalid_file", message: "文件无效：无法读取所选文件。" };
    return;
  }
  const parsed = inspectBackup(text);
  if (!parsed.ok) {
    restoreError.value = { code: parsed.code, message: parsed.message };
    return;
  }
  pendingRestore.value = parsed.ledger;
  restoreSummary.value = `${parsed.ledger.events.length + parsed.ledger.rests.length} 条记录、${parsed.ledger.tasks.length} 个目标`;
}
function confirmRestore() {
  if (!pendingRestore.value) return;
  const result = restorePersonal(pendingRestore.value);
  if (!result.ok) {
    restoreError.value = { code: result.code, message: result.message };
    return;
  }
  restoreNotice.value = `已恢复 ${restoreSummary.value}。`;
  pendingRestore.value = null;
  restoreError.value = null;
}
function cancelRestore() {
  pendingRestore.value = null;
  restoreSummary.value = "";
  restoreError.value = null;
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
            <div><dt>开盘</dt><dd>{{ fmtIndex(currentWeek.open) }}</dd></div>
            <div><dt>最高</dt><dd>{{ fmtIndex(currentWeek.high) }}</dd></div>
            <div><dt>最低</dt><dd>{{ fmtIndex(currentWeek.low) }}</dd></div>
            <div><dt>收盘</dt><dd>{{ fmtIndex(currentWeek.close) }}</dd></div>
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
          <div class="drawer-goal">
            <div class="drawer-goal-meta">
              <span class="badge" :class="selectedGoal.displayStatus">{{ statusNames[selectedGoal.displayStatus] }}</span>
              <span>到期 {{ selectedGoal.dueAt }}</span>
              <span>投入 {{ selectedGoal.position }} / 5</span>
            </div>
            <div class="goal-meter large">
              <div class="goal-meter-label"><span>投入程度</span><span>{{ selectedGoal.position }} / 5</span></div>
              <div class="goal-meter-track"><i :style="{ width: `${selectedGoal.position * 20}%` }"></i></div>
            </div>
            <section class="drawer-section">
              <h3>关联记录</h3>
              <p class="drawer-note">{{ selectedGoal.doneAt ? `完成于 ${String(selectedGoal.doneAt).slice(0, 10)}` : "完成后会自动写入成长记录。" }}</p>
              <div class="detail-actions">
                <button class="action-btn" type="button" @click="setPage('records', { taskId: selectedGoal.id })">关联成长记录</button>
                <button class="action-btn" type="button" @click="openGoalWeek">计分明细</button>
              </div>
            </section>
            <section v-if="editable && selectedGoal.deletedAt == null" class="drawer-section">
              <h3>目标操作</h3>
              <div class="detail-actions">
                <button class="action-btn danger" type="button" @click="deleteTask(selectedGoal.id)">删除目标</button>
              </div>
            </section>
          </div>
        </template>

        <template v-else-if="drawer.mode === 'record' && selectedRecord">
          <div class="record-detail">
            <section class="drawer-section source-quote">
              <h3>原始对话</h3>
              <blockquote>「{{ selectedRecord.kind === "task" ? selectedRecord.title : selectedRecord.quote }}」</blockquote>
            </section>
            <section class="record-facts">
              <div><span>生效日期</span><strong>{{ recordDate }}</strong></div>
              <div><span>状态</span><strong>{{ selectedTimelineRow?.status === "pending" ? "待确认" : selectedTimelineRow?.status === "deleted" ? "已撤销" : "已生效" }}</strong></div>
              <div class="record-fact-pct"><span>计分贡献</span><strong :class="contribClass(selectedTimelineRow?.contribution ?? 0)">{{ fmtContrib(selectedTimelineRow?.contribution ?? 0) }}</strong></div>
            </section>
            <div class="detail-actions">
              <button v-if="selectedRecord.kind === 'task'" class="action-btn" type="button" @click="openEntity('goal', selectedRecord.id)">返回目标</button>
              <button class="action-btn" type="button" @click="openWeekForDate(recordDate === '—' ? today : recordDate)">查看周 K</button>
            </div>
            <section v-if="editable && selectedRecord.deletedAt == null && selectedRecord.kind !== 'task'" class="drawer-section">
              <h3>{{ selectedRecord.status === "pending" ? "补充与确认" : "修正记录" }}</h3>
              <form class="edit-form" @submit.prevent="saveCorrection">
                <label>生效日期<input v-model="editDate" type="date" required></label>
                <label>原文<textarea v-model="editQuote" rows="3" maxlength="200"></textarea></label>
                <div class="detail-actions">
                  <button class="action-btn primary" type="submit">保存修正</button>
                  <button v-if="selectedRecord.status === 'pending'" class="action-btn primary" type="button" @click="confirmEdited">按此日期确认</button>
                  <button class="action-btn danger" type="button" @click="removeSelected">{{ selectedRecord.status === "pending" ? "否认" : "撤销" }}</button>
                </div>
                <p v-if="pendingError" class="pending-error" id="pending-error" role="alert">{{ pendingError }}</p>
              </form>
            </section>
            <section v-if="editable && auditHistory.length" class="drawer-section">
              <h3>变更轨迹</h3>
              <ul class="audit-list"><li v-for="entry in auditHistory.slice(0, 12)" :key="entry.id">{{ entry.at }} · {{ entry.action }}</li></ul>
            </section>
          </div>
        </template>

        <template v-else-if="drawer.mode === 'settings'">
          <div class="settings-panel">
            <section class="settings-block">
              <h3>主题</h3>
              <div class="theme-options" role="group" aria-label="界面主题">
                <button v-for="item in themes" :key="item.id" :data-testid="`theme-${item.id}`" type="button" :aria-pressed="theme === item.id" @click="setTheme(item.id)">{{ item.label }}</button>
              </div>
            </section>
            <section class="settings-block">
              <h3>本机数据</h3>
              <p>个人记录保存在当前浏览器。可导出备份，或从导出的 JSON 恢复。</p>
              <div class="settings-actions">
                <button class="action-btn" type="button" @click="exportCurrent">{{ view === "sample" ? "导出样例 JSON" : "导出我的 JSON" }}</button>
                <button id="restore-open" class="action-btn" type="button" @click="pickRestoreFile">从 JSON 恢复</button>
                <input id="restore-file" ref="restoreInput" type="file" accept="application/json,.json" hidden @change="onRestoreFile">
              </div>
              <p v-if="restoreError" id="restore-error" class="settings-feedback error" role="alert" :data-code="restoreError.code">{{ restoreError.message }}</p>
              <div v-if="pendingRestore" id="restore-confirm-block" class="restore-confirm">
                <p id="restore-summary">将恢复 {{ restoreSummary }}。恢复会覆盖当前个人账本与对话，样例不受影响，且不可撤销。</p>
                <div class="detail-actions">
                  <button id="restore-confirm" class="action-btn danger" type="button" @click="confirmRestore">确认恢复</button>
                  <button id="restore-cancel" class="action-btn" type="button" @click="cancelRestore">取消</button>
                </div>
              </div>
              <p v-if="restoreNotice" id="restore-success" class="settings-feedback success" role="status">{{ restoreNotice }}</p>
            </section>
            <section class="settings-block">
              <h3>模型连接</h3>
              <p class="model-line" :data-state="modelState"><i></i>{{ modelNames[modelState] }}</p>
              <p>发送消息时会抽取所需内容发给模型。</p>
            </section>
            <section v-if="editable" class="settings-block">
              <template v-if="!clearArmed">
                <button class="action-btn danger" type="button" @click="clearArmed = true">清空我的记录</button>
              </template>
              <template v-else>
                <p>清空会移除个人账本与对话，样例不受影响。</p>
                <div class="detail-actions">
                  <button class="action-btn danger" type="button" @click="clearPersonalData">确定清空</button>
                  <button class="action-btn" type="button" @click="clearArmed = false">取消</button>
                </div>
              </template>
            </section>
          </div>
        </template>
      </div>
      <footer v-if="drawer.mode === 'goal' && selectedGoal && editable && selectedGoal.status === 'open'" class="drawer-footer">
        <button class="action-btn primary wide" type="button" :disabled="Boolean(completionRequest)" @click="completeSelected">完成目标</button>
      </footer>
    </aside>
  </Transition>
</template>
