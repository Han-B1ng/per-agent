// 本地 Deno 入口（仅开发用，不进发布包）。先运行 npm run build:functions 生成 dist-functions/；需本机 deno。
// 无 deno 时用 tests/sites-function.test.mjs 的 Node fixture。
import { handler } from "../dist-functions/handler.mjs";

Deno.serve({ hostname: "127.0.0.1", port: 8000 }, handler);