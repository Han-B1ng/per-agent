# Agent 交流协议 v0.1

状态：实现基线协议（2026-11-19）。适用「个人成长指数」现有单 Agent：浏览器 → 同源 Sites Function / 本地服务 → 一个 Qoder Cloud Agent（或 Mock / Stub）。本文只定义交流与入账边界，不改变 D18–D40 的计分与账本口径。

关联决策：D11（模型不算分）、D18（情绪不计分）、D25（完成不双重计分）、D29–D32（低置信、时间归一化、休息、多意图）、D33–D36（回复、上下文、窗口、单次返回）、D39（完成/逾期）、D40（pending 隔离与休息确认流）。

## 1. 三种意图

模型每次只做三件事之一或其组合：

| 意图 | 典型话 | 唯一允许的写操作 | 说明 |
| --- | --- | --- | --- |
| 新增目标 | 「我想周五交数据库课设」 | `add_task` | 未来承诺；必须有到期日。不得写成行为事件，也不得计完成增益。 |
| 完成已有目标 | 「数据库课设交了」 | `complete_task` | 必须引用上下文中的稳定 `task.id`；同名/相近目标有歧义时不得猜 ID。 |
| 记录已发生的事 | 「今天跑了五公里」「前阵子跑过五公里」 | `add_event` / `add_rest` | 日期必须归一化；模糊过去先进入 pending 或追问，确认前不计分。 |

判定优先级：

1. 明确的过去完成措辞（交了/交完/提交了/完成/做完/搞定/写完/通过）优先判为 `complete_task`，不判新增目标。
2. 未来承诺措辞（我想/我要/计划/打算/准备/截止/之前）+ 目标对象判为 `add_task`；没有到期日时只追问，不落目标。
3. 发生过的行为/情绪/休息判为 `add_event`/`add_rest`（D18/D31/D32）。
4. 一句话可同时包含「记录」和「完成/新增」；拆成多个 item，但共享一次响应与一次应用事务。

## 2. 请求上下文

浏览器每次调用携带以下对象。字段范围是协议的一部分，服务端按范围裁剪/校验；超限或非法上下文返回 400，不调用模型。

| 字段 | 必填 | 范围 | 缺失/非法处理 |
| --- | --- | --- | --- |
| `today` | 是 | `YYYY-MM-DD`，客户端本地日期 | 缺失时服务端兼容性回退到 UTC 今天；非法则 400。应用正常路径必须显式发送。 |
| `now` | 否 | ISO 时间 | 缺失时用 `today`；只用于提示，不参与计分。 |
| `clientId` | 否 | 字符串 ≤100 | 缺失时不做跨请求缓存键隔离。 |
| `openTasks` | 否 | ≤200 条；`{id,title,dueAt,position}`；仅 `open` 未完成、未删除目标 | 缺省 `[]`；缺 `id`/`title`/`dueAt` 的条目丢弃，不得被模型引用。 |
| `pendingEvents` | 否 | ≤200 条；`{id,quote,occurredAt,eventType,polarity,intensity}` | 缺省 `[]`；缺 `id`/`occurredAt`/`quote` 的条目丢弃。 |
| `pendingRests` | 否 | ≤200 条；`{id,quote,date}` | 缺省 `[]`；缺 `id`/`date`/`quote` 的条目丢弃。 |
| `clarifications` | 否 | ≤5 条仍待回答的澄清；见 §3.2 / §4 | 缺省 `[]`；已 resolved/cancelled 的不注入；候选必须仍存在于当前账本/待确认列表。 |
| `turns` | 否 | 最近 10 条，每条 content ≤1500 字 | 缺省 `[]`；只放用户与助手的可见对话，排除失败消息与**当前这一句**。不注入全量事件历史（D35）。 |

上下文示例：

