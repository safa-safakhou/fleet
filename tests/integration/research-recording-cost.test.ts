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
