<script setup lang="ts">
import { computed, inject } from "vue";
import type { Workspace } from "../composables/useWorkspace";

const ws = inject<Workspace>("workspace")!;
const { page, view, modelState, focusMode, navOpen, setView, setFocus } = ws;
const title = computed(() => ({ market: "行情", goals: "目标中心", records: "成长记录" }[page.value]));
const statusText = computed(() => ({ model: "模型在线", mock: "本地 Mock", degraded: "降级 · 样例可用", offline: "离线 · 样例可用" }[modelState.value]));
</script>

<template>
  <header class="topbar">
    <div class="topbar-heading">
      <button id="nav-menu" type="button" aria-label="打开导航" @click="navOpen = !navOpen">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
      </button>
      <h1 id="page-title">{{ title }}</h1>
    </div>
    <div class="toolbar">
      <div class="data-switch" role="group" aria-label="数据视图">
        <button id="view-sample" type="button" :aria-pressed="view === 'sample'" @click="setView('sample')">样例</button>
        <button id="view-personal" type="button" :aria-pressed="view === 'personal'" @click="setView('personal')">我的</button>
      </div>
      <span v-if="page === 'market'" class="model-status" id="model-status" :data-state="modelState"><i></i><span id="model-status-text">{{ statusText }}</span></span>
      <button id="view-toggle" type="button" :hidden="!focusMode" @click="setFocus(false)">返回行情</button>
    </div>
  </header>
</template>
