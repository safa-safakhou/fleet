/** Owned synthetic browser fixture. No database, providers, game clients or retained routes. */

import { performance } from "node:perf_hooks";
import Fastify from "fastify";
import { createServer } from "vite";

const app = Fastify({ logger: false }),
  vite = await createServer({
    configFile: false,
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
    server: { middlewareMode: true, watch: { ignored: ["**/.superpowers/**", "**/.state/**", "**/test-results/**"] } },
    appType: "custom",
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
export function fixtureEvent(i: number) {
  return {
    schemaVersion: "fleet.evidence/v1",
    id: eventId(i),
    scope,
    streamId: i % 2 ? "actor" : "provider",
    sequence: String(Math.ceil(i / 2)),
    ordinal: String(i),
    kind: i === 2 ? "context.prepared" : i % 3 ? "queue.enter" : "model.response",
    occurredAt: `2026-10-31T10:00:00.000Z`,
    recordedAt: "2026-10-31T10:00:01.000Z",
    parentIds: i > 2 ? [eventId(i - 2)] : [],
    attributes: {
      ...(i % 3 === 0 ? { durationMs: "20", inputTokens: "7", outputTokens: "8" } : { outcome: "pending" }),
      purpose: "decision",
    },
    artifacts: [],
    coverage: { status: "complete", expected: "1", recorded: "1", reasons: [] },
  };
}
app.get("/health", () => ({ fixture: true }));
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
