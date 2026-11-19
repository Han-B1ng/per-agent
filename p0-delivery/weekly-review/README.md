# 本周复盘 · 独立功能模块

「成长记录」下的「本周」视图：从现有账本与确定性引擎的周 K 输出派生复盘，展示本周指数变化、本周已完成、仍在进行和逐条贡献。点击目标或贡献项只向宿主抛出稳定 ID，不在组件里跳转。

本目录是独立验收单元，同时已挂载到主站「成长记录 → 本周」（见下文接入验收）。不改公共账本结构、Sites 后端或根 `package.json` 的运行时依赖。

## 快速开始

```bash
cd p0-delivery/weekly-review
npm install
npm run dev          # http://127.0.0.1:5183/?scene=data&today=2026-11-19
npm run build        # vue-tsc 类型检查 + vite build
npm test             # 11 项复盘派生单测
npm run test:e2e     # 23 项预览/交互/桌面与手机验收，生成截图与 JSON
npm run test:all     # 单测 + 构建 + 浏览器验收
```

预览地址：

| 场景 | URL |
| --- | --- |
| 有数据 | `/?scene=data&today=2026-11-19` |
| 空账本 | `/?scene=empty&today=2026-11-19` |
| 手机窄屏 | 浏览器视口 390 × 844，同上 URL |

截图与验收原始值：

- `assets/screenshots/weekly-review-data-1440x900.png`
- `assets/screenshots/weekly-review-empty-1440x900.png`
- `assets/screenshots/weekly-review-mobile-390x844.png`
- `assets/screenshots/weekly-review-mobile-list-390x844.png`
- `assets/weekly-review-acceptance.json`

## 目录

| 路径 | 内容 |
| --- | --- |
| `src/review.ts` | 纯函数派生：周边界/涨跌/贡献/完成/进行中，全部读取 `computeAll` 输出 |
| `src/core.ts` | 对 `../web/engine.js` 与 `../web/ledger.js` 的类型收口，不复制计分逻辑 |
| `src/components/WeeklyReviewView.vue` | 复盘主组件；接收查询结果，抛出目标 ID / 周标识 |
| `src/components/WeekIndexCard.vue` | 指数卡：周开盘、当前点位、涨跌幅、周内区间、周 K 入口 |
| `src/components/ContributionList.vue` | 贡献列表：完成增益、情绪、待确认、逾期、停牌、沉默衰减 |
| `src/App.vue` | 独立预览宿主：三入口侧栏、周切换、数据/空账本切换、宿主事件回显 |
| `src/scenarios.ts` | 预览夹具；空账本返回空数组，不写 localStorage |
| `tests/review.test.ts` | 派生与账本重算单测 |
| `tests/preview.mjs` | Playwright 预览验收与截图 |

## 组件接入

```ts
import { computeAll } from "../../web/engine.js";
import { deriveWeeklyReview, WeeklyReviewView } from "./features/weekly-review/src";

const result = computeAll(records, { today });
const review = deriveWeeklyReview(records, result, { weekStart });

// 模板
<WeeklyReviewView :review="review" @open-goal="onOpenGoal" @open-week="onOpenWeek">
  <template #week-controls><!-- 宿主周次切换 --></template>
</WeeklyReviewView>

function onOpenGoal(taskId: string) {
  // 现有宿主：openEntity("goal", taskId) 或 setPage("goals", { taskId })
}
function onOpenWeek(payload: { weekStart: string; weekEnd: string; lineId?: string; targetId?: string }) {
  // 现有宿主：openWeekForDate(payload.weekStart)
  // lineId / targetId 仅用于周 K 明细内定位，可不处理
}
```

宿主现有字段即可满足接入，不需要新增持久化字段：

- `records`：迁移后 `useWorkspace` 的 `records`（个人或样例账本）。
- `result`：同一 `computeAll(records, { today })` 的查询结果；周边界、开盘/收盘、完成增益、情绪与待确认贡献都取自它。
- `weekStart`：可选；默认当前周。取值应来自 `review.week.weekStart`（即引擎的 `weekStart`），不要自己重算周边界。
- 跳转入口：`openEntity` / `openWeekForDate`（迁移 PR 已有）。`open-week` 的 `weekStart` 是稳定周标识；`open-goal` 的 `taskId` 是稳定目标 ID。

