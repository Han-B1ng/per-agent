# Personal Economy · 个人成长指数

> 2026 Qoder 高校创造力大赛参赛作品（LifeHack 倾向）。
> 把人当一支股票：通过对话录入事件与任务，前端纯函数引擎算出「个人成长指数」，以周 K 线呈现，每一分都能点开看明细。
> 竞品卖「被理解」（情绪陪伴），我们卖「被度量」。

## 当前状态

- **可运行原型 v0.1**：`app/index.html`，自包含单文件（内联 React + 应用 + Dk Connect 样式），零外部依赖、零网络请求。
- **纯前端本地 Mock**：聊天识别是本地正则演示，**没有接真实模型、没有后端、没有部署**。数据仅存浏览器。
- **设计规格已敲定**（D18–D36）：见 [agent-engine-spec](docs/design/agent-engine-spec-v0.1.md)。原型实现仍为旧口径，待按新规格重算（见「现有问题」）。

## 快速开始

无需安装依赖、无需构建、无需环境变量。

```bash
cd app
python3 -m http.server 8123
# 打开 http://localhost:8123
```

或直接用任意静态服务器托管 `app/`，或双击 `app/index.html`（localStorage 在 file:// 下多数浏览器可用，推荐用 http 服务）。

操作：默认进入演示对话；`ESC` 或「返回行情」切到 K 线主视图；点任意 K 线看计算明细；底部输入框发送一句话看指数即时变化；右上角切换浅/暗主题；「重置演示」恢复预置数据。

## 目录结构

| 路径 | 内容 |
| --- | --- |
| `app/index.html` | 可运行原型（本次原样保留，供后续对照） |
| `docs/design/` | 设计事实来源 + 算法规格（算法以 spec 为唯一权威） |
| `docs/decisions/` | 决策记录 D1–D36 / 待定 / 已撤回 / 规格缺口 |
| `docs/competition/` | 赛事规则、赛道、奖项、认证、评审偏好 |
| `docs/collab/` | 协作任务表、队友上手、专项会话交接提示词 |
| `docs/submission/` | 作品帖提纲、截图清单 |
| `assets/screenshots/` | 开发过程截图凭证（含本轮导出验证截图） |
| `vibe_images/` | 早期视觉方向图 |
| `server/` | 预留：模型代理 function（当前为空，未实现） |
| `.env.example` | 环境变量占位（当前原型不需要任何 env） |

## 哪些功能仍是 Mock

- **聊天识别**：本地正则演示（关键词判极性/强度），非真实模型抽取。界面明确标注「本地 MOCK 识别」。
- **数据**：仅存浏览器 localStorage/内存，无云端、无账号。
- **样例人生**：预置演示数据，非真实用户经历（P3 待定）。
- **模型代理 / 部署**：`server/` 为空，未接 Qoder Sites、未公开部署。
- **推演（研报）**：P2，未实现。

## 现有问题（已知，待后续解决）

1. **原型算分口径过时**（验收①）：仍用维度权重直加点数、旧休息规则「≥2 天 +0.3%」，与规格 D19（无板块）/D23（停牌 7 天每日 +0.05%）/D26（±6% 涨跌停）/D27（同日 8 条上限）不一致。本次按要求原样保留，待前端按 spec 重算。
2. **规格缺口**（验收②③）：任务/事件状态变更协议（按 id 引用）、同日稳定排序键、明细三段式（原始→涨跌停调整→实际）尚未落入实现。见 [decision-log 规格缺口](docs/decisions/decision-log.md)。
3. **公网→模型链路未验证**（验收④）：学生权益档位（P6）、公开部署、真实模型调用均未验证，是产品能否跑的根本风险。
4. **推演 P2 未实现**，作品帖卖点不写推演。
5. **本轮未独立复测**：浅色主题、移动端视口（前端会话另有截图 16/17/20/21，但导出后未逐一复测）。

## 本轮导出验证记录（2026-11-16）

- 来源：前端会话内嵌 Canvas `personal-economy-app-v1.html`（自包含片段），包裹最小 HTML shell 导出为 `app/index.html`，界面与逻辑原样保留。
- 静态服务 `http://localhost:8123` 实测：桌面暗色渲染正常；**控制台 0 error / 0 warning**。
- K 线主视图：指数 / 近期成长率 / 最大回撤 / 波动率 / 日周月K / MA5·10·20 / 可点蜡烛图 / 计算明细（前端纯函数公式）均渲染。
- Live 交互：发送「今天终于跑完了五公里」→ Mock 抽取 1 条正向事件（健康·强度4 +3.6）→ 指数 128.6 → 132.2（+5.84%），对话与图同步更新。
- 截图：`assets/screenshots/23-export-desktop.png`（桌面暗色）。K 线主视图与发送交互因视口隐藏改用无障碍结构快照确认（无截图文件）。

## 安全

- 仓库**不含任何真实密钥/凭据**；扫描仅命中 React 内部符号名与 input type 字符串。
- `.env`、`*.pem`、`*.key`、`credentials.json`、`node_modules/`、`dist/` 等已被 `.gitignore` 排除；只提交 `.env.example` 占位。

## 开发流程

日常改动走独立任务分支，经 PR 合入 `main`，不要直接在 `main` 上堆大改。开工先读 [AGENTS.md](AGENTS.md)。创建 PR 时按模板写明动机、改动范围和实际验证结果。

完整约定见 Linear：[GitHub 全流程开发规范](https://linear.app/han-b1ng/document/github-全流程开发规范分支pr合并发布与仓库维护-d5f0745cd928)。

## 关键文档

- [设计初稿](docs/design/design-draft-v0.1.md) · [算法规格（权威）](docs/design/agent-engine-spec-v0.1.md) · [决策记录](docs/decisions/decision-log.md) · [赛事要求](docs/competition/rules.md) · [协作任务表](docs/collab/tasks.md) · [作品帖提纲](docs/submission/post-outline.md)