<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import type { ReviewWeekOption } from "../features/weekly-review/review";

const props = withDefaults(defineProps<{
  modelValue: string;
  weeks: ReviewWeekOption[];
  id?: string;
}>(), { id: "review-week-select" });

const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const root = ref<HTMLElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
const listbox = ref<HTMLElement | null>(null);
const open = ref(false);
const activeIndex = ref(0);

const labelId = "review-week-picker-label";
const listboxId = "review-week-select-menu";

const options = computed(() => [
  { value: "", label: "本周" },
  ...props.weeks.map((week) => ({ value: week.weekStart, label: `${week.weekStart} ~ ${week.weekEnd}` })),
]);
const selectedIndex = computed(() => {
  const index = options.value.findIndex((option) => option.value === props.modelValue);
  return index >= 0 ? index : 0;
});
const selectedLabel = computed(() => options.value[selectedIndex.value]?.label ?? "本周");

function optionId(index: number) {
  return `review-week-option-${index}`;
}
function scrollActiveIntoView() {
  void nextTick(() => {
    const list = listbox.value;
    const option = list?.querySelector<HTMLElement>(`#${optionId(activeIndex.value)}`);
    if (!list || !option) return;
    const top = option.offsetTop;
    const bottom = top + option.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  });
}
function setActive(index: number) {
  const count = options.value.length;
  if (!count) return;
  activeIndex.value = (index + count) % count;
  scrollActiveIntoView();
}
function openMenu(index = selectedIndex.value) {
  if (open.value) return;
  activeIndex.value = index;
  open.value = true;
  scrollActiveIntoView();
}
function closeMenu() {
  open.value = false;
}
function choose(index: number) {
  const option = options.value[index];
  if (!option) return;
  if (option.value !== props.modelValue) emit("update:modelValue", option.value);
  activeIndex.value = index;
  closeMenu();
  trigger.value?.focus();
}
function onKeydown(event: KeyboardEvent) {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    if (open.value) setActive(activeIndex.value + 1);
    else openMenu(selectedIndex.value);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    if (open.value) setActive(activeIndex.value - 1);
    else openMenu(selectedIndex.value);
  } else if (event.key === "Home" && open.value) {
    event.preventDefault();
    setActive(0);
  } else if (event.key === "End" && open.value) {
    event.preventDefault();
    setActive(options.value.length - 1);
  } else if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    if (open.value) choose(activeIndex.value);
    else openMenu(selectedIndex.value);
  } else if (event.key === "Escape" && open.value) {
    event.preventDefault();
    event.stopPropagation();
    closeMenu();
  } else if (event.key === "Tab") {
    closeMenu();
  }
}
function onPointerDown(event: PointerEvent) {
  if (!root.value?.contains(event.target as Node)) closeMenu();
}
function toggleMenu() {
  if (open.value) closeMenu();
  else openMenu();
}

watch(open, (value) => {
  if (value) document.addEventListener("pointerdown", onPointerDown, true);
  else document.removeEventListener("pointerdown", onPointerDown, true);
});
watch(selectedIndex, (index) => {
  if (!open.value) activeIndex.value = index;
});
onBeforeUnmount(() => document.removeEventListener("pointerdown", onPointerDown, true));
</script>

