<script setup lang="ts">
import { inject, nextTick, onMounted, ref, watch } from "vue";
import type { Workspace } from "../composables/useWorkspace";
import type { EventRecord, RestRecord } from "../types";

const ws = inject<Workspace>("workspace")!;
const { personal, typing, findPending, confirmPending, denyPending, retryFailed, resetChat, resolveClarificationCandidate, cancelClarification } = ws;
const scrollEl = ref<HTMLElement | null>(null);
const stickToBottom = ref(true);

function onScroll() {
  const el = scrollEl.value;
  if (!el) return;
  stickToBottom.value = el.scrollTop + el.clientHeight >= el.scrollHeight - 24;
}
function scrollBottom() {
  const el = scrollEl.value;
  if (el) el.scrollTop = el.scrollHeight;
}
function confirmCard(id: string) {
  const pending = findPending(id);
  if (pending) confirmPending(id, pending.kind);
}
function denyCard(id: string) {
  const pending = findPending(id);
  if (pending) denyPending(id, pending.kind);
}
watch([() => personal.value.chat.length, typing], async () => {
  await nextTick();
  if (stickToBottom.value) scrollBottom();
});
onMounted(scrollBottom);
</script>

<template>
  <div class="conversation-inner">
    <header class="conversation-heading">
      <h2>对话</h2>
      <button id="reset" type="button" @click="resetChat">重置对话</button>
    </header>
    <div class="message-scroll" ref="scrollEl" tabindex="0" aria-label="消息记录" @scroll="onScroll">
      <div class="messages" role="log" aria-live="polite" aria-relevant="additions">
        <p v-for="message in personal.chat" :key="message.id" class="message" :data-author="message.role">
          <span class="sr-only">{{ message.role === "user" ? "你：" : "助手：" }}</span>{{ message.text }}
          <template v-if="message.role === 'assistant'">
            <div v-if="message.receipt && message.receipt.status !== 'empty'" class="card-meta agent-receipt" data-testid="agent-receipt" :data-status="message.receipt.status">
              <template v-if="message.receipt.changed">已写入 {{ message.receipt.changed }} 项</template>
              <template v-if="message.receipt.pending"> · 待确认 {{ message.receipt.pending }} 项</template>
              <template v-if="message.receipt.clarifications"> · 待澄清 {{ message.receipt.clarifications }} 项</template>
              <template v-if="message.receipt.noop"> · 未重复入账 {{ message.receipt.noop }} 项</template>
            </div>
            <template v-for="clarification in message.clarifications ?? []" :key="clarification.id">
              <div v-if="clarification.status === 'pending'" class="msg-card" data-testid="clarification-card" :data-clarification-id="clarification.id">
                <div class="card-quote">{{ clarification.question }}</div>
                <div class="card-meta">{{ clarification.sourceText }} · 先确认再写入</div>
                <div class="clarification-actions">
                  <button
                    v-for="candidate in clarification.candidates"
                    :key="candidate.id"
                    class="card-btn"
                    type="button"
                    :data-candidate-id="candidate.id"
                    :aria-label="`选择${candidate.label}`"
                    @click="resolveClarificationCandidate(message.id, clarification.id, candidate.id)"
                  >{{ candidate.label }}</button>
                  <button class="card-btn ghost" type="button" @click="cancelClarification(message.id, clarification.id)">先不处理</button>
                </div>
              </div>
            </template>
            <template v-for="id in message.pending ?? []" :key="id">
              <div v-if="findPending(id)" class="msg-card">
                <div class="card-quote">「{{ findPending(id)!.record.quote }}」</div>
                <div class="card-meta">{{ findPending(id)!.kind === "rest" ? "休息标记" : "事件" }}把握不足 · 暂不计分 · 默认记在 {{ findPending(id)!.kind === "rest" ? (findPending(id)!.record as RestRecord).date : (findPending(id)!.record as EventRecord).occurredAt }}</div>
                <div class="card-actions">
                  <button class="card-btn primary" type="button" @click="confirmCard(id)">{{ findPending(id)!.kind === "rest" ? "确认休息" : "确认计入" }}</button>
                  <button class="card-btn ghost" type="button" @click="denyCard(id)">不记了</button>
                </div>
              </div>
            </template>
            <div v-if="message.failed" class="msg-card failed">
              <div class="card-quote">这条没有进入记录。<span class="fail-tag">未录入</span></div>
              <div class="card-actions">
                <button class="card-btn" type="button" @click="retryFailed(message, false)">重试</button>
                <button class="card-btn ghost" type="button" @click="retryFailed(message, true)">改用本地识别</button>
              </div>
            </div>
          </template>
        </p>
        <p v-if="typing" class="message typing" data-author="assistant"><i></i><i></i><i></i> 正在记录…</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.clarification-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}
.agent-receipt {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed #ffffff10;
}
</style>
