import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import { RunInspection } from "../../src/research/evidence/inspection.js";
import { ComparisonService } from "../../src/research/experiments/comparison.js";
import { MLflowProjection } from "../../src/research/experiments/mlflow.js";
import { ExperimentRepository } from "../../src/research/experiments/repository.js";
import { MetricRepository } from "../../src/research/metrics/repository.js";
import { buildServer } from "../../src/server.js";
import { memoryFixture } from "../fixtures/research/memory.js";

test("preregistration preserves missing runs, drift, immutable late results and consent tombstones", async () => {
  const f = await memoryFixture(false);
  let app: ReturnType<typeof buildServer> | undefined;
  try {
    const sessionHash = randomUUID();
    await f.pool.query("INSERT INTO operator_sessions VALUES($1,$2,'fixture')", [
      sessionHash,
      new Date(f.now().getTime() + 7200000),
    ]);
    const principal = { sessionHash },
      inspection = new RunInspection(f.store, f.capture.artifacts),
      metrics = new MetricRepository(inspection, f.capture, principal),
      repo = new ExperimentRepository(metrics);
    const start = f.now().toISOString(),
      end = new Date(f.now().getTime() + 3600000).toISOString();
    const spec = {
      schemaVersion: "fleet.experiment/v1" as const,
      id: randomUUID(),
      assignmentUnit: "world" as const,
      baseline: "base",
      primaryMetric: "known_input_tokens.v1",
      secondaryMetrics: ["calls.v1"],
      margin: 0.1,
      window: { start, end },
      horizonMs: 3600000,
      seed: 42,
      paired: false,
      stoppingRule: "fixed-horizon" as const,
      missingness: "report-and-block-inference" as const,
      splitDigests: { train: "a".repeat(64), development: "b".repeat(64), heldout: "c".repeat(64) },
      units: [
        {
          id: "baseline-world",
          arm: "base",
          worldId: f.manifest.environment.worldIncarnation,
          sessionId: "s1",
          cohortId: f.group.id,
          runIds: [f.scope.runId],
          manifestDigest: f.scope.manifestDigest,
          limits: f.manifest.limits,
        },
        {
          id: "missing-bad-world",
          arm: "candidate",
          worldId: "missing-world",
          sessionId: "s2",
          cohortId: f.group.id,
          runIds: ["missing-bad-run"],
          manifestDigest: "f".repeat(64),
          limits: { calls: "1", tokens: "1", concurrency: 1 },
        },
      ],
    };
    app = buildServer({
      store: f.store,
      broker: {} as never,
      engine: {} as never,
      origin: "http://fixture.invalid",
      operatorSecret: "x".repeat(32),
      liveAllowed: false,
      researchInspection: inspection,
    });
    expect((await app.inject({ method: "POST", url: "/api/research/experiments", payload: spec })).statusCode).toBe(
      401,
    );
    const login = await app.inject({
      method: "POST",
      url: "/api/login",
      headers: { origin: "http://fixture.invalid" },
      payload: { password: "x".repeat(32) },
    });
    const cookie = String(login.headers["set-cookie"]).split(";")[0];
    expect(
      (await app.inject({ method: "POST", url: "/api/research/experiments", headers: { cookie }, payload: spec }))
        .statusCode,
    ).toBe(403);
    const created = await app.inject({
      method: "POST",
      url: "/api/research/experiments",
      headers: { cookie, origin: "http://fixture.invalid", "x-csrf-token": login.json().csrf },
      payload: spec,
    });
    expect(created.statusCode).toBe(200);
    expect(created.json().id).toBe(spec.id);
    await repo.create(spec);
    const unknown = randomUUID();
    await f.pool.query(
      "INSERT INTO compute_ledger(id,cohort_id,turn_id,period,tokens,created_at,status) VALUES($1,$2,$3,'fixture',100,$4,'unknown')",
      [unknown, f.group.id, f.scope.turnId, start],
    );
    const source = await inspection.snapshot(f.scope.runId, principal),
      snap = await repo.snapshot(spec.id, [source.id]),
      comparison = new ComparisonService(repo),
      first = await comparison.compare(snap.id);
    expect(first.missingRuns).toEqual(["missing-bad-run"]);
    expect(first.winner).toBeNull();
    expect(first.flags).toContain("UNKNOWN_USAGE");
    expect(first.units.length).toBe(2);
    const api = await app.inject({
      method: "GET",
      url: `/api/research/experiment-snapshots/${snap.id}`,
      headers: { cookie },
    });
    expect(api.statusCode).toBe(200);
    expect(api.json().winner).toBeNull();
    expect(api.headers["cache-control"]).toBe("no-store");
    expect(first.intervals[0].lower).toBeNull();
    const original = JSON.stringify(await repo.retained(snap.id));
    const sent: unknown[] = [];
    const tracking = new MLflowProjection(repo, {
      sync: async (metadata) => {
        sent.push(metadata);
        return { status: "synced" };
      },
    });
    expect((await tracking.sync(snap)).status).toBe("synced");
    expect((await tracking.sync(snap)).status).toBe("synced");
    expect(sent[0]).toEqual(sent[1]);
    expect(Object.keys(sent[0] as object).sort()).toEqual(["artifactRefs", "metrics", "parameters", "snapshotDigest"]);
    expect(
      (
        await new MLflowProjection(repo, {
          sync: async () => {
            throw Error("fixture outage");
          },
        }).sync(snap)
      ).status,
    ).toBe("unavailable");
    expect(JSON.stringify(await repo.retained(snap.id))).toBe(original);
    const get = metrics.get.bind(metrics);
    metrics.get = async (id) => {
      await f.pool.query("DELETE FROM operator_sessions WHERE hash=$1", [sessionHash]);
      return get(id);
    };
    await expect(repo.retained(snap.id)).rejects.toThrow("EVIDENCE_FORBIDDEN");
    expect(
      (await f.pool.query("SELECT body_cipher FROM research_experiment_snapshots WHERE id=$1", [snap.id])).rows[0]
        .body_cipher,
    ).not.toBeNull();
    metrics.get = get;
    await f.pool.query("INSERT INTO operator_sessions VALUES($1,$2,'fixture')", [
      sessionHash,
      new Date(f.now().getTime() + 7200000),
    ]);
    await f.pool.query("UPDATE compute_ledger SET status='reported',input_tokens=10,output_tokens=5 WHERE id=$1", [
      unknown,
    ]);
    const next = await repo.snapshot(spec.id, [(await inspection.snapshot(f.scope.runId, principal)).id]);
    expect(next.digest).not.toBe(snap.digest);
    expect(next.units[0].flags).not.toContain("UNKNOWN_USAGE");
    expect(first.flags).toContain("BUDGET_MISMATCH");
    expect(JSON.stringify(await repo.retained(snap.id))).toBe(original);
    await f.store.consent(f.group.id, false);
    await expect(repo.retained(snap.id)).rejects.toThrow("EXPERIMENT_UNAVAILABLE");
    expect(
      (await f.pool.query("SELECT body_cipher FROM research_experiment_snapshots WHERE id=$1", [snap.id])).rows[0]
        .body_cipher,
    ).toBeNull();
  } finally {
    await app?.close();
    await f.close();
  }
});
