import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import { RunInspection } from "../../src/research/evidence/inspection.js";
import { MetricRepository } from "../../src/research/metrics/repository.js";
import { memoryFixture } from "../fixtures/research/memory.js";

test("studio parent and chunk reads stay within pinned snapshot and current authorization", async () => {
  const f = await memoryFixture(false);
  try {
    const sessionHash = randomUUID();
    await f.pool.query("INSERT INTO operator_sessions VALUES($1,$2,'fixture')", [
      sessionHash,
      new Date(f.now().getTime() + 3600000),
    ]);
    const p = { sessionHash },
      inspection = new RunInspection(f.store, f.capture.artifacts);
    const event = await f.capture.emit(
      f.scope,
      "context.prepared",
      { messages: [{ role: "user", content: "SYNTHETIC_PRIVATE" }], schema: {} },
      {},
      { required: true },
    );
    const snap = await inspection.snapshot(f.scope.runId, p);
    const found = await inspection.event(f.scope.runId, p, snap.id, event!.id);
    expect(found.id).toBe(event!.id);
    const chunk = await inspection.artifactChunk(f.scope.runId, p, snap.id, found.artifacts[0].id, 0);
    expect(Buffer.from(chunk.body, "base64").toString()).toContain("SYNTHETIC_PRIVATE");
    expect(chunk.bytes).toBeLessThanOrEqual(1048576);
    const late = await f.capture.emit(f.scope, "context.prepared", { secret: "LATE_PRIVATE" }, {}, { required: true });
    await expect(inspection.event(f.scope.runId, p, snap.id, late!.id)).rejects.toThrow("EVIDENCE_EVENT_UNAVAILABLE");
    const metrics = new MetricRepository(inspection, f.capture, p);
    await metrics.compute(snap, ["calls.v1"], {
      start: f.now().toISOString(),
      end: new Date(f.now().getTime() + 1).toISOString(),
    });
    expect((await metrics.latest(f.scope.runId))[0].metrics.values[0].value).toBe(0);
    await f.store.consent(f.group.id, false);
    await expect(metrics.latest(f.scope.runId)).rejects.toThrow("EVIDENCE_WITHHELD");
    await expect(inspection.artifactChunk(f.scope.runId, p, snap.id, found.artifacts[0].id, 0)).rejects.toThrow(
      "EVIDENCE_WITHHELD",
    );
  } finally {
    await f.close();
  }
});