```json
{
  "today": "2026-11-19",
  "now": "2026-11-19T12:30:00.000Z",
  "clientId": "client_abc",
  "openTasks": [
    { "id": "task_db", "title": "数据库课设", "dueAt": "2026-11-21", "position": 3 },
    { "id": "task_algo", "title": "算法课设", "dueAt": "2026-11-24", "position": 3 }
  ],
  "pendingEvents": [
    { "id": "evt_run", "quote": "前阵子跑过五公里", "occurredAt": "2026-11-19", "eventType": "behavior", "polarity": "positive", "intensity": 3 }
  ],
  "pendingRests": [],
  "clarifications": [
    {
      "id": "clr_1",
      "kind": "task_target",
      "intent": "complete_task",
      "question": "你说的课设是哪一个？",
      "sourceText": "课设交了",
      "candidates": [
        { "id": "task_db", "label": "数据库课设 · 11.21 到期", "kind": "task", "title": "数据库课设", "dueAt": "2026-11-21" },
        { "id": "task_algo", "label": "算法课设 · 11.24 到期", "kind": "task", "title": "算法课设", "dueAt": "2026-11-24" }
      ]
    }
  ],
  "turns": [
    { "role": "user", "content": "课设交了，今天还跑了五公里" },
    { "role": "assistant", "content": "跑步记下了。你说的课设是哪一个？" }
  ]
}
```

约束：

- 上下文中的 ID 是稳定、不可推断的账本 ID；模型必须原样引用，不得自造、改写或从标题猜。
- 标题、原文只用于理解，不能替代 ID。
- 服务端模型永远不接收分数、权重或历史 K 线；模型也不能返回任何分数/点数/百分比（D11）。

## 3. 返回协议

一次调用只返回严格 JSON：

```json
{ "reply": "string", "items": [] }
```

`reply` 是给用户看的自然语言，**不是入账凭证**；最终是否写入、写入多少，由应用依据 `applyItems` 结果生成回执（§7）。模型不得声称「已计入指数」「+X%」「目标已完成」等最终结果。

### 3.1 操作总表

| op | 必填 | 可选 | 约束 |
| --- | --- | --- | --- |
| `add_event` | `event.eventType`、`polarity`、`intensity`、`occurredAt`、`quote`、`confidence` | `tags` | `occurredAt` 合法且 ≤ `today`；情绪强制 neutral；confidence<0.6 由应用存 pending。 |
| `add_rest` | `rest.date`、`quote`、`confidence` | — | `date` 合法且 ≤ `today`；低置信存 pending，确认前无停牌增益（D40）。 |
| `add_task` | `task.title`、`dueAt`、`position`、`confidence` | — | `dueAt` 合法且 ≥ `today`；无到期日时不得输出 op，只能追问。 |
| `confirm_event` | `id` | `occurredAt` | `id` 必须是当前 `pendingEvents`；日期合法且 ≤ `today`；已确认再确认由应用报错并整批回滚。 |
| `deny_event` / `delete_event` | `id` | — | `id` 必须是当前 pending 事件。 |
| `confirm_rest` | `id` | `date` | `id` 必须是当前 `pendingRests`；日期合法且 ≤ `today`。 |
| `deny_rest` / `delete_rest` | `id` | — | `id` 必须是当前 pending 休息。 |
| `complete_task` | `id` | `doneAt` | `id` 必须是当前 `openTasks`；`doneAt` 合法且 ≤ `today`；目标已完成时应用幂等跳过并回执「未重复入账」。 |
| `delete_task` | `id` | — | `id` 必须是当前 `openTasks`。 |
| `request_clarification` | `clarification.kind`、`intent`、`question`、`sourceText`、`candidates` | — | 见 §3.2；候选 ID 必须来自当前上下文，候选 1–5 个。 |

未知 op、未知 ID、非法日期、候选 ID 越界、候选为空：服务端整次拒绝（`bad_output`），不返回部分 `items`；浏览器再做一次写入前校验。

### 3.2 request_clarification

用于同名/相近目标或多条 pending 归属不明。它**不是**账本写入，只创建一条待回答状态。

```json
{
  "op": "request_clarification",
  "clarification": {
    "kind": "task_target",
    "intent": "complete_task",
    "question": "有两个课设目标，你说的是哪一个？",
    "sourceText": "课设交了",
    "candidates": [
      { "id": "task_db", "label": "数据库课设 · 11.21 到期", "kind": "task", "title": "数据库课设", "dueAt": "2026-11-21" },
      { "id": "task_algo", "label": "算法课设 · 11.24 到期", "kind": "task", "title": "算法课设", "dueAt": "2026-11-24" }
    ]
  }
}
```

