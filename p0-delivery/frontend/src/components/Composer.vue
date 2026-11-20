<script setup lang="ts">
import { computed, inject, nextTick, onMounted, ref, watch } from "vue";
import type { Workspace } from "../composables/useWorkspace";

const ws = inject<Workspace>("workspace")!;
const { draft, busy, focusMode, conversationOpen, modelState, sendText, composerFocusSignal, openConversation, openGoalForm, openFirstActiveGoal } = ws;
const entry = ref<HTMLTextAreaElement | null>(null);
const composing = ref(false);
const privacy = computed(() => (modelState.value === "model" ? "内容会发给模型服务 · 记录仅存本机" : "本地识别 · 记录仅存本机"));
const canSend = computed(() => draft.value.trim().length > 0 && !busy.value);

function autoGrow() {
  const el = entry.value;
  if (!el) return;
  el.style.height = "auto";
  const max = 4 * 22 + 16;
  el.style.height = `${Math.min(el.scrollHeight, max)}px`;
  el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
}
function submit() {
  const text = draft.value.trim();
  if (!text || busy.value) return;
  draft.value = "";
  nextTick(autoGrow);
  void sendText(text);
}
function onKeydown(event: KeyboardEvent) {
  if (event.key !== "Enter" || event.shiftKey || composing.value || event.isComposing || event.keyCode === 229) return;
  event.preventDefault();
  submit();
}
function focusEntry() {
  openConversation();
  entry.value?.focus({ preventScroll: true });
}
function recordSomething() {
  focusEntry();
}
function watchDraft() {
  return nextTick(autoGrow);
}
watch(draft, watchDraft);
watch(composerFocusSignal, () => nextTick(() => entry.value?.focus({ preventScroll: true })));
onMounted(() => {
  if (conversationOpen.value) nextTick(() => entry.value?.focus({ preventScroll: true }));
});
</script>

<template>
  <footer class="compose-area" :class="{ 'is-expanded': conversationOpen || focusMode }">
    <div v-if="conversationOpen || focusMode" class="quick-actions" aria-label="快捷操作">
      <button type="button" @click="recordSomething">记录一件事</button>
      <button type="button" @click="openGoalForm">新增目标</button>
      <button type="button" @click="openFirstActiveGoal">完成目标</button>
    </div>
    <form class="composer" @submit.prevent="submit" @click="focusEntry">
      <label class="sr-only" for="entry">输入消息</label>
      <textarea id="entry" ref="entry" v-model="draft" rows="1" maxlength="1500" placeholder="说说今天发生的事…" aria-describedby="compose-hint" @focus="openConversation" @input="autoGrow" @keydown="onKeydown" @compositionstart="composing = true" @compositionend="composing = false"></textarea>
      <button class="send" type="submit" aria-label="发送" :disabled="!canSend"><span aria-hidden="true">↑</span></button>
    </form>
    <p v-show="conversationOpen || focusMode" class="compose-hint" id="compose-hint">发送时会将内容发给模型服务<span v-if="modelState !== 'model'"> · 当前为本地识别</span></p>
  </footer>
</template>
