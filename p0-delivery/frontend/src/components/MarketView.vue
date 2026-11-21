<script setup lang="ts">
import { computed, inject, ref, watch } from "vue";
import type { Workspace } from "../composables/useWorkspace";
import MarketSummary from "./MarketSummary.vue";
import CandleChart from "./CandleChart.vue";
import MessageList from "./MessageList.vue";

const ws = inject<Workspace>("workspace")!;
const { result, view, theme, focusMode, openWeek, personalEmpty, SAMPLE_META } = ws;

const CHART_WEEKS = 20;
const chartPage = ref(0);
const emptyPersonal = computed(() => view.value === "personal" && personalEmpty.value);
const maxWindowStart = computed(() => Math.max(0, result.value.weeks.length - CHART_WEEKS));
const maxPage = computed(() => Math.ceil(maxWindowStart.value / CHART_WEEKS));
const chartStart = computed(() => Math.max(0, maxWindowStart.value - chartPage.value * CHART_WEEKS));
const chartEnd = computed(() => Math.min(result.value.weeks.length, chartStart.value + CHART_WEEKS));
const visibleWeeks = computed(() => result.value.weeks.slice(chartStart.value, chartEnd.value));
const canShowOlder = computed(() => chartPage.value < maxPage.value);
const canShowNewer = computed(() => chartPage.value > 0);
const weekRange = computed(() => {
  const weeks = visibleWeeks.value;
  if (!weeks.length) return "—";
  const fmt = (value: string) => value.slice(5).replace("-", ".");
  return `${fmt(weeks[0].weekStart)}–${fmt(weeks[weeks.length - 1].weekEnd)} · ${weeks.length} 周`;
});
const chartLabel = computed(() => {
  const weeks = visibleWeeks.value;
  const tail = weeks[weeks.length - 1];
  const close = tail ? tail.close : result.value.latest;
  return `${view.value === "sample" ? "样例" : "个人"}周 K 走势，当前显示 ${weeks.length} 周，窗口末周收盘 ${close.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} 点`;
});

function selectWeek(index: number) {
  openWeek(chartStart.value + index);
}
function openLastWeek() {
  if (chartEnd.value) openWeek(chartEnd.value - 1);
}
function showOlderWeeks() {
  if (canShowOlder.value) chartPage.value += 1;
}
function showNewerWeeks() {
  if (canShowNewer.value) chartPage.value -= 1;
}

watch(maxPage, (max) => { if (chartPage.value > max) chartPage.value = max; });
watch(() => view.value, () => { chartPage.value = 0; });
</script>

<template>
  <main class="stage" :class="{ 'is-empty-personal': emptyPersonal }" aria-label="个人成长指数与对话">
    <section class="market" aria-labelledby="market-title">
      <div class="market-card">
        <MarketSummary :result="result" :view="view" :sample-label="SAMPLE_META.label" :empty="emptyPersonal" />
        <div class="chart-toolbar">
          <div class="chart-tabs">
            <span class="chart-tab active">周 K</span>
            <span class="chart-range">{{ weekRange }}</span>
            <div v-if="!emptyPersonal" class="chart-window" role="group" aria-label="周 K 时间窗口">
              <button type="button" class="chart-page" data-testid="chart-older" :disabled="!canShowOlder" aria-label="查看更早的周次" @click="showOlderWeeks"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m10 3.5-4.5 4.5 4.5 4.5"/></svg></button>
              <button type="button" class="chart-page" data-testid="chart-newer" :disabled="!canShowNewer" aria-label="查看更新的周次" @click="showNewerWeeks"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 3.5 4.5 4.5L6 12.5"/></svg></button>
            </div>
          </div>
          <button v-if="!emptyPersonal" type="button" class="chart-detail-btn" data-testid="chart-detail" @click="openLastWeek">计算明细 <span aria-hidden="true">↗</span></button>
        </div>
        <div class="chart">
          <CandleChart v-if="!emptyPersonal" :weeks="visibleWeeks" :label="chartLabel" :minimal="focusMode" :theme="theme" :highlight-last="chartEnd === result.weeks.length" @select="selectWeek" />
          <div v-if="emptyPersonal" class="market-empty">
            <h3>还没有个人行情</h3>
            <p>在底部说一句今天发生的事，开始记录。</p>
          </div>
          <p v-if="!emptyPersonal && result.weeks.length === 1" class="single-week-note">目前只有本周记录</p>
        </div>
      </div>
    </section>
    <section class="conversation" :class="{ 'is-focus': focusMode, 'is-collapsed': !focusMode }" aria-label="对话">
      <MessageList />
    </section>
  </main>
</template>
