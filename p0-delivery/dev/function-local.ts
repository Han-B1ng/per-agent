// 本地 Deno 入口（仅开发用，不进发布包）。需本机 deno；无 deno 时用 tests/sites-function.test.mjs 的 Node fixture。
import { handler } from "../functions/handler.mjs";

Deno.serve({ hostname: "127.0.0.1", port: 8000 }, handler);