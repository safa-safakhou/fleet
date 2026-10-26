import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { connect, migrate } from "../src/db.js";
import { FleetError, type ModelPort } from "../src/domain.js";
import { HttpModel } from "../src/model.js";
import { assertCacheSelection, cacheResource, parseCacheProfile } from "../src/platform/cache-profile.js";
import { assertFreshHostClock, currentWindowsClock } from "./lib/host-clock.js";
import { nativeArchitectureHarness } from "./lib/native-architecture-harness.js";
import { dueRehearsalRounds } from "./lib/native-rehearsal-control.js";
import { createOwnedFixture } from "./test-architecture-offline.js";

const exec = promisify(execFile);
const root = resolve(process.env.FLEET_NATIVE_REHEARSAL_ROOT ?? "");
if (!root.startsWith("/home/mnim/.local/share/fleet-native-rehearsal-") || process.env.FLEET_LIVE_ENABLED !== "0")
  throw Error("OWNED_GAME_FREE_REHEARSAL_REQUIRED");
const clockPath = process.env.FLEET_CLOCK_VALIDATION;
if (!clockPath) throw Error("FRESH_HOST_CLOCK_VALIDATION_REQUIRED");
const clockText = await readFile(clockPath, "utf8");
if (Buffer.byteLength(clockText) > 2 * 1024 * 1024) throw Error("CLOCK_EVIDENCE_TOO_LARGE");
const clockQualification = assertFreshHostClock(JSON.parse(clockText), await currentWindowsClock());
const record = JSON.parse(await readFile(resolve(root, "service.json"), "utf8"));
if (
  record.root !== root ||
  record.endpoint !== "http://127.0.0.1:18535" ||
  record.model !== "nemotron-4b" ||
  record.gameExecution !== false ||
  record.structuredOutputs?.backend !== "guidance" ||
  record.structuredOutputs?.disable_any_whitespace !== true ||
  record.tokenCapacity !== 40000 ||
  record.tokenBlockSize !== 976
)
  throw Error("OWNED_NEMOTRON_SERVICE_REQUIRED");
const apiKey = (await readFile(resolve(root, "api-key"), "utf8")).trim();
const cacheProfile = parseCacheProfile(JSON.parse(await readFile(resolve(root, "cache-profile.json"), "utf8")));
assertCacheSelection(
  cacheProfile,
  { route: "openai-compatible", provider: "vllm", model: record.model },
  `${record.endpoint}/v1`,
  4,
);
if (cacheProfile.instanceId !== record.instanceId || cacheProfile.engineConfigSha256 !== record.engineConfigSha256)
  throw Error("OWNED_CACHE_PROFILE_MISMATCH");
const raw = new HttpModel({ "openai-compatible": `${record.endpoint}/v1` }, apiKey, undefined, cacheProfile);
const maxCalls = 3000,
  durationMs = 1800000,
  drainMs = 90000;
let calls = 0,
  endsAt = Infinity;
const provider: ModelPort = {
  tracksDispatch: true,
  estimateInputTokens: async (request) => {
    if (request.model.model !== "nemotron-4b" || request.model.provider !== "vllm")
      throw new FleetError("OWNED_NEMOTRON_SERVICE_REQUIRED", true);
    return raw.estimateInputTokens({
      ...request,
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(5000)]),
    });
  },
  decide: async (request) => {
    if (
      request.model.model !== "nemotron-4b" ||
      request.model.provider !== "vllm" ||
      calls >= maxCalls ||
      performance.now() >= endsAt
    )
      throw new FleetError("REHEARSAL_ADMISSION_CLOSED", true);
    calls++;
    return raw.decide({
      ...request,
      signal: AbortSignal.any([
        request.signal,
        AbortSignal.timeout(Math.max(1, Math.min(45000, endsAt - performance.now()))),
      ]),
    });
  },
};
const fixture = await createOwnedFixture();
await writeFile(resolve(root, "fixture-private.json"), JSON.stringify(fixture, null, 2), { mode: 0o600 });
const pool = connect(fixture.fleetUrl);
await migrate(pool);
const pending: Promise<unknown>[] = [];
const report = (kind: string, data: unknown) => {
  pending.push(appendFile(resolve(root, `${kind}.jsonl`), `${JSON.stringify(data)}\n`, { mode: 0o600 }));
};
let harness: Awaited<ReturnType<typeof nativeArchitectureHarness>> | undefined;
let tick: ReturnType<typeof setInterval> | undefined;
let fatal: string | undefined;
const sourceFiles = (
  await exec("git", [
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "src",
    "migrations",
    "scripts/lib",
    "scripts/rehearse-native-architectures.ts",
    "scripts/test-architecture-offline.ts",
    "package.json",
    "package-lock.json",
    "AGENTS.md",
  ])
).stdout
  .trim()
  .split("\n");
