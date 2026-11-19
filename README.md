# Personal Economy · 工作区索引

> 2026 Qoder 高校创造力大赛参赛作品。**P0 全部交付物已收进统一自包含目录：**
> [`p0-delivery/`](p0-delivery/README.md) — 机器位置 `/Users/han_b1ng/Han_B1ng/code/aicode/dasai/p0-delivery`
> 运行/验收/录屏/交付单都在该目录内，见其 README。本根目录仅保留设计事实来源与历史资料。

## 根目录内容（非交付物）

| 路径 | 内容 |
| --- | --- |
| `p0-delivery/` | **P0 统一交付包**（可运行前后端 + 测试 + 证据 + 交付单） |
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
npm start        # http://localhost:8123
npm test         # 28 单测
npm run test:browser   # 38 浏览器验收 + 录屏
```

Git 分支 / 推送 / PR 由 Grok 负责；部署等负责人确认。