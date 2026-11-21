# Sites Function 源码

此目录不是自包含部署包，不要在这里放共享 core 副本。

抽取核心（`model.mjs`、`prompt.mjs`、`mock.mjs`）的单一源码在 `../server/`；`web/` 核心（`agent-protocol.js`、`date.js`、`engine.js`）的单一源码在 `../web/`。`npm run build:functions`（`npm run build` 的一部分）会把本目录的 Sites 专属文件、`../server/` 的抽取核心和 `../web/` 的共享核心组装到 `../dist-functions/`；组装时把抽取核心里的 `../web/*` 导入改写为同目录导入，保证生成包脱离仓库仍可加载。部署到 Qoder Sites 时，Function 目录使用 `dist-functions/`，入口为 `dist-functions/index.ts`。

构建只覆盖生成文件：默认 `dist-functions/` 只清理已知生成文件；自定义 `--out` 目录若非空且没有生成清单，会拒绝覆盖并保留原文件；已有生成包会按清单替换生成文件，保留额外文件。生成前会检查同名冲突：同名文件不在生成清单，或默认输出中的同名文件无法与 `server/`/`functions/`/`web/` 源码对上时，直接退出并保留原文件。

本地 Deno 入口使用生成包：先 `npm run build:functions`，再运行 `npm run dev:function`（需本机 `deno`，监听 `127.0.0.1:8000`）。无 deno 时用 `../tests/sites-function.test.mjs` 的 Node fixture。

独立目录验收见 `../tests/functions-package.test.mjs`。