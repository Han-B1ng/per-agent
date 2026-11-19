# Personal Economy · 个人成长指数 — Vue 迁移交付包

> **本目录（`p0-delivery/`）是当前版本的全部交付物，自包含、可从本目录直接运行。**
> 机器位置：`/Users/han_b1ng/Han_B1ng/code/aicode/dasai/p0-delivery`
> 2026 Qoder 高校创造力大赛参赛作品（LifeHack 倾向）。把人当一支股票：对话录入事件与任务，前端纯函数引擎算出「个人成长指数」，周 K 呈现，每一分可点开复算。竞品卖「被理解」，我们卖「被度量」。

## 当前状态（Vue 3 + TypeScript + Vite，2026-11-19）

- **前端架构**：`frontend/` 为 Vue 3 单页应用，TypeScript 类型覆盖账本实体、抽取请求/结果、页面状态与抽屉状态；Vite 负责开发代理与生产构建。核心计分、账本、存储、抽取与 Canvas 周 K 逻辑继续复用 `web/*.js`，由 `frontend/src/core.ts` 提供类型化边界。
- **三个主入口**：窄图标侧栏切换「行情」「目标中心」「成长记录」，底部设置入口；轻量页头显示当前页面名，行情页右侧为样例/我的与模型状态。按需详情抽屉保留。
- **行情精修**：指数 48–64px 等宽数字，周 K 绘图区约 44dvh，空消息时收起对话区；输入框一行起步、最多四行内部滚动；实际布局溢出才进入专注对话，550ms Dk Connect 缓动，返回行情/Esc 保留消息与草稿，尊重减少动态效果。
- **同一本地账本**：目标、成长记录、周 K 均从同一账本派生；`web/ledger.js` 整批原子写入，`web/store.js` v2 迁移并运行时校验旧数据；样例只读，清空/导出按范围执行。
- **模型契约**：沿用同源 `health/extract` 与 `reply/items`；非法字段、日期、操作或引用整次拒绝；Sites 缓存按访客与完整上下文隔离；QODER_PAT 仅服务端读取。
- **验收**：49 项单测、52 项 P0 浏览器回归、51 项 v0.2 工作区验收、18 项样板对照，以及 Vue 行情三视口三状态截图/录屏。详见 `docs/vue-migration-2026-11-19.md` 与 `assets/`。
- 旧原型快照 `legacy/index.html` 作历史对照，本服务以 `/legacy/` 托管；已确认桌面样板快照在 `reference-sample/`；迁移前基线截图在 `assets/baseline-v02/`。

## 快速开始（在本目录内）

Node >= 20。前端需要构建；服务端仍零 npm 运行时依赖。

```bash
cd /Users/han_b1ng/Han_B1ng/code/aicode/dasai/p0-delivery
npm install
npm run build          # 类型检查 + Vite 生产构建到 dist/
npm start              # http://localhost:8123，托管 dist/ 与 /api、/legacy/
npm test               # 49 项引擎 / 账本 / API / Sites Function 单测
```

开发模式（Vite HMR，代理现有本地后端）：

```bash
npm start              # 终端 1：后端 http://localhost:8123
npm run dev            # 终端 2：前端 http://localhost:5173，/api 代理到 8123
```

浏览器验收 / 视觉证据 / 样板对照：

```bash
npm run test:install   # playwright install chromium ffmpeg
npm run test:browser   # 构建 + 52 项 P0 浏览器回归
npm run test:v02       # 构建 + 51 项 v0.2 工作区验收
npm run test:visual    # 构建 + 行情三视口三状态截图/录屏、高DPR、单根周K
npm run test:sample    # 18 项已确认桌面样板对照
```

> 浏览器脚本自托管所需服务，无需另开 `npm start`；可选 `PE_BASE_URL` 指向外部服务、`PE_CHANNEL=chrome` 改用系统 Chrome。

接真实模型（可选）：

