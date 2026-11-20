<script setup lang="ts">
import { computed, inject, ref } from "vue";
import type { Workspace } from "../composables/useWorkspace";
import type { GoalView } from "../types";

const ws = inject<Workspace>("workspace")!;
const {
  goals, editable, today, goalFormOpen, lastCompletedGoalId,
  addGoal, completeTask, openEntity, openGoalForm, shiftDate, clearCompletedNotice, setPage,
} = ws;
const title = ref("");
const dueAt = ref("");
const position = ref(3);
const names: Record<GoalView["displayStatus"], string> = { open: "进行中", overdue: "逾期", paused: "暂停", done: "已完成" };
const completedGoal = computed(() => goals.value.done.find((goal) => goal.id === lastCompletedGoalId.value) ?? null);
const activeCount = computed(() => String(goals.value.active.length).padStart(2, "0"));
const doneCount = computed(() => String(goals.value.done.length).padStart(2, "0"));

function openForm() {
  dueAt.value ||= shiftDate(today.value, 7);
  openGoalForm();
}
function submit() {
  const write = addGoal(title.value, dueAt.value, position.value);
  if (!write?.applied || !write.saved) return;
  title.value = "";
  dueAt.value = "";
  position.value = 3;
}
function cancel() {
  goalFormOpen.value = false;
  title.value = "";
  dueAt.value = "";
}
function showCompletedRecord() {
  if (!completedGoal.value) return;
  const id = completedGoal.value.id;
  clearCompletedNotice();
  setPage("records", { taskId: id });
}
function finishFromCard(goal: GoalView) {
  if (!editable.value) return;
  completeTask(goal.id);
}
</script>

<template>
  <main class="page-view" id="goals-page" aria-labelledby="goals-title">
    <header class="page-heading goals-heading">
      <div>
        <h1 id="goals-title">目标中心 <span class="data-tag page-data-tag">{{ editable ? "我的记录" : "样例人生" }}</span></h1>
      </div>
      <button id="goal-add-open" class="action-btn primary" type="button" @click="openForm">新增目标</button>
    </header>

    <section class="goals-section" aria-labelledby="active-goals-title">
      <header class="section-heading">
        <h2 id="active-goals-title">未完成 <span id="active-goal-count">{{ activeCount }}</span></h2>
        <span>进行中 · 逾期 · 暂停</span>
      </header>
      <div id="active-goals" class="goal-grid">
        <p v-if="!goals.active.length" class="goal-empty">暂无未完成目标。用右上角「新增目标」创建第一条。</p>
        <article v-for="goal in goals.active" :key="goal.id" class="goal-card active-card" :class="goal.displayStatus" :data-goal-id="goal.id" tabindex="0" @dblclick="openEntity('goal', goal.id)">
          <div class="goal-card-top">
            <h3>{{ goal.title }}</h3>
            <span class="badge" :class="goal.displayStatus">{{ names[goal.displayStatus] }}</span>
          </div>
          <p class="goal-due">{{ goal.dueAt }} 到期</p>
          <div class="goal-meter">
            <div class="goal-meter-label"><span>投入程度</span><span>{{ goal.position }} / 5</span></div>
            <div class="goal-meter-track"><i :style="{ width: `${goal.position * 20}%` }"></i></div>
          </div>
          <div class="goal-card-foot">
            <span>{{ goal.displayStatus === "overdue" ? "需要优先处理" : goal.displayStatus === "paused" ? "已暂停" : "按计划推进" }}</span>
            <div class="goal-card-actions">
              <button class="mini-btn" type="button" @click.stop="openEntity('goal', goal.id)">详情 <span aria-hidden="true">›</span></button>
              <button v-if="editable && goal.status === 'open'" class="mini-btn complete" type="button" @click.stop="finishFromCard(goal)">完成</button>
            </div>
          </div>
        </article>
      </div>
    </section>

    <article v-if="completedGoal" class="goal-success" aria-live="polite">
      <div><strong>目标已完成</strong><p>完成事实已写入成长记录。</p></div>
      <button type="button" class="action-btn" @click="showCompletedRecord">查看完成记录</button>
    </article>

    <section class="goals-section completed-section" aria-labelledby="done-goals-title">
      <header class="section-heading">
        <h2 id="done-goals-title">已完成 <span id="done-goal-count">{{ doneCount }}</span></h2>
        <span>按完成时间倒序</span>
      </header>
      <div id="done-goals" class="done-list">
        <p v-if="!goals.done.length" class="goal-empty">暂无已完成目标。完成事实会同时出现在成长记录中。</p>
        <article v-for="goal in goals.done" :key="goal.id" class="goal-card done-row" :data-goal-id="goal.id">
          <span class="done-dot" aria-hidden="true"></span>
          <h3>{{ goal.title }}</h3>
          <span class="done-date">{{ String(goal.doneAt).slice(5, 10).replace("-", " 月 ") }} 日</span>
          <span class="done-status badge done">已完成</span>
          <button class="mini-btn" type="button" @click="openEntity('goal', goal.id)">详情 <span aria-hidden="true">›</span></button>
        </article>
      </div>
    </section>

    <div v-if="goalFormOpen" class="goal-create-layer">
      <div class="goal-create-scrim" @click="cancel"></div>
      <aside class="goal-create-panel" role="dialog" aria-modal="true" aria-labelledby="goal-create-title">
        <header class="panel-head">
          <div><h2 id="goal-create-title">新增目标</h2><p>写下你想完成的事</p></div>
          <button class="drawer-close" type="button" aria-label="关闭新增目标" @click="cancel">×</button>
        </header>
        <form id="goal-form" class="goal-form" @submit.prevent="submit">
          <label>目标名称<input id="goal-title-input" v-model="title" maxlength="80" required placeholder="例如：完成数据库课设"></label>
          <label>截止日期<input id="goal-due-input" v-model="dueAt" type="date" required></label>
          <label>投入程度<select id="goal-position" v-model.number="position"><option :value="1">1 / 5 · 轻</option><option :value="2">2 / 5</option><option :value="3">3 / 5 · 标准</option><option :value="4">4 / 5</option><option :value="5">5 / 5 · 重</option></select></label>
          <footer class="panel-foot">
            <button id="goal-form-cancel" class="action-btn" type="button" @click="cancel">取消</button>
            <button class="action-btn primary" type="submit">创建目标</button>
          </footer>
        </form>
      </aside>
    </div>

  </main>
</template>
