/** Explicit opt-in, game-free benchmark. Does not import runtime, store, broker or game ports. */

import { AsyncLocalStorage } from "node:async_hooks";
import { type ChildProcess, execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, open, readFile, writeFile } from "node:fs/promises";
import { homedir, totalmem } from "node:os";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { HttpModel } from "../src/model.js";
import { compileGenerationSchema } from "../src/model-schema.js";
import { WorkerPool } from "../src/platform/worker-pool.js";

const exec = promisify(execFile);
const model = "nemotron-3-nano:4b";
const digest = "6cc467f054393a55e98a74098abde0c762ffb6d1d8cd64becf30458f38886197";
const base = "http://127.0.0.1:18534";
const measuredCalls = 8;
const contextLength = 16384;
const schema = {
  type: "object",
  additionalProperties: false,
  required: ["kingdomId", "kind", "selectedOfferId", "canAfford", "summary", "checks"],
  properties: {
    kingdomId: { type: "string" },
    kind: { const: "wait" },
    selectedOfferId: { type: "string" },
    canAfford: { type: "boolean" },
    summary: { type: "string", maxLength: 600 },
    checks: { type: "array", minItems: 4, maxItems: 4, items: { type: "string", maxLength: 180 } },
  },
};
const validDecision = compileGenerationSchema(schema);
export function assessBenchmarkDecision(value: unknown, expectedId: string) {
  const schemaValid = Boolean(validDecision(value));
  const decision = value as Record<string, unknown> | null;
  return {
    schemaValid,
    coreFieldsCorrect:
      schemaValid &&
      decision?.kingdomId === expectedId &&
      decision?.selectedOfferId === "offer-b" &&
      decision?.canAfford === true,
  };
}
export function benchmarkRequest(id: string) {
  const synthetic = {
    kingdomId: id,
    gameTime: "2026-10-24T00:00:00Z",
    gold: 120,
    iron: 600,
    reserveGold: 20,
    offers: [
      { id: "offer-a", goldCost: 140, ironReceived: 300 },
      { id: "offer-b", goldCost: 80, ironReceived: 200 },
      { id: "offer-c", goldCost: 110, ironReceived: 250 },
    ],
    objective:
      "Choose the offer giving most iron while preserving the gold reserve. Report a decision only; do not execute or send anything.",
    historicalObservations: Array.from({ length: 36 }, (_, i) => ({
      observationId: `snapshot-${i}`,
      tick: i,
      resources: { gold: 120 + (i % 3), iron: 600 + i * 2, grain: 150 + i },
      source: "synthetic-owned-observation",
      status: "historical",
      note: "Historical resource snapshots are context only. Use current gold and reserve for affordability; no offer has been accepted or delivered.",
    })),
  };
  return {
    model: { route: "ollama" as const, model, thinking: false },
    messages: [
      {
        role: "system",
        content:
          "You are evaluating synthetic kingdom data for a throughput benchmark. No game is connected. Return the requested JSON. Use current balances and preserve reserves. Return four short factual checks covering current gold, reserve, feasible offers and selected offer. Explain your choice in two short sentences. kind=wait means report only, with no commitment or delivery claim.",
      },
      { role: "user", content: JSON.stringify(synthetic) },
    ],
    schema,
    maxOutputTokens: 512,
  };
}
export function summarizeCalls(
  rows: Array<{ elapsedMs: number; inputTokens: number; outputTokens: number }>,
  wallMs: number,
) {
  const times = rows.map((r) => r.elapsedMs).sort((a, b) => a - b);
  const percentile = (p: number) => times[Math.max(0, Math.ceil(times.length * p) - 1)];
  return {
    calls: rows.length,
    wallMs,
    meanMs: times.reduce((a, b) => a + b, 0) / times.length,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    callsPerMinute: (rows.length * 60000) / wallMs,
    inputTokens: rows.reduce((n, r) => n + r.inputTokens, 0),
    outputTokens: rows.reduce((n, r) => n + r.outputTokens, 0),
    effectiveOverlap: times.reduce((a, b) => a + b, 0) / wallMs,
  };
}

