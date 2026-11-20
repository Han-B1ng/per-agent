# 个人成长指数 · Personal Economy

个人成长指数是一款以对话为入口的个人成长记录工具。你可以记录已经发生的事、整理目标和回顾一周的变化。应用把行为、目标进展与休息记录汇总为个人指数和周 K 线，每次变化都可以追溯到对应日期和记录。情绪单独保留，便于回顾。

## 功能

| 页面 | 可以做什么 |
| --- | --- |
| **行情** | 查看个人指数、本周开高低和周 K 线。点击 K 线查看计算明细，也可以直接在页面底部发消息记录。 |
| **目标中心** | 创建带到期日的目标，查看未完成和已完成事项，追踪进度并标记完成。 |
| **成长记录** | 按日期、类型和关键词查找记录，查看原文与状态，处理待确认项、修正或撤销记录。切换到「本周」可回顾指数变化、贡献与完成项。 |

应用内置独立的样例账本。打开后可以先看「样例」，再切到「我的」，发送「今天有点焦虑，但还是去跑了五公里」。然后点开周 K 明细，查看情绪和行为如何分别记录。

## 快速开始

需要 Node.js 22（建议 22.13 或以上）和 npm。

```sh
git clone https://github.com/Han-B1ng/per-agent.git
cd per-agent/p0-delivery
npm ci
npm run build
npm start
```

打开 [http://127.0.0.1:8123/](http://127.0.0.1:8123/)。默认使用本地 Mock，无需模型密钥。

### 前端开发

让 Node 服务继续运行。在另一个终端进入 `p0-delivery/`，运行 `npm run dev`，打开 [http://localhost:5173/](http://localhost:5173/)。Vite 将 `/api` 请求转发到本地 Node 服务，修改 Vue 文件后可在浏览器中即时查看。

## 工作方式

1. 用户在行情页输入一句话。抽取服务将文本转换为回复和结构化操作。
2. 应用校验操作并写入浏览器账本。低置信度记录先进入待确认状态。
3. 计分引擎用已生效记录重算指数、周 K 和明细。目标中心与成长记录读取同一份账本。

前端使用 **Vue 3、TypeScript 和 Vite**，周 K 使用 **Canvas** 绘制。个人账本通过 **localStorage** 保存在当前浏览器。设置中可以导出 JSON 备份，也可以从备份恢复：恢复前会校验文件并区分文件无效、版本暂不支持，确认覆盖后才写入；浏览器写入失败时保留原账本。启用真实模型时，消息和抽取所需的上下文会发送给配置的模型服务。

## 项目结构

| 目录 | 职责 |
| --- | --- |
| [`p0-delivery/frontend/`](p0-delivery/frontend/) | 页面、组件、样式与应用状态（`useLedger` / `useChat` / `useNavigation` 组装） |
| [`p0-delivery/web/`](p0-delivery/web/) | 账本、存储迁移、计分引擎、图表绘制与 Agent 协议工具 |
| [`p0-delivery/weekly-review/`](p0-delivery/weekly-review/) | 周复盘的数据派生和展示 |
| [`p0-delivery/server/`](p0-delivery/server/) | 本地静态服务、Mock、模型代理与协议校验 |
| [`p0-delivery/functions/`](p0-delivery/functions/) | Qoder Sites Function 源码；构建时与 `web/` 共享 core 组装成自包含包 |
| [`p0-delivery/scripts/`](p0-delivery/scripts/) | 构建与打包脚本（含 Function 包生成） |
| [`p0-delivery/tests/`](p0-delivery/tests/) | 引擎、账本、接口和浏览器回归 |
| [`docs/`](docs/) | 产品设计、算法规格、决策记录与 [Agent 交流协议](docs/design/agent-communication-protocol-v0.1.md) |

| 环境 | 抽取方式 | 接口 |
| --- | --- | --- |
| 本地默认 | Node 服务内置 Mock | `/api/health`、`/api/extract` |
| 本地真实模型 | Node 服务调用 OpenAI 兼容端点 | `/api/health`、`/api/extract` |
| Qoder Sites | 同源 Function 调用 Qoder Cloud Agents | `/functions/v1/app/api/health`、`/functions/v1/app/api/extract` |

在本地使用真实模型时，进入 `p0-delivery/`，复制 [`.env.example`](p0-delivery/.env.example) 为 `.env`，填写 `MODEL_API_KEY`。按供应商要求配置 `MODEL_BASE_URL` 和 `MODEL_NAME`，然后用以下命令启动服务。

```sh
node --env-file=.env server/index.mjs
```

部署到 Qoder Sites 时，以 `p0-delivery/` 为项目目录，运行 `npm run build`。静态资源位于 `dist/`；Function 包生成到 `dist-functions/`，入口为 `dist-functions/index.ts`。Sites 的 Function 目录应使用 `dist-functions/`（由 `scripts/build-functions.mjs` 从 `functions/` 与 `web/` 组装，共享 core 只维护 `web/` 一份）。由 Sites 的 `qoder` 后端在服务端提供 `QODER_PAT`，模型凭据应保存在服务端环境中。本地 Deno 调试使用 `npm run dev:function`（先构建生成包，再需本机 `deno`）。

## 测试

在 `p0-delivery/` 执行。首次运行浏览器测试前安装 Chromium 和录屏组件。

```sh
npm run build
npm test
npm run test:install
```

| 命令 | 覆盖范围 |
| --- | --- |
| `npm test` | 引擎、账本、API、协议、ID 与生成的 Function 包（含独立目录 Stub） |
| `npm run test:browser` | 核心流程、待确认、持久化和模型降级 |
| `npm run test:v02` | 三个页面之间的账本联动 |
| `npm run test:agent` | 三意图、澄清候选、逐项日期、回执与 Sites 复用协议 |
| `npm run test:restore` | 设置页 JSON 恢复：导出后恢复、无效文件与版本、写入失败与重试 |
| `npm run test:functions` | 独立临时目录加载生成的 Function 包，stub QCA，校验依赖闭环 |
| `npm run test:ui` | 行情两态、目标/记录/设置画板与核心流程；输出 `docs/ui-handoff/` 证据 |
| `npm run test:visual` | 行情布局、不同视口和对话动效 |
| `npm run test:sample` | 与现有桌面交互样板的对照 |

周复盘另有独立测试。进入 `p0-delivery/weekly-review/`，执行 `npm ci` 和 `npm run test:all`。真实模型调用需在目标部署环境中单独验证。

## 项目文档

- [产品与工作台设计](docs/design/product-workspace-v0.2-proposal.md)
- [事件、目标与指数算法](docs/design/agent-engine-spec-v0.1.md)
- [产品与算法决策记录](docs/decisions/decision-log.md)
- [Agent 交流协议与示例](docs/design/agent-communication-protocol-v0.1.md)
- [桌面 UI 实现与验收证据](docs/ui-handoff/README.md)
- [贡献与协作约定](AGENTS.md)
