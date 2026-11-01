import { expect, test } from "vitest";
import { transaction } from "../../src/db.js";
import { EvidenceRecorder } from "../../src/research/evidence/recorder.js";
import { EvidenceRepository, scopeForTurn } from "../../src/research/evidence/repository.js";
import { researchFixture } from "../research-helpers.js";

test("bound evidence writes stay within six database requests without caching authority", async () => {
  const f = await researchFixture();
  try {
    const scope = await scopeForTurn(f.store, f.claim.turn.id);
    const repository = new EvidenceRepository(f.store);
    await transaction(f.pool, (db) => repository.bind(scope, db));
    const recorder = new EvidenceRecorder(f.store);
    await transaction(f.pool, async (db) => {
      const query = db.query.bind(db);
      let requests = 0;
      db.query = ((...args: unknown[]) => {
        requests++;
        return (query as (...args: unknown[]) => unknown)(...args);
      }) as typeof db.query;
      try {
        const result = await recorder.append(
          scope,
          { kind: "queue.leave", streamId: "queue", producerKey: "bounded" },
          db,
        );
        expect(result.sequence).toBe("1");
        expect(requests).toBeLessThanOrEqual(6);
      } finally {
        db.query = query;
      }
    });
    // Reusing the same repository must recheck the persisted binding.
    await f.pool.query("UPDATE research_runs SET binding_id=$2 WHERE run_id=$1", [scope.runId, "changed-binding"]);
    await expect(transaction(f.pool, (db) => repository.bind(scope, db))).rejects.toThrow("EVIDENCE_SCOPE_MISMATCH");
  } finally {
    await f.pool.end();
  }
});

test("journal allocation and deduplication use two requests while preserving conflict rollback", async () => {
  const f = await researchFixture();
  try {
    const scope = await scopeForTurn(f.store, f.claim.turn.id);
    await transaction(f.pool, (db) => new EvidenceRepository(f.store).bind(scope, db));
    const recorder = new EvidenceRecorder(f.store);
    const input = { kind: "queue.leave" as const, streamId: "queue", producerKey: "single-write" };
    await transaction(f.pool, async (db) => {
      const query = db.query.bind(db);
      let requests = 0;
      db.query = ((...args: unknown[]) => {
        requests++;
        return (query as (...args: unknown[]) => unknown)(...args);
      }) as typeof db.query;
      try {
        const first = await recorder.append(scope, input, db);
        expect(first.sequence).toBe("1");
        expect(requests).toBeLessThanOrEqual(2);
      } finally {
        db.query = query;
      }
    });
    const original = await recorder.append(scope, input);
    await expect(recorder.append(scope, { ...input, attributes: { stage: "finished" } })).rejects.toThrow(
      "EVENT_KEY_CONFLICT",
    );
    const next = await recorder.append(scope, { ...input, producerKey: "next", parentIds: [original.id] });
    expect(next.sequence).toBe("2");
    const page = await new EvidenceRepository(f.store).page(scope, {});
    expect(page.events.map((x) => x.ordinal)).toEqual(["1", "2"]);
    expect(page.events[1].parentIds).toEqual([original.id]);
  } finally {
    await f.pool.end();
  }
});

test("foreign parents cannot allocate journal positions, and concurrent duplicate keys consume one position", async () => {
  const f = await researchFixture();
  try {
    const scope = await scopeForTurn(f.store, f.claim.turn.id);
    const recorder = new EvidenceRecorder(f.store);
    const first = await recorder.append(scope, { kind: "queue.leave", streamId: "queue", producerKey: "first" });
    const foreignId = "12345678-0000-4000-8000-000000000001";
    await f.pool.query(
      "INSERT INTO research_runs(run_id,agent_id,cohort_id,binding_id,manifest_digest,provenance,created_at,expires_at) SELECT 'foreign-parent-run',agent_id,cohort_id,binding_id,manifest_digest,provenance,created_at,expires_at FROM research_runs WHERE run_id=$1",
      [scope.runId],
    );
    await f.pool.query(
      "INSERT INTO research_events(id,run_id,stream_id,sequence,ordinal,producer_key,input_digest,event) VALUES($1,'foreign-parent-run','other',1,1,'foreign',$2,'{}')",
      [foreignId, "a".repeat(64)],
    );
    await expect(
      recorder.append(scope, { kind: "queue.leave", streamId: "queue", producerKey: "denied", parentIds: [foreignId] }),
    ).rejects.toThrow("EVIDENCE_PARENT_SCOPE");
    const input = { kind: "queue.leave" as const, streamId: "queue", producerKey: "duplicate", parentIds: [first.id] };
    const results = await Promise.all(Array.from({ length: 8 }, () => recorder.append(scope, input)));
    expect(new Set(results.map((x) => x.id)).size).toBe(1);
    expect(results.map((x) => x.sequence)).toEqual(Array(8).fill("2"));
    const page = await new EvidenceRepository(f.store).page(scope, {});
    expect(page.events.map((x) => x.ordinal)).toEqual(["1", "2"]);
    expect(page.events[1].parentIds).toEqual([first.id]);
  } finally {
    await f.pool.end();
  }
});