- `kind`：`task_target`（intent 仅 `complete_task`/`delete_task`）或 `record_target`（intent 为 confirm/deny/delete 事件或休息）。
- `candidates`：任务只能引用 `openTasks`；记录只能引用对应 pending 列表。每个候选有稳定 `id` 与可读 `label`；任务候选可带 `title`/`dueAt`，记录候选可带 `quote`/`date`。
- 应用存储时分配 `clr_*` ID，并保留候选快照；模型不生成澄清 ID。
- 候选超过 5 个时只保留最相关的 5 个，并让用户用更具体的说法缩小范围。

## 4. 上下文中的澄清与后续解析

应用把仍 pending 的澄清写入 `context.clarifications`。用户下一句可以：

1. 直接点名：`数据库那个` / `第二个` / `task_db`；
2. 补充日期：`上周三`（用于 pending 事件/休息确认）；
3. 取消：`不是` / `算了` / `不记了`。

应用先做确定性解析（不调用模型）：

- 任务候选：按 `id`、完整标题、唯一最长公共子串、到期日、序数（第一个/后者）匹配；仅当**唯一最高分**且本句确实在确认原操作时，才解析为 `task.id`。
- 记录候选：按 `id`、原文、日期、序数匹配；唯一最高分才解析。
- 候选匹配与操作意图分开判断：`数据库那个` 是候选选择；`数据库那个还没交` 是否定，不完成；`今天复习了数据库` 是新动作，不当作完成确认；疑问句（如「交了吗？」）也只追问，不落写操作。
- 删除澄清保留 `delete_task`：选择候选只会删除目标，不会转成完成或产生完成增益。
- 日期补全：复用现有相对日期解析；解析成功后 `confirm_event`/`confirm_rest` 携带该日期。
- 仍有多个同分候选：继续追问，不猜 ID，不发写操作。
- 用户话里没有候选信息：视为新意图，继续走模型；已有澄清保持 pending。
- 澄清答复里同时带新的明确事项（如「数据库那个，今天还跑了五公里」）：应用先处理澄清目标，再把同一句剩余事项交给模型；已生效的操作不会重复执行。
- 取消/否定：标记澄清 cancelled 或给出「尚未完成/尚未删除」反馈，不写账本；若同句还有新事项，新事项仍继续处理。

如果确定性解析没有命中、但模型仍返回 `complete_task` 等写操作，应用再做**歧义守卫**：当用户原句对多个目标同分且模型选中其中之一时，应用丢弃该写操作并转换成 `task_target` 澄清；明确事项仍可照常入账。

## 5. 多意图与事务边界

一句话可以返回多个 item，例如：

```json
{
  "reply": "跑步记下了。你说的课设是哪一个？",
  "items": [
    { "op": "add_event", "event": { "eventType": "behavior", "polarity": "positive", "intensity": 3, "occurredAt": "2026-11-19", "quote": "今天还跑了五公里", "tags": [], "confidence": 0.92 } },
    { "op": "request_clarification", "clarification": { "kind": "task_target", "intent": "complete_task", "question": "有两个课设目标，你说的是哪一个？", "sourceText": "课设交了", "candidates": [ "…" ] } }
  ]
}
```

提交规则：

| 项 | 是否写账本 | 何时生效 |
| --- | --- | --- |
| `add_*` / `confirm_*` / `deny_*` / `delete_*` / `complete_task` | 是 | 同一响应内**整批原子校验**；全部通过后由 `applyItems` 一次提交。任一写项无效 → 整批不写。 |
| 低置信 `add_event` / `add_rest` | 是（pending 记录） | 写入账本但 `status=pending`；不计分、不影响起点/沉默/停牌（D40）。 |
| `request_clarification` | 否 | 仅当同批写项全部成功时，作为聊天消息状态保存；写项失败则不保存新澄清；`intent` 必须保留原操作（完成/删除/确认/否认）。 |
| 明确事项 + 歧义事项 | 明确项写入，歧义项挂起 | 歧义项不是写操作，不会让整批失败；这正是「先入账明确事项，歧义单独等待确认」。 |

应用写入成功后才显示「已记录」「目标已完成」；模型 `reply` 不能代替回执。失败、超时、非法响应一律不写，只显示失败与重试入口。

## 6. 日期与状态约束

