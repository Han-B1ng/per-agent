<script setup lang="ts">
import { onBeforeUnmount, onMounted, provide } from "vue";
import { useWorkspace } from "./composables/useWorkspace";
import AppSidebar from "./components/AppSidebar.vue";
import PageHeader from "./components/PageHeader.vue";
import MarketView from "./components/MarketView.vue";
import GoalsView from "./components/GoalsView.vue";
import RecordsView from "./components/RecordsView.vue";
import Composer from "./components/Composer.vue";
import DetailDrawer from "./components/DetailDrawer.vue";
import CompletionConfirm from "./components/CompletionConfirm.vue";

const ws = useWorkspace();
provide("workspace", ws);
const { page, focusMode, navOpen, drawer, refreshToday, closeDrawer, checkHealth } = ws;

function onKeydown(event: KeyboardEvent) {
  if (event.key !== "Escape") return;
  if (drawer.open) closeDrawer();
  else if (navOpen.value) navOpen.value = false;
  else if (focusMode.value) ws.setFocus(false);
}
function onVisibility() {
  refreshToday();
}
let timer: number | undefined;
onMounted(() => {
  void checkHealth();
  document.addEventListener("keydown", onKeydown);
  document.addEventListener("visibilitychange", onVisibility);
  timer = window.setInterval(refreshToday, 60000);
});
onBeforeUnmount(() => {
  document.removeEventListener("keydown", onKeydown);
  document.removeEventListener("visibilitychange", onVisibility);
  if (timer) window.clearInterval(timer);
});
</script>

<template>
  <div class="workspace" :data-mode="focusMode ? 'focus' : 'market'" :data-page="page" :data-nav-open="navOpen">
    <div v-if="navOpen" class="nav-scrim" @click="navOpen = false"></div>
    <AppSidebar />
    <div class="app-shell">
      <PageHeader />
      <MarketView v-if="page === 'market'" />
      <GoalsView v-else-if="page === 'goals'" />
      <RecordsView v-else />
      <Composer v-if="page === 'market'" />
    </div>
    <DetailDrawer />
    <CompletionConfirm />
  </div>
</template>