```bash
cp .env.example .env   # 填 MODEL_API_KEY / MODEL_BASE_URL / MODEL_NAME
node --env-file=.env server/index.mjs
```

不填 Key 则为本地 Mock 演示。操作：首屏看样例；底部输入框发一句话即录入并切到「我的」；消息溢出时行情放大渐隐为背景、消息区独立滚动；ESC/「返回行情」退出；点任意 K 线看计算明细与持仓；明细内可撤销/确认/否认；「重置对话」只清对话不清记录。

## 目录结构（自包含）

| 路径 | 内容 |
| --- | --- |
| `frontend/` | Vue 3 + TypeScript + Vite 页面壳、导航、行情、目标、记录、消息、输入、抽屉组件 |
| `frontend/src/core.ts` | 核心 JS 模块的类型化复用边界与模型回包运行时校验 |
| `dist/` | Vite 生产构建产物（ Sites 静态目录，git 忽略） |
| `web/` | 共享核心逻辑：engine / ledger / store / extractor / chart / sample-data |
| `web/engine.js` | 确定性引擎纯函数（D18–D40 口径，权重 v0.1 起点） |
| `web/ledger.js` | 统一写入动作、幂等完成、目标/成长记录派生查询与稳定 ID 关联 |
| `web/store.js` | localStorage v2、P0 v1 自动迁移、样例/个人隔离 |
| `server/` | 模型代理 + 静态托管 + 本地 Mock + 提示词（零依赖） |
| `functions/` | Sites Edge Function（qoder→Cloud Agents，免钥；自包含包）+ `dev/` 本地入口 |
| `tests/` | 引擎/API 单测 + 浏览器验收 harness |
| `legacy/index.html` | 旧原型快照（历史对照，/legacy/） |
| `reference-sample/` | 已确认桌面样板快照（设计基准 + 对照测试用） |
| `docs/p0-delivery-2026-11-17.md` | **P0 交付验收单**（验收表/临时取值/拍板单/阻塞点） |
| `docs/reference/` | 算法规格 + 决策记录快照（自包含参考；上游权威在仓库 `docs/`） |
| `assets/videos/`、`assets/screenshots/`、`assets/acceptance-results.json` | 验收录屏/截图/断言原始值 |
| `.env.example` | 服务端环境变量占位 |

## 哪些仍是 Mock / 待定

- **真实模型调用**：Sites `qoder` 后端已开通（PAT 已签发）并私有发布，但**真实 QCA 执行待 owner 登录试玩**（私有访问挡未登录冒烟）；自备 Key 路径对本地 stub 验证；公开访问待确认。详见交付单 §9。
- **样例人生**：虚构演示（P3 待真实经历）。
- **权重**：v0.1 讨论起点（P4 待校准）；逾期上限/同日排序键等为临时口径，见交付单 §3/§4。
- **推演 / 日报 / 雷达 / 云端同步**：P1/P2，未实现。
- **移动端**：已验证 390×844 三入口、详情、发送与键盘高度收缩；更多机型待试玩。

## 安全

- 交付包不含任何真实密钥；Key 只放服务端 env / Sites Secret，前端永不接触。
- `.env`、`*.pem`、`*.key`、`credentials.json`、`node_modules/` 等已被仓库 `.gitignore` 排除。
- 模型代理剥掉任何分数字段（D11 结构强制）、限频、缓存、超时/额度错误分类；失败输入绝不记为已录入。

## 关键文档

- [Vue 迁移验收单](docs/vue-migration-2026-11-19.md) · [v0.2 交付验收单](docs/v02-delivery-2026-11-19.md) · [P0 交付验收单](docs/p0-delivery-2026-11-17.md) · [算法规格快照](docs/reference/agent-engine-spec-v0.1.md) · [决策记录快照](docs/reference/decision-log.md)
- 上游权威（仓库根）：`../docs/design/`、`../docs/decisions/`、`../docs/collab/tasks.md`、`../docs/competition/rules.md`