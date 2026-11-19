<script setup lang="ts">
type NavKey = "market" | "goals" | "records";

defineProps<{ active: NavKey }>();
const emit = defineEmits<{ (event: "navigate", key: NavKey): void }>();

const items: Array<{ key: NavKey; label: string }> = [
  { key: "market", label: "行情" },
  { key: "goals", label: "目标中心" },
  { key: "records", label: "成长记录" },
];
</script>

<template>
  <aside class="sidebar" aria-label="主导航">
    <nav class="main-nav">
      <button
        v-for="item in items"
        :key="item.key"
        class="nav-item"
        type="button"
        :data-page-target="item.key"
        :aria-current="active === item.key ? 'page' : undefined"
        :title="item.label"
        :aria-label="item.label"
        @click="emit('navigate', item.key)"
      >
        <svg v-if="item.key === 'market'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
          <path d="M5 19V9m0-4v2m7 12V5m0-2v1m7 15v-8m0-3v2" />
          <rect x="3.5" y="9" width="3" height="6" rx="1" />
          <rect x="10.5" y="5" width="3" height="8" rx="1" />
          <rect x="17.5" y="11" width="3" height="5" rx="1" />
        </svg>
        <svg v-else-if="item.key === 'goals'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="12" cy="12" r="1" fill="currentColor" />
        </svg>
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
          <path d="M5 6h14M5 12h14M5 18h9" />
          <circle cx="18.5" cy="18" r="1.5" />
        </svg>
        <b>{{ item.label }}</b>
      </button>
    </nav>
    <p class="sidebar-note">独立功能预览<br>成长记录 · 本周</p>
  </aside>
</template>

<style scoped>
.sidebar {
  min-height: 0;
  padding: 76px 12px 18px;
  border-right: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  background: #0e0f12aa;
  z-index: 20;
}
.main-nav { display: grid; gap: 7px; }
.nav-item {
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  min-height: 42px;
  padding: 10px 12px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: var(--muted);
  text-align: left;
  transition: color 0.2s, background 0.2s, border-color 0.2s;
}
.nav-item svg { width: 18px; height: 18px; flex: none; }
.nav-item b { font-size: 12px; font-weight: 520; white-space: nowrap; }
.nav-item:hover { color: var(--text); background: #ffffff08; }
.nav-item[aria-current="page"] {
  color: var(--text);
  border-color: var(--line);
  background: linear-gradient(120deg, #ffffff10, #ffffff05);
}
.sidebar-note {
  margin: auto 0 0;
  padding: 0 10px;
  color: #5a5b64;
  font-size: 9px;
  line-height: 1.7;
}
@media (max-width: 760px) {
  .sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    width: 220px;
    padding: 24px 14px 18px;
    background: #111216;
    transform: translateX(-100%);
    transition: transform 0.35s var(--ease);
    box-shadow: 18px 0 48px #00000080;
    z-index: 70;
  }
  .workspace[data-nav-open="true"] .sidebar { transform: translateX(0); }
}
</style>