- 所有记录日期使用 `YYYY-MM-DD`，按客户端 `today` 解释；服务端拒绝 `2026-02-31` 这类不存在的日期。
- 已发生：`occurredAt`、休息 `date`、`doneAt`、确认日期必须 ≤ today；未来日期拒绝。
- 模糊日期必须**逐条记录**绑定日期证据：某条 item 的 `quote` 或其所在分句没有明确日期时，即使模型填了昨天、上周或其它历史日，也强制 `confidence≤0.4` 进入 pending；同一句里另一事项的「今天」不能解锁这条模糊记录。补明日期并确认后才允许计分。
- 新增目标：`dueAt` 必须 ≥ today；到期日说不清时只追问，不落目标。
- `complete_task` 只能引用仍为 `open` 的目标；对已 `done` 目标重复完成是幂等 no-op，不产生第二笔完成增益（D25/D39）。
- `confirm_event` 只能作用于 pending；确认后事件转 confirmed 并按确认日期全量重算；第二次确认/否认返回「已处理」，整批回滚（D40）。
- 完成逾期目标：完成当日只计一次完成增益，历史逾期扣分保留（D39）；复盘和 K 线以引擎重算为准。

## 7. 应用回执

浏览器在 `applyItems` 后生成 `receipt` 并随助手消息持久化：

```json
{
  "receipt": {
    "status": "pending",
    "changed": 1,
    "pending": 1,
    "noop": 0,
    "clarifications": 1
  }
}
```

| status | 含义 | 用户可见 |
| --- | --- | --- |
| `applied` | 至少一项写入成功，无 pending/澄清 | 「已写入 N 项」 |
| `pending` | 写入成功但含待确认记录 | 「已记录，待确认后计分」 |
| `clarification` | 无写入，只创建/保留澄清 | 显示澄清卡片，不显示「已记录」 |
| `noop` | 有写操作但全部已处理 | 「之前已处理，没有重复入账」；覆盖模型 reply 中的成功措辞 |
| `empty` | 无写操作也无澄清 | 只显示模型对话 |

- 待确认（pending）不是「已计入」；确认后由引擎重算才改变指数。
- 模型 reply 只作对话文本；应用按 `receipt` 改写成功措辞。`pending`、`clarification`、`noop`、`empty` 下若模型声称「已计入指数/已记录/已完成」，应用会移除该句并生成「待确认不计分 / 待澄清 / 之前已处理」等回执说明；同批混合状态也按实际计数生成。
- 刷新后：pending 事件/休息、澄清候选、回执都在账本/聊天消息中恢复；不会重复写入。
- 真实模型、Mock、Stub 都走同一应用校验与回执；`mode` 分别保留为 `model` / `mock` / `local`（本地澄清解析）。不得把 Mock 或 Stub 结果标注成真实模型。

### 7.1 客户端状态与挂载点

- `ChatMessage` 新增可选字段：`clarifications[]`（待回答/已解决/已取消 + 候选快照）与 `receipt`（写入回执）；`mode` 增加 `local`。沿用现有 `chat` 数组持久化，不升账本版本、不新增集合。
- 应用写入仍走 `web/ledger.js#applyItems`；澄清与回执只挂在聊天消息上，不进入计分引擎。
- 最小 UI 挂载点：`frontend/src/components/MessageList.vue` 的助手消息内，使用现有 `.msg-card` / `.card-btn` 样式渲染候选按钮、取消和回执；不重做聊天布局。
- Workspace 新增动作：`resolveClarificationCandidate(messageId, clarificationId, candidateId)` 与 `cancelClarification(messageId, clarificationId)`；不改变现有 `sendText` 事件签名。

## 8. 示例（today = 2026-11-19）

机器可读版本：`p0-delivery/tests/fixtures/agent-protocol-examples.json`。

### 8.1 新增目标

输入：`我想周五交数据库课设`

```json
{
  "reply": "记下了这个目标，周五到期。",
  "items": [
    { "op": "add_task", "task": { "title": "交数据库课设", "dueAt": "2026-11-20", "position": 2, "confidence": 0.9 } }
  ]
}
```

应用：写入一条 open 目标；指数暂不变。

### 8.2 唯一目标完成

上下文：`openTasks` 只有 `task_db`「数据库课设」。

输入：`数据库课设交了`

```json
{
  "reply": "「数据库课设」完成了。",
  "items": [
    { "op": "complete_task", "id": "task_db", "doneAt": "2026-11-19" }
  ]
}
```

