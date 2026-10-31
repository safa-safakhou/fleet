import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import { RunInspection } from "../../src/research/evidence/inspection.js";
import { MetricRepository } from "../../src/research/metrics/repository.js";
import { memoryFixture } from "../fixtures/research/memory.js";

test("known_metric_fixture_is_exact beyond 200, half-open boundaries and late settlement are frozen", async () => {
  const f = await memoryFixture(false);
  try {
    const sessionHash = randomUUID(),
      window = { start: f.now().toISOString(), end: new Date(f.now().getTime() + 3600000).toISOString() };
    await f.pool.query("INSERT INTO operator_sessions VALUES($1,$2,'fixture')", [sessionHash, window.end]);
    await f.pool.query(
      "INSERT INTO compute_ledger(id,cohort_id,turn_id,period,tokens,created_at,status,input_tokens,output_tokens,request_metrics,response_metrics) SELECT gen_random_uuid(),$1,$2,'fixture',15,$3,'reported',10,5,jsonb_build_object('queueDelayMs',i),jsonb_build_object('providerExecutionMs',i) FROM generate_series(1,205) i",
      [f.group.id, f.scope.turnId, window.start],
    );
    const unknown = randomUUID();
    await f.pool.query("INSERT INTO compute_ledger VALUES($1,$2,$3,'fixture',100,$4,'unknown',NULL,NULL,NULL,NULL)", [
      unknown,
      f.group.id,
      f.scope.turnId,
      window.start,
    ]);
    await f.pool.query(
      "INSERT INTO compute_ledger(id,cohort_id,turn_id,period,tokens,created_at,status,input_tokens,output_tokens) VALUES(gen_random_uuid(),$1,$2,'fixture',15,$3,'reported',10,5)",
      [f.group.id, f.scope.turnId, window.end],
    );
    const inspection = new RunInspection(f.store, f.capture.artifacts),
      principal = { sessionHash, agentIds: [f.scope.agentId] },
      snapshot = await inspection.snapshot(f.scope.runId, principal),
      repo = new MetricRepository(inspection, f.capture, principal);
    const result = await repo.compute(snapshot, ["calls.v1", "latency_p95.v1", "known_tokens_per_success.v1"], window);
    expect(result.metrics.values.map((v) => v.value)).toEqual([206, 195, null]);
    await f.pool.query("UPDATE compute_ledger SET status='reported',input_tokens=7,output_tokens=8 WHERE id=$1", [
      unknown,
    ]);
    const frozen = await repo.get(result.id);
    expect(frozen.metrics.digest).toBe(result.metrics.digest);
    expect(frozen.metrics.unresolvedUsage.allocations).toBe(1);
    const next = await repo.compute(
      await inspection.snapshot(f.scope.runId, principal),
      ["calls.v1", "latency_p95.v1", "known_tokens_per_success.v1"],
      window,
    );
    expect(next.metrics.unresolvedUsage.allocations).toBe(0);
    expect(next.metrics.digest).not.toBe(result.metrics.digest);
    await expect(
      new MetricRepository(inspection, f.capture, { sessionHash, agentIds: [randomUUID()] }).get(result.id),
    ).rejects.toThrow("EVIDENCE_FORBIDDEN");
    await f.store.consent(f.group.id, false);
    await expect(repo.get(result.id)).rejects.toThrow("EVIDENCE_WITHHELD");
  } finally {
    await f.close();
  }
});
