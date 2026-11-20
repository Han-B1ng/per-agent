<script setup lang="ts">
import { computed, inject } from "vue";
import type { Workspace } from "../composables/useWorkspace";

const ws = inject<Workspace>("workspace")!;
const { page, view, modelState, focusMode, navOpen, setView, setFocus, result } = ws;
const title = computed(() => ({ market: "行情", goals: "目标中心", records: "成长记录" }[page.value]));
const statusText = computed(() => ({ model: "模型在线", mock: "本地 Mock", degraded: "降级 · 样例可用", offline: "离线 · 样例可用" }[modelState.value]));
const fmtIndex = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtPct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(2)}%`;
</script>

<template>
  <header class="topbar">
    <div class="topbar-heading">
      <button id="nav-menu" type="button" aria-label="打开导航" @click="navOpen = !navOpen">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
      </button>
      <h1 id="page-title">{{ title }}</h1>
      <div v-if="page === 'market' && focusMode" class="topbar-market">
        <span class="topbar-divider" aria-hidden="true"></span>
        <span class="topbar-market-label">个人成长指数</span>
        <strong id="focus-quote">{{ fmtIndex(result.latest) }}</strong>
        <span id="focus-change" class="topbar-change" :class="{ neg: result.weekChangePct < 0 }">{{ fmtPct(result.weekChangePct) }}</span>
      </div>
    </div>
    <div class="toolbar">
      <div v-if="page === 'market'" class="data-switch" role="group" aria-label="数据视图">
        <button id="view-sample" type="button" :aria-pressed="view === 'sample'" @click="setView('sample')">样例</button>
        <button id="view-personal" type="button" :aria-pressed="view === 'personal'" @click="setView('personal')">我的</button>
      </div>
      <span v-if="page === 'market'" class="model-status" id="model-status" :data-state="modelState"><i></i><span id="model-status-text">{{ statusText }}</span></span>
      <button id="view-toggle" type="button" class="back-market" :hidden="!focusMode" @click="setFocus(false)"><span aria-hidden="true">←</span> 返回行情</button>
    </div>
  </header>
</template>
