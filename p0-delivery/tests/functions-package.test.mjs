// 独立目录验收：只复制生成后的 Function 包，加载 index.ts 与 handler，验证依赖闭环。
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");
const BUILD = path.join(ROOT, "scripts", "build-functions.mjs");
const SHARED = ["agent-protocol.js", "date.js", "engine.js"];
const MANIFEST = ".pe-functions-package.json";
const TODAY = "2026-11-20";

async function filesIn(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await filesIn(full));
    else out.push(full);
  }
  return out;
}
function relativeImports(text) {
  const specs = new Set();
  for (const re of [/\bfrom\s+["'](\.{1,2}\/[^"']+)["']/g, /\bimport\s*(?:\(\s*)?["'](\.{1,2}\/[^"']+)["']/g]) {
    for (const match of text.matchAll(re)) specs.add(match[1]);
  }
  return [...specs];
}
function stubFetch(routes) {
  return async (url, opts = {}) => {
    const u = new URL(url);
    const key = `${opts.method || "GET"} ${u.pathname}`;
    const handler = routes[key];
    if (!handler) return new Response(JSON.stringify({ error: "unexpected " + key }), { status: 500 });
    return new Response(JSON.stringify(handler), { status: 200, headers: { "Content-Type": "application/json" } });
  };
}

test("独立临时目录：生成 Function 包自包含，index.ts 与依赖可加载", async () => {
  const outer = await mkdtemp(path.join(tmpdir(), "pe-functions-"));
  const out = path.join(outer, "app");
  try {
    execFileSync(process.execPath, [BUILD, "--out", out], { cwd: ROOT, stdio: "pipe" });
    const files = await filesIn(out);
    const names = files.map((file) => path.relative(out, file)).sort();
    for (const expected of ["index.ts", "handler.mjs", "cloud-agents.mjs", "model.mjs", "prompt.mjs", "mock.mjs", ...SHARED, MANIFEST]) {
      assert.ok(names.includes(expected), `missing ${expected}`);
    }
    for (const file of SHARED) {
      assert.deepEqual(await readFile(path.join(out, file)), await readFile(path.join(ROOT, "web", file)), `${file} must come from web/`);
      await assert.rejects(access(path.join(ROOT, "functions", file)), `${file} must not be duplicated in functions/`);
    }
    for (const file of names) {
      if (!/\.(?:mjs|js|ts)$/.test(file)) continue;
      for (const spec of relativeImports(await readFile(path.join(out, file), "utf8"))) {
        assert.ok(!spec.includes(".."), `${file}: import escapes package: ${spec}`);
        await stat(path.resolve(path.dirname(path.join(out, file)), spec));
      }
    }

    const previousDeno = globalThis.Deno;
    let handler;
    globalThis.Deno = { serve(fn) { handler = fn; }, env: { get: () => undefined } };
    try {
      await import(`${pathToFileURL(path.join(out, "index.ts")).href}?v=${Date.now()}`);
      assert.equal(typeof handler, "function");
      const health = await handler(new Request("http://site.local/functions/v1/app/api/health"));
      assert.equal((await health.json()).mode, "mock");
      const extract = await handler(new Request("http://site.local/functions/v1/app/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "今天跑了五公里", context: { today: TODAY } }),
      }));
      const body = await extract.json();
      assert.equal(body.ok, true);
      assert.equal(body.mode, "mock");
      assert.ok(body.items.length >= 1);
    } finally {
      globalThis.Deno = previousDeno;
    }

    const { createHandler } = await import(pathToFileURL(path.join(out, "handler.mjs")).href);
    const qcaRoutes = {
      "GET /api/v1/cloud/models": { data: [{ id: "m1", enabled: true }] },
      "GET /api/v1/cloud/agents": { data: [] },
      "GET /api/v1/cloud/environments": { data: [] },
      "POST /api/v1/cloud/agents": { id: "agent1" },
      "POST /api/v1/cloud/environments": { id: "env1" },
      "POST /api/v1/cloud/sessions": { id: "sess1" },
      "POST /api/v1/cloud/sessions/sess1/events": { id: "ev1" },
      "GET /api/v1/cloud/sessions/sess1/events": { data: [{ type: "agent.message", content: [{ type: "text", text: JSON.stringify({ reply: "记下了。", items: [{ op: "add_event", event: { eventType: "behavior", polarity: "positive", intensity: 3, occurredAt: TODAY, quote: "跑五公里", confidence: 0.9, score: 99 } }] }) }] }] },
    };
    const stub = createHandler({ getToken: () => "fixture", fetchImpl: stubFetch(qcaRoutes) });
    const modelResponse = await stub(new Request("http://site.local/functions/v1/app/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "今天跑了五公里", context: { today: TODAY } }),
    }));
    const modelBody = await modelResponse.json();
    assert.equal(modelBody.ok, true);
    assert.equal(modelBody.mode, "model");
    assert.equal(modelBody.items.length, 1);
    assert.ok(!("score" in modelBody.items[0].event));
  } finally {
    await rm(outer, { recursive: true, force: true });
  }
});
test("自定义 --out 非空且无生成清单时拒绝覆盖", async () => {
  const outer = await mkdtemp(path.join(tmpdir(), "pe-functions-guard-"));
  const out = path.join(outer, "custom");
  try {
    await mkdir(out);
    await writeFile(path.join(out, "keep.txt"), "keep");
    let error;
    try {
      execFileSync(process.execPath, [BUILD, "--out", out], { cwd: ROOT, stdio: "pipe" });
    } catch (caught) {
      error = caught;
    }
    assert.ok(error, "build should refuse a non-empty custom directory");
    assert.match(String(error.stderr || error.message), /refusing to overwrite non-empty directory/);
    assert.equal(await readFile(path.join(out, "keep.txt"), "utf8"), "keep");
    assert.deepEqual((await readdir(out)).sort(), ["keep.txt"]);
  } finally {
    await rm(outer, { recursive: true, force: true });
  }
});

test("已有生成包只替换生成文件并保留额外文件", async () => {
  const outer = await mkdtemp(path.join(tmpdir(), "pe-functions-reuse-"));
  const out = path.join(outer, "app");
  try {
    execFileSync(process.execPath, [BUILD, "--out", out], { cwd: ROOT, stdio: "pipe" });
    await writeFile(path.join(out, "keep.txt"), "keep");
    execFileSync(process.execPath, [BUILD, "--out", out], { cwd: ROOT, stdio: "pipe" });
    assert.equal(await readFile(path.join(out, "keep.txt"), "utf8"), "keep");
    const names = (await filesIn(out)).map((file) => path.relative(out, file)).sort();
    for (const expected of ["index.ts", "handler.mjs", "cloud-agents.mjs", "model.mjs", "prompt.mjs", "mock.mjs", ...SHARED, MANIFEST, "keep.txt"]) {
      assert.ok(names.includes(expected), `missing ${expected}`);
    }
  } finally {
    await rm(outer, { recursive: true, force: true });
  }
});

test("本地 Deno 入口使用生成包", async () => {
  const source = await readFile(path.join(ROOT, "dev", "function-local.ts"), "utf8");
  assert.match(source, /from "\.\.\/dist-functions\/handler\.mjs"/);
  assert.ok(!source.includes("../functions/"));
});
