<script setup lang="ts">
import { computed, inject, nextTick, ref, watch } from "vue";
import type { Workspace } from "../composables/useWorkspace";

const ws = inject<Workspace>("workspace")!;
const { draft, busy, hasMessages, modelState, sendText, composerFocusSignal } = ws;
const entry = ref<HTMLTextAreaElement | null>(null);
const composing = ref(false);
const examples = [
  "今天有点焦虑，但还是去跑了五公里。",
  "今天完成了数据库课设。",
  "今天有点累，想休息一天。",
];
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
function useExample(text: string) {
  draft.value = text;
  nextTick(() => { autoGrow(); entry.value?.focus({ preventScroll: true }); });
}
watch(draft, () => nextTick(autoGrow));
watch(composerFocusSignal, () => nextTick(() => entry.value?.focus({ preventScroll: true })));
</script>

<template>
  <footer class="compose-area">
    <div v-if="!hasMessages" class="examples" aria-label="试一句">
      <button v-for="text in examples" :key="text" type="button" @click="useExample(text)">{{ text }}</button>
    </div>
    <form class="composer" @submit.prevent="submit">
      <label class="sr-only" for="entry">输入消息</label>
      <textarea id="entry" ref="entry" v-model="draft" rows="1" maxlength="1500" placeholder="说说今天发生的事…" aria-describedby="compose-hint" @input="autoGrow" @keydown="onKeydown" @compositionstart="composing = true" @compositionend="composing = false"></textarea>
      <button class="send" type="submit" aria-label="发送" :disabled="!canSend"><span aria-hidden="true">↑</span></button>
    </form>
    <p class="compose-hint" id="compose-hint">Enter 发送 <span>·</span> Shift + Enter 换行 <span>·</span> <em id="privacy-note">{{ privacy }}</em></p>
  </footer>
</template>
