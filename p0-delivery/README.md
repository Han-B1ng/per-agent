# Personal Economy · 个人成长指数 — P0 统一交付包

> **本目录（`p0-delivery/`）是 P0 的全部交付物，自包含、可从本目录直接运行。**
> 机器位置：`/Users/han_b1ng/Han_B1ng/code/aicode/dasai/p0-delivery`
> 2026 Qoder 高校创造力大赛参赛作品（LifeHack 倾向）。把人当一支股票：对话录入事件与任务，前端纯函数引擎算出「个人成长指数」，周 K 呈现，每一分可点开复算。竞品卖「被理解」，我们卖「被度量」。

## 当前状态（P0 已交付，2026-11-17）

- **前后端 P0 可运行**：在本目录 `npm start` → http://localhost:8123。前端以已确认桌面样板为设计基准重置（`web/`），服务端仅一个模型代理 + 静态托管（`server/`，零 npm 依赖）。
- **核心闭环**：发一句话 → 结构化记录（情绪/行为分离）→ 确定性引擎算分 → 周 K 即时更新 → 点 K 线右抽屉看三段式明细（原始→涨跌停调整→实际）→ 刷新后本地记录仍在。
- **抽取三路径**：① Sites `qoder` 后端（Cloud Agents，免自备 Key、扣账户 Credits；已开通+私有发布，真实执行待 owner 登录试玩）；② 自备 `MODEL_API_KEY` 走 OpenAI 兼容代理；③ 无 Key 自动本地 Mock。模型超时/额度耗尽 → 失败不录入、样例与现有记录仍可查看、可重试或改用本地识别。
- **样例人生**：首屏预置 90 天虚构样例（P3 真实经历待团队提供），顶栏「样例 / 我的」一键切换，与个人记录严格分离。
- **验收**：见 [P0 交付验收单](docs/p0-delivery-2026-11-17.md)（52 项浏览器断言 + 39 项单测 + 18 项样板对照 + 双视口连续录屏；含返工四修复与 Sites qoder 接入）。
- 旧原型快照 `legacy/index.html` 作历史对照，本服务以 `/legacy/` 托管；已确认桌面样板快照在 `reference-sample/`。

## 快速开始（在本目录内）

应用本体零运行时依赖、无需构建（Node >= 20）。

```bash
cd /Users/han_b1ng/Han_B1ng/code/aicode/dasai/p0-delivery
npm start              # http://localhost:8123 （旧原型 /legacy/）
npm test               # 引擎 22 + 服务端 API 13 + Sites Function 4 = 39 项单测
```

浏览器验收 / 样板对照需测试依赖（仅 devDependency，不影响应用零依赖启动）：

```bash
npm install            # 安装 playwright（devDependency）
npm run test:install   # = playwright install chromium ffmpeg
npm run test:browser   # 52 项浏览器验收（自托管服务+stub，录屏/截图/JSON）
npm run test:sample    # 18 项样板对照（自托管 reference-sample/）
```

> 两套脚本均**自托管**所需服务，无需另开 `npm start`；只依赖 playwright + 已安装浏览器，不依赖 about-me 或本机绝对路径（已在独立目录复跑验证）。可选：`PE_BASE_URL` 指向外部服务、`PE_CHANNEL=chrome` 改用系统 Chrome。

接真实模型（可选）：

```bash
cp .env.example .env   # 填 MODEL_API_KEY / MODEL_BASE_URL / MODEL_NAME
node --env-file=.env server/index.mjs
```

不填 Key 则为本地 Mock 演示。操作：首屏看样例；底部输入框发一句话即录入并切到「我的」；消息溢出时行情放大渐隐为背景、消息区独立滚动；ESC/「返回行情」退出；点任意 K 线看计算明细与持仓；明细内可撤销/确认/否认；「重置对话」只清对话不清记录。

## 目录结构（自包含）

| 路径 | 内容 |
| --- | --- |
| `web/` | P0 前端（样板壳 + 数据驱动周 K + 右抽屉明细 + 确认流 + 持久化） |
| `web/engine.js` | 确定性引擎纯函数（D18–D36 口径，权重 v0.1 起点） |
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
- **移动端**：仅媒体查询降级，未深测。

## 安全

- 交付包不含任何真实密钥；Key 只放服务端 env / Sites Secret，前端永不接触。
- `.env`、`*.pem`、`*.key`、`credentials.json`、`node_modules/` 等已被仓库 `.gitignore` 排除。
- 模型代理剥掉任何分数字段（D11 结构强制）、限频、缓存、超时/额度错误分类；失败输入绝不记为已录入。

## 关键文档

- [P0 交付验收单](docs/p0-delivery-2026-11-17.md) · [算法规格快照](docs/reference/agent-engine-spec-v0.1.md) · [决策记录快照](docs/reference/decision-log.md)
- 上游权威（仓库根）：`../docs/design/`、`../docs/decisions/`、`../docs/collab/tasks.md`、`../docs/competition/rules.md`