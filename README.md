# Personal Economy · 工作区索引

> 2026 Qoder 高校创造力大赛参赛作品。**当前交付物已收进统一自包含目录：**
> [`p0-delivery/`](p0-delivery/README.md) — 机器位置 `/Users/han_b1ng/Han_B1ng/code/aicode/dasai/p0-delivery`
> 前端已迁移到 Vue 3 + TypeScript + Vite；运行/构建/验收/录屏/交付单都在该目录内。本根目录仅保留设计事实来源与历史资料。

## 根目录内容（非交付物）

| 路径 | 内容 |
| --- | --- |
| `p0-delivery/` | **统一交付包**（Vue 前端 + 共享核心 + 后端 + 测试 + 证据 + 交付单） |
| `docs/design/` | 设计事实来源 + 算法规格（算法唯一权威） |
| `docs/decisions/` | 决策记录 D1–D38 / 待定 / 已撤回 / 规格缺口 |
| `docs/collab/` | 协作任务表、队友上手、专项会话交接 |
| `docs/competition/`、`docs/submission/` | 赛事规则、作品帖提纲 |
| `app/index.html` | 旧原型（历史；交付包内另有快照 `legacy/`） |
| `assets/screenshots/` | 早期开发过程截图（本轮验收证据在交付包 `assets/`） |
| `vibe_images/` | 早期视觉方向图 |

## 快速开始

```bash
cd p0-delivery
npm install
npm run build    # 类型检查 + Vite 构建到 dist/
npm start        # http://localhost:8123
npm run dev      # Vite HMR http://localhost:5173（需另开 npm start 提供 /api）
npm test         # 49 项引擎 / 账本 / API / Sites Function 单测
npm run test:browser   # 52 项 P0 浏览器回归
npm run test:v02       # 51 项 v0.2 工作区验收
npm run test:visual    # 行情三视口三状态截图/录屏
```

## 开发流程

日常改动走独立任务分支，经 PR 合入 `main`，不要直接在 `main` 上堆大改。开工先读 [AGENTS.md](AGENTS.md)。创建 PR 时按模板写明动机、改动范围和实际验证结果。

完整约定见 Linear：[GitHub 全流程开发规范](https://linear.app/han-b1ng/document/github-全流程开发规范分支pr合并发布与仓库维护-d5f0745cd928)。

## 关键文档

- [设计初稿](docs/design/design-draft-v0.1.md) · [算法规格（权威）](docs/design/agent-engine-spec-v0.1.md) · [决策记录](docs/decisions/decision-log.md) · [赛事要求](docs/competition/rules.md) · [协作任务表](docs/collab/tasks.md) · [作品帖提纲](docs/submission/post-outline.md)
