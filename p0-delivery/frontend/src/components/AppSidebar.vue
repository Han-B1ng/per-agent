<script setup lang="ts">
import { inject } from "vue";
import type { Workspace } from "../composables/useWorkspace";

const ws = inject<Workspace>("workspace")!;
const { page, setPage, openEntity } = ws;
</script>

<template>
  <aside class="sidebar" aria-label="主导航">
    <div class="sidebar-brand">
      <span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>
      <span class="brand-name">Personal Economy</span>
    </div>
    <nav class="main-nav">
      <button class="nav-item" type="button" data-page-target="market" :aria-current="page === 'market' ? 'page' : undefined" title="行情" aria-label="行情" @click="setPage('market')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M5 19V9m0-4v2m7 12V5m0-2v1m7 15v-8m0-3v2"/><rect x="3.5" y="9" width="3" height="6" rx="1"/><rect x="10.5" y="5" width="3" height="8" rx="1"/><rect x="17.5" y="11" width="3" height="5" rx="1"/></svg>
        <b>行情</b>
      </button>
      <button class="nav-item" type="button" data-page-target="goals" :aria-current="page === 'goals' ? 'page' : undefined" title="目标中心" aria-label="目标中心" @click="setPage('goals')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>
        <b>目标中心</b>
      </button>
      <button class="nav-item" type="button" data-page-target="records" :aria-current="page === 'records' ? 'page' : undefined" title="成长记录" aria-label="成长记录" @click="setPage('records')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M5 6h14M5 12h14M5 18h9"/><circle cx="18.5" cy="18" r="1.5"/></svg>
        <b>成长记录</b>
      </button>
    </nav>
    <div class="sidebar-tools">
      <button id="settings-open" class="nav-item" type="button" title="设置" aria-label="设置" @click="openEntity('settings', 'settings')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6l1.4 1.4m10 10 1.4 1.4M18.4 5.6 17 7m-10 10-1.4 1.4"/></svg>
        <b>设置</b>
      </button>
    </div>
  </aside>
</template>
