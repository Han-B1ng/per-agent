// Sites Edge Function 部署入口（runtime/app.zip 根 index.ts，logical name app，runtime edge）。
import { handler } from "./handler.mjs";

Deno.serve(handler);