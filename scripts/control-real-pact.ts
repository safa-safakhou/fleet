/** Owned operator tooling only. No HTTP/model/peer text can invoke this process controller. */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, appendFile, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import pg from "pg";
import { composeRuntime } from "../src/app/composition.js";
import { config } from "../src/config.js";
import { LaunchService } from "../src/platform/launch.js";
import { freshRunProfiles } from "./lib/fresh-run-profile.js";
import { assertFreshHostClock, currentWindowsClock } from "./lib/host-clock.js";
import { LocalRunSupervisor, type SupervisorRecord } from "./lib/local-run-supervisor.js";
import {
  clock,
  closeAdmissions,
  loadOwnedWorld,
  localEnvironment,
  processIdentity,
  requiredOwnedProcesses,
  restoreCheck,
  snapshot,
  startOwnedEventPublisher,
  startOwnedProcess,
  stopOwnedProcess,
  stopOwnedProvider,
  writePrivateJson,
} from "./lib/owned-local-world.js";
import { reviewProgress } from "./lib/review-progress.js";
import { independentHeartbeat, serializedFinalization } from "./lib/run-control-io.js";
import { supervisorDiagnostic } from "./lib/supervisor-diagnostic.js";

const exec = promisify(execFile),
  [action, directory] = process.argv.slice(2);
if (
  !directory ||
  ![
    "prepare",
    "start-canary",
    "start-24h",
    "start-6h",
    "start-30m",
    "watch",
    "snapshot",
    "restore",
    "status",
    "park",
    "verify-supervision",
  ].includes(action)
)
  throw Error("Explicit owned operation and private directory required");
const c = await loadOwnedWorld(directory),
  file = (name: string) => resolve(c.root, name);