应用：完成增益 +0.60%（position 3）；重复完成不再增益。

### 8.3 同名目标 + 多意图

上下文：`task_db` 与 `task_algo` 都含「课设」。

输入：`课设交了，今天还跑了五公里`

```json
{
  "reply": "跑步记下了。你说的课设是哪一个？",
  "items": [
    { "op": "add_event", "event": { "eventType": "behavior", "polarity": "positive", "intensity": 2, "occurredAt": "2026-11-19", "quote": "今天还跑了五公里", "tags": [], "confidence": 0.92 } },
    { "op": "request_clarification", "clarification": { "kind": "task_target", "intent": "complete_task", "question": "有两个课设目标，你说的是哪一个？", "sourceText": "课设交了", "candidates": [ { "id": "task_db", "label": "数据库课设 · 11.21 到期", "kind": "task", "title": "数据库课设", "dueAt": "2026-11-21" }, { "id": "task_algo", "label": "算法课设 · 11.24 到期", "kind": "task", "title": "算法课设", "dueAt": "2026-11-24" } ] } }
  ]
}
```

应用：跑步立即写入；课设不完成，存为澄清。用户回「数据库那个」后由应用解析为 `task_db` 并完成；跑步不会重复入账。

### 8.4 模糊日期

输入：`前阵子跑过五公里`

```json
{
  "reply": "这是哪天跑的？告诉我具体日期，我再记进那天的走势。",
  "items": [
    { "op": "add_event", "event": { "eventType": "behavior", "polarity": "positive", "intensity": 3, "occurredAt": "2026-11-19", "quote": "前阵子跑过五公里", "tags": [], "confidence": 0.35 } }
  ]
}
```

应用：写入 pending 事件，不计分、不改变指数与历史 K；用户回「上周三」→ `confirm_event` + `occurredAt=2026-11-11`，按该日期重算一次。pending 记录 ID 是本次追问的绑定。

### 8.5 否定、疑问与删除

- `数据库那个还没交`：候选命中但操作意图是否定，不完成目标；澄清取消，reply 明确「这个目标还没完成」。
- `数据库那个交了吗`：问句不当作完成确认，继续追问。
- `今天复习了数据库`：新动作不是完成确认；行为照常记录，原有澄清保持 pending。
- 删除澄清下选择「数据库那个」：只执行 `delete_task`，不产生完成增益。

### 8.6 重复确认 / 目标已完成

- 同一 pending 再次 `confirm_event`：应用返回错误「事件已处理，请按最新账本重试」，整批不写。
- 同一目标再次 `complete_task`：`changed=0`，回执 `noop`，显示「之前已完成，没有重复计分」。
- 未知 ID / 非法日期：服务端 `bad_output` 整次拒绝；浏览器显示失败与重试，不写账本。
- 多条 pending 时，`今天还跑了五公里` 是新事件，正常入账；只有纯日期回答（如 `上周三`）才追问选择哪条旧记录。

## 9. 模式与证据

| 路径 | 标识 | 验证方式 |
| --- | --- | --- |
| 真实模型（自备 Key） | `mode:"model"` | 本地/远程 OpenAI 兼容 Stub 单测；真实服务另记 |
| Qoder Cloud Agent（Sites） | `mode:"model"`, `provider:"qoder-cloud-agents"` | Sites Function fixture + 线上真实抽取状态；初始化 409 复用旧 Agent 时，**每次请求正文仍携带完整协议提示词** |
| 本地 Mock | `mode:"mock"` | 确定性单测 + 浏览器回归 |
| 应用澄清解析 | `mode:"local"` | 前端单测/浏览器回归；不冒充模型 |

真实 Sites 的部署与 QCA 状态不因本协议文档自动成立；每次发布需单独记录 release、输入、请求 ID、结果与阻塞原因。

## 10. 已知边界

- 历史周不重建「当时进行中、后来完成」的目标状态；目标完成以当前账本 `task.id` 为准。
- 目标子步骤、拆分/暂停的模型操作不在本协议范围，留后续任务。
- 澄清只存在聊天消息中；用户在「重置对话」后，未回答的目标澄清会清除；已写入的 pending 事件/休息仍在账本中，可继续在记录页确认。
- 候选匹配使用确定性文本相似度，不调用模型做语义判断；极短或纯代词回复（「就那个」）会继续追问。
