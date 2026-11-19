<script setup lang="ts">
import { computed, ref } from "vue";
import SidebarNav from "./components/SidebarNav.vue";
import WeeklyReviewView from "./components/WeeklyReviewView.vue";
import { computeAll, weekStartOf } from "./core";
import { deriveWeeklyReview, listReviewWeeks } from "./review";
import { recordsForScene, type PreviewScene } from "./scenarios";

type NavKey = "market" | "goals" | "records";
type HostEvent = { kind: "open-goal" | "open-week" | "navigate"; id: string; title: string; detail: string };

function localToday(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const params = new URLSearchParams(window.location.search);
const scene = ref<PreviewScene>(params.get("scene") === "empty" ? "empty" : "data");
const today = ref(params.get("today") || localToday());
const records = computed(() => recordsForScene(scene.value, today.value));
const result = computed(() => computeAll(records.value, { today: today.value }));
const weeks = computed(() => listReviewWeeks(result.value));
const currentWeekKey = computed(() => weekStartOf(today.value));
const requestedWeek = params.get("week");
const initialWeek = requestedWeek ? weekStartOf(requestedWeek) : currentWeekKey.value;
const selectedWeekStart = ref(weeks.value.some((week) => week.weekKey === initialWeek) ? initialWeek : currentWeekKey.value);
const review = computed(() => deriveWeeklyReview(records.value, result.value, { weekStart: selectedWeekStart.value }));
const weekIndex = computed(() => weeks.value.findIndex((week) => week.weekKey === selectedWeekStart.value));
const canStepBack = computed(() => weekIndex.value > 0);
const canStepForward = computed(() => weekIndex.value >= 0 && weekIndex.value < weeks.value.length - 1);

const activeNav = ref<NavKey>("records");
const navOpen = ref(false);
const hostEvent = ref<HostEvent | null>(null);
const navNames: Record<NavKey, string> = { market: "行情", goals: "目标中心", records: "成长记录" };

function navigate(key: NavKey) {
  activeNav.value = key;
  navOpen.value = false;
  hostEvent.value = key === "records" ? null : {
    kind: "navigate",
    id: key,
    title: `宿主将切换到${navNames[key]}`,
    detail: "该入口由主站现有页面承接；独立预览只验收成长记录 · 本周。",
  };
}

function setScene(next: PreviewScene) {
  scene.value = next;
  selectedWeekStart.value = currentWeekKey.value;
  hostEvent.value = null;
  const url = new URL(window.location.href);
  if (next === "empty") url.searchParams.set("scene", "empty");
  else url.searchParams.delete("scene");
  window.history.replaceState(null, "", url);
}

function stepWeek(direction: -1 | 1) {
  const next = weeks.value[weekIndex.value + direction];
  if (!next) return;
  selectedWeekStart.value = next.weekKey;
  hostEvent.value = null;
}

function goCurrentWeek() {
  selectedWeekStart.value = currentWeekKey.value;
  hostEvent.value = null;
}

function onOpenGoal(taskId: string) {
  hostEvent.value = {
    kind: "open-goal",
    id: taskId,
    title: `宿主将打开目标 ${taskId}`,
    detail: "由宿主切换到目标中心详情；复盘组件只提供稳定目标 ID。",
  };
  window.history.replaceState(null, "", `#goal=${encodeURIComponent(taskId)}`);
}

function onOpenWeek(payload: { weekStart: string; weekEnd: string; lineId?: string; targetId?: string }) {
  const target = payload.targetId ? `，定位目标 ${payload.targetId}` : payload.lineId ? `，定位明细 ${payload.lineId}` : "";
  hostEvent.value = {
    kind: "open-week",
    id: payload.weekStart,
    title: `宿主将打开周 K ${payload.weekStart}${target}`,
    detail: `周区间 ${payload.weekStart} → ${payload.weekEnd}；由宿主切换到行情明细。`,
  };
  window.history.replaceState(null, "", `#week=${encodeURIComponent(payload.weekStart)}`);
}
</script>

<template>
  <div class="workspace" :data-nav-open="navOpen" data-testid="preview-shell">
    <SidebarNav :active="activeNav" @navigate="navigate" />
    <div v-if="navOpen" class="nav-scrim" aria-hidden="true" @click="navOpen = false"></div>

    <div class="app-shell">
      <header class="topbar">
        <div class="brand">
          <button class="nav-menu" type="button" aria-label="打开导航" @click="navOpen = true">☰</button>
          <span class="mark" aria-hidden="true"><i></i><i></i><i></i></span>
          <span>Personal Economy</span>
          <span class="preview-tag">独立预览</span>
        </div>
        <div class="toolbar">
          <div class="scene-switch" role="group" aria-label="预览账本">
            <button type="button" data-testid="scene-data" :aria-pressed="scene === 'data'" @click="setScene('data')">有数据</button>
            <button type="button" data-testid="scene-empty" :aria-pressed="scene === 'empty'" @click="setScene('empty')">空账本</button>
          </div>
          <span class="today-note">{{ today }}</span>
        </div>
      </header>

      <div class="content">
        <WeeklyReviewView
          v-if="activeNav === 'records'"
          :review="review"
          @open-goal="onOpenGoal"
          @open-week="onOpenWeek"
        >
          <template #week-controls>
            <div class="week-nav" aria-label="周次切换">
              <button type="button" data-testid="prev-week" :disabled="!canStepBack" aria-label="上一周" @click="stepWeek(-1)">‹</button>
              <button type="button" class="week-now" data-testid="current-week" :aria-pressed="review.week.isCurrent" @click="goCurrentWeek">本周</button>
              <button type="button" data-testid="next-week" :disabled="!canStepForward" aria-label="下一周" @click="stepWeek(1)">›</button>
            </div>
          </template>
        </WeeklyReviewView>

        <main v-else class="placeholder-page">
          <p class="eyebrow">HOST VIEW</p>
          <h1>{{ navNames[activeNav] }}</h1>
          <p>该入口由主站现有页面承接。独立预览只验收「成长记录 · 本周」，不复制行情或目标中心。</p>
          <button type="button" class="back-btn" @click="activeNav = 'records'">回到本周复盘</button>
        </main>
      </div>
    </div>

    <div v-if="hostEvent" class="host-toast" role="status" data-testid="host-event" :data-event-kind="hostEvent.kind" :data-event-id="hostEvent.id">
      <span class="toast-kind">{{ hostEvent.kind }}</span>
      <strong>{{ hostEvent.title }}</strong>
      <small>{{ hostEvent.detail }}</small>
    </div>
  </div>
</template>

<style scoped>
.workspace {
  height: 100dvh;
  min-height: 430px;
  display: grid;
  grid-template-columns: 184px minmax(0, 1fr);
  isolation: isolate;
  background: radial-gradient(ellipse at 47% 2%, #17191e 0%, transparent 58%), var(--bg);
}
.app-shell {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
}
.topbar {
  height: 65px;
  padding: 0 clamp(20px, 4.2vw, 68px);
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--line);
  gap: 16px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  font-weight: 630;
  letter-spacing: -0.025em;
  white-space: nowrap;
}
.nav-menu {
  display: none;
  border: 0;
  background: transparent;
  color: var(--muted);
  padding: 4px;
  font-size: 17px;
}
.mark {
  width: 29px;
  height: 29px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  border: 1px solid #ffffff28;
  border-radius: 8px;
  background: linear-gradient(145deg, #30333b, #17181d);
  box-shadow: inset 0 1px #ffffff0d;
}
.mark i { width: 2px; height: 7px; background: #e4e6eb; border-radius: 2px; }
.mark i:nth-child(2) { height: 12px; background: #8dd8ad; }
.mark i:nth-child(3) { height: 9px; }
.preview-tag {
  padding: 2px 7px;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--muted);
  font-size: 9px;
  font-weight: 400;
  letter-spacing: 0;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}
.scene-switch {
  display: inline-flex;
  border: 1px solid var(--line);
  border-radius: 9px;
  overflow: hidden;
}
.scene-switch button {
  padding: 5px 11px;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 10px;
}
.scene-switch button[aria-pressed="true"] {
  background: #ffffff12;
  color: var(--text);
}
.today-note {
  color: var(--muted);
  font: 10px ui-monospace, Menlo, monospace;
  white-space: nowrap;
}
.content {
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #383940 transparent;
}
.content::-webkit-scrollbar { width: 8px; }
.content::-webkit-scrollbar-thumb { background: #383940; border-radius: 4px; }
.week-nav {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--line);
  border-radius: 9px;
  overflow: hidden;
  background: #ffffff05;
}
.week-nav button {
  min-width: 34px;
  min-height: 30px;
  padding: 4px 8px;
  border: 0;
  border-right: 1px solid var(--line);
  background: transparent;
  color: var(--muted);
  font-size: 13px;
}
.week-nav button:last-child { border-right: 0; }
.week-nav button:hover:not(:disabled) { color: var(--text); background: #ffffff0d; }
.week-nav button:disabled { opacity: 0.35; cursor: default; }
.week-nav .week-now {
  font-size: 10px;
  padding-inline: 10px;
}
.week-nav .week-now[aria-pressed="true"] {
  color: #d8c98d;
  background: #d8c98d0f;
}
.placeholder-page {
  width: min(1040px, calc(100% - 64px));
  margin: 0 auto;
  padding: clamp(24px, 5dvh, 48px) 0;
}
.placeholder-page .eyebrow {
  margin: 0;
  color: var(--muted);
  font: 9px ui-monospace, Menlo, monospace;
  letter-spacing: 0.24em;
}
.placeholder-page h1 {
  margin: 6px 0 10px;
  font-size: 32px;
  font-weight: 560;
  letter-spacing: -0.045em;
}
.placeholder-page p {
  margin: 0 0 18px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.7;
}
.back-btn {
  border: 1px solid #ffffff24;
  border-radius: 9px;
  background: #ffffff08;
  color: var(--text);
  padding: 8px 13px;
  font-size: 11px;
}
.host-toast {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 90;
  width: min(360px, calc(100vw - 40px));
  padding: 12px 14px;
  border: 1px solid #8dd8ad3d;
  border-radius: 11px;
  background: #141a17f2;
  box-shadow: 0 16px 40px #00000080;
  backdrop-filter: blur(8px);
}
.toast-kind {
  display: inline-block;
  margin-bottom: 5px;
  padding: 1px 6px;
  border-radius: 999px;
  background: #8dd8ad1f;
  color: var(--up);
  font: 9px ui-monospace, Menlo, monospace;
  text-transform: uppercase;
}
.host-toast strong {
  display: block;
  font-size: 12px;
  font-weight: 550;
  overflow-wrap: anywhere;
}
.host-toast small {
  display: block;
  margin-top: 4px;
  color: var(--muted);
  font-size: 10px;
  line-height: 1.5;
}
.nav-scrim {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: #00000066;
  backdrop-filter: blur(2px);
}
@media (max-width: 760px) {
  .workspace { grid-template-columns: minmax(0, 1fr); }
  .topbar { height: 58px; padding-inline: 14px; }
  .nav-menu { display: inline-block; }
  .brand { font-size: 12px; gap: 7px; }
  .mark, .preview-tag { display: none; }
  .today-note { display: none; }
  .placeholder-page { width: calc(100% - 28px); }
  .host-toast { right: 14px; bottom: 14px; }
}
</style>
