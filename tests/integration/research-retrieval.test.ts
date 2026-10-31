import { expect, test } from "vitest";
import { RetrievalService } from "../../src/research/memory/retrieval.js";
import { memoryFixture } from "../fixtures/research/memory.js";

const embedding = {
  revision: "fixture-3@1",
  digest: "a".repeat(64),
  dimension: 3,
  normalization: "l2" as const,
};
test.each(["fts-v1", "vector-exact-v1", "rrf-v1"] as const)("rank_and_scope_are_explicit for %s", async (strategy) => {
  const f = await memoryFixture(true, { strategy, embedding });
  try {
    await f.memory.indexPolicy.grant(f.scope, "fixture-index");
    const service = new RetrievalService(f.memory),
      refs = [];
    for (const [text, vector] of [
      ["wood wood farm", [1, 0, 0]],
      ["stone castle", [0, 1, 0]],
      ["wood forest", [0.6, 0.8, 0]],
    ] as const) {
      const source = await f.source("observation", text),
        ref = await f.memory.capture(f.scope, {
          kind: "episode",
          sourceClass: "observation",
          text,
          sourceRefs: [source],
          observedAt: f.now().toISOString(),
          privacy: "private",
          indexPolicyId: "fixture-index",
        });
      refs.push(ref);
      await service.indexVector(f.scope, ref.id, [...vector], embedding);
    }
    const result = await service.search(f.scope, {
      strategy,
      text: "wood",
      language: "en",
      topK: 2,
      vector: [1, 0, 0],
    });
    expect(result.selected.map((r) => r.record.text)).toEqual(["wood wood farm", "wood forest"]);
    expect(result.candidates.length).toBe(strategy === "fts-v1" ? 2 : 3);
    expect(result.coverage.status).toBe("complete");
    await expect(
      service.search(f.scope, { strategy, text: "wood", language: "xx", topK: 2, vector: [1, 0, 0] }),
    ).rejects.toThrow("LANGUAGE_UNSUPPORTED");
    await expect(service.indexVector(f.scope, refs[0].id, [0, 0, 0], embedding)).rejects.toThrow("VECTOR_INVALID");
    await expect(
      service.indexVector(f.scope, refs[0].id, [1, 0, 0, 0], { ...embedding, dimension: 4 }),
    ).rejects.toThrow("EMBEDDING_INCOMPATIBLE");
    await f.memory.indexPolicy.revoke(f.scope, "fixture-index");
    await expect(
      service.search(f.scope, { strategy, text: "wood", language: "en", topK: 2, vector: [1, 0, 0] }),
    ).rejects.toThrow("INDEX_PERMISSION_REQUIRED");
  } finally {
    await f.close();
  }
});

test("baseline uses encrypted authorized memory without an index and FTS has a real GIN plan", async () => {
  const f = await memoryFixture(false);
  try {
    const source = await f.source("observation"),
      ref = await f.memory.capture(f.scope, {
        kind: "episode",
        sourceClass: "observation",
        text: "Wood for a farm",
        sourceRefs: [source],
        observedAt: f.now().toISOString(),
        privacy: "private",
      });
    const result = await new RetrievalService(f.memory).search(f.scope, {
      strategy: "baseline-v1",
      text: "wood",
      language: "en",
      topK: 1,
    });
    expect(result.selected.map((x) => x.record.id)).toEqual([ref.id]);
    expect((await f.pool.query("SELECT count(*)::int n FROM research_memory_projections")).rows[0].n).toBe(0);
    await expect(
      new RetrievalService(f.memory).search(f.scope, {
        strategy: "rrf-v1",
        text: "wood",
        language: "en",
        topK: 1,
        vector: [1, 0, 0],
      }),
    ).rejects.toThrow("RETRIEVAL_POLICY_MISMATCH");
  } finally {
    await f.close();
  }
  const g = await memoryFixture(true, { strategy: "fts-v1" });
  try {
    await g.memory.indexPolicy.grant(g.scope, "fixture-index");
    const source = await g.source("observation");
    await g.memory.capture(g.scope, {
      kind: "episode",
      sourceClass: "observation",
      text: "wood",
      sourceRefs: [source],
      observedAt: g.now().toISOString(),
      privacy: "private",
      indexPolicyId: "fixture-index",
    });
    const ns = (await g.memory.all(g.scope))[0].namespace,
      db = await g.pool.connect();
    let plan: unknown;
    try {
      await db.query("BEGIN");
      await db.query("SET LOCAL enable_seqscan=off");
      plan = (
        await db.query(
          "EXPLAIN(FORMAT JSON) SELECT memory_id FROM research_memory_projections WHERE namespace=$1 AND lexemes @@ plainto_tsquery('english','wood')",
          [ns],
        )
      ).rows[0]["QUERY PLAN"];
      await db.query("ROLLBACK");
    } finally {
      db.release();
    }
    expect(JSON.stringify(plan)).toContain("research_memory_fts");
    expect(
      (
        await new RetrievalService(g.memory).search(g.scope, {
          strategy: "fts-v1",
          text: "absent",
          language: "en",
          topK: 1,
        })
      ).selected,
    ).toEqual([]);
  } finally {
    await g.close();
  }
});

test("partial indexes and Unicode simple-language queries remain explicit", async () => {
  const f = await memoryFixture(true, { strategy: "fts-v1", language: "simple" });
  try {
    await f.memory.indexPolicy.grant(f.scope, "fixture-index");
    const source = await f.source("observation");
    const a = await f.memory.capture(f.scope, {
      kind: "episode",
      sourceClass: "observation",
      text: "木材",
      sourceRefs: [source],
      observedAt: f.now().toISOString(),
      privacy: "private",
      indexPolicyId: "fixture-index",
    });
    const b = await f.memory.capture(f.scope, {
      kind: "episode",
      sourceClass: "observation",
      text: "wood",
      sourceRefs: [source],
      observedAt: f.now().toISOString(),
      privacy: "private",
    });
    const result = await new RetrievalService(f.memory).search(f.scope, {
      strategy: "fts-v1",
      text: "木材",
      language: "simple",
      topK: 1,
    });
    expect(result.selected.map((x) => x.record.id)).toEqual([a.id]);
    expect(result.coverage).toEqual({ status: "partial", expected: 2, recorded: 1 });
    expect(result.omitted).toContainEqual({ id: b.id, reason: "not-indexed" });
  } finally {
    await f.close();
  }
});