<template>
  <div ref="root" class="week-picker">
    <span :id="labelId" class="week-picker-label">周次</span>
    <button
      :id="props.id"
      ref="trigger"
      type="button"
      class="week-picker-trigger"
      role="combobox"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-controls="open ? listboxId : undefined"
      :aria-labelledby="`${labelId} week-picker-value`"
      :aria-activedescendant="open ? optionId(activeIndex) : undefined"
      @click="toggleMenu"
      @keydown="onKeydown"
    >
      <span id="week-picker-value" class="week-picker-value">{{ selectedLabel }}</span>
      <svg class="week-picker-chevron" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 4.5 3 3 3-3"/></svg>
    </button>
    <ul
      v-if="open"
      :id="listboxId"
      ref="listbox"
      class="week-picker-menu"
      role="listbox"
      :aria-labelledby="labelId"
    >
      <li
        v-for="(option, index) in options"
        :id="optionId(index)"
        :key="option.value || 'current'"
        class="week-picker-option"
        :class="{ 'is-active': activeIndex === index, 'is-selected': selectedIndex === index }"
        role="option"
        :aria-selected="selectedIndex === index"
        @mouseenter="activeIndex = index"
        @mousedown.prevent
        @click="choose(index)"
      >
        <span class="week-picker-check" aria-hidden="true">
          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m2.5 6.2 2.2 2.2 4.8-4.8"/></svg>
        </span>
        <span class="week-picker-option-label">{{ option.label }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.week-picker { position: relative; display: inline-flex; align-items: center; gap: 7px; color: var(--pe-color-text-muted); font-size: 10px; }
.week-picker-label { white-space: nowrap; }
.week-picker-trigger { display: inline-flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 148px; height: 31px; padding: 0 8px 0 10px; border: 1px solid var(--pe-color-border-default); border-radius: 6px; background: var(--pe-color-surface-control-secondary); color: var(--pe-color-text-primary); font: 10px var(--mono); line-height: 1; white-space: nowrap; transition: background .18s, border-color .18s; }
.week-picker-trigger:hover { background: var(--pe-color-surface-raised); border-color: var(--pe-color-border-strong); }
.week-picker-trigger[aria-expanded="true"] { background: var(--pe-color-surface-raised); border-color: var(--pe-color-border-focus); }
.week-picker-trigger:focus-visible { outline: 2px solid var(--pe-color-border-focus); outline-offset: 2px; }
.week-picker-value { overflow: hidden; text-overflow: ellipsis; }
.week-picker-chevron { width: 12px; height: 12px; flex: none; color: var(--pe-color-icon-muted); transition: transform .18s; }
.week-picker-trigger[aria-expanded="true"] .week-picker-chevron { transform: rotate(180deg); color: var(--pe-color-icon-active); }
.week-picker-menu { position: absolute; top: calc(100% + 6px); right: 0; z-index: 20; width: max-content; min-width: 100%; max-width: min(280px, calc(100vw - 32px)); max-height: 284px; margin: 0; padding: 5px; overflow-y: auto; overscroll-behavior: contain; list-style: none; border: 1px solid var(--pe-color-border-default); border-radius: 9px; background: var(--pe-color-surface-panel); box-shadow: 0 18px 40px color-mix(in srgb, var(--pe-color-overlay-scrim) 28%, transparent), 0 2px 8px color-mix(in srgb, var(--pe-color-overlay-scrim) 18%, transparent); scrollbar-width: thin; scrollbar-color: var(--pe-color-scrollbar-thumb) transparent; animation: week-picker-in .14s var(--ease); }
.week-picker-option { display: flex; align-items: center; gap: 8px; min-height: 30px; padding: 0 8px 0 6px; border-radius: 6px; color: var(--pe-color-text-secondary); font: 10px var(--mono); cursor: pointer; user-select: none; }
.week-picker-option + .week-picker-option { margin-top: 1px; }
.week-picker-option.is-active { background: var(--pe-color-surface-raised); color: var(--pe-color-text-primary); }
.week-picker-option.is-selected { background: var(--pe-color-surface-selected); color: var(--pe-color-text-primary); font-weight: 500; }
.week-picker-option.is-selected.is-active { box-shadow: inset 0 0 0 1px var(--pe-color-border-focus); }
.week-picker-check { display: grid; place-items: center; width: 12px; height: 12px; flex: none; color: var(--pe-color-chart-marker); opacity: 0; }
.week-picker-check svg { width: 12px; height: 12px; }
.week-picker-option.is-selected .week-picker-check { opacity: 1; }
.week-picker-option-label { white-space: nowrap; }
@keyframes week-picker-in {
  from { opacity: 0; transform: translateY(-3px) scale(.985); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .week-picker-trigger, .week-picker-chevron { transition: none; }
  .week-picker-menu { animation: none; }
}
</style>
