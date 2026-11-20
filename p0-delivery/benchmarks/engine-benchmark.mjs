// computeAll 手动性能基准：固定种子生成模拟账本，预热后多次计时，报告平均耗时与 P95。
// 运行：在 p0-delivery/ 下执行 node benchmarks/engine-benchmark.mjs
import os from "node:os";
import { computeAll, shiftDate } from "../web/engine.js";

const TODAY = "2026-11-17";
const WINDOW_DAYS = 730;
const EVENT_SEED = 20261117;
const AUX_SEED = 20261118;
const AUX_TASKS = 40;
const AUX_RESTS = 12;
const WARMUP_ROUNDS = 10;
const MEASURED_ROUNDS = 50;
const SIZES = [1_000, 10_000];

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rand, min, max) {
  return min + Math.floor(rand() * (max - min + 1));
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function createEvents(count) {
  const rand = mulberry32(EVENT_SEED);
  const events = [];
  for (let i = 0; i < count; i += 1) {
    const occurredAt = shiftDate(TODAY, -randInt(rand, 0, WINDOW_DAYS - 1));
    const isEmotion = rand() < 0.2;
    const isPending = rand() < 0.1;
    const isDeleted = rand() < 0.05;
    const polarity = isEmotion
      ? "neutral"
      : rand() < 0.78
        ? "positive"
        : rand() < 0.75
          ? "negative"
          : "neutral";
    events.push({
      id: `bench_evt_${String(i + 1).padStart(5, "0")}`,
      kind: "event",
      eventType: isEmotion ? "emotion" : "behavior",
      polarity,
      intensity: randInt(rand, 1, 5),
      occurredAt,
      quote: `模拟记录 ${i + 1}`,
      tags: [],
      confidence: isPending ? 0.4 : 0.9,
      status: isPending ? "pending" : "confirmed",
      createdAt: `${occurredAt}T${pad2(randInt(rand, 0, 23))}:${pad2(randInt(rand, 0, 59))}:00.000Z`,
      deletedAt: isDeleted ? `${occurredAt}T23:59:59.000Z` : null,
    });
  }
  return events;
}

// 任务与休息不随事件数变化，保证两种规模的差异只来自事件条数。
function createAuxRecords() {
  const rand = mulberry32(AUX_SEED);
  const tasks = [];
  for (let i = 0; i < AUX_TASKS; i += 1) {
    const createdDaysAgo = randInt(rand, 30, WINDOW_DAYS - 1);
    const dueDaysAgo = randInt(rand, 0, createdDaysAgo - 1);
    const isDone = rand() < 0.4;
    const doneDaysAgo = randInt(rand, 0, dueDaysAgo);
    tasks.push({
      id: `bench_task_${String(i + 1).padStart(3, "0")}`,
      kind: "task",
      title: `模拟目标 ${i + 1}`,
      dueAt: shiftDate(TODAY, -dueDaysAgo),
      position: randInt(rand, 1, 3),
      status: isDone ? "done" : "open",
      createdAt: `${shiftDate(TODAY, -createdDaysAgo)}T09:00:00.000Z`,
      doneAt: isDone ? `${shiftDate(TODAY, -doneDaysAgo)}T16:00:00.000Z` : null,
      deletedAt: null,
    });
  }
  const rests = [];
  for (let i = 0; i < AUX_RESTS; i += 1) {
    const date = shiftDate(TODAY, -randInt(rand, 0, WINDOW_DAYS - 1));
    const isPending = rand() < 0.2;
    rests.push({
      id: `bench_rest_${String(i + 1).padStart(3, "0")}`,
      kind: "rest",
      date,
      quote: `模拟休息 ${i + 1}`,
      confidence: isPending ? 0.4 : 0.9,
      status: isPending ? "pending" : "confirmed",
      createdAt: `${date}T21:00:00.000Z`,
      deletedAt: null,
    });
  }
  return { tasks, rests };
}

function createLedger(eventCount) {
  return { events: createEvents(eventCount), ...createAuxRecords() };
}

function fingerprint(result) {
  return `${result.days.length}|${result.weeks.length}|${result.latest}`;
}

function timeRun(records) {
  const started = process.hrtime.bigint();
  const result = computeAll(records, { today: TODAY });
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  return { result, elapsedMs };
}

function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = samples.reduce((sum, x) => sum + x, 0) / samples.length;
  return {
    mean,
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

function assertStable(label, size, expected, result) {
  const actual = fingerprint(result);
  if (actual !== expected.get(size)) throw new Error(`${label}结果不确定：${actual} != ${expected.get(size)}`);
}

// 两种规模交替采样，抵消进程启动、CPU 调度等随时间漂移的噪声。
function benchmarkAll(ledgers) {
  const expected = new Map();
  for (const { size, records } of ledgers) {
    expected.set(size, fingerprint(timeRun(records).result));
  }
  for (let round = 0; round < WARMUP_ROUNDS; round += 1) {
    for (const { size, records } of ledgers) {
      assertStable("预热", size, expected, timeRun(records).result);
    }
  }
  const samples = new Map(ledgers.map(({ size }) => [size, []]));
  for (let round = 0; round < MEASURED_ROUNDS; round += 1) {
    const order = round % 2 === 0 ? ledgers : [...ledgers].reverse();
    for (const { size, records } of order) {
      const { result, elapsedMs } = timeRun(records);
      assertStable("计时", size, expected, result);
      samples.get(size).push(elapsedMs);
    }
  }
  return samples;
}

function fmt(ms) {
  return ms.toFixed(2);
}

console.log("computeAll 性能基准（p0-delivery/web/engine.js）");
console.log("");
console.log("环境");
console.log(`  Node ${process.version} · ${os.platform()} ${os.release()} ${os.arch()}`);
console.log(`  ${os.cpus()[0].model} · ${os.cpus().length} 逻辑核心 · ${(os.totalmem() / 1024 ** 3).toFixed(1)} GiB 内存`);
console.log("");
const ledgers = SIZES.map((size) => ({ size, records: createLedger(size) }));
console.log("账本");
console.log(`  固定种子 ${EVENT_SEED} · ${WINDOW_DAYS} 天窗口 · today ${TODAY}`);
console.log(`  事件之外固定 ${AUX_TASKS} 个任务 / ${AUX_RESTS} 条休息 · 预热 ${WARMUP_ROUNDS} 轮 · 每种规模计时 ${MEASURED_ROUNDS} 次（交替采样）`);
console.log("");
const samples = benchmarkAll(ledgers);
for (const { size } of ledgers) {
  const stats = summarize(samples.get(size));
  console.log(
    `${size.toLocaleString("en-US")} 条事件 · 平均 ${fmt(stats.mean)} ms · P95 ${fmt(stats.p95)} ms · 最快 ${fmt(stats.min)} ms · 最慢 ${fmt(stats.max)} ms`,
  );
}
