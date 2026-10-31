import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Readable } from "node:stream";
import { EventKinds } from "../src/research/evidence/types.js";
import { compareExperiment } from "../src/research/experiments/comparison.js";
import type { ExperimentSnapshot } from "../src/research/experiments/repository.js";
/** Owned synthetic browser fixture. No database, providers, game clients or retained routes. */

import { performance } from "node:perf_hooks";
import Fastify from "fastify";
import { createServer } from "vite";

const app = Fastify({ logger: false }),
  vite = await createServer({
    configFile: false,
    envDir: false,
    optimizeDeps: {
      noDiscovery: true,
      include: [
        "react",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@dagrejs/dagre",
        "echarts/core",
        "echarts/charts",
        "echarts/components",
        "echarts/renderers",
      ],
    },
    root: process.cwd(),
    server: {
      middlewareMode: true,
      allowedHosts: ["host.docker.internal", "127.0.0.1", "localhost"],
      fs: {
        allow: [resolve("web"), resolve("node_modules"), resolve("config/research/metrics.v1.json")],
        deny: ["**/.env*", "**/.state/**", "**/.superpowers/**", "**/.git/**"],
      },
      watch: { ignored: ["**/.superpowers/**", "**/.state/**", "**/test-results/**"] },
    },
    appType: "custom",
  });
