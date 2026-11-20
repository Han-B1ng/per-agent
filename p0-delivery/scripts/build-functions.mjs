import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIR = path.join(ROOT, "functions");
const SHARED_DIR = path.join(ROOT, "web");
const DEFAULT_OUT = path.join(ROOT, "dist-functions");
const PACKAGE_FILES = ["index.ts", "handler.mjs", "cloud-agents.mjs", "model.mjs", "prompt.mjs", "mock.mjs"];
const SHARED_FILES = ["agent-protocol.js", "date.js", "engine.js"];
const GENERATED_FILES = [...PACKAGE_FILES, ...SHARED_FILES];
const GENERATED_SET = new Set(GENERATED_FILES);
const MANIFEST = ".pe-functions-package.json";
const outIndex = process.argv.indexOf("--out");
const OUT_DIR = path.resolve(outIndex >= 0 ? process.argv[outIndex + 1] : DEFAULT_OUT);

if (!OUT_DIR || OUT_DIR === path.parse(OUT_DIR).root) throw new Error("refusing to build the function package into the filesystem root");

function relativeImports(text) {
  const specs = new Set();
  for (const re of [/\bfrom\s+["'](\.{1,2}\/[^"']+)["']/g, /\bimport\s*(?:\(\s*)?["'](\.{1,2}\/[^"']+)["']/g]) {
    for (const match of text.matchAll(re)) specs.add(match[1]);
  }
  return [...specs];
}
async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}
async function manifestFiles() {
  try {
    const parsed = JSON.parse(await readFile(path.join(OUT_DIR, MANIFEST), "utf8"));
    if (parsed.generator !== "scripts/build-functions.mjs" || !Array.isArray(parsed.files)) return null;
    const files = parsed.files.filter((file) => typeof file === "string" && path.basename(file) === file && file !== MANIFEST);
    if (!files.every((file) => GENERATED_SET.has(file))) return null;
    return files;
  } catch {
    return null;
  }
}
async function sourceFor(file) {
  return path.join(PACKAGE_FILES.includes(file) ? SOURCE_DIR : SHARED_DIR, file);
}
async function inspectOutput() {
  if (!(await exists(OUT_DIR))) return { remove: [] };
  const info = await stat(OUT_DIR);
  if (!info.isDirectory()) throw new Error(`output path is not a directory: ${OUT_DIR}`);
  const entries = await readdir(OUT_DIR);
  if (!entries.length) return { remove: [] };

  const conflicts = [];
  const remove = new Set();
  const manifestPresent = entries.includes(MANIFEST);
  const owned = await manifestFiles();
  if (manifestPresent && !owned) conflicts.push(MANIFEST);

  if (owned) {
    const ownedSet = new Set(owned);
    for (const entry of entries) {
      if (GENERATED_SET.has(entry) && !ownedSet.has(entry)) conflicts.push(entry);
    }
    for (const file of owned) remove.add(file);
  } else if (OUT_DIR === DEFAULT_OUT) {
    for (const entry of entries) {
      if (!GENERATED_SET.has(entry)) continue;
      let generated = false;
      try {
        const target = path.join(OUT_DIR, entry);
        generated = (await stat(target)).isFile() && (await readFile(target)).equals(await readFile(await sourceFor(entry)));
      } catch {
        generated = false;
      }
      if (generated) remove.add(entry);
      else conflicts.push(entry);
    }
  } else {
    throw new Error(`refusing to overwrite non-empty directory without a generated manifest: ${OUT_DIR}`);
  }

  if (conflicts.length) throw new Error(`refusing to overwrite files not managed by this build: ${[...new Set(conflicts)].join(", ")}; original files preserved`);
  return { remove: [...remove] };
}
async function prepareOutput() {
  if (!(await exists(OUT_DIR))) {
    await mkdir(OUT_DIR, { recursive: true });
    return;
  }
  const { remove } = await inspectOutput();
  for (const file of remove) await rm(path.join(OUT_DIR, file), { force: true });
}

await prepareOutput();
for (const file of PACKAGE_FILES) {
  await copyFile(path.join(SOURCE_DIR, file), path.join(OUT_DIR, file));
}
for (const file of SHARED_FILES) {
  await copyFile(path.join(SHARED_DIR, file), path.join(OUT_DIR, file));
}

const files = await readdir(OUT_DIR);
for (const file of files) {
  if (!/\.(?:mjs|js|ts)$/.test(file)) continue;
  const text = await readFile(path.join(OUT_DIR, file), "utf8");
  for (const spec of relativeImports(text)) {
    if (spec.includes("..")) throw new Error(`${file}: relative import escapes the package: ${spec}`);
    const target = path.resolve(OUT_DIR, spec);
    if (!target.startsWith(OUT_DIR + path.sep)) throw new Error(`${file}: import leaves the package: ${spec}`);
    await stat(target);
  }
}
for (const file of SHARED_FILES) {
  const [source, generated] = await Promise.all([
    readFile(path.join(SHARED_DIR, file)),
    readFile(path.join(OUT_DIR, file)),
  ]);
  if (!source.equals(generated)) throw new Error(`${file}: generated copy differs from web/ source`);
}
await writeFile(path.join(OUT_DIR, MANIFEST), `${JSON.stringify({ generator: "scripts/build-functions.mjs", files: GENERATED_FILES }, null, 2)}\n`);

console.log(`function package ready: ${OUT_DIR}`);
console.log(`  source: ${SOURCE_DIR}`);
console.log(`  shared core from web/: ${SHARED_FILES.join(", ")}`);