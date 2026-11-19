<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { createChart, type ChartHandle } from "../core";
import type { WeekResult } from "../types";

const props = defineProps<{ weeks: WeekResult[]; label: string }>();
const emit = defineEmits<{ select: [index: number] }>();
const canvas = ref<HTMLCanvasElement | null>(null);
let chart: ChartHandle | null = null;

onMounted(() => {
  if (!canvas.value) return;
  chart = createChart(canvas.value, { onSelect: (index) => emit("select", index) });
  chart.render(props.weeks);
});
watch(() => props.weeks, (weeks) => chart?.render(weeks));
onBeforeUnmount(() => chart?.destroy());
</script>

<template>
  <div class="plot">
    <canvas id="candles" ref="canvas" role="img" :aria-label="label"></canvas>
  </div>
</template>
