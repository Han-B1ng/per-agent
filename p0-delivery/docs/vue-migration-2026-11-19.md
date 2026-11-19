# Personal Economy Vue 迁移与行情精修验收单

日期：2026-11-19。分支：`feature/vue-market-refinement`。基线：最新 `main` 加当前 v0.2 功能基线。本文记录 Vue 3 + TypeScript + Vite 迁移、行情首页精修、构建与实测证据。

## 1. 架构与文件责任

- `frontend/index.html`：Vite 入口。
- `frontend/src/main.ts`：挂载 Vue 应用并加载样式。
- `frontend/src/App.vue`：页面壳、导航状态、Esc 优先级、跨日刷新与健康检查。
- `frontend/src/composables/useWorkspace.ts`：唯一页面状态与业务动作协调；请求代次、清空作废、整批写入、跨日、抽屉、筛选、导出。
- `frontend/src/components/AppSidebar.vue`：60px 图标导航，顶部产品标识，底部设置；悬停提示与键盘可读名称。
- `frontend/src/components/PageHeader.vue`：当前页面名；行情页右侧样例/我的与模型状态；返回行情。
- `frontend/src/components/MarketView.vue`：行情布局与实际溢出测量；周 K 与消息区比例；专注切换。
- `frontend/src/components/MarketSummary.vue`：指数、周涨跌、开高低。
- `frontend/src/components/CandleChart.vue`：Canvas 生命周期、DPR、resize、点选、卸载清理。
- `frontend/src/components/MessageList.vue`：消息、待确认卡、失败重试、处理中、滚动记忆。
- `frontend/src/components/Composer.vue`：一行起步、最多四行内部滚动、Enter/Shift+Enter、中文输入法保护、草稿保留。
- `frontend/src/components/GoalsView.vue` / `RecordsView.vue`：目标与记录页面，保全 v0.2 功能。
- `frontend/src/components/DetailDrawer.vue`：周明细、持仓、目标、记录、设置抽屉。
- `frontend/src/types.ts`：账本实体、抽取请求/结果、引擎结果、页面/抽屉/筛选状态类型。
- `frontend/src/core.ts`：复用 `web/engine.js`、`ledger.js`、`store.js`、`extractor.js`、`chart.js`、`sample-data.js` 的类型化边界；模型回包运行时校验。
- `web/store.js`：localStorage v2、v1 迁移、实体运行时校验、样例/个人隔离。
- `server/index.mjs`：静态托管默认改为 `dist/`，保留 `/api`、`/legacy/`。
- `vite.config.ts`：root `frontend`，base `./`，开发代理 `/api` 与 `/legacy` 到 `127.0.0.1:8123`，构建输出 `dist/`。

## 2. 启动与构建

```bash
cd p0-delivery
npm install
npm run build       # vue-tsc 类型检查 + vite build
npm start           # 生产预览 http://localhost:8123
npm run dev         # Vite HMR http://localhost:5173，需另开 npm start
npm run typecheck
npm test
npm run test:browser
npm run test:v02
npm run test:visual
npm run test:sample
```

## 3. 数据与模型契约

- 三页面共享同一账本，不保存业务副本。目标从任务状态派生，记录从事件/休息/任务完成派生，周 K 由原引擎全量重算。
- localStorage v2 保留；v1 自动迁移并运行时校验实体字段、日期、状态、引用 ID。样例只读。
- 写入继续走 `ledger.applyItems` 草稿事务；冲突整批回滚；任务完成幂等；D39/D40 不变。
- 清空递增请求代次，旧响应不写回；跨午夜动态刷新 today；否认只处理执行时仍 pending 的记录。
- 模型接口沿用同源 `health/extract` 与 `reply/items`。前端 core 对回包做运行时校验；服务端继续字段/日期/操作/引用校验、限流、缓存隔离与安全日志。QODER_PAT 仅 Sites 服务端读取。

## 4. 行情精修要点

- 左侧窄图标栏，顶部产品标识，底部设置；手机收进菜单。
- 指数 48–64px 等宽数字，周涨跌 15px，开高低右侧；窄屏移到点位下方。
- 周 K 绘图区 `clamp(260px, 44dvh, 460px)`，随容器 resize 与 DPR 重绘；单根周 K 显示「目前只有本周记录」。
- 无消息时不渲染空白消息区；有回复后消息区在图表下方按内容展开。
- 首次聚焦只改变输入框样式，图表位置尺寸不变；实际布局溢出才进入专注；同一张 K 线放大渐隐为背景，550ms Dk Connect 缓动。
- 返回行情/Esc 保留消息与草稿；抽屉打开时 Esc 优先关抽屉；用户上滚看历史时不强制拉回底部；减少动态效果直接切换。
- 输入框最多四行后内部滚动；中文输入法选词结束前不发送。

## 5. 实测结果

| 验证层 | 状态 | 证据 |
| --- | --- | --- |
| TypeScript 类型检查 + Vite 生产构建 | 通过 | `npm run build` |
| 引擎 / 账本 / API / Sites Function 单测 | 通过 49/49 | `npm test` |
| P0 浏览器回归 | 通过 52/52 | `assets/acceptance-results.json` |
| v0.2 工作区验收 | 通过 51/51 | `assets/v02-acceptance-results.json` |
| Vue 行情视觉与动效 | 通过 19/19 | `assets/vue-visual-results.json`；三视口空闲/有消息/专注/返回截图，连续录屏，高DPR，单根周K |
| 已确认桌面样板对照 | 通过 18/18 | `npm run test:sample` |
| Vite 开发代理 | 通过 | `http://localhost:5173/api/health` 返回本地后端 health |
| 生产静态托管 | 通过 | `http://localhost:8123/` 200，`/api/health` 200 |
| 真实 Qoder 模型调用 | 受阻 | 私有站点需 Qoder 登录态；未用 Mock/Stub/HTTP 200 冒充成功 |

## 6. 视觉证据

- 迁移前基线：`assets/baseline-v02/`
- Vue 行情：`assets/screenshots/vue-market-1440x900-*.png`、`vue-market-1440x720-*.png`、`vue-market-390x844-*.png`
- 单根周 K：`assets/screenshots/vue-market-single-week.png`
- 连续录屏：`assets/videos/vue-market-1440x900.webm`、`vue-market-1440x720.webm`、`vue-market-390x844.webm`
- 目标中心 / 成长记录：`assets/screenshots/v02-goals.png`、`v02-records.png`

## 7. Sites 兼容与未验证项

- 生产构建 base `./`，静态资源相对路径，兼容 Qoder Sites 子路径；Function 路由仍为同源 `/functions/v1/app/api/health|extract`。
- Vue 构建已发布到同一私有站点，Function `app` active，访问范围保持 private；真实 Qoder 抽取仍待登录态冒烟。
- 私有站点发布与真实模型冒烟按实际状态记录；公开发布等负责人安排。
- 未验证：更多手机机型、真实 Qoder 登录后抽取、公开访问。