const pins: Record<string, string> = {};
for (const file of new Set(sourceFiles)) {
  const source = await readFile(file);
  pins[file] = createHash("sha256").update(source).digest("hex");
  const destination = resolve(root, "source", file);
  await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
  await writeFile(destination, source, { mode: 0o600 });
}
await writeFile(resolve(root, "source-pins.json"), JSON.stringify(pins, null, 2), { mode: 0o600 });
try {
  harness = await nativeArchitectureHarness(
    pool,
    provider,
    {
      route: "openai-compatible",
      model: "nemotron-4b",
      provider: "vllm",
      thinking: false,
      temperature: 0,
      topP: 1,
      seed: 42,
    },
    report,
    { tokenCapacity: record.tokenCapacity, tokenBlockSize: record.tokenBlockSize, cacheProfile },
  );
  const startedAt = new Date().toISOString(),
    started = performance.now();
  endsAt = started + durationMs + drainMs;
  await writeFile(
    resolve(root, "run.json"),
    JSON.stringify(
      {
        startedAt,
        durationMs,
        drainLimitMs: drainMs,
        protocol: "native-cache-blocks.v1",
        clockQualification,
        cacheResource: cacheResource(cacheProfile),
        structuredOutputs: record.structuredOutputs,
        tokenCapacity: record.tokenCapacity,
        maxCalls,
        workerSlots: 8,
        inferenceSlots: 4,
        model: "Nemotron 4B BF16",
        gameExecution: false,
        blocked: ["E4", "KQ1"],
        simulationOrigin: harness.sim.base,
        roster: harness.roster,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  let resourceSampling = false;
  const sample = async () => {
    if (resourceSampling) return;
    resourceSampling = true;
    try {
      const memory = await readFile("/proc/meminfo", "utf8"),
        gpu = (
          await exec("nvidia-smi", [
            "--query-gpu=memory.used,memory.total,utilization.gpu,power.draw",
            "--format=csv,noheader,nounits",
          ])
        ).stdout.trim();
      report("resources", {
        at: new Date().toISOString(),
        elapsedMs: performance.now() - started,
        memoryAvailableKiB: Number(memory.match(/MemAvailable:\s+(\d+)/)?.[1]),
        gpu,
      });
    } catch (error) {
      report("resourceError", { error: String(error) });
    } finally {
      resourceSampling = false;
    }
  };
  tick = setInterval(() => {
    void sample();
  }, 10000);
  await sample();
  let nextRound = 0;
  while (performance.now() < started + durationMs) {
    const elapsed = performance.now() - started;
    for (const round of dueRehearsalRounds(elapsed, nextRound)) {
      await harness.round(round);
      nextRound = round;
      report("round", { round, elapsedMs: performance.now() - started });
    }
    await harness.dispatch();
    await writeFile(
      resolve(root, "progress.json"),
      JSON.stringify({
        at: new Date().toISOString(),
        elapsedMs: performance.now() - started,
        round: nextRound,
        calls,
        turns: harness.runs.length,
        running: harness.running,
        peakCalls: harness.peakCalls,
        failures: harness.runs.filter((r) => r.code !== "RETURNED").length,
      }),
      { mode: 0o600 },
    );
    await new Promise((r) => setTimeout(r, 500));
  }
  const activeAtCutoff = harness.running;
  const atCutoff = await pool.query(
    "SELECT count(*) FILTER(WHERE answered_at IS NULL)::int pending,count(*) FILTER(WHERE answered_at IS NOT NULL)::int answered FROM sim_requests",
  );
  const drainStarted = performance.now();
  while (performance.now() < endsAt) {
    await harness.dispatch();
    if (!harness.running) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await harness.close();
  const actualDrainMs = performance.now() - drainStarted;
  clearInterval(tick);
  tick = undefined;
  await sample();
  const endedAt = new Date().toISOString(),
    elapsedMs = performance.now() - started;
  const snapshots: Record<string, unknown> = {};
  for (const table of [
    "cohorts",
    "agents",
    "turns",
    "platform_tasks",
    "platform_task_claims",
    "compute_ledger",
    "architecture_allocations",
    "architecture_operations",
    "platform_commands",
    "command_resolutions",
    "model_capacity_leases",
    "specialist_states",
    "specialist_deliveries",
    "specialist_intents",
    "environment_event_inbox",
    "environment_cursors",
    "turn_events",
    "cohort_engine_profiles",
    "architecture_scoped_evidence",
    "specialist_original_index",
    "sim_kingdoms",
    "sim_requests",
    "sim_receipts",
    "sim_messages",
  ]) {
    const exists = (await pool.query("SELECT to_regclass($1) relation", [table])).rows[0].relation;
    if (exists) snapshots[table] = (await pool.query(`SELECT * FROM ${table}`)).rows;
  }
  await writeFile(resolve(root, "database-snapshot-private.json"), JSON.stringify(snapshots), { mode: 0o600 });
  const native = harness;
  const traces = (
    await pool.query(
      "SELECT id,turn_id,label,detail_cipher FROM turn_events WHERE label IN('Native grounded decision','Native legacy grounded proposal','Provider capacity admitted','Provider capacity queued') ORDER BY occurred_at",
    )
  ).rows.map((r) => ({
    id: r.id,
    turnId: r.turn_id,
    label: r.label,
    ...(r.detail_cipher ? native.store.vault.decrypt<object>(r.detail_cipher, `turn-event:${r.id}`) : {}),
  }));
  await writeFile(resolve(root, "metrics-traces.json"), JSON.stringify(traces), { mode: 0o600 });
  await writeFile(resolve(root, "checks.json"), JSON.stringify(harness.checks), { mode: 0o600 });
  const receiptRows = (snapshots.sim_receipts ?? []) as {
    binding_id: string;
    intent: { payload: { requestId: string; choice: string } };
    outcome: { status: string };
  }[];
  const percentiles = (xs: number[]) => {
    const x = xs.toSorted((a, b) => a - b);
    return {
      n: x.length,
      p50: x[Math.min(x.length - 1, Math.ceil(x.length * 0.5) - 1)] ?? null,
      p95: x[Math.min(x.length - 1, Math.ceil(x.length * 0.95) - 1)] ?? null,
      max: x.at(-1) ?? null,
    };
  };
  const architectures = Object.fromEntries(
    [...new Set(harness.roster.map((r) => r.architecture))].map((architecture) => {
      const members = native.roster.filter((r) => r.architecture === architecture),
        ids = new Set(members.map((r) => r.binding.id)),
        modelCalls = native.calls.filter((c) => c.architecture === architecture),
        runs = native.runs.filter((r) => r.architecture === architecture),
        receipts = receiptRows.filter((r) => ids.has(r.binding_id));
      return [
        architecture,
        {
          kingdoms: members.length,
          turns: runs.length,
          returned: runs.filter((r) => r.code === "RETURNED").length,
          errors: runs.filter((r) => r.code !== "RETURNED").map((r) => ({ code: r.code, taskId: r.taskId })),
          calls: modelCalls.length,
          dispatched: modelCalls.filter((c) => c.dispatched).length,
          confirmed: receipts.filter((r) => r.outcome.status === "confirmed").length,
          rejected: receipts.filter((r) => r.outcome.status !== "confirmed").length,
          answeredRounds: new Set(
            receipts.filter((r) => r.outcome.status === "confirmed").map((r) => r.intent.payload.requestId),
          ).size,
          callLatencyMs: percentiles(modelCalls.map((c) => c.elapsedMs)),
          turnLatencyMs: percentiles(runs.map((r) => Number(r.elapsedMs))),
        },
      ];
    }),
  );
  const unknown = (snapshots.compute_ledger as { status: string }[]).filter(
    (r) => !["reported", "not_dispatched"].includes(r.status),
  );
  const changed = [];
  for (const [file, hash] of Object.entries(pins))
    if (
      createHash("sha256")
        .update(await readFile(file))
        .digest("hex") !== hash
    )
      changed.push(file);
  const summary = {
    startedAt,
    endedAt,
    elapsedMs,
    monotonicWindowMs: durationMs,
    drainLimitMs: drainMs,
    actualDrainMs,
    requestsAtCutoff: atCutoff.rows[0],
    protocol: "native-cache-blocks.v1",
    clockQualification,
    cacheResource: cacheResource(cacheProfile),
    wallClockElapsedMs: Date.parse(endedAt) - Date.parse(startedAt),
    activeAtCutoff,
    rounds: nextRound,
    calls,
    attempts: harness.calls.length,
    dispatched: harness.calls.filter((c) => c.dispatched).length,
    peakCalls: harness.peakCalls,
    architectures,
    inputTokens: harness.calls.reduce((n, c) => n + (c.inputTokens ?? 0), 0),
    outputTokens: harness.calls.reduce((n, c) => n + (c.outputTokens ?? 0), 0),
    unknownAllocations: unknown.length,
    sourceChanged: changed,
    simulationHttpRequests: harness.sim.networkRequests,
    gameCommands: 0,
    gameExecution: false,
    blocked: ["E4", "KQ1"],
    model: "Nemotron 4B BF16",
    provider: "isolated vLLM",
    messages: (snapshots.sim_messages as unknown[]).length,
    requests: {
      offered: (snapshots.sim_requests as unknown[]).length,
      answered: (snapshots.sim_requests as { answered_at: string | null }[]).filter((r) => r.answered_at).length,
      pending: (snapshots.sim_requests as { answered_at: string | null }[]).filter((r) => !r.answered_at).length,
      latencyMs: percentiles(
        (snapshots.sim_requests as { created_at: string; answered_at: string | null }[]).flatMap((r) =>
          r.answered_at ? [Date.parse(r.answered_at) - Date.parse(r.created_at)] : [],
        ),
      ),
    },
    remainingCapacityLeases: (snapshots.model_capacity_leases as unknown[]).length,
  };
  await writeFile(resolve(root, "result.json"), JSON.stringify(summary, null, 2), { mode: 0o600 });
  console.log(
    JSON.stringify({
      completed: true,
      calls,
      turns: harness.runs.length,
      unknownAllocations: unknown.length,
      result: resolve(root, "result.json"),
    }),
  );
} catch (error) {
  fatal = error instanceof Error ? error.stack : String(error);
  await writeFile(resolve(root, "fatal.txt"), fatal ?? "UNKNOWN", { mode: 0o600 });
  throw error;
} finally {
  if (tick) clearInterval(tick);
  if (fatal) await harness?.close().catch(() => {});
  await Promise.all(pending);
  await pool.end();
  // Preserve the owned rehearsal database and all unresolved rows; stop its container after the run externally.
  const owner = (
    await exec("docker", ["ps", "-aq", "--filter", `label=fleet.architecture.fixture=${fixture.nonce}`])
  ).stdout.trim();
  if (owner) {
    const label = (
      await exec("docker", ["inspect", "--format", '{{ index .Config.Labels "fleet.architecture.fixture" }}', owner])
    ).stdout.trim();
    if (label !== fixture.nonce) {
      await writeFile(resolve(root, "fixture-stop-refused.txt"), "Ownership mismatch; foreign target preserved", {
        mode: 0o600,
      });
      process.exitCode = 1;
    } else {
      await exec("docker", ["stop", "--time", "10", owner]);
      await writeFile(
        resolve(root, "fixture-stopped.json"),
        JSON.stringify({ container: owner, stopped: true, retained: true }),
        { mode: 0o600 },
      );
    }
  }
}
