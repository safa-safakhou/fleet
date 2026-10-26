/** Fresh, game-free 24-session observation. Does not import the game runtime, broker or command ports. */

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { FleetError, safeCode } from "../src/domain.js";
import { HttpModel } from "../src/model.js";
import { WorkerPool } from "../src/platform/worker-pool.js";
import { latencySummary, WorkflowMetrics } from "../src/platform/workflow-metrics.js";
import { executeKingdomWorkflow } from "./lib/feedback-workflow.js";
import { allKingdomRepairs } from "./lib/grounded-kingdom-policy.js";
import { InferenceQueue } from "./lib/inference-queue.js";

if (process.argv[2] !== "--run" || !process.argv[3] || process.argv.length !== 4)
  throw Error("EXPLICIT_SOAK_RUN_REQUIRED");
if (process.env.FLEET_LIVE_ENABLED !== "0") throw Error("GAME_EXECUTION_MUST_REMAIN_DISABLED");
const root = resolve(process.argv[3]);
await mkdir(root, { recursive: true, mode: 0o700 });
await writeFile(resolve(root, "run-once.marker"), new Date().toISOString(), { flag: "wx", mode: 0o600 });
const service = JSON.parse(await readFile(resolve(root, "service.json"), "utf8"));
if (service.endpoint !== "http://127.0.0.1:18535" || service.model !== "nemotron-4b" || service.gameExecution !== false)
  throw Error("ISOLATED_NEMOTRON_IDENTITY_REQUIRED");
const key = (await readFile(resolve(root, "api-key"), "utf8")).trim();
const adapter = new HttpModel({ "openai-compatible": "http://127.0.0.1:18535/v1" }, key);
const model = {
  route: "openai-compatible" as const,
  provider: "vllm" as const,
  model: "nemotron-4b",
  thinking: false,
  temperature: 0.6,
  topP: 0.95,
  seed: 42,
};
const identity = await fetch("http://127.0.0.1:18535/v1/models", {
  headers: { authorization: `Bearer ${key}` },
  signal: AbortSignal.timeout(3000),
});
if (
  !identity.ok ||
  !((await identity.json()) as { data: Array<{ id: string }> }).data.some((m) => m.id === model.model)
)
  throw Error("MODEL_IDENTITY_MISMATCH");
const pins: Record<string, string> = {};
for (const path of [
  "scripts/soak-feedback-kingdoms.ts",
  "scripts/lib/feedback-workflow.ts",
  "scripts/lib/inference-queue.ts",
  "scripts/lib/grounded-kingdom-policy.ts",
  "src/platform/grounded-decision.ts",
  "src/platform/decision-feedback.ts",
  "src/platform/workflow-metrics.ts",
  "src/model.ts",
  "tests/fixtures/kingdom-feedback-workflow.ts",
])
  pins[path] = createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
await writeFile(resolve(root, "source-pins.json"), JSON.stringify(pins, null, 2), { flag: "wx", mode: 0o600 });
const stop = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => stop.abort(new FleetError("OPERATOR_STOP", true)));
const workers = new WorkerPool(8),
  inference = new InferenceQueue(4),
  measurements = new WorkflowMetrics();
const pending: Array<{ index: number; round: number; queuedAt: number }> = [],
  busy = new Set<number>(),
  jobs = new Set<Promise<void>>();
const providerQueue: number[] = [],
  callLatencies: number[] = [],
  resources: unknown[] = [],
  serverSamples: unknown[] = [],
  errors: Record<string, number> = {},
  perVariant: Record<string, { workflows: number; completed: number; objectiveCorrect: number; recovered: number }> =
    {};
let calls = 0,
  reported = 0,
  knownInput = 0,
  knownOutput = 0,
  unknownCalls = 0,
  skipped = 0,
  peakRunning = 0,
  peakWaiting = 0,
  metricFailures = 0,
  validProposalChecks = 0;
let hostRefreshes = 0;
const started = performance.now(),
  startedAt = new Date().toISOString(),
  windowMs = 1800000,
  end = started + windowMs;
