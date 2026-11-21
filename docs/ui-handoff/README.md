# 桌面 UI 实现与验收（2026-11-20）

设计来源：[Penpot 正式画板](https://design.penpot.app/?screen=workspace&file-id=42288968-6e5e-808d-8008-f86131caebf5&page-id=42288968-6e5e-808d-8008-f86131caebf6)（本地交付件位于 `.local/design-handoff/`）（1440 × 900）。本轮按「行情 01 → 24 → 02 三态 → 目标中心 → 成长记录 → 设置」落地，沿用现有账本、计分与模型接口。

## 预览与验收

```bash
cd p0-delivery
npm ci
npm run build
npm run test:ui      # 三态、主题、页面与核心流程；生成截图/录屏/acceptance.json（本地，不入库）
```

`npm run test:ui` 会在本目录生成本地验收截图、录屏和 `acceptance.json`。这些文件已由 `.gitignore` 忽略，不进入版本库；历史验收证据保留在对应 PR 的提交和讨论中，`main` 不存放验收媒体。

## 2026-11-21 增补：本机数据 JSON 恢复

- 入口：设置 → 本机数据，在「导出我的 JSON」旁新增「从 JSON 恢复」。
- 验收媒体保留在 [PR #20](https://github.com/Han-B1ng/per-agent/pull/20) 的 `632ac5b` 提交，不进入 `main`：
  - 截图：[25 入口](https://github.com/Han-B1ng/per-agent/blob/632ac5b/docs/ui-handoff/screenshots/25-restore-settings.png)、[26 覆盖确认](https://github.com/Han-B1ng/per-agent/blob/632ac5b/docs/ui-handoff/screenshots/26-restore-confirm.png)、[29 文件无效](https://github.com/Han-B1ng/per-agent/blob/632ac5b/docs/ui-handoff/screenshots/29-restore-invalid-file.png)、[27 写入失败](https://github.com/Han-B1ng/per-agent/blob/632ac5b/docs/ui-handoff/screenshots/27-restore-storage-failed.png)、[28 普通记账未保存](https://github.com/Han-B1ng/per-agent/blob/632ac5b/docs/ui-handoff/screenshots/28-persist-unsaved.png)。
  - 录屏：[restore-flow](https://github.com/Han-B1ng/per-agent/blob/632ac5b/docs/ui-handoff/videos/restore-flow-1440x900.webm)（导出 → 清空 → 选择备份 → 校验 → 确认覆盖 → 行情/目标/记录同步 → 刷新一致）；[restore-write-retry](https://github.com/Han-B1ng/per-agent/blob/632ac5b/docs/ui-handoff/videos/restore-write-retry-1440x900.webm)（模拟 localStorage 写入失败 → 未保存且无成功回执 → 恢复存储后重试成功）。
- 复跑：`cd p0-delivery && npm run test:restore`（50 项）。

## 本轮范围

- 行情两态：行情态只显示指数、周 K、明细入口和底部输入框；点击输入框只聚焦，聊天历史和快捷提示收起。有效发送（点击发送与 Enter 同一逻辑）立即进入专注：马上显示用户消息和等待态，卡片底色/边框/摘要/工具栏退场，仅原周 K 绘图区放大渐隐、过渡后静止且绘图区高度不变，页头保留点位、涨跌幅与返回行情；聊天区独立滚动、输入框留底，返回行情收起聊天并保留历史与草稿。样例页闲聊不切换数据视图，只有账本写入后才切到「我的」。
- 目标中心：未完成卡片与已完成列表同屏；新增目标右侧面板；目标详情；完成确认弹窗；完成成功提示。
- 成长记录：全部记录/本周复盘；搜索、日期、类型、待确认筛选；行点击详情；待确认可在行内或抽屉补充日期/确认/否认。
- 设置：Dark / 晨雾 / 午夜蓝主题、本机数据导出/清空、模型连接状态；主题写入 `pe.theme.v1`，刷新保留，Canvas 同步重绘。
- 待确认：行内与抽屉共用日期校验；未来/非法日期不写入，保留 pending 并显示反馈。
- 完成确认：打开后焦点进入弹窗，Esc 优先取消，关闭后焦点回到触发按钮。
- 专注对话：消息区为固定输入框、快捷操作和多行草稿预留底部空间，滚到底可读最后一条。
- 待确认空日期：清空日期后确认会提示填写，不会回退原日期，记录保持 pending。

## 设计取舍与已知边界

- 正式画板中的「步骤进度」没有对应账本字段，本轮用真实存在的「投入程度 / 仓位」呈现；目标子步骤留后续。
- 日期筛选使用两个原生日期输入，功能保留但比画板的单按钮更直接。
- 完成确认弹窗只从目标详情触发；目标卡保留快捷「完成」以维持既有幂等回归。
- 专注态沿用现有 1.24 放大、13% 透明度与 3px 模糊，以保持 P0/视觉基线；正式画板约 15% 不模糊，可在负责人确认后微调。
- 主题使用正式 `tokens.css` 的语义变量；Canvas 在主题切换后按当前变量重绘。
- 本次仅在本地 Mock/Stub 下验收；真实 Sites Function 发布状态不受本轮 UI 改动影响，也未在本轮重新部署。
