import { afterEach, expect, test } from "vitest";
import { transaction } from "../../src/db.js";
import { CoverageService } from "../../src/research/evidence/coverage.js";
import { EvidenceRecorder } from "../../src/research/evidence/recorder.js";
import { EvidenceRepository, scopeForTurn } from "../../src/research/evidence/repository.js";
import { researchFixture } from "../research-helpers.js";

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});
test("keeps_stream_order_and_cross_stream_causes with rollback and producer deduplication", async () => {
  const f = await researchFixture();
  close = () => f.pool.end();
  const scope = await scopeForTurn(f.store, f.claim.turn.id),
    recorder = new EvidenceRecorder(f.store),
    repo = new EvidenceRepository(f.store);
  const input = {
    producerKey: "one",
    streamId: "left",
    kind: "observation.record" as const,
    occurredAt: "2026-10-30T12:00:00.000Z",
  };
  const a = await recorder.append(scope, input),
    b = await recorder.append(scope, {
      ...input,
      producerKey: "two",
      streamId: "right",
      occurredAt: "2026-10-30T11:59:59.000Z",
    });
  const c = await recorder.append(scope, { ...input, producerKey: "three", parentIds: [a.id, b.id] });
  expect((await recorder.append(scope, input)).id).toBe(a.id);
  await expect(recorder.append(scope, { ...input, attributes: { stage: "finished" } })).rejects.toThrow(
    "EVENT_KEY_CONFLICT",
  );
  await expect(
    transaction(f.pool, async (db) => {
      await recorder.append(scope, { ...input, producerKey: "rolled-back" }, db);
      throw Error("ROLLBACK");
    }),
  ).rejects.toThrow("ROLLBACK");
  const d = await recorder.append(scope, { ...input, producerKey: "four" });
  expect(d.sequence).toBe("3");
  const page = await repo.page(scope, {});
  expect(page.events.map((x) => x.id)).toEqual([a.id, b.id, c.id, d.id]);
  expect(page.events[2].parentIds).toEqual([a.id, b.id]);
  await expect(repo.page({ ...scope, agentId: "foreign" }, {})).rejects.toThrow("EVIDENCE_SCOPE_MISMATCH");
  const allocation = await f.store.reserveCall(f.claim.turn);
  await f.store.recordUsage(allocation, 1, 1);
  expect((await new CoverageService(f.store).reconcile(scope.runId)).status).toBe("partial");
});

test("pending legacy command remains in the coverage denominator before a receipt exists", async () => {
  const f = await researchFixture();
  close = () => f.pool.end();
  const scope = await scopeForTurn(f.store, f.claim.turn.id),
    command = "99999999-9999-4999-8999-999999999999";
  await new EvidenceRecorder(f.store).append(scope, {
    kind: "run.started",
    producerKey: "pending-start",
    streamId: "run",
  });
  await f.pool.query("UPDATE turns SET pending_command=$2,pending_action='{}'::jsonb WHERE id=$1", [
    scope.turnId,
    command,
  ]);
  expect((await new CoverageService(f.store).reconcile(scope.runId)).missing).toContainEqual({
    kind: "command.prepared",
    sourceId: command,
  });
});

test("parallel producers commit contiguous independent stream sequences", async () => {
  const f = await researchFixture();
  close = () => f.pool.end();
  const scope = await scopeForTurn(f.store, f.claim.turn.id),
    recorder = new EvidenceRecorder(f.store);
  await Promise.all(
    Array.from({ length: 30 }, (_, i) =>
      recorder.append(scope, {
        kind: "observation.record",
        producerKey: `parallel-${i}`,
        streamId: `parallel-${i % 3}`,
        occurredAt: `2026-10-30T00:00:${String(29 - i).padStart(2, "0")}.000Z`,
      }),
    ),
  );
  const page = await new EvidenceRepository(f.store).page(scope, {});
  expect(page.total).toBe(30);
  for (let i = 0; i < 3; i++)
    expect(page.events.filter((e) => e.streamId === `parallel-${i}`).map((e) => e.sequence)).toEqual(
      Array.from({ length: 10 }, (_, n) => String(n + 1)),
    );
  await recorder.append(scope, {
    kind: "observation.record",
    streamId: "late",
    producerKey: "missing-parent",
    parentIds: ["77777777-7777-4777-8777-777777777777"],
  });
  expect((await new CoverageService(f.store).reconcile(scope.runId)).missing).toContainEqual({
    kind: "causal.parent",
    sourceId: "77777777-7777-4777-8777-777777777777",
  });
});