const exec = promisify(execFile);
let sampling = false;
const summary = () => ({
  startedAt,
  at: new Date().toISOString(),
  elapsedSeconds: (performance.now() - started) / 1000,
  windowSeconds: 1800,
  kingdomSessions: 24,
  workerSlots: 8,
  inferenceSlots: 4,
  callsDispatched: calls,
  callsReported: reported,
  providerKnownInputTokens: knownInput,
  providerKnownOutputTokens: knownOutput,
  unknownCalls,
  peakRunning,
  peakWaiting,
  metricFailures,
  skippedTriggers: skipped,
  pendingTasks: pending.length,
  activeTasks: jobs.size,
  validProposalChecks,
  hostRefreshes,
  repairs: allKingdomRepairs,
  providerQueueDelayMs: latencySummary(providerQueue),
  providerCallLatencyMs: latencySummary(callLatencies),
  ...measurements.snapshot(),
  errors,
  perVariant,
  gameCommands: 0,
  gameExecution: false,
  e4: "blocked",
  kq1: "blocked",
  model,
});
async function sample() {
  if (sampling) return;
  sampling = true;
  try {
    const response = await fetch("http://127.0.0.1:18535/metrics", {
      headers: { authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) throw Error("METRICS_UNAVAILABLE");
    const text = await response.text();
    const metric = (name: string) =>
      text
        .split("\n")
        .filter((l) => l.startsWith(`vllm:${name}{`))
        .reduce((n, l) => n + Number(l.trim().split(/\s+/).at(-1)), 0);
    if (!text.includes("vllm:num_requests_running")) throw Error("RUNNING_METRIC_REQUIRED");
    const running = metric("num_requests_running"),
      waiting = metric("num_requests_waiting");
    peakRunning = Math.max(peakRunning, running);
    peakWaiting = Math.max(peakWaiting, waiting);
    serverSamples.push({
      at: new Date().toISOString(),
      running,
      waiting,
      preemptions: metric("num_preemptions_total"),
    });
    await writeFile(resolve(root, "server-metrics-latest.txt"), text, { mode: 0o600 });
    const gpu = await exec(
      "nvidia-smi",
      ["--query-gpu=memory.used,utilization.gpu,temperature.gpu", "--format=csv,noheader,nounits"],
      { timeout: 3000 },
    );
    const mem = await readFile("/proc/meminfo", "utf8");
    resources.push({
      at: new Date().toISOString(),
      gpu: gpu.stdout.trim(),
      availableRamKiB: Number(mem.match(/^MemAvailable:\s+(\d+)/m)?.[1] ?? 0),
    });
    await writeFile(resolve(root, "progress.json"), JSON.stringify(summary(), null, 2), { mode: 0o600 });
  } catch {
    metricFailures++;
  } finally {
    sampling = false;
  }
}
async function execute(job: { index: number; round: number; queuedAt: number }) {
  const bindingId = `kingdom-${job.index}`,
    id = `${bindingId}-round-${job.round}`,
    variant = job.index % 8;
  const taskController = new AbortController(),
    taskTimer = setTimeout(
      () => taskController.abort(new FleetError("WORKFLOW_DEADLINE", true)),
      Math.max(1, job.queuedAt + 90000 - performance.now()),
    );
  const signal = AbortSignal.any([stop.signal, taskController.signal]);
  try {
    const out = await executeKingdomWorkflow({
      id,
      bindingId,
      variant,
      round: job.round,
      model,
      signal,
      queueDelayMs: performance.now() - job.queuedAt,
      repairs: allKingdomRepairs,
      attempt: async (request) => {
        const queuedAt = performance.now();
        return inference.run(request.signal, async () => {
          providerQueue.push(performance.now() - queuedAt);
          if (stop.signal.aborted || performance.now() >= end || calls >= 4320)
            throw new FleetError("SOAK_DISPATCH_LIMIT", true);
          const callId = calls + 1,
            callStarted = performance.now();
          let dispatched = false;
          try {
            const result = await adapter.decide({
              ...request,
              signal: AbortSignal.any([request.signal, AbortSignal.timeout(60000)]),
              onDispatch: async () => {
                dispatched = true;
                calls++;
                await appendFile(
                  resolve(root, "calls.jsonl"),
                  JSON.stringify({ callId, id, state: "dispatched", at: new Date().toISOString() }) + "\n",
                  { mode: 0o600 },
                );
              },
            });
            reported++;
            knownInput += result.inputTokens ?? 0;
            knownOutput += result.outputTokens ?? 0;
            if (result.inputTokens === null || result.outputTokens === null) unknownCalls++;
            callLatencies.push(performance.now() - callStarted);
            await appendFile(
              resolve(root, "calls.jsonl"),
              JSON.stringify({
                callId,
                id,
                state: "reported",
                inputTokens: result.inputTokens,
                outputTokens: result.outputTokens,
                elapsedMs: performance.now() - callStarted,
              }) + "\n",
              { mode: 0o600 },
            );
            return result;
          } catch (error) {
            if (dispatched) {
              unknownCalls++;
              stop.abort(new FleetError("MODEL_OUTCOME_UNCERTAIN"));
            }
            throw error;
          }
        });
      },
    });
    measurements.record(out.row);
    validProposalChecks += out.validProposalChecks;
    hostRefreshes += out.hostRefreshes;
    for (const code of out.errors) errors[code] = (errors[code] ?? 0) + 1;
    perVariant[String(variant)] ??= {
      workflows: 0,
      completed: 0,
      objectiveCorrect: 0,
      recovered: 0,
    };
    const variantRow = perVariant[String(variant)];
    variantRow.workflows++;
    variantRow.completed += Number(out.row.completed);
    variantRow.objectiveCorrect += Number(out.row.objectiveCorrect === true);
    variantRow.recovered += Number(out.row.recovered);
    await appendFile(resolve(root, "workflows.jsonl"), JSON.stringify(out) + "\n", { mode: 0o600 });
    if (out.row.isolationViolations || out.row.invalidEffects)
      stop.abort(new FleetError("ISOLATION_OR_EFFECT_FAILURE"));
  } finally {
    clearTimeout(taskTimer);
    busy.delete(job.index);
  }
}
function pump() {
  while (workers.hasCapacity && pending.length && !stop.signal.aborted && performance.now() < end) {
    const job = pending.shift();
    if (!job) break;
    const p = workers
      .run(() => execute(job))
      .catch(async (error) => {
        const code = safeCode(error);
        errors[code] = (errors[code] ?? 0) + 1;
        await appendFile(resolve(root, "task-errors.jsonl"), JSON.stringify({ job, code }) + "\n", { mode: 0o600 });
      })
      .finally(() => {
        jobs.delete(p);
        pump();
      });
    jobs.add(p);
  }
}
await writeFile(
  resolve(root, "protocol.json"),
  JSON.stringify(
    {
      startedAt,
      durationSeconds: 1800,
      sessions: 24,
      variants: 8,
      realArchitectures: false,
      maximumCalls: 4320,
      maxCallsPerWorkflow: 6,
      maxCorrectionsPerStep: 2,
      workflowDeadlineSeconds: 90,
      callDeadlineSeconds: 60,
      triggerPeriodSeconds: 60,
      gameExecution: false,
      model,
      repairs: allKingdomRepairs,
    },
    null,
    2,
  ),
  { flag: "wx", mode: 0o600 },
);
const poll = setInterval(() => void sample(), 1000);
try {
  while (sampling) await delay(50);
  await sample();
  for (let round = 0; round < 30 && !stop.signal.aborted; round++) {
    const remaining = started + round * 60000 - performance.now();
    if (remaining > 0) await delay(remaining, undefined, { signal: stop.signal });
    for (let index = 0; index < 24; index++) {
      if (busy.has(index)) {
        skipped++;
        continue;
      }
      busy.add(index);
      pending.push({ index, round, queuedAt: performance.now() });
    }
    pump();
  }
  const remaining = end - performance.now();
  if (remaining > 0) await delay(remaining, undefined, { signal: stop.signal });
} catch (error) {
  if (!stop.signal.aborted) throw error;
} finally {
  workers.close();
  await workers.drain();
  clearInterval(poll);
  while (sampling) await delay(50);
  await sample();
  await writeFile(resolve(root, "resource-samples.json"), JSON.stringify(resources), { mode: 0o600 });
  await writeFile(resolve(root, "server-samples.json"), JSON.stringify(serverSamples), { mode: 0o600 });
  const result = {
    ...summary(),
    status: stop.signal.aborted ? "stopped_early" : "window_complete",
    stopReason: stop.signal.aborted ? safeCode(stop.signal.reason) : "observation_window_complete",
    unstartedTasks: pending.length,
  };
  await writeFile(resolve(root, "result.json"), JSON.stringify(result, null, 2), { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify(result));
}
