<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { Workspace } from "../composables/useWorkspace";
import MarketSummary from "./MarketSummary.vue";
import CandleChart from "./CandleChart.vue";
import MessageList from "./MessageList.vue";

const ws = inject<Workspace>("workspace")!;
const { result, view, personal, typing, hasMessages, focusMode, focusLocked, setFocus, openWeek, conversationOpen, personalEmpty, SAMPLE_META } = ws;
const stage = ref<HTMLElement | null>(null);
const market = ref<HTMLElement | null>(null);
const conversation = ref<HTMLElement | null>(null);
const marketHeight = ref(0);
let observer: ResizeObserver | null = null;

const emptyPersonal = computed(() => view.value === "personal" && personalEmpty.value);
const visibleWeeks = computed(() => result.value.weeks.slice(-9));
const weekOffset = computed(() => Math.max(0, result.value.weeks.length - visibleWeeks.value.length));
const currentWeek = computed(() => result.value.weeks[result.value.weeks.length - 1] ?? null);
const weekRange = computed(() => {
  const week = currentWeek.value;
  if (!week) return "—";
  const fmt = (value: string) => value.slice(5).replace("-", ".");
  return `${fmt(week.weekStart)}–${fmt(week.weekEnd)}`;
});
const chartLabel = computed(() => `${view.value === "sample" ? "样例" : "个人"}周 K 走势，最新 ${result.value.latest.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} 点`);

function measure() {
  if (!stage.value || !market.value) return;
  marketHeight.value = market.value.offsetHeight;
  if (focusMode.value || focusLocked.value || !conversationOpen.value || !conversation.value) return;
  if (!hasMessages.value && !typing.value) return;
  const available = stage.value.clientHeight - marketHeight.value - 12;
  if (conversation.value.scrollHeight > available + 4) setFocus(true);
}
function selectWeek(index: number) {
  openWeek(index + weekOffset.value);
}
function openLastWeek() {
  if (result.value.weeks.length) openWeek(result.value.weeks.length - 1);
}
onMounted(() => {
  measure();
  observer = new ResizeObserver(() => measure());
  if (stage.value) observer.observe(stage.value);
  if (market.value) observer.observe(market.value);
  if (conversation.value) observer.observe(conversation.value);
});
watch([hasMessages, conversationOpen, () => personal.value.chat.length, typing, () => result.value.weeks.length, focusMode], async () => {
  await nextTick();
  if (conversation.value && observer) {
    observer.observe(conversation.value);
    const messagesEl = conversation.value.querySelector(".messages");
    if (messagesEl) observer.observe(messagesEl);
  }
  measure();
});
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <main class="stage" ref="stage" :class="{ 'is-empty-personal': emptyPersonal }" aria-label="个人成长指数与对话" :style="{ '--market-height': `${marketHeight}px` }">
    <section class="market" ref="market" aria-labelledby="market-title">
      <div class="market-card">
        <MarketSummary :result="result" :view="view" :sample-label="SAMPLE_META.label" :empty="emptyPersonal" />
        <div class="chart-toolbar">
          <div class="chart-tabs">
            <span class="chart-tab active">周 K</span>
            <span class="chart-range">{{ weekRange }}</span>
          </div>
          <button type="button" class="chart-detail-btn" data-testid="chart-detail" @click="openLastWeek">计算明细 <span aria-hidden="true">↗</span></button>
        </div>
        <div class="chart">
          <CandleChart v-if="!emptyPersonal" :weeks="visibleWeeks" :label="chartLabel" :minimal="focusMode" @select="selectWeek" />
          <div v-if="emptyPersonal" class="market-empty">
            <h3>还没有个人行情</h3>
            <p>在底部说一句今天发生的事，开始记录。</p>
          </div>
          <p v-if="!emptyPersonal && result.weeks.length === 1" class="single-week-note">目前只有本周记录</p>
        </div>
      </div>
    </section>
    <section v-show="hasMessages || conversationOpen" class="conversation" :class="{ 'is-focus': focusMode }" ref="conversation" aria-label="对话">
      <MessageList />
    </section>
  </main>
</template>