// Q3 replay serves only the owned synthetic acceptance output, never a user-selected path.
async function nativeWalkthrough() {
  try {
    const value = JSON.parse(
      await readFile(".superpowers/sdd/2026-10-30-pact-research-07-qualification/native-walkthrough.json", "utf8"),
    );
    return value.fixtureTag === "fleet.owned-synthetic-walkthrough/v1" ? value : null;
  } catch {
    return null;
  }
}
app.get("/__fixture/native", async (_r, reply) => {
  const native = await nativeWalkthrough();
  return native
    ? { runId: native.snapshot.runId, createdAt: native.snapshot.createdAt, reconciliation: native.reconciliation }
    : reply.code(404).send({ code: "NATIVE_FIXTURE_NOT_PREPARED" });
});
app.addHook("onRequest", async (r, reply) => {
  const native = await nativeWalkthrough();
  if (!native) return;
  const prefix = `/api/research/runs/${encodeURIComponent(native.snapshot.runId)}`;
  const url = new URL(r.url, "http://fixture.invalid");
  if (url.pathname !== prefix && !url.pathname.startsWith(prefix + "/")) return;
  if (revoked) return reply.code(403).send({ error: { code: "EVIDENCE_WITHHELD" } });
  if (r.method !== "GET") return reply.code(403).send({ error: { code: "FIXTURE_ROUTE_DENIED" } });
  const suffix = url.pathname.slice(prefix.length);
  if (!suffix) return reply.send(native.snapshot);
  if (suffix === "/metric-sets") return reply.send(native.metricSets);
  if (url.searchParams.get("snapshotId") !== native.snapshot.id)
    return reply.code(403).send({ error: { code: "FIXTURE_SNAPSHOT_REQUIRED" } });
  if (suffix === "/events")
    return reply.send({
      snapshotId: native.snapshot.id,
      events: native.events.filter(
        (e: any) =>
          (!url.searchParams.get("kind") || e.kind === url.searchParams.get("kind")) &&
          (!url.searchParams.get("streamId") || e.streamId === url.searchParams.get("streamId")),
      ),
      total: native.snapshot.total,
      hasMore: false,
      nextCursor: null,
      maximumOrdinal: native.snapshot.maximumOrdinal,
    });
  const event = suffix.match(/^\/events\/([^/]+)$/);
  if (event) return reply.send(native.events.find((e: any) => e.id === event[1]));
  const chunk = suffix.match(/^\/artifacts\/([^/]+)\/chunks\/(\d+)$/);
  if (chunk && native.chunks[`${chunk[1]}:${chunk[2]}`]) return reply.send(native.chunks[`${chunk[1]}:${chunk[2]}`]);
  return reply.code(404).send({ error: { code: "FIXTURE_ROUTE_DENIED" } });
});
let revoked = false;
const snapshotId = "10000000-0000-4000-8000-000000000001",
  eventId = (i: number) => `20000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
const scope = {
  runId: "synthetic-large",
  agentId: "synthetic-agent",
  bindingId: "synthetic-binding",
  turnId: "synthetic-turn",
  taskId: "synthetic-task",
  operationId: "synthetic-op",
  operationEpoch: "1",
  manifestDigest: "a".repeat(64),
};
const artifactId = (i: number) => `40000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
const packet = {
  messages: [
    { role: "system", content: "Owner guidance: no actions." },
    { role: "user", content: "fact é <img src=x onerror=alert(1)> contradictory peer claim" },
  ],
  schema: { type: "object", required: ["kind"] },
  lineage: {
    version: "context-lineage@1",
    spans: [
      {
        id: "contradictory-peer",
        sourceClass: "peer-claim",
        messageIndex: 1,
        startByte: 0,
        endByte: 7,
        sourceRefs: [artifactId(4)],
        transform: "identity-utf8@1",
      },
    ],
    omitted: [
      { id: "old-source", reason: "expired" },
      { id: "large-source", reason: "capacity" },
    ],
    mandatoryCoverage: { expected: 2, recorded: 2, status: "complete" },
  },
  transition: { from: "observing", to: "thinking", reason: "recorded-admission" },
  version: 2,
};
const artifact = (i: number) => ({
  id: artifactId(i),
  contentType: i === 2 ? "text/plain" : "application/json",
  bytes: String(i === 2 ? 16777216 : Buffer.byteLength(JSON.stringify(packet))),
  chunks: i === 2 ? "16" : "1",
  ciphertextDigest: "b".repeat(64),
  privacyClass: "private",
  retentionClass: "30d",
});
export function fixtureEvent(i: number) {
  return {
    schemaVersion: "fleet.evidence/v1",
    id: eventId(i),
    scope,
    streamId: i % 2 ? "actor" : "provider",
    sequence: String(Math.ceil(i / 2)),
    ordinal: String(i),
    kind:
      i === 5
        ? "command.receipt"
        : i === 6
          ? "task.state"
          : i === 2
            ? "context.prepared"
            : i % 3
              ? "queue.enter"
              : "model.response",
    occurredAt: `2026-10-31T10:00:00.000Z`,
    recordedAt: "2026-10-31T10:00:01.000Z",
    parentIds: i > 2 ? [eventId(i - 2)] : [],
    attributes: {
      ...(i % 3 === 0 ? { durationMs: "20", inputTokens: "7", outputTokens: "8" } : { outcome: "pending" }),
      purpose: "decision",
    },
    artifacts: i === 2 ? [artifact(1), artifact(2)] : [],
    coverage: { status: "complete", expected: "1", recorded: "1", reasons: [] },
  };
}
const proofRoot = resolve(".superpowers/sdd/2026-10-30-pact-research-06-studio");
await mkdir(proofRoot, { recursive: true, mode: 0o700 });
const privateCanary = resolve(proofRoot, `fixture-private-${randomUUID()}.txt`);
await writeFile(privateCanary, "SYNTHETIC_PRIVATE_FS_SENTINEL", { mode: 0o600 });
app.get("/health", () => ({ fixture: true, privateCanaryURL: `/@fs${privateCanary}` }));
app.post("/__fixture/revoke", () => {
  revoked = true;
  return { ok: true };
});
app.post("/__fixture/reset", () => {
  revoked = false;
  return { ok: true };
});
app.addHook("onRequest", async (r, reply) => {
  if (r.url.startsWith("/api/")) {
    reply.header("cache-control", "no-store");
    if (revoked) return reply.code(403).send({ error: { code: "EVIDENCE_WITHHELD" } });
    if (r.method !== "GET" || !r.url.startsWith("/api/research/"))
      return reply.code(403).send({ error: { code: "FIXTURE_ROUTE_DENIED" } });
  }
});
app.get("/api/research/turns/:turnId/runs", () => [{ runId: "synthetic-large", provenance: "synthetic" }]);
app.get("/api/research/runs/:runId", (r) => ({
  version: "fleet.snapshot/v1",
  id: snapshotId,
  runId: (r.params as { runId: string }).runId,
  maximumOrdinal: "100000",
  total: 100000,
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 3600000).toISOString(),
  provenance: "synthetic",
  manifestDigest: scope.manifestDigest,
  manifest: {
    profile: { id: "pact-reactive-reference@1" },
    status: "experimental",
    limits: { calls: "16", tokens: "1000000" },
    evaluation: { split: "synthetic" },
    context: { maxBytes: 16384 },
  },
  manifestAvailability: "sealed",
  scopes: [scope],
  coverage: {
    version: "fleet.coverage/v1",
    runId: scope.runId,
    status: "partial",
    expected: 100001,
    recorded: 100000,
    missing: [{ kind: "model.response", sourceId: "unavailable-provider-final" }],
  },
  native: {
    allocations: [
      { id: "unknown-allocation", status: "unknown", purpose: "decision", inputTokens: null, outputTokens: null },
    ],
    commands: [{ id: "pending-construction", status: "admitted" }],
    cohorts: [{ id: "synthetic-cohort", state: "paused", createdAt: new Date().toISOString(), completedAt: null }],
  },
  eventKinds: [...EventKinds],
  metricDefinitions: [],
}));
app.get("/api/research/runs/:runId/events", (r, reply) => {
  const t = performance.now(),
    q = r.query as Record<string, string>,
    after = Number(q.cursor ?? 0);
  const events = [];
  let i = after + 1;
  for (; i <= 100000 && events.length < 200; i++) {
    const e = fixtureEvent(i);
    if ((!q.kind || q.kind === e.kind) && (!q.streamId || q.streamId === e.streamId)) events.push(e);
  }
  reply.header("server-timing", `fixture;dur=${performance.now() - t}`);
  return {
    snapshotId,
    events,
    total: 100000,
    hasMore: i <= 100000,
    nextCursor: i <= 100000 ? String(i - 1) : null,
    nextAfter: String(i - 1),
    maximumOrdinal: "100000",
  };
});
app.get("/api/research/runs/:runId/events/:eventId", (r) => {
  const id = (r.params as { eventId: string }).eventId;
  const n = Number(id.split("-").at(-1));
  if (!n || n > 100000) throw Error("EVIDENCE_UNAVAILABLE");
  return fixtureEvent(n);
});
app.get("/api/research/runs/:runId/artifacts/:artifactId/chunks/:index", (r, reply) => {
  const p = r.params as { artifactId: string; index: string },
    index = Number(p.index);
  if (![artifactId(1), artifactId(2), artifactId(4)].includes(p.artifactId))
    return reply.code(404).send({ error: { code: "ARTIFACT_UNAVAILABLE" } });
  const large = p.artifactId === artifactId(2),
    body = large ? Buffer.alloc(1048576, 90) : Buffer.from(JSON.stringify(packet));
  if (!Number.isInteger(index) || index < 0 || index >= (large ? 16 : 1))
    return reply.code(404).send({ error: { code: "ARTIFACT_CHUNK_UNAVAILABLE" } });
  return {
    index,
    chunks: large ? 16 : 1,
    bytes: body.length,
    totalBytes: String(large ? 16777216 : body.length),
    body: body.toString("base64"),
    complete: !large,
    contentType: large ? "text/plain" : "application/json",
  };
});
const metricValues = [
  ...[
    { id: "tasks.v1", value: 4, unit: "tasks" },
    { id: "attempts.v1", value: 8, unit: "attempts" },
    { id: "confirmed_actions.v1", value: 3, unit: "commands" },
    { id: "queue_p95.v1", value: 30, unit: "ms" },
    { id: "latency_p95.v1", value: 20, unit: "ms" },
    { id: "admission_deferrals.v1", value: 1, unit: "deferrals" },
    { id: "output_cap_hits.v1", value: 2, unit: "calls" },
    { id: "disk_bytes.v1", value: 16777216, unit: "bytes" },
    { id: "input_limit_utilization.v1", value: 0.8, unit: "ratio" },
    { id: "monetary_cost.v1", value: null, unit: "currency" },
  ].map((m) => ({ ...m, numerator: String(m.value ?? "0"), denominator: null })),

  { id: "calls.v1", value: 205, unit: "call", numerator: "205", denominator: null },
  { id: "known_input_tokens.v1", value: 1000, unit: "token", numerator: "1000", denominator: null },
  { id: "unknown_allocations.v1", value: 2, unit: "allocation", numerator: "2", denominator: null },
  { id: "reserved_tokens.v1", value: 5000, unit: "token", numerator: "5000", denominator: null },
  { id: "known_tokens_per_success.v1", value: null, unit: "token/success", numerator: "1000", denominator: "1" },
  { id: "messages_delivered.v1", value: 0, unit: "message", numerator: "0", denominator: null },
].map((m) => ({
  ...m,
  version: "1",
  population: "full authorized published native population",
  window: { start: "2026-10-31T10:00:00.000Z", end: "2026-10-31T11:00:00.000Z" },
  timeBasis: "allocation-created",
  coverage: { status: "partial", expected: 207, recorded: 205, censored: 2, ungraded: 0 },
  sourceRefs: [eventId(2)],
  evaluatorDigest: "e".repeat(64),
  exclusions: m.value === null ? ["UNKNOWN_USAGE"] : [],
}));
const metricSet = {
  version: "fleet.metric-set/v1",
  snapshotId: "historical-published-snapshot",
  digest: "c".repeat(64),
  values: metricValues,
  unresolvedUsage: { allocations: 2, reservedTokens: "5000" },
  ungraded: 0,
  exclusions: ["UNKNOWN_USAGE"],
};
app.get("/api/research/runs/:runId/metric-sets", () => [
  {
    id: "50000000-0000-4000-8000-000000000001",
    metrics: metricSet,
    evaluation: {
      version: "fleet.evaluation/v1",
      evaluatorDigest: "e".repeat(64),
      objectives: [
        { id: "verified-upgrade", status: "completed", sourceRefs: [eventId(2)] },
        { id: "ungraded-objective", status: "ungraded", sourceRefs: [] },
      ],
    },
  },
]);
const spec = {
  schemaVersion: "fleet.experiment/v1",
  id: "70000000-0000-4000-8000-000000000001",
  assignmentUnit: "world",
  baseline: "base",
  primaryMetric: "first_pass_accuracy.v1",
  secondaryMetrics: ["calls.v1", "known_tokens_per_success.v1"],
  margin: 0.05,
  window: { start: "2026-10-31T10:00:00.000Z", end: "2026-10-31T11:00:00.000Z" },
  horizonMs: 3600000,
  seed: 42,
  paired: false,
  stoppingRule: "fixed-horizon",
  missingness: "report-and-block-inference",
  splitDigests: { train: "a".repeat(64), development: "b".repeat(64), heldout: "c".repeat(64) },
  units: [],
};
const study = {
  version: "fleet.experiment-snapshot/v1",
  id: "60000000-0000-4000-8000-000000000001",
  experimentId: spec.id,
  spec,
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 3600000).toISOString(),
  digest: "f".repeat(64),
  units: ["base", "candidate"].map((arm, i) => ({
    id: i ? "=SUM(1)" : "baseline",
    arm,
    worldId: `world-${i}`,
    sessionId: `session-${i}`,
    expectedRuns: [i ? "synthetic-large" : "synthetic-baseline", ...(i ? ["missing-bad-run"] : [])],
    missingRuns: i ? ["missing-bad-run"] : [],
    flags: i ? ["UNKNOWN_USAGE", "CENSORED_HORIZON", "MISSING_RUNS", "MANIFEST_MISMATCH"] : [],
    manifestDifferences: [],
    runs: [
      {
        runId: i ? "synthetic-large" : "synthetic-baseline",
        snapshotId,
        metricId: "50000000-0000-4000-8000-000000000001",
        configuration: {
          environment: { worldIncarnation: `world-${i}` },
          evaluation: { evaluator: i ? "changed@2" : "pact-rules@1" },
        },
        metrics: {
          ...metricSet,
          values: [
            ...metricSet.values,
            {
              ...metricValues[0],
              id: "first_pass_accuracy.v1",
              unit: "ratio",
              value: i ? 0.6 : 0.5,
              numerator: i ? "6" : "5",
              denominator: "10",
            },
          ],
        },
      },
    ],
  })),
} as unknown as ExperimentSnapshot;
spec.units = study.units.map((u) => ({
  id: u.id,
  arm: u.arm,
  cohortId: "synthetic",
  worldId: u.worldId,
  sessionId: u.sessionId,
  runIds: u.expectedRuns,
  limits: { calls: "16", tokens: "1000000", concurrency: 1 },
})) as never[];
app.get("/api/research/experiment-snapshots/:id", () => compareExperiment(study));
app.get("/api/research/runs/:runId/export", (r, reply) => {
  if (typeof r.headers["x-fleet-export-key"] !== "string" || !/^[a-f0-9]{64}$/.test(r.headers["x-fleet-export-key"]))
    return reply.code(400).send({ error: { code: "EXPORT_KEY_REQUIRED" } });
  reply.type("application/vnd.fleet.encrypted-archive");
  return reply.send(
    Readable.from(
      (async function* () {
        for (let i = 0; i < 4; i++) yield Buffer.alloc(1048576, 43);
      })(),
    ),
  );
});
app.get("/api/research/runs/:runId/coverage", () => ({ status: "partial" }));
app.setNotFoundHandler(async (r, reply) => {
  if (r.url.startsWith("/api/")) return reply.code(403).send({ error: { code: "FIXTURE_ROUTE_DENIED" } });
  if (r.url === "/" || r.url.startsWith("/?")) {
    reply.type("text/html");
    return vite.transformIndexHtml(
      "/",
      '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fleet synthetic research studio</title></head><body style="margin:0;background:#0a1220"><div id="root"></div><script type="module" src="/web/research/fixture-main.tsx"></script></body></html>',
    );
  }
  await new Promise<void>((resolve, reject) =>
    vite.middlewares(r.raw, reply.raw, (e?: unknown) => (e ? reject(e) : resolve())),
  );
  reply.hijack();
});
await app.listen({ host: "127.0.0.1", port: 8876 });
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, async () => {
    await app.close();
    await vite.close();
    process.exit(0);
  });
