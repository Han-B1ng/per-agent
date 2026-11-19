# 个人成长指数 · 队友对接

用户从「行情」发一句话，模型提取记录或任务。记录保存在浏览器，计分引擎算出指数和周 K。用户可在「目标中心」查看未完成与已完成项，在「成长记录」查原文、处理待确认、修正记录和看本周复盘。

## 本地启动

使用 Node.js 22，建议 22.13 及以上。进入仓库后执行：

```sh
cd p0-delivery
npm ci
npm run build
npm start
```

打开 [本地页面](http://127.0.0.1:8123/)。默认使用本地 Mock，方便体验完整操作。开发 Vue 页面时，保留后端，再开一个终端进入同一目录执行 `npm run dev`，打开 [Vite 开发页](http://localhost:5173/)。Vite 会把 `/api` 转发到 8123。

第一次试玩可以发「今天有点焦虑，但还是去跑了五公里」。点周 K 查看情绪和行为的贡献，再到成长记录查原文。接着新增两个目标、完成其中一个，在目标中心和本周复盘核对同一笔完成记录。

## 去哪里改

| 工作 | 入口 |
| --- | --- |
| 页面壳、侧栏和页面切换 | `p0-delivery/frontend/src/App.vue` 与 `components/AppSidebar.vue` |
| 行情、对话、抽屉及页面样式 | `frontend/src/components/` 与 `frontend/src/styles.css` |
| 页面状态与写入协调 | `frontend/src/composables/useWorkspace.ts` |
| 账本、存量迁移、计分和画图 | `web/ledger.js`、`store.js`、`engine.js`、`chart.js` |
| 本周复盘 | `weekly-review/src/`，由 `frontend/src/components/RecordsView.vue` 挂载 |
| 本地模型代理和 Mock | `server/` |
| Qoder Sites 真实模型抽取 | `functions/`，入口为 `functions/index.ts` |
| 回归测试与桌面动效基线 | `tests/` 与 `reference-sample/` |

表中短路径均相对于 `p0-delivery/`。设计以 [工作台设计稿](docs/design/product-workspace-v0.2-proposal.md) 为参考，业务规则以 [算法规格](docs/design/agent-engine-spec-v0.1.md) 和 [决策记录](docs/decisions/decision-log.md) 为准。涉及计分或日期规则的变更，同步更新这两处。

## 改完怎么验

在 `p0-delivery/` 执行：

```sh
npm run build
npm test
npm run test:install
npm run test:browser
npm run test:v02
npm run test:visual
npm run test:sample
```

`test:install` 安装 Playwright 的浏览器和录屏组件，本机装过可跳过。浏览器测试自托管，截图、录屏和断言写到本地 `assets/`。周复盘的独立测试在 `weekly-review/` 执行 `npm ci` 后运行 `npm run test:all`。PR 写清测试命令和实际结果，交互变更附截图或录屏，协作约定见 [AGENTS.md](AGENTS.md)。

## 对接 Qoder Sites

用 Qoder CN 打开原有站点工作目录 `p0-delivery/`。运行 `npm run build` 后，静态发布目录是 `dist/`，Function 源码目录是 `functions/`。线上通过同源 `/functions/v1/app/api/health` 和 `/functions/v1/app/api/extract` 访问 Function，平台的 `qoder` 后端提供服务端 `QODER_PAT`。本地 Node 使用 `/api/`。个人账本保存在浏览器，调用模型时会发送当前消息和抽取所需的有限上下文。

当前仓库已包含 Cloud Agents 初始化冲突修复。最近一次验收记录里，Qoder Sites 因平台 `ENOSPC` 未能发布新版 Function。恢复后重新发布并发送一条合成测试消息，核对真实抽取回包和周 K 明细，再更新验收状态。

旧原型、独立验收截图、录屏和交付记录可从 [整理前版本](https://github.com/Han-B1ng/per-agent/tree/3948e1027068cea38ca25c851de9f35b4ea0e3a4) 查回。
