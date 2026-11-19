# 终版 main 验收记录（2026-11-19）

验收对象：合并 #3（工作台）、#5（Vue 迁移 + 首页精修 + 页头裁切修复）、#4（周复盘挂载）、#6（QCA 初始化冲突修复）后的 `main`，提交 `9579e3957e4ef27cd26d61099cd7ce4e0c38ae66`。#2 经逐项比对确认被 #3 完整覆盖后关闭。

## 1. 合并顺序与差异核对

| 步骤 | 结果 |
| --- | --- |
| #2 vs #3 P0 差异 | #2 无 #3 缺失的有效改动；独有内容仅为过时计数与旧分工句。关闭 #2 |
| 合 #3 | `4c4f749` |
| #5 页头裁切修复 | 页头容器独立 `topbar-heading`，三视口标题完整；补 `vue-header-*.png` 与断言；`dc4208f` |
| 合 #5 后 diff 复核 | 相对 main 仅余迁移与首页精修（85 文件：frontend、证据、构建配置、共享核心校验/destroy） |
| 合 #5 | `b8b20e0` |
| #4 周复盘挂载 | 成长记录「本周」tab + 周次选择；open-goal/open-week 接共享抽屉；58/58 含 7 项接入断言；`c9a2fd4` |
| 合 #4 | `111acab` |
| 真实抽取发现上游 409 | #6 修复 bootstrap 复用；`f5ac365` |
| 合 #6 | `9579e39` |

## 2. 终版 main 本地实测

| 项目 | 结果 |
| --- | --- |
| `npm run build`（vue-tsc + vite） | 通过 |
| `npm test` | 50/50 |
| `npm run test:v02`（三页联动 + 周复盘接入 + 并发/跨日回归） | 58/58 |
| `npm run test:browser`（P0） | 52/52 |
| `npm run test:visual`（三视口三状态 + 页头 + 高DPR + 单根周K） | 22/22 |
| `npm run test:sample` | 18/18 |
| `weekly-review npm run test:all` | 11/11 单测 + 构建 + 23/23 e2e |

## 3. 发布与真实抽取（受阻，原因明确）

- 当前线上 release：`033C1723-51C7-4113-B9AB-1507EA6B74C0`（终版 main 前端 + 修复前 Function）。站点访问范围现为 public（负责人侧调整），未由本轮改动。
- 真实浏览器（非 headless）打开线上站点发送「今天有点焦虑，但还是去跑了五公里。」：返回 502 `network`，账本未写入（失败不录入语义正确）。
- Function 请求日志确认请求到达 Function；输出日志显示上游 `POST /api/v1/cloud/agents` 返回 **409 `ai_conflict`**（旧 Idempotency-Key 对应定义已存在且不一致）。requestId 例：`86ec92ae-0c51-4588-be99-e5c4d7f44eed`、`22623663-16f4-4845-8cd9-01cf67eb9fc6`。
- #6 已修复该路径（新幂等键 + 409 时复用本应用 Agent/Environment），单测 50/50 覆盖。
- **部署阻塞**：含 #6 的 Function 发布连续 4 次操作失败，平台安全消息均为 `sites_function_deploy_failed / ENOSPC: no space left on device, mkdtemp 'edge-function-bundle-XXXXXX'`（平台构建机临时目录满）。操作 ID：`01a1f44a-c04c-7198-8e9d-856a7b779f22`、`01a1f44c-d083-72dd-80bf-9465ade582f6`、`01a1f44f-4bfe-7c3c-bf47-745164248e6e`、`01a1f455-07a6-75da-bd9c-c79ad67e8228`。已按平台重试间隔等待并停止继续重试。
- 结论：**真实 Qoder 抽取尚未通过**；阻塞点为平台 Edge 部署 ENOSPC，而非代码或凭据。平台恢复后重新发布 `functions/`（main 已含修复），再复跑真实抽取即可闭环；本地 Mock/Stub 与全部浏览器回归不受影响。

## 4. 证据

- 真实抽取失败原始值：`assets/real-qca-extract.json`、截图 `assets/screenshots/real-qca-extract.png`
- 三页联动与接入断言：`assets/v02-acceptance-results.json`
- 页头修复特写：`assets/screenshots/vue-header-1440x900.png`、`vue-header-1440x720.png`、`vue-header-390x844.png`
- 周复盘挂载截图：`assets/screenshots/weekly-review-mounted-1440x900.png`、`weekly-review-mounted-390x844.png`
- 终版录屏：`assets/videos/vue-market-*.webm`、`v02-market-*.webm`、`v02-mobile-390x844.webm`
