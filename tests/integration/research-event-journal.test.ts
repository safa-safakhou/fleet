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
