import { expect, test } from "vitest";
import { memoryFixture } from "../fixtures/research/memory.js";

test("scope_and_truth_class_survive_projection with explicit index permission", async () => {
  const f = await memoryFixture();
  try {
    const source = await f.source("peer-statement");
    const input = {
      kind: "episode" as const,
      sourceClass: "peer-statement" as const,
      text: "The peer promised wood",
      sourceRefs: [source],
      observedAt: f.now().toISOString(),
      privacy: "private" as const,
    };
    const ref = await f.memory.capture(f.scope, input);
    expect((await f.memory.get(f.scope, [ref.id]))[0]).toMatchObject({
      sourceClass: "peer-statement",
      version: "1",
      text: input.text,
    });
    await expect(f.memory.capture(f.scope, { ...input, indexPolicyId: "fixture-index" })).rejects.toThrow(
      "INDEX_PERMISSION_REQUIRED",
    );
    await f.memory.indexPolicy.grant(f.scope, "fixture-index");
    await f.memory.index(ref.id, f.scope, "fixture-index");
    await expect(f.memory.revise(f.scope, ref.id, "0", { text: "changed" })).rejects.toThrow("MEMORY_VERSION_CONFLICT");
    await expect(
      f.memory.revise(f.scope, ref.id, "1", { sourceClass: "confirmed-outcome" } as never),
    ).rejects.toThrow();
    const revised = await f.memory.revise(f.scope, ref.id, "1", {
      text: "The peer promised wood; receipt remains absent",
    });
    expect(revised.version).toBe("2");
    const direct = await f.pool.connect();
    try {
      await direct.query("BEGIN");
      await direct.query("SET LOCAL ROLE fleet_research_index");
      await direct.query("SELECT set_config('fleet.research.ticket','forged',true)");
      expect((await direct.query("SELECT count(*)::int n FROM research_memory_projections")).rows[0].n).toBe(0);
      await direct.query("ROLLBACK");
    } finally {
      direct.release();
    }
    await f.store.consent(f.group.id, false);
    expect(await f.memory.get(f.scope, [ref.id])).toEqual([]);
    expect((await f.pool.query("SELECT count(*)::int n FROM research_memory_projections")).rows[0].n).toBe(0);
  } finally {
    await f.close();
  }
});

test("peer speech, inference, command admission and observed completion stay distinct", async () => {
  const f = await memoryFixture(false);
  try {
    const peer = await f.source("peer-statement"),
      admitted = await f.source("command-admitted"),
      completed = await f.source("confirmed-outcome");
    const base = { text: "same text", observedAt: f.now().toISOString(), privacy: "private" as const };
    const belief = await f.memory.capture(f.scope, {
      ...base,
      kind: "belief",
      sourceClass: "inference",
      sourceRefs: [peer],
    });
    const admission = await f.memory.capture(f.scope, {
      ...base,
      kind: "episode",
      sourceClass: "command-admitted",
      sourceRefs: [admitted],
    });
    const completion = await f.memory.capture(f.scope, {
      ...base,
      kind: "episode",
      sourceClass: "confirmed-outcome",
      sourceRefs: [completed],
    });
    await expect(
      f.memory.capture(f.scope, { ...base, kind: "episode", sourceClass: "confirmed-outcome", sourceRefs: [peer] }),
    ).rejects.toThrow("MEMORY_TRUTH_CLASS_CONFLICT");
    expect(
      (await f.memory.get(f.scope, [belief.id, admission.id, completion.id])).map((r) => r.sourceClass).sort(),
    ).toEqual(["command-admitted", "confirmed-outcome", "inference"]);
    await f.pool.query("UPDATE research_artifacts SET expires_at=$2 WHERE id=$1", [
      peer,
      new Date(f.now().getTime() - 1),
    ]);
    expect(await f.memory.get(f.scope, [belief.id])).toEqual([]);
    await f.capture.artifacts.expire(f.now());
    expect((await f.pool.query("SELECT 1 FROM research_memories WHERE id=$1", [belief.id])).rowCount).toBe(0);
  } finally {
    await f.close();
  }
});

