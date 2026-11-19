<script setup lang="ts">
import { inject, ref } from "vue";
import type { Workspace } from "../composables/useWorkspace";
import type { GoalView } from "../types";

const ws = inject<Workspace>("workspace")!;
const { goals, editable, today, goalFormOpen, addGoal, completeTask, openEntity, shiftDate, setView } = ws;
const title = ref("");
const dueAt = ref("");
const position = ref(3);
const names: Record<GoalView["displayStatus"], string> = { open: "进行中", overdue: "逾期", paused: "暂停", done: "已完成" };

function openForm() {
  if (!editable.value) setView("personal");
  dueAt.value ||= shiftDate(today.value, 7);
  goalFormOpen.value = true;
}
function submit() {
  addGoal(title.value, dueAt.value, position.value);
  title.value = "";
  dueAt.value = "";
  position.value = 3;
}
function cancel() {
  goalFormOpen.value = false;
  title.value = "";
  dueAt.value = "";
}
</script>

<template>
  <main class="page-view" id="goals-page" aria-labelledby="goals-title">
    <header class="page-heading">
      <div>
        <h1 id="goals-title">目标中心 <span class="data-tag page-data-tag">{{ editable ? "我的记录" : "样例人生" }}</span></h1>
        <p>每件事现在的状态。目标与指数共享同一账本。</p>
      </div>
      <button id="goal-add-open" class="action-btn primary" type="button" @click="openForm">{{ editable ? "新增目标" : "在我的账本新增" }}</button>
    </header>
    <form v-if="goalFormOpen" id="goal-form" class="goal-form" @submit.prevent="submit">
      <label>目标名称<input id="goal-title-input" v-model="title" maxlength="80" required placeholder="例如：完成论文第三章"></label>
      <label>到期日<input id="goal-due-input" v-model="dueAt" type="date" required></label>
      <label>仓位<select id="goal-position" v-model.number="position"><option :value="1">1 · 轻</option><option :value="2">2</option><option :value="3">3 · 标准</option><option :value="4">4</option><option :value="5">5 · 重</option></select></label>
      <div class="form-actions"><button class="action-btn primary" type="submit">创建目标</button><button id="goal-form-cancel" class="action-btn" type="button" @click="cancel">取消</button></div>
    </form>
    <div class="goal-groups">
      <details class="goal-group" open>
        <summary>未完成 <span id="active-goal-count">{{ goals.active.length }}</span><small>进行中 · 逾期 · 暂停</small></summary>
        <div id="active-goals" class="goal-list">
          <div v-if="!goals.active.length" class="goal-empty">暂无未完成目标。用右上角「新增目标」创建第一条。</div>
          <article v-for="goal in goals.active" :key="goal.id" class="goal-card" :data-goal-id="goal.id">
            <div>
              <div class="goal-title-line"><h2>{{ goal.title }}</h2><span class="badge" :class="goal.displayStatus">{{ names[goal.displayStatus] }}</span></div>
              <div class="goal-meta"><span>到期 {{ goal.dueAt }}</span><span class="pos-dots">仓位 {{ goal.position }}/5</span><span>{{ goal.id }}</span></div>
            </div>
            <div class="goal-actions">
              <button class="action-btn" type="button" @click="openEntity('goal', goal.id)">详情</button>
              <button v-if="editable && goal.status === 'open'" class="action-btn primary" type="button" @click="completeTask(goal.id)">完成</button>
            </div>
          </article>
        </div>
      </details>
      <details class="goal-group" open>
        <summary>已完成 <span id="done-goal-count">{{ goals.done.length }}</span><small>按完成时间回查</small></summary>
        <div id="done-goals" class="goal-list">
          <div v-if="!goals.done.length" class="goal-empty">暂无已完成目标。完成事实会同时出现在成长记录中。</div>
          <article v-for="goal in goals.done" :key="goal.id" class="goal-card" :data-goal-id="goal.id">
            <div>
              <div class="goal-title-line"><h2>{{ goal.title }}</h2><span class="badge done">已完成</span></div>
              <div class="goal-meta"><span>到期 {{ goal.dueAt }}</span><span class="pos-dots">仓位 {{ goal.position }}/5</span><span>完成 {{ String(goal.doneAt).slice(0, 10) }}</span></div>
            </div>
            <div class="goal-actions"><button class="action-btn" type="button" @click="openEntity('goal', goal.id)">详情</button></div>
          </article>
        </div>
      </details>
    </div>
  </main>
</template>