const json = async (name: string) => JSON.parse(await readFile(file(name), "utf8"));
const mono = () => Number(process.hrtime.bigint() / 1000000n);
const boot = () => readFile("/proc/sys/kernel/random/boot_id", "utf8");
async function ready(origin: string) {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${origin}/health`, { signal: AbortSignal.timeout(1000) })).ok) return;
    } catch {}
    await new Promise((done) => setTimeout(done, 200));
  }
  throw Error("SERVICE_READINESS_FAILED");
}
async function readStats(pool: pg.Pool) {
  const ledger = (
    await pool.query(`SELECT count(*)::int calls,count(*) FILTER(WHERE status='unknown')::int unknown,
    coalesce(sum(input_tokens),0)::text input_tokens,coalesce(sum(output_tokens),0)::text output_tokens FROM compute_ledger`)
  ).rows[0];
  const turns = (
    await pool.query(`SELECT count(*)::int attempts,count(*) FILTER(WHERE state='running')::int running,
    count(*) FILTER(WHERE state IN('pending','needs_owner'))::int unresolved,
    count(*) FILTER(WHERE state<>'running' AND code NOT IN('WAIT','COMMITTED','ALREADY_COMMITTED','TURN_ACTION_LIMIT','BUDGET_EXHAUSTED'))::int failed,
    count(DISTINCT agent_id) FILTER(WHERE state='finished' AND code IN('WAIT','COMMITTED','ALREADY_COMMITTED','TURN_ACTION_LIMIT'))::int actors
    FROM turns`)
  ).rows[0];
  const pending = (
    await pool.query("SELECT count(*)::int n FROM platform_commands WHERE state IN('pending','unknown')")
  ).rows[0].n;
  const capacity = (await pool.query("SELECT state,count(*)::int n FROM model_capacity_leases GROUP BY state")).rows;
  const coverage = (
    await pool.query(`SELECT p.profile_id,p.profile_version,count(DISTINCT t.agent_id)::int actors,count(t.id)::int turns,
    coalesce(sum(t.actions),0)::int actions FROM cohort_engine_profiles p LEFT JOIN turns t ON t.cohort_id=p.cohort_id
    GROUP BY p.profile_id,p.profile_version ORDER BY p.profile_id,p.profile_version`)
  ).rows;
  const recent = (
    await pool.query(`SELECT agent_id AS "agentId",code,actions FROM (
    SELECT agent_id,code,actions,started_at,id,row_number() OVER(PARTITION BY agent_id ORDER BY started_at DESC,id DESC) n
    FROM turns WHERE state<>'running') x WHERE n<=20 ORDER BY started_at DESC,id DESC`)
  ).rows;
  const holds = (
    await pool.query(
      "SELECT id agent_id,state,credential_state,reason FROM agents WHERE state='needs_owner' OR credential_state<>'ready'",
    )
  ).rows;
  return { ledger, turns, pending, capacity, coverage, progress: reviewProgress(recent), recordedHolds: holds };
}
async function resources() {
  const memory = await readFile("/proc/meminfo", "utf8");
  const gpuExecutable = await access("/usr/lib/wsl/lib/nvidia-smi").then(
    () => "/usr/lib/wsl/lib/nvidia-smi",
    () => "nvidia-smi",
  );
  const gpu = await exec(
    gpuExecutable,
    ["--query-gpu=memory.used,memory.total,utilization.gpu", "--format=csv,noheader,nounits"],
    { timeout: 2000 },
  ).catch(() => null);
  const key = (await readFile(file("provider/api-key"), "utf8")).trim();
  const base = c.model.endpoint.replace(/\/v1$/, "");
  const response = await fetch(`${base}/metrics`, {
    headers: { authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(2000),
  });
  const metrics = response.ok ? await response.text() : "";
  const values = (name: string) =>
    [...metrics.matchAll(new RegExp(`^vllm:${name}(?:\\{[^\\n]*\\})? ([0-9.e+-]+)$`, "gm"))].map((m) => Number(m[1]));
  return {
    availableRamKiB: Number(memory.match(/^MemAvailable:\s+(\d+)/m)?.[1] ?? NaN),
    gpu: gpu?.stdout.trim() ?? null,
    providerRunning: values("num_requests_running"),
    providerWaiting: values("num_requests_waiting"),
    providerPreemptions: values("num_preemptions_total"),
    kvCacheUsage: values("kv_cache_usage_perc"),
  };
}
async function park(reason: string, timedOut = false) {
  await closeAdmissions(c, reason, "closed");
  if ((await clock(c, "status")).status !== "paused") await clock(c, "pause");
  await stopOwnedProcess(c, "fleet-worker", timedOut);
  await stopOwnedProcess(c, "pact-events", timedOut);
  await stopOwnedProcess(c, "pact-rules", timedOut);
  const r = composeRuntime(config(c.fleetEnv));
  try {
    const ids = (await r.pool.query("SELECT id FROM cohorts WHERE state='running'")).rows.map((row) => row.id);
    if (ids.length) await r.store.setStates(ids, "paused", false);
  } finally {
    await r.pool.end();
  }
  const providerStop = await stopOwnedProvider(c);
  const priorStop = await json("evidence/provider-stop.json").catch(() => null);
  if (!priorStop) await writePrivateJson(file("evidence/provider-stop.json"), providerStop);
  else await writePrivateJson(file("evidence/provider-stop-recheck.json"), providerStop);
}
async function finalize(label = "final") {
  return serializedFinalization(file("finalization.lock"), async () => {
    // Quiesce only these owned APIs before complete-row backup comparison. Data/volumes stay intact.
    await stopOwnedProcess(c, "pact-api");
    await stopOwnedProcess(c, "fleet-console");
    const completed = await json(`evidence/${label}-restore.json`).catch(() => null);
    if (completed) return completed;
    const archive = await access(file(`evidence/${label}-pact.dump.enc`)).then(
      () => true,
      () => false,
    );
    if (!archive) await snapshot(c, label);
    const proof = await restoreCheck(c, label);
    await writePrivateJson(file("evidence/finalization-complete.json"), {
      completedAt: new Date().toISOString(),
      label,
      restored: proof.completeRowTables,
    });
    return proof;
  });
}
async function watch() {
  const record = (await json("supervisor.json")) as SupervisorRecord;
  const pool = new pg.Pool({
    connectionString: c.fleetEnv.DATABASE_URL,
    connectionTimeoutMillis: 2000,
    query_timeout: 3000,
  });
  let first = true,
    lastReport = 0,
    finalReason = "UNSET",
    finalTimedOut = false;
  const ports = {
    close: async (reason: string) => {
      await closeAdmissions(c, reason);
      finalReason = reason;
    },
    park: async (timedOut: boolean) => {
      finalTimedOut = timedOut;
      await park(finalReason, timedOut);
    },
  };
  const existingHeartbeat = await readFile(file("supervisor-heartbeat.json"), "utf8").catch(() => "");
  const supervisor = existingHeartbeat
    ? LocalRunSupervisor.resume(record, ports)
    : new LocalRunSupervisor(record, ports);
  process.once("SIGTERM", () => supervisor.stop("OPERATOR_STOP", mono()));
  process.once("SIGINT", () => supervisor.stop("OPERATOR_STOP", mono()));
  const bootId = (await boot()).trim();
  let controlMonoMs = mono();
  const heartbeat = independentHeartbeat(() =>
    writePrivateJson(file("supervisor-heartbeat.json"), {
      at: Date.now(),
      monoMs: mono(),
      controlMonoMs,
      pid: process.pid,
      bootId,
    }),
  );
  await heartbeat.ready;
  let stage = "heartbeat";
  try {
    while (true) {
      stage = "heartbeat";
      heartbeat.check();
      controlMonoMs = mono();
      const now = Date.now(),
        currentMono = mono();
      stage = "telemetry";
      const stats = await readStats(pool).catch(() => null);
      const window = await json("window.json"),
        starting = window.status === "armed" && now < record.wallStartMs + 60000;
      let healthy = stats !== null;
      for (const name of requiredOwnedProcesses(c)) {
        // Fleet actor/worker failures must not stop an explicitly approved observation world.
        if (record.faultPolicy === "isolate-actors" && name === "fleet-worker") continue;
        try {
          const saved = await json(`${name}.process.json`),
            current = await processIdentity(saved.pid);
          if (current.startTicks !== saved.startTicks || current.state === "Z") healthy = false;
        } catch {
          if (!first && !starting) healthy = false;
        }
      }
      // A separate guardian may already have closed admission. Never reopen it.
      if (!["running", "draining"].includes(window.status) && !starting)
        supervisor.stop(String(window.reason ?? "EXTERNAL_GUARD"), currentMono);
      const request = await json("stop-request.json").catch(() => null);
      if (request) supervisor.stop(String(request.reason ?? "OPERATOR_STOP"), currentMono);
      stage = "poll";
      let state: ReturnType<LocalRunSupervisor["record"]>;
      try {
        state = await supervisor.poll({
          wallMs: now,
          monoMs: currentMono,
          bootId: (await boot()).trim(),
          healthy,
          calls: stats?.ledger.calls ?? 0,
          unknownUsage: stats?.ledger.unknown ?? 0,
          unknownCommands: (stats?.pending ?? 0) + (stats?.turns.unresolved ?? 0),
          failedTurns: stats?.turns.failed ?? 0,
          inFlight: stats?.turns.running ?? 1,
        });
      } finally {
        await writePrivateJson(file("supervisor.json"), supervisor.record());
      }
      if (now - lastReport >= 5000 || state.status !== "running") {
        await appendFile(
          file("evidence/observer.ndjson"),
          `${JSON.stringify({ at: new Date().toISOString(), monoMs: currentMono, state, stats, resources: await resources().catch(() => null) })}\n`,
          { mode: 0o600 },
        );
        lastReport = now;
      }
      if (state.status === "parked") {
        await writePrivateJson(file("evidence/run-final.json"), {
          record: state,
          stats: await readStats(pool),
          drainTimedOut: finalTimedOut,
          clock: await clock(c, "status"),
        });
        stage = "finalize";
        await finalize();
        break;
      }
      first = false;
      await new Promise((done) => setTimeout(done, 500));
    }
  } catch (error) {
    // Preserve the first diagnostic even if parking or storage also fails.
    const diagnostic = supervisorDiagnostic(error, stage);
    await writePrivateJson(file("evidence/supervisor-failure.json"), diagnostic).catch(() => {});
    try {
      await park("SUPERVISOR_FAILURE", true);
    } catch (parkingError) {
      await writePrivateJson(
        file("evidence/supervisor-parking-failure.json"),
        supervisorDiagnostic(parkingError, "park"),
      ).catch(() => {});
    }
    throw Error(`SUPERVISOR_FAILED_CLOSED:${diagnostic.code}:${stage}`);
  } finally {
    await heartbeat.stop();
    await pool.end();
  }
}

if (action === "prepare") {
  assert(["real-workflow-canary", "fresh-six-hour", "fresh-half-hour"].includes(c.purpose ?? ""));
  assert.equal((await json("window.json")).status, "prepared");
  await startOwnedProcess(c, "pact-api", "pact", ["services/api/dist/main.js"]);
  await ready(c.pactEnv.PACT_ORIGIN);
  await clock(c, "resume");
  try {
    const { stdout } = await exec(c.node, ["--import", "tsx", "scripts/prepare-24h-roster.ts", c.root], {
      cwd: c.fleetRepo,
      env: localEnvironment(c, "fleet"),
      timeout: 45000,
      maxBuffer: 1024 ** 2,
    });
    await writeFile(file("logs/owner-preparation.log"), stdout, { mode: 0o600, flag: "wx" });
  } finally {
    await clock(c, "pause");
  }
  const deployment = ["fresh-six-hour", "fresh-half-hour"].includes(c.purpose ?? "")
    ? await json("deployment.json")
    : null;
  if (deployment) assert(String(deployment.stage).startsWith(`${c.root}/deployments/`), "OWNED_STAGE_REQUIRED");
  await startOwnedProcess(c, "fleet-console", "fleet", [
    deployment ? `${deployment.stage}/server/main.js` : "dist/server/main.js",
  ]);
  await ready(c.fleetEnv.FLEET_ORIGIN);
  await snapshot(c, "baseline");
  const proof = await restoreCheck(c, "baseline");
  console.log(
    JSON.stringify({
      prepared: true,
      root: c.root,
      restored: proof.completeRowTables,
      gameExecution: false,
      modelCalls: 0,
    }),
  );
} else if (action === "start-canary" || action === "start-24h" || action === "start-6h" || action === "start-30m") {
  const profile = freshRunProfiles[action];
  const canary = action === "start-canary",
    exploratory = profile.exploratory,
    durationMs = profile.durationMs,
    perActorCalls = canary ? 6 : 2000;
  if (canary) assert.equal(c.purpose, "real-workflow-canary");
  if (exploratory) assert.equal(c.purpose, profile.purpose);
  else {
    const approval = await json("activation-approval.json");
    assert.equal(approval.id, c.id);
    assert.equal(approval.approved, true);
    assert.equal(approval.durationMs, durationMs);
    assert.equal((await json("activation-package.json")).status, "ready");
  }
  assert.equal((await json("window.json")).status, "prepared");
  const hostStart = await currentWindowsClock();
  assertFreshHostClock(await json("clock-control.json"), hostStart);
  const key = (await readFile(file("provider/api-key"), "utf8")).trim();
  const cache = await json("provider/cache-profile.json");
  const live = await fetch(`${c.model.endpoint.replace(/\/v1$/, "")}/fleet/cache-profile`, {
    headers: { authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(3000),
  });
  assert.equal(live.status, 200);
  assert.deepEqual(await live.json(), cache);
  const liveEnv = {
    ...c.fleetEnv,
    FLEET_LIVE_ENABLED: "1",
    MODEL_API_KEY: key,
    FLEET_VLLM_CACHE_PROFILE: file("provider/cache-profile.json"),
    ...(canary ? { FLEET_STOP_ON_TURN_FAILURE: "1" } : {}),
  };
  const r = composeRuntime(config(liveEnv)),
    roster = await json("roster.json");
  try {
    assert.equal(roster.length, 24);
    assert.equal((await r.pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n, 0);
    const hostAtStart = await currentWindowsClock();
    const start = Date.now(),
      record: SupervisorRecord & { hostStart: typeof hostStart } = {
        id: c.id,
        durationMs,
        maxCalls: perActorCalls * 24,
        wallStartMs: start,
        monoStartMs: mono(),
        bootId: (await boot()).trim(),
        drainMs: exploratory ? 210000 : 90000,
        ...(exploratory ? { faultPolicy: "isolate-actors" as const } : {}),
        hostStart: hostAtStart,
      };
    await writeFile(file("supervisor.json"), JSON.stringify(record, null, 2), { mode: 0o600, flag: "wx" });
    await writePrivateJson(file("window.json"), {
      id: c.id,
      status: "armed",
      startsAt: start,
      endsAt: start + durationMs,
      durationMs,
      blockedScenarios: ["E4", "KQ1"],
      scope: profile.scope,
    });
    const launcher = new LaunchService(r.store, r.tasks, r.environments, r.architectures, {
      liveAllowed: true,
      providerConfigured: r.providerConfigured,
    });
    assert.equal(
      roster.filter(
        (row: { spec: { architecture: { id: string } } }) => row.spec.architecture.id === "autonomous-specialists",
      ).length,
      3,
    );
    for (const row of roster) {
      const callLimit = canary ? (row.spec.architecture.id === "autonomous-specialists" ? 13 : 5) : perActorCalls;
      const spec = {
        ...row.spec,
        budget: {
          ...row.spec.budget,
          callLimit,
          tokenLimit: callLimit * 40000,
          deadlineAt: new Date(start + durationMs).toISOString(),
        },
      };
      const draft = await launcher.draft({ requestId: randomUUID(), spec });
      await launcher.start({ requestId: randomUUID(), draftId: draft.draftId, expectedDigest: draft.digest });
      const binding = await r.bindings.get(row.bindingId);
      // Timed-only architectures already receive their initial native review. Do not
      // create a second task for the same startup just to force canary coverage.
      if (row.spec.wakePolicy?.enabled)
        await r.tasks.publishFromEvent(
          binding,
          {
            id: `operator-initial:${c.id}:${binding.id}`,
            type: "scheduled",
            sourceRef: `operator-review:${c.id}`,
            observedAt: new Date().toISOString(),
            environmentTime: { clockId: "utc", value: new Date().toISOString() },
            metadata: { category: "review" },
          },
          "operator-initial",
        );
    }
    await startOwnedEventPublisher(c);
    await startOwnedProcess(c, "supervisor", "fleet", [
      "--import",
      "tsx",
      "scripts/control-real-pact.ts",
      "watch",
      c.root,
    ]);
    // The independent guardian must see a real heartbeat from this supervisor.
    for (let n = 0; n < 100; n++) {
      if (
        await access(file("supervisor-heartbeat.json")).then(
          () => true,
          () => false,
        )
      )
        break;
      await new Promise((done) => setTimeout(done, 50));
    }
    const heartbeat = await json("supervisor-heartbeat.json");
    assert(mono() - heartbeat.monoMs < 5000, "SUPERVISOR_HEARTBEAT_NOT_READY");
    // Secondary clock/process guardian is independent of both the worker and this supervisor.
    const { stdout } = await exec("python3", [resolve(c.fleetRepo, "scripts/local-run-guardian.py"), "start", c.root], {
      timeout: 10000,
    });
    await writeFile(file("logs/guardian-start.json"), stdout, { mode: 0o600, flag: "wx" });
    await clock(c, "resume");
    if (canary) {
      const seed = await exec(c.node, ["--import", "tsx", "scripts/seed-real-pact-canary.ts", c.root], {
        cwd: c.fleetRepo,
        env: localEnvironment(c, "fleet"),
        timeout: 45000,
        maxBuffer: 1024 ** 2,
      });
      await writeFile(file("logs/seed-inputs.json"), seed.stdout, { mode: 0o600, flag: "wx" });
    }
    await startOwnedProcess(c, "pact-rules", "pact", ["workers/rules/dist/main.js"]);
    const deployment = exploratory ? await json("deployment.json") : null;
    if (exploratory) assert(String(deployment.stage).startsWith(`${c.root}/deployments/`), "OWNED_STAGE_REQUIRED");
    await startOwnedProcess(
      c,
      "fleet-worker",
      "fleet",
      [deployment ? `${deployment.stage}/server/worker.js` : "dist/server/worker.js"],
      liveEnv,
    );
    const armed = await json("window.json");
    assert.equal(armed.status, "armed");
    await writePrivateJson(file("window.json"), { ...armed, status: "running", admissionOpenedAt: Date.now() });
    console.log(
      JSON.stringify({
        started: profile.scope,
        durationMs,
        callCeiling: record.maxCalls,
        root: c.root,
      }),
    );
  } catch (error) {
    const detail = error as Error & { code?: string; stderr?: string };
    let message = `${detail.stack ?? detail.message}\n${detail.stderr ?? ""}`;
    for (const env of [c.pactEnv, c.fleetEnv])
      for (const [key, value] of Object.entries(env))
        if (/KEY|SECRET|PEPPER|DATABASE_URL/.test(key)) message = message.replaceAll(value, "[private]");
    await writePrivateJson(file("evidence/start-failure.json"), {
      code: detail.code ?? "START_FAILURE",
      detail: message,
    });
    await park("START_FAILURE", true);
    throw Error("OWNED_START_FAILED_CLOSED");
  } finally {
    await r.pool.end();
  }
} else if (action === "watch") await watch();
else if (action === "park") {
  await park(process.argv[4] ?? "OPERATOR_STOP", true);
  await finalize();
  console.log("Owned world parked; no replay or allocation reset.");
} else if (action === "snapshot") {
  await snapshot(c, process.argv[4] ?? "final");
  console.log("Encrypted owned snapshots saved.");
} else if (action === "restore")
  console.log(JSON.stringify((await restoreCheck(c, process.argv[4] ?? "final")).completeRowTables));
else if (action === "status") {
  const pool = new pg.Pool({ connectionString: c.fleetEnv.DATABASE_URL });
  try {
    console.log(
      JSON.stringify({
        window: await json("window.json"),
        clock: await clock(c, "status"),
        stats: await readStats(pool),
      }),
    );
  } finally {
    await pool.end();
  }
} else if (action === "verify-supervision") {
  // Process/clock-only fixture: real guardian, no worker/provider/API gameplay.
  assert.equal(c.purpose, "real-workflow-canary");
  assert.equal((await json("window.json")).status, "prepared");
  const { stdout } = await exec("python3", [resolve(c.fleetRepo, "scripts/local-run-guardian.py"), "verify", c.root], {
    timeout: 45000,
  });
  console.log(stdout.trim());
}
