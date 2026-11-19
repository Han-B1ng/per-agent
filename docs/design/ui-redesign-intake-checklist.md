# UI 重设计接入清单（设计准备轮）

基线：`main` @ `809f147`。本轮只做接入核对与清单，不替换 UI；等负责人与 Codex 逐页确认、Penpot 画板与覆盖任务下达后，再按新版设计整体替换本地 UI。三天前原型与旧 UI 稿已退役；Q1 Agent 协议的未提交改动留在 `dasai-agent-protocol` 工作区，本轮不动。

## 1. 启动与现版实测

```sh
cd p0-delivery && npm ci && npm run build && npm start   # http://127.0.0.1:8123
npm run dev                                              # http://localhost:5173，/api 代理到 8123
```

现版四入口实测（1440×900，0 控制台报错）：

| 入口 | 现版行为 |
| --- | --- |
| 行情 | 默认完整行情面板（指数 + 开高低 + 周 K，约 524px 高），底部仅一条输入框与快捷提示；点周 K 开右抽屉 |
| 目标中心 | 未完成 / 已完成两组默认同屏展开；新增、完成、详情、删除可用；完成只计一次增益 |
| 成长记录 | 「全部记录」按日期分组 + 日期/关键词/类型/已撤销筛选；待确认行内补日期确认/否认；详情可修正与撤销 |
| 本周复盘 | 成长记录内「本周」tab；指数卡 / 贡献列表 / 已完成 / 仍在进行；点击跳真实目标抽屉与周 K 明细；周次可切换 |

**已确认的首页新方向与现版差异（替换时必须落实）**：现版仅在消息实际溢出时才收起行情；新方向要求**点击输入框立即收起完整行情面板，只保留点位与涨跌幅**，同时展开对话与快捷提示；背景走势渐显微动；返回行情恢复面板，聊天与草稿保留（现版返回已保留草稿与消息，可沿用）。目标中心与成长记录视觉等逐页设计，功能与数据链路保持不变。

## 2. 页面入口与组件责任

|  surface | 入口 / 组件 |
| --- | --- |
| 页面壳与切换 | `frontend/src/App.vue`、`components/AppSidebar.vue`（`data-page-target="market|goals|records"`，无路由库，`useWorkspace.page`） |
| 页头 | `components/PageHeader.vue`（`#page-title`、样例/我的、模型状态、`#view-toggle`） |
| 行情 | `components/MarketView.vue` + `MarketSummary.vue` + `CandleChart.vue` + `MessageList.vue` |
| 输入 | `components/Composer.vue`（`#entry`、`.composer`、`.send`、`.examples`；IME 保护、四行上限、草稿在 `useWorkspace.draft`） |
| 目标 / 记录 / 复盘 | `components/GoalsView.vue`、`RecordsView.vue`（挂载 `weekly-review/src` 的 `WeeklyReviewView`） |
| 抽屉 / 设置 | `components/DetailDrawer.vue`（周明细 / 持仓 / 目标 / 记录 / 设置导出与清空） |
| 状态与写入协调 | `frontend/src/composables/useWorkspace.ts` |

## 3. 可复用的账本与图表能力（不要重写）

- `web/ledger.js`：`applyItems` 草稿事务整批原子写入；ops：add_event/add_rest/add_task、confirm/deny/delete_event、confirm/deny/delete_rest、correct_event/correct_rest、complete_task/delete_task；`getGoals`、`getTimeline`、`findRecord` 派生查询；稳定 ID 关联与 audit 轨迹。
- `web/engine.js`：`computeAll(records,{today,startDate})` → `days/weeks/lines/raw/adjustment/actual`；D18–D40 口径（情绪 0 分、±6% 涨跌停、同日 8 条、停牌 7 天、沉默衰减、D39 完成日、D40 pending 隔离）；`weekStartOf/shiftDate`。
- `web/chart.js`：`createChart(canvas,{onSelect})` → `render/redraw/destroy`；DPR 适配、ResizeObserver、命中测试；单根周 K 提示由宿主渲染。
- `web/store.js`：v2 读写 + v1 迁移 + 实体运行时校验 + `getClientId`。
- `weekly-review/src/review.ts`：`deriveWeeklyReview/listReviewWeeks`，只读引擎输出，不另存数据。
- `useWorkspace.ts`：请求代次作废（清空后旧响应不写回）、跨午夜刷新、focus 锁定、抽屉状态、筛选、导出/清空范围。

## 4. 必须保留的用户数据

- `pe.personal.v2`：`{version,events,rests,tasks,chat,audit}`，唯一事实来源；三页面与周 K 全部派生，禁止页面级副本。
- `pe.personal.v1`：迁移源，清空时一并移除；`pe.client.v1`：访客 ID（缓存隔离用）。
- 样例只读（`web/sample-data.js`），与个人账本严格隔离；导出/清空按当前视图范围执行。
- 完成幂等、pending 确认前不计分、撤销软删除可追溯，均为存量数据语义，新 UI 不得改变。

## 5. 必须保留的 Sites / 模型接口

- 本地：`/api/health`、`/api/extract`；线上同源：`/functions/v1/app/api/health|extract`（`web/extractor.js` 按 hostname 自适应）。
- 契约：`{reply, items[]}`；items 仅上述 ops；服务端校验字段/日期/引用 ID，非法整批拒绝；限流 30/min、缓存按访客+完整上下文隔离；失败不录入。
- `QODER_PAT` 仅 `functions/` 服务端读取；发布目录 `dist/`、Function 目录 `functions/`。
- 已知阻塞：平台 Edge 部署 `ENOSPC` 曾挡住含 409 修复的 Function 发布（修复已在 main）；恢复后重发并复跑真实抽取，见 `p0-delivery/docs/final-main-acceptance-2026-11-19.md`（整理前版本树可查回）。

## 6. 回归基线与 DOM 契约

命令：`npm run build && npm test && npm run test:browser && npm run test:v02 && npm run test:visual && npm run test:sample`；周复盘 `weekly-review/ npm run test:all`。基线计数：50 / 52 / 58 / 22 / 18 / 11+23。

新 UI 需保留或同步更新 harness 依赖的选择器：`#entry/.composer/.send/.examples`、`#view-toggle`、`#quote-value/#quote-change/#stat-open/#stat-high/#stat-low/#data-tag`、`#candles/.market/.conversation/.message-scroll/.messages/.message/.msg-card`、`#view-sample/#view-personal/#model-status`、`[data-page-target]`、`#drawer/#drawer-body/#drawer-title/#drawer-sub/#tab-detail/#tab-tasks/.week-ohlc/.day-block/.line-row`、`#goals-page/#active-goals/#done-goals/#goal-form/#goal-title-input/#goal-due-input/#goal-position`、`#records-page/#records-tab-list/#records-tab-week/#review-week-select/#filter-from/#filter-to/#record-keyword/#record-type/#record-include-deleted/#record-list/.record-row/.pending-editor`、周复盘 `data-testid="weekly-review|completed-row|ongoing-row|contribution-list|contribution-completion|week-open|index-card"`。对应 harness：`tests/browser/acceptance.mjs`、`workspace-v02.mjs`、`vue-market-visual.mjs`、`weekly-review/tests/preview.mjs`。

## 7. 等待项

- Penpot 画板 + 交互说明 + 覆盖任务（首页方向已确认，见 §1 差异）；目标中心 / 成长记录逐页设计未定。
- 拿到确认后才整体替换本地 UI；替换时以本清单 §3–§6 为不可回归边界。
