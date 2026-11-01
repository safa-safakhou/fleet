// Standalone fresh process per sample. Only a nonce-owned synthetic DB may be used.
import { randomUUID } from "node:crypto";
import { mkdir, readdir, stat } from "node:fs/promises";
import { availableParallelism, cpus, platform, release, totalmem } from "node:os";
import { join } from "node:path";
import { connect } from "../dist/server/db.js";
import { CaptureSession } from "../dist/server/research/evidence/boundaries.js";
import { ArtifactFilesystem } from "../dist/server/research/evidence/filesystem.js";
import { scopeForTurn } from "../dist/server/research/evidence/repository.js";
import { Store } from "../dist/server/store.js";
import { Vault } from "../dist/server/vault.js";

const enabled = process.argv[2] === "enabled";
if (
  !["enabled", "disabled"].includes(process.argv[2]) ||
  !/^[a-f0-9]{64}$/.test(process.env.FLEET_BENCHMARK_NONCE ?? "")
)
  throw Error("OWNED_BENCHMARK_REQUIRED");
const url = new URL(process.env.FLEET_BENCHMARK_DATABASE_URL ?? "");
if (
  !["127.0.0.1", "host.docker.internal"].includes(url.hostname) ||
  url.pathname !== "/fleet_test" ||
  [5432, 5436, 5437, 5438, 5439, 5451, 5452].includes(Number(url.port))
)
  throw Error("OWNED_BENCHMARK_REQUIRED");
const pool = connect(url.href),
  root = process.env.FLEET_BENCHMARK_ARTIFACT_ROOT;
if (!root) throw Error("OWNED_ARTIFACT_ROOT_REQUIRED");
try {
  if (
    (await pool.query("SELECT nonce FROM architecture_fixture_owner")).rows[0]?.nonce !==
    process.env.FLEET_BENCHMARK_NONCE
  )
    throw Error("OWNERSHIP_MISMATCH");
  const cohort = randomUUID(),
    now = new Date(),
    vault = new Vault(Buffer.alloc(32, 23).toString("base64")),
    store = new Store(pool, vault),
    capture = new CaptureSession(store, new ArtifactFilesystem(root));
  await pool.query(
    "INSERT INTO cohorts(id,name,count,interval_minutes,seed,state,observation_consent) VALUES($1,'Synthetic benchmark',4,15,'20261030','paused',true)",
    [cohort],
  );
  const claims = [];
  for (let i = 0; i < 4; i++) {
    const agent = randomUUID(),
      turn = randomUUID();
    await pool.query("INSERT INTO agents(id,cohort_id,ordinal,name,strategy) VALUES($1,$2,$3,'Synthetic','{}')", [
      agent,
      cohort,
      i + 1,
    ]);
    await pool.query(
      "INSERT INTO turns(id,agent_id,cohort_id,generation,fence,worker,state,due_at,started_at,deadline_at) VALUES($1,$2,$3,0,0,'fixture','running',$4,$4,$5)",
      [turn, agent, cohort, now, new Date(now.getTime() + 3600000)],
    );
    claims.push({ id: turn, agentId: agent, cohortId: cohort });
  }
  const scopes = await Promise.all(claims.map((c) => scopeForTurn(store, c.id)));
  const request = {
    model: { route: "ollama", model: "fake" },
    messages: [{ role: "user", content: "Synthetic recorded workload" }],
    schema: { type: "object" },
    maxOutputTokens: 100,
    signal: new AbortController().signal,
  };
  let providerCalls = 0;
  const provider = {
    decide: async () => {
      providerCalls++;
      await new Promise((r) => setTimeout(r, 50));
      return { decision: { kind: "wait" }, inputTokens: 7, outputTokens: 8 };
    },
  };
  const times = [],
    providerMs = [],
    rss = [];
  const startCpu = process.cpuUsage(),
    start = performance.now();
  const sample = setInterval(() => rss.push(process.memoryUsage().rss), 10);
  await mkdir(root, { recursive: true, mode: 0o700 });
  let cleanupMs = 0;
  try {
    await Promise.all(
      Array.from({ length: 4 }, (_, worker) =>
        (async () => {
          for (let i = 0; i < 250; i++) {
            const t = performance.now();
            let fakeTime = 0;
            const timed = {
              decide: async (input) => {
                const p = performance.now();
                const result = await provider.decide(input);
                fakeTime = performance.now() - p;
                return result;
              },
            };
            if (enabled) await capture.withScope(scopes[worker], () => capture.model(claims[worker], request, timed));
            else await timed.decide(request);
            times.push(performance.now() - t);
            providerMs.push(fakeTime);
          }
        })(),
      ),
    );
    const cleanupStart = performance.now();
    await capture.flush();
    cleanupMs = performance.now() - cleanupStart;
  } finally {
    clearInterval(sample);
  }
  const elapsedMs = performance.now() - start,
    cpu = process.cpuUsage(startCpu);
  const footprint = (
    await pool.query(
      "SELECT pg_database_size(current_database())::text database_bytes,COALESCE((SELECT sum(pg_total_relation_size(c.oid)) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'),0)::text relation_bytes",
    )
  ).rows[0];
  const counts = (
    await pool.query(
      "SELECT (SELECT count(*)::int FROM research_events e JOIN research_runs r ON r.run_id=e.run_id WHERE r.cohort_id=$1) events,(SELECT count(*)::int FROM research_artifacts a JOIN research_runs r ON r.run_id=a.run_id WHERE r.cohort_id=$1) artifacts",
      [cohort],
    )
  ).rows[0];
  const pendingCipherCopies = (
    await pool.query(
      "SELECT count(*)::int n FROM research_artifacts a JOIN research_runs r ON r.run_id=a.run_id WHERE r.cohort_id=$1 AND a.inline_cipher IS NOT NULL",
      [cohort],
    )
  ).rows[0].n;
  if (pendingCipherCopies !== 0) throw Error("RECORDING_CLEANUP_INCOMPLETE");
  async function bytes(path) {
    let total = 0;
    for (const e of await readdir(path, { withFileTypes: true })) {
      const p = join(path, e.name);
      total += e.isDirectory() ? await bytes(p) : (await stat(p)).size;
    }
    return total;
  }
  const percentile = (a) => [...a].sort((a, b) => a - b)[Math.ceil(a.length * 0.95) - 1];
  console.log(
    JSON.stringify({
      schemaVersion: "fleet.benchmark-sample/v2",
      enabled,
      operations: 1000,
      concurrency: 4,
      fakeProviderMs: 50,
      providerCalls,
      elapsedMs,
      cleanupMs,
      pendingCipherCopies,
      p95ServiceMs: percentile(times),
      p95ProviderMs: percentile(providerMs),
      p95HostExclusiveMs: percentile(times.map((value, index) => value - providerMs[index])),
      peakRssBytes: Math.max(process.resourceUsage().maxRSS * 1024, ...rss),
      cpuMicros: cpu.user + cpu.system,
      artifactBytes: await bytes(root),
      footprint,
      counts,
      runner: {
        os: platform(),
        release: release(),
        node: process.version,
        cpu: cpus()[0]?.model,
        cpus: availableParallelism(),
        totalRamBytes: totalmem(),
      },
      limits: [
        "Recording boundary benchmark; excludes native admission, scheduler, Temporal and optional telemetry backends. No real provider or game IO.",
      ],
    }),
  );
} finally {
  await pool.end();
}
