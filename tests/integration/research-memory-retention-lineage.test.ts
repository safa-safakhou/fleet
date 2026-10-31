import { expect, test } from "vitest";
import { ContextAssembler } from "../../src/research/context/assembler.js";
import { memoryFixture } from "../fixtures/research/memory.js";

test("copied memory and context artifacts inherit source expiry and revocation", async () => {
  const f = await memoryFixture(false, { contextPolicy: "source-complete@1" });
  try {
    const source = await f.source("observation", "Private aging fact");
    const expiresAt = new Date(f.now().getTime() + 60000).toISOString();
    await f.pool.query("UPDATE research_artifacts SET expires_at=$2 WHERE id=$1", [source, expiresAt]);
    await f.memory.capture(f.scope, {
      kind: "episode",
      sourceClass: "observation",
      text: "Private aging fact",
      sourceRefs: [source],
      observedAt: f.now().toISOString(),
      privacy: "private",
    });
    const memoryEvent = (await f.pool.query("SELECT event FROM research_events WHERE event->>'kind'='memory.write'"))
      .rows[0].event;
    const packet = await new ContextAssembler(
      {
        resolve: async () => ({
          id: "fact",
          slot: "observation",
          sourceClass: "observation",
          text: "Private aging fact",
          sourceRefs: [source],
          observedAt: f.now().toISOString(),
          expiresAt,
        }),
      },
      f.capture,
    ).build(f.scope, {
      refs: [{ id: "fact", mandatory: true }],
      schema: {},
      maxBytes: 5000,
      maxTokens: 2000,
      maxOutputTokens: 100,
      maxObservationAgeMs: 60000,
      now: f.now().toISOString(),
    });
    const { WorkerCheckpoints } = await import("../../src/research/broker/checkpoints.js");
    const key = { operationId: f.scope.operationId, operationEpoch: f.scope.operationEpoch, logicalStepId: "port:1" };
    await f.memory.journal.begin(f.scope, key, "a".repeat(64), "port");
    const resultRef = { id: packet.lineage.artifact!.id, kind: "context/v1" };
    await f.memory.journal.complete(f.scope, key, { status: "completed", usage: null, resultRef });
    const checkpoints = new WorkerCheckpoints(f.store, f.memory.journal, f.capture);
    const checkpoint = await checkpoints.save(f.scope, "0", {
      workerVersion: f.manifest.components.worker,
      policyVersion: f.manifest.components.worker,
      steps: [{ logicalStepId: key.logicalStepId, operationEpoch: key.operationEpoch, resultRef }],
      sourceRefs: [source],
      state: { copy: "Private aging fact" },
    });
    const checkpointRef = (
      await f.pool.query("SELECT state_ref FROM research_worker_checkpoints WHERE id=$1", [checkpoint.id])
    ).rows[0].state_ref;
    const refs = [memoryEvent.artifacts[0], packet.lineage.artifact!, checkpointRef];
    for (const ref of refs)
      expect(
        new Date(
          (await f.pool.query("SELECT expires_at FROM research_artifacts WHERE id=$1", [ref.id])).rows[0].expires_at,
        ).toISOString(),
      ).toBe(expiresAt);
    await f.pool.query("UPDATE research_artifacts SET status='expired' WHERE id=$1", [source]);
    for (const ref of refs) {
      const row = (await f.pool.query("SELECT status,inline_cipher FROM research_artifacts WHERE id=$1", [ref.id]))
        .rows[0];
      expect(row).toEqual({ status: "expired", inline_cipher: null });
      await expect(
        (async () => {
          for await (const _ of f.capture.artifacts.read(f.scope, ref)) {
            /* must deny */
          }
        })(),
      ).rejects.toThrow("ARTIFACT_EXPIRED");
    }
    await expect(checkpoints.load(f.scope)).rejects.toThrow("ARTIFACT_EXPIRED");
    await f.capture.expire();
    expect(
      (
        await f.pool.query("SELECT count(*)::int n FROM research_artifacts WHERE id=ANY($1::uuid[]) AND NOT purged", [
          refs.map((r) => r.id),
        ])
      ).rows[0].n,
    ).toBe(0);
  } finally {
    await f.close();
  }
});

test("expired source at capture leaves no orphan private copy", async () => {
  const f = await memoryFixture(false);
  try {
    const source = await f.source("observation", "Private original");
    await f.pool.query("UPDATE research_artifacts SET status='expired' WHERE id=$1", [source]);
    const before = (await f.pool.query("SELECT count(*)::int n FROM research_artifacts")).rows[0].n;
    await expect(
      f.capture.emit(
        f.scope,
        "context.prepared",
        { text: "Private copy must roll back" },
        {},
        { required: true, sourceRefs: [source] },
      ),
    ).rejects.toThrow("EVIDENCE_UNAVAILABLE");
    expect((await f.pool.query("SELECT count(*)::int n FROM research_artifacts")).rows[0].n).toBe(before);
  } finally {
    await f.close();
  }
});