接入位置：主站 `frontend/src/components/RecordsView.vue` 的「全部记录 / 本周」切换。`review` 由同一 `records` 与 `result` 派生；`open-goal` 接 `openEntity("goal", taskId)`，`open-week` 接 `openWeekForDate(payload.weekStart)`；周次切换通过 `#week-controls` 插槽提供 `#review-week-select`。组件根节点为 `section`，可直接嵌入宿主 `main`。

## 数据口径

- **单周数据只来自引擎**：`review.week.open/close/high/low` 直接取 `result.weeks[i]`；涨跌幅为 `close/open - 1`；贡献逐条取 `week.days[].lines`。模块不实现第二套计分，也不写存储。
- **当前周显示截至今天**：`weekEnd` 取引擎当前周最后一天（今天）；历史周显示已收盘。周次切换只允许引擎已覆盖的周。
- **完成增益只计一次（D39）**：完成列表与贡献均以引擎输出为准；完成任务后重复 `complete_task` 不会重复计分。完成前已结算的逾期保留。
- **待确认与情绪（D40/D18）**：待确认事件/休息保留「待确认 · 未计分」，贡献为 0，且不提前账本起点、不触发沉默衰减；情绪记录贡献恒为 0。
- **纠错/撤销**：软删除或改期后重新 `computeAll`，完成列表、贡献与涨跌随账本同步变化。已删除任务的完成事实不计入复盘。
- **仍在进行**：当前账本中仍存活且创建日期不晚于该周结束日的未完成目标；状态以该周结束日计算（进行中/已逾期/已暂停），按到期日排序。
- **预览夹具**：`src/scenarios.ts` 是确定性演示数据，不是真实用户数据；空账本场景不读取也不写入 localStorage。

## 验收记录

| 项目 | 结果 |
| --- | --- |
| `npm test` | 11/11 通过（本周完成+进行中、完成倒序、周涨跌与明细一致、跨周、空账本、纠错、撤销、否认待确认、完成幂等、周标识） |
| `npm run build` | 通过（vue-tsc + vite） |
| `npm run test:e2e` | 23/23 通过；含桌面首屏顺序、三个分组、点击输出、跨周、空账本、手机无横向溢出、手机点击与 0 控制台报错 |
| 桌面 1440×900 | 有数据 / 空账本截图见上 |
| 手机 390×844 | 首屏与列表截图见上；行宽 360px，标题字号 13px |

**独立组件通过与接入主站通过分开记录。**

### 主站接入验收（Vue 迁移合并后）

| 项目 | 结果 |
| --- | --- |
| 主站构建 `npm run build` | 通过（vue-tsc + vite，复盘组件随主站打包） |
| 主站工作区验收 `npm run test:v02` | 58/58 通过，含 7 项接入断言 |
| 完成项跳转 | 点击「本周已完成」行打开真实目标抽屉（`#drawer-sub` = 任务 ID） |
| 贡献项 / 指数卡跳转 | 打开对应周 K 明细抽屉（周标识与引擎 `weekStart` 一致） |
| 跨周切换 | `#review-week-select` 切换后复盘按该周重算 |
| 手机 390×844 | 无横向溢出，控制台 0 报错 |
| 接入截图 | `../assets/screenshots/weekly-review-mounted-1440x900.png`、`weekly-review-mounted-390x844.png` |

## 已知边界

- 历史周不重建「当时仍在进行、后来已完成」的目标状态；进行中列表以当前账本存活目标为准。若后续要严格历史时点回放，需宿主提供 audit 回放或引擎快照。
- 预览中的「行情」「目标中心」入口仅用于证明三入口侧栏存在，点击显示宿主占位提示；不复制这两个页面。
- 本模块没有新增线上依赖或后端接口；如迁移 PR 的 `types.ts` 先落地，可把本地 `src/types.ts` 的导入改为共享类型，派生逻辑不变。
