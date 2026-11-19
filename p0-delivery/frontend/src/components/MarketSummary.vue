<script setup lang="ts">
import { computed } from "vue";
import type { ComputeResult, DataView } from "../types";

const props = defineProps<{ result: ComputeResult; view: DataView; sampleLabel: string }>();
const fmtIndex = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtPct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(2)}%`;
const week = computed(() => props.result.weeks[props.result.weeks.length - 1] ?? null);
</script>

<template>
  <div class="market-summary">
    <div class="quote-block">
      <h2 id="market-title">个人成长指数 <span class="data-tag" id="data-tag">{{ view === "sample" ? sampleLabel : "我的记录" }}</span></h2>
      <div class="quote"><strong id="quote-value">{{ fmtIndex(result.latest) }}</strong><span id="quote-change" :class="{ neg: result.weekChangePct < 0 }">{{ fmtPct(result.weekChangePct) }}</span></div>
    </div>
    <dl class="market-stats">
      <div><dt>本周开盘</dt><dd id="stat-open">{{ week ? fmtIndex(week.open) : "—" }}</dd></div>
      <div><dt>本周最高</dt><dd id="stat-high">{{ week ? fmtIndex(week.high) : "—" }}</dd></div>
      <div><dt>本周最低</dt><dd id="stat-low">{{ week ? fmtIndex(week.low) : "—" }}</dd></div>
    </dl>
  </div>
</template>
