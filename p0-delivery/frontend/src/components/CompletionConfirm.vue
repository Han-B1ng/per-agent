<script setup lang="ts">
import { inject, nextTick, onBeforeUnmount, ref, watch } from "vue";
import type { Workspace } from "../composables/useWorkspace";

const ws = inject<Workspace>("workspace")!;
const { completionRequest, cancelCompletion, confirmCompletion } = ws;
const dialog = ref<HTMLElement | null>(null);
const cancelButton = ref<HTMLButtonElement | null>(null);
let trigger: HTMLElement | null = null;

function focusables() {
  return [...(dialog.value?.querySelectorAll<HTMLElement>("button:not(:disabled), [href], input, select, textarea, [tabindex]:not([tabindex='-1'])") ?? [])];
}
function onKeydown(event: KeyboardEvent) {
  if (!completionRequest.value) return;
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopImmediatePropagation();
    cancelCompletion();
    return;
  }
  if (event.key !== "Tab") return;
  const items = focusables();
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
function restoreFocus() {
  if (trigger?.isConnected) {
    trigger.focus();
  } else {
    document.querySelector<HTMLElement>("#drawer-close, #goal-add-open")?.focus();
  }
  trigger = null;
}
watch(completionRequest, async (request, previous) => {
  if (request && !previous) {
    trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    await nextTick();
    cancelButton.value?.focus();
    document.addEventListener("keydown", onKeydown, true);
  } else if (!request && previous) {
    document.removeEventListener("keydown", onKeydown, true);
    await nextTick();
    restoreFocus();
  }
});
onBeforeUnmount(() => document.removeEventListener("keydown", onKeydown, true));
</script>

<template>
  <div v-if="completionRequest" class="confirm-layer">
    <div class="confirm-scrim" @click="cancelCompletion"></div>
    <section ref="dialog" class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="complete-title">
      <h2 id="complete-title">完成「{{ completionRequest.title }}」？</h2>
      <p>确认后，成长记录会新增 1 条目标完成记录。</p>
      <p>只记一次完成增益，已结算的历史逾期保留。</p>
      <div class="confirm-actions">
        <button ref="cancelButton" class="action-btn" type="button" @click="cancelCompletion">继续处理</button>
        <button class="action-btn primary" type="button" @click="confirmCompletion">确认完成</button>
      </div>
    </section>
  </div>
</template>