async function main() {
  if (process.argv[2] !== "--run" || !process.argv[3] || process.argv.length !== 4)
    throw Error("EXPLICIT_BENCHMARK_RUN_AND_OUTPUT_REQUIRED");
  const directory = resolve(process.argv[3]);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(resolve(directory, "run-once.marker"), new Date().toISOString(), { flag: "wx", mode: 0o600 });
  const sourceHash = createHash("sha256")
    .update(await readFile(new URL(import.meta.url)))
    .digest("hex");
  const totalDeadline = Date.now() + 20 * 60000;
  const cancellation = new AbortController();
  const deadlineTimer = setTimeout(() => cancellation.abort(Error("BENCHMARK_TIME_LIMIT")), 20 * 60000);
  const interrupt = () => cancellation.abort(Error("BENCHMARK_INTERRUPTED"));
  process.once("SIGTERM", interrupt);
  process.once("SIGINT", interrupt);
  let child: ChildProcess | undefined;
  let requests = 0;
  const stages: unknown[] = [];
  const nativeFetch = globalThis.fetch;
  const trace = new AsyncLocalStorage<Record<string, unknown>>();
  globalThis.fetch = async (input, init) => {
    const response = await nativeFetch(input, init);
    const current = trace.getStore();
    if (current) {
      const data = (await response.clone().json()) as Record<string, unknown>;
      for (const field of [
        "total_duration",
        "load_duration",
        "prompt_eval_duration",
        "eval_duration",
        "prompt_eval_count",
        "eval_count",
        "done_reason",
      ])
        current[field] = data[field];
    }
    return response;
  };
  async function metadata(url: string) {
    return (
      await nativeFetch(url, { signal: AbortSignal.any([cancellation.signal, AbortSignal.timeout(3000)]) })
    ).json();
  }
  const bounded = () => {
    if (cancellation.signal.aborted || Date.now() >= totalDeadline) throw Error("BENCHMARK_STOPPED");
    if (requests >= 39) throw Error("BENCHMARK_CALL_LIMIT");
  };
  const outcomes: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    model,
    digest,
    sourceHash,
    contextLength,
    maxOutputTokens: 512,
    callsCeiling: 39,
    totalMinutesCeiling: 20,
    hostMemoryBytes: totalmem(),
    gameExecution: false,
    workersStarted: false,
    stages,
  };
  try {
    const ordinary = (await metadata("http://127.0.0.1:11434/api/ps")) as { models: unknown[] };
    if (ordinary.models.length) throw Error("ORDINARY_PROVIDER_BUSY");
    try {
      await nativeFetch(`${base}/api/version`, { signal: AbortSignal.timeout(500) });
      throw Error("BENCHMARK_PORT_OCCUPIED");
    } catch (error) {
      if (error instanceof Error && error.message === "BENCHMARK_PORT_OCCUPIED") throw error;
    }
    const executable = resolve(homedir(), ".local/opt/ollama/0.35.1/bin/ollama");
    const models = resolve(homedir(), ".local/share/ollama/models");
    const transport = new HttpModel({ ollama: base }, undefined, { contextLength, keepAliveSeconds: 300 });
    for (const parallel of [1, 2, 4]) {
      bounded();
      const log = await open(resolve(directory, `provider-${parallel}.log`), "wx", 0o600);
      child = spawn(executable, ["serve"], {
        detached: true,
        stdio: ["ignore", log.fd, log.fd],
        env: {
          PATH: process.env.PATH,
          HOME: homedir(),
          OLLAMA_MODELS: models,
          OLLAMA_HOST: "127.0.0.1:18534",
          OLLAMA_NUM_PARALLEL: String(parallel),
          OLLAMA_MAX_LOADED_MODELS: "1",
          OLLAMA_MAX_QUEUE: "16",
          OLLAMA_CONTEXT_LENGTH: String(contextLength),
          OLLAMA_NO_CLOUD: "1",
        },
      });
      let ready = false;
      try {
        for (let n = 0; n < 100; n++) {
          if (child.exitCode !== null || cancellation.signal.aborted) throw Error("OWNED_PROVIDER_START_FAILED");
          try {
            await metadata(`${base}/api/version`);
            ready = true;
            break;
          } catch {
            await new Promise((done) => setTimeout(done, 100));
          }
        }
        if (!ready) throw Error("OWNED_PROVIDER_NOT_READY");
        const tags = (await metadata(`${base}/api/tags`)) as { models: Array<{ name: string; digest: string }> };
        if (!tags.models.some((m) => m.name === model && m.digest === digest)) throw Error("MODEL_PIN_MISMATCH");
        console.log(JSON.stringify({ event: "stage-start", parallel }));
        async function call(index: number) {
          bounded();
          requests++;
          const id = `${directory.split("/").at(-1)}-p${parallel}-request-${index}`;
          const wire: Record<string, unknown> = {};
          const start = performance.now();
          const response = await trace.run(wire, () =>
            transport.decide({
              ...benchmarkRequest(id),
              signal: AbortSignal.any([cancellation.signal, AbortSignal.timeout(90000)]),
            }),
          );
          const elapsedMs = performance.now() - start;
          const decision = response.decision as Record<string, unknown> | null;
          const row = {
            index,
            elapsedMs,
            inputTokens: response.inputTokens ?? 0,
            outputTokens: response.outputTokens ?? 0,
            decisionError: response.decisionError ?? null,
            decision,
            ...assessBenchmarkDecision(decision, id),
            native: wire,
          };
          await writeFile(resolve(directory, `call-${parallel}-${index}.json`), JSON.stringify(row, null, 2), {
            flag: "wx",
            mode: 0o600,
          });
          if (!response.inputTokens || !response.outputTokens) {
            cancellation.abort(Error("BENCHMARK_RESPONSE_FAILED"));
            throw Error("BENCHMARK_RESPONSE_FAILED");
          }
          return row;
        }
        const warmup = await call(-1);
        const loaded = await metadata(`${base}/api/ps`);
        const samples: unknown[] = [];
        let sampling = false;
        async function sample() {
          if (sampling) return;
          sampling = true;
          try {
            const { stdout } = await exec(
              "nvidia-smi",
              ["--query-gpu=memory.used,utilization.gpu,power.draw", "--format=csv,noheader,nounits"],
              { timeout: 2000 },
            );
            samples.push({
              at: new Date().toISOString(),
              gpu: stdout.trim(),
              memAvailableKiB: Number(
                (await readFile("/proc/meminfo", "utf8")).match(/MemAvailable:\s+(\d+)/)?.[1] ?? 0,
              ),
            });
          } finally {
            sampling = false;
          }
        }
        await sample();
        const sampler = setInterval(() => void sample().catch(() => {}), 500);
        const rows: Awaited<ReturnType<typeof call>>[] = [];
        const workers = new WorkerPool(parallel);
        const start = performance.now();
        try {
          for (let offset = 0; offset < measuredCalls; offset += parallel) {
            const batch = Array.from({ length: parallel }, (_, lane) => workers.run(() => call(offset + lane)));
            const settled = await Promise.allSettled(batch);
            for (const result of settled) {
              if (result.status === "rejected") throw result.reason;
              rows.push(result.value);
            }
          }
        } finally {
          clearInterval(sampler);
          workers.close();
          await workers.drain();
        }
        const wallMs = performance.now() - start;
        await sample();
        const stage = {
          parallel,
          warmupMs: warmup.elapsedMs,
          ...summarizeCalls(rows, wallMs),
          schemaValid: rows.filter((r) => r.schemaValid).length,
          coreFieldsCorrect: rows.filter((r) => r.coreFieldsCorrect).length,
          loaded,
          samples,
        };
        stages.push(stage);
        await writeFile(resolve(directory, `stage-${parallel}.json`), JSON.stringify(stage, null, 2), {
          flag: "wx",
          mode: 0o600,
        });
        console.log(JSON.stringify({ event: "stage-done", parallel, ...summarizeCalls(rows, wallMs) }));
      } finally {
        if (child.pid && child.exitCode === null) {
          const owned = child;
          const exiting = new Promise<void>((done) => owned.once("exit", () => done()));
          process.kill(-child.pid, "SIGTERM");
          const exited = await Promise.race([
            exiting.then(() => true),
            new Promise<boolean>((done) => setTimeout(() => done(false), 5000)),
          ]);
          if (!exited) {
            process.kill(-child.pid, "SIGKILL");
            await exiting;
          }
        }
        child = undefined;
        await log.close();
      }
    }
    outcomes.status = "completed";
  } catch (error) {
    outcomes.status = "failed";
    outcomes.error = error instanceof Error ? error.message : "BENCHMARK_FAILED";
    throw error;
  } finally {
    globalThis.fetch = nativeFetch;
    clearTimeout(deadlineTimer);
    process.removeListener("SIGTERM", interrupt);
    process.removeListener("SIGINT", interrupt);
    outcomes.finishedAt = new Date().toISOString();
    outcomes.requests = requests;
    await writeFile(resolve(directory, "result.json"), JSON.stringify(outcomes, null, 2), { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify({ event: "finished", status: outcomes.status, requests, evidence: directory }));
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