test("actor/world scopes and pooled SQL transactions cannot share private candidates", async () => {
  const f = await memoryFixture();
  try {
    const source = await f.source("observation"),
      ref = await f.memory.capture(f.scope, {
        kind: "episode",
        sourceClass: "observation",
        text: "same private text",
        sourceRefs: [source],
        observedAt: f.now().toISOString(),
        privacy: "private",
      });
    await f.memory.indexPolicy.grant(f.scope, "fixture-index");
    await f.memory.index(ref.id, f.scope, "fixture-index");
    expect(
      await f.memory.indexPolicy.restricted(
        f.scope,
        "fixture-index",
        async (db) => (await db.query("SELECT count(*)::int n FROM research_memory_projections")).rows[0].n,
      ),
    ).toBe(1);
    await f.enqueue(f.group.bindings[1], "other", "source:other");
    const claim = await f.claimTask();
    const { manifestInput, capability } = await import("../fixtures/research/manifest.js"),
      { compileManifest } = await import("../../src/research/manifests/compiler.js"),
      { ManifestRepository } = await import("../../src/research/manifests/repository.js");
    const input = manifestInput();
    input.profile = claim.profile;
    input.environment.bindingId = claim.bindingId;
    input.environment.worldIncarnation = "other-world";
    const m = compileManifest(input, {
      ...capability,
      environment: { ...capability.environment, worldIncarnation: "other-world" },
    });
    await new ManifestRepository(f.pool).save(m.manifest);
    const other = await f.memory.journal.open(claim, "other-run", "other-op", m.digest);
    expect(await f.memory.get(other, [ref.id])).toEqual([]);
    await f.memory.indexPolicy.revoke(f.scope, "fixture-index");
    await expect(
      f.memory.indexPolicy.restricted(f.scope, "fixture-index", (db) =>
        db.query("SELECT memory_id FROM research_memory_projections"),
      ),
    ).rejects.toThrow("INDEX_PERMISSION_REQUIRED");
    const db = await f.pool.connect();
    try {
      await db.query("BEGIN");
      await db.query("SET LOCAL ROLE fleet_research_index");
      expect((await db.query("SELECT count(*)::int n FROM research_memory_projections")).rows[0].n).toBe(0);
      await expect(db.query("SELECT value_cipher FROM research_memory_versions")).rejects.toThrow("permission denied");
      await db.query("ROLLBACK");
    } finally {
      db.release();
    }
  } finally {
    await f.close();
  }
});

test("native cognition adapters preserve speech and receipt meaning without re-dating old sources", async () => {
  const f = await memoryFixture(false);
  try {
    const { NativeMemoryAdapters } = await import("../../src/research/memory/adapters.js"),
      adapters = new NativeMemoryAdapters(f.memory);
    const speech = await adapters.episode(f.scope, {
      id: "native:message",
      at: f.now().toISOString(),
      kind: "message",
      detail: { direction: "incoming", body: "I promise wood" },
    });
    const receipt = await adapters.episode(f.scope, {
      id: "native:receipt",
      at: f.now().toISOString(),
      kind: "receipt",
      detail: { receipt: { code: "COMMITTED" }, action: { kind: "queue_build" } },
    });
    expect((await f.memory.get(f.scope, [speech.id, receipt.id])).map((r) => r.sourceClass).sort()).toEqual([
      "command-admitted",
      "peer-statement",
    ]);
    await expect(
      adapters.episode(f.scope, {
        id: "native:expired",
        at: new Date(f.now().getTime() - 31 * 86400000).toISOString(),
        kind: "observation",
        detail: {},
      }),
    ).rejects.toThrow("MEMORY_SOURCE_UNAVAILABLE");
  } finally {
    await f.close();
  }
});
