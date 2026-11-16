# 任务：补全 Agent 规格缺口（验收发现②③）

工作区：/Users/han_b1ng/Han_B1ng/code/aicode/dasai

## 第一步：读这些
- docs/design/agent-engine-spec-v0.1.md  ← 你要补全的规格（D18–D36 已敲定，不要重开）
- docs/decisions/decision-log.md         ← 看「规格缺口」节 + 已定项 D1–D36
- docs/design/design-draft-v0.1.md §4.5  ← 明细三段式与排序键的设计侧描述

## 你的职责
你是 agent 逻辑专项会话的续作。8 个开放项已关闭，本次只补**三个规格缺口**，
补全后写入 agent-engine-spec-v0.1.md，并更新 decision-log（新决策续接 D37+）。
技术协议你可以提案，但涉及产品取舍的点要问我，不要替我发明。不写实现代码。

## 绝对禁止
- 重开已定项（D1–D36），尤其：模型只抽取不算分（D11）、无板块（D19）、
  同日 8 条上限（D27）、pending 不计分（D29）、单次调用返回 {reply, items[]}（D36）。
- 沿用已撤回的五板块 / dimension。
- 把提案当已定。

## 缺口 1：状态变更协议（高）
现状问题：spec §8 注入上下文只给 open 任务的 title/dueAt/position，**没给 id**；
items[] 没定义操作如何引用对象。同名任务、一轮多条 pending 时，一句「对，那个完成了」会更新错对象。

要补：
- 固定注入必须带稳定 id：task.id、pending event.id（含 title 供人读，但引用以 id 为准）。
- items[] 定义结构化操作类型，至少覆盖：
  add_event / add_task / mark_rest / confirm_event{id} / reject_event{id} /
  complete_task{id} / delete_event{id} / update_task{id, fields}。
- 模型引用对象一律用 id，禁止用 title 匹配。
- 歧义兜底：同名任务或一轮多条 pending 时，模型必须追问澄清（列出候选 id 让用户选），不能猜。
- 确认/否认/撤销与引擎全量重算的衔接（pending→confirmed 计分，reject→软删除）。

验收用例（写进 spec）：
1. 两个同名任务，用户说「那个完成了」→ 必须追问是哪一个，确认后只更新对应 id。
2. 一轮抽取出两条 pending，用户说「第一条对，第二条不对」→ 按 id 分别 confirm/reject。

## 缺口 2：同日稳定排序键（高）
现状问题：occurredAt 只到天，spec §4「按发生顺序取前 8 条计分」缺稳定 tie-breaker；
同日补录后顺序不确定，破坏可复算。

要补：
- 定义同日排序键：建议加 seq（录入单调递增）或 createdAt 时间戳作 tie-breaker。
- 明确「按发生顺序」= occurredAt 日期 + 同日 tie-breaker 的稳定排序。
- 补录旧日期事件：按排序键插入，全量重算（确定性引擎红利）。
- 排序键由谁产生（前端录入时赋值，非模型职责），写清。

验收用例：同日先后录入多条、再补录一条旧事件，重算结果与明细顺序稳定一致。

## 缺口 3：明细三段式落地（高）
现状问题：明细要让用户从事件一路核对到收盘，需展示涨跌停调整。

要补：
- 每日 r 在明细中展示三段：原始收益（Σ事件+完成增益−逾期+沉默/停牌）→ 涨跌停调整 → 实际收益（clamp 后）。
  例：原始 +8%、调整 −2%、实际 +6%。
- 周收盘 = 周内每日实际收益复利累积，明细能逐日对上。
- 超出 8 条上限的事件、情绪事件、软删除/pending 的展示规则（贡献 0 / 不计分，标注原因）。

验收用例：构造一日原始 +8% 的事件组，明细显示调整 −2%、实际 +6%，周收盘可对上。

## 产出
- 三个缺口写入 agent-engine-spec-v0.1.md（新增节，标注「用户已定」或「待定」）。
- 每个缺口附验收用例。
- 更新 decision-log：新决策编号续接，变更日志记一笔。
- 涉及产品取舍的点（如排序键用 seq 还是 createdAt）列出来问我，不替我填默认值。