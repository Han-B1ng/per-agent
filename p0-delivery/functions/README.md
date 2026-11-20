# Sites Function 源码

此目录不是自包含部署包，不要在这里放共享 core 副本。

`npm run build:functions`（`npm run build` 的一部分）会把本目录的 Sites 专属文件和 `../web/` 的 `agent-protocol.js`、`date.js`、`engine.js` 组装到 `../dist-functions/`。部署到 Qoder Sites 时，Function 目录使用 `dist-functions/`，入口为 `dist-functions/index.ts`。

独立目录验收见 `../tests/functions-package.test.mjs`。