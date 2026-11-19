<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { Workspace } from "../composables/useWorkspace";
import MarketSummary from "./MarketSummary.vue";
import CandleChart from "./CandleChart.vue";
import MessageList from "./MessageList.vue";

const ws = inject<Workspace>("workspace")!;
const { result, view, personal, typing, hasMessages, focusMode, focusLocked, setFocus, openWeek, SAMPLE_META } = ws;
const stage = ref<HTMLElement | null>(null);
const market = ref<HTMLElement | null>(null);
const conversation = ref<HTMLElement | null>(null);
const marketHeight = ref(0);
let observer: ResizeObserver | null = null;

const chartLabel = computed(() => `${view.value === "sample" ? "样例" : "个人"}周 K 走势，最新 ${result.value.latest.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} 点`);

function measure() {
  if (!stage.value || !market.value) return;
  marketHeight.value = market.value.offsetHeight;
  if (focusMode.value || focusLocked.value || !hasMessages.value || !conversation.value) return;
  const available = stage.value.clientHeight - marketHeight.value - 12;
  if (conversation.value.scrollHeight > available) setFocus(true);
}
onMounted(() => {
  measure();
  observer = new ResizeObserver(() => measure());
  if (stage.value) observer.observe(stage.value);
  if (market.value) observer.observe(market.value);
  if (conversation.value) observer.observe(conversation.value);
});
watch([hasMessages, () => personal.value.chat.length, typing, () => result.value.weeks.length, focusMode], async () => {
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
  <main class="stage" ref="stage" aria-label="个人成长指数与对话" :style="{ '--market-height': `${marketHeight}px` }">
    <section class="market" ref="market" aria-labelledby="market-title">
      <MarketSummary :result="result" :view="view" :sample-label="SAMPLE_META.label" />
      <div class="chart">
        <div class="chart-heading"><span>走势</span><span>周 K · 点击看明细</span></div>
        <CandleChart :weeks="result.weeks" :label="chartLabel" @select="openWeek" />
        <p v-if="result.weeks.length === 1" class="single-week-note">目前只有本周记录</p>
      </div>
    </section>
    <section v-if="hasMessages" class="conversation" ref="conversation" aria-label="对话">
      <MessageList />
    </section>
  </main>
</template>
