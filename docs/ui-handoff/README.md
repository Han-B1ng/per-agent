# 桌面 UI 实现与验收（2026-11-20）

设计来源：`/Users/han_b1ng/Han_B1ng/code/aicode/per-agent-design-handoff/` 的正式画板（1440 × 900）。本轮按「行情 01 → 24 → 02 三态 → 目标中心 → 成长记录 → 设置」落地，沿用现有账本、计分与模型接口。

## 预览与验收

```bash
cd p0-delivery
npm ci
npm run build
npm run test:ui      # 三态、主题、页面与核心流程；生成本目录截图/录屏/acceptance.json
```

- 三态：`screenshots/01-market.png`、`24-input-focus.png`、`02-conversation-focus.png`
- 页面与抽屉：`03-goals.png`、`04-goal-detail.png`、`05-records.png`、`06-weekly-review.png`、`08-goal-create.png`、`09-record-pending.png`、`10-record-detail.png`、`11-settings.png`
- 完成闭环：`12-goal-complete-confirm.png`、`13-goal-completed.png`
- 空态：`20-market-personal-empty.png`、`21-records-empty.png`、`22-records-no-results.png`
- 连续录屏：`videos/core-flow-1440x900.webm`（个人行情 → 输入聚焦 → 记录行为 → 待确认抽屉 → 确认 → 新建目标 → 完成确认 → 成功态 → 成长记录 → 本周复盘 → 周 K 明细 → 设置）
- 原始断言：`acceptance.json`

## 本轮范围

- 行情三态：默认单行输入；输入聚焦展开最近对话/快捷操作；内容实际溢出后进入专注，背景 K 线淡化，顶部保留点位与返回行情。
- 目标中心：未完成卡片与已完成列表同屏；新增目标右侧面板；目标详情；完成确认弹窗；完成成功提示。
- 成长记录：全部记录/本周复盘；搜索、日期、类型、待确认筛选；行点击详情；待确认可在行内或抽屉补充日期/确认/否认。
- 设置：Dark / 晨雾 / 午夜蓝主题、本机数据导出/清空、模型连接状态；主题写入 `pe.theme.v1`，刷新保留，Canvas 同步重绘。
- 待确认：行内与抽屉共用日期校验；未来/非法日期不写入，保留 pending 并显示反馈。
- 完成确认：打开后焦点进入弹窗，Esc 优先取消，关闭后焦点回到触发按钮。

## 设计取舍与已知边界

- 正式画板中的「步骤进度」没有对应账本字段，本轮用真实存在的「投入程度 / 仓位」呈现；目标子步骤留后续。
- 日期筛选使用两个原生日期输入，功能保留但比画板的单按钮更直接。
- 完成确认弹窗只从目标详情触发；目标卡保留快捷「完成」以维持既有幂等回归。
- 专注态沿用现有 1.24 放大、13% 透明度与 3px 模糊，以保持 P0/视觉基线；正式画板约 15% 不模糊，可在负责人确认后微调。
- 主题使用正式 `tokens.css` 的语义变量；Canvas 在主题切换后按当前变量重绘。
- 本次仅在本地 Mock/Stub 下验收；真实 Sites Function 发布状态不受本轮 UI 改动影响，也未在本轮重新部署。
