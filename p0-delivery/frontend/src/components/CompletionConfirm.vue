<script setup lang="ts">
import { inject } from "vue";
import type { Workspace } from "../composables/useWorkspace";

const ws = inject<Workspace>("workspace")!;
const { completionRequest, cancelCompletion, confirmCompletion } = ws;
</script>

<template>
  <div v-if="completionRequest" class="confirm-layer">
    <div class="confirm-scrim" @click="cancelCompletion"></div>
    <section class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="complete-title">
      <h2 id="complete-title">完成「{{ completionRequest.title }}」？</h2>
      <p>确认后，成长记录会新增 1 条目标完成记录。</p>
      <p>只记一次完成增益，已结算的历史逾期保留。</p>
      <div class="confirm-actions">
        <button class="action-btn" type="button" @click="cancelCompletion">继续处理</button>
        <button class="action-btn primary" type="button" @click="confirmCompletion">确认完成</button>
      </div>
    </section>
  </div>
</template>
