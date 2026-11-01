import { expect, test } from "vitest";
import { transaction } from "../../src/db.js";
import { StepJournal } from "../../src/research/broker/steps.js";
import { EvidenceRecorder } from "../../src/research/evidence/recorder.js";
import { EvidenceRepository, scopeForTurn } from "../../src/research/evidence/repository.js";
import { compileManifest } from "../../src/research/manifests/compiler.js";
import { ManifestRepository } from "../../src/research/manifests/repository.js";
import { capability, manifestInput } from "../fixtures/research/manifest.js";
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

test("reused bound-scope plans reject a changed native task claim", async () => {
  const f = await researchFixture();
  try {
    const input = manifestInput();
    input.environment.bindingId = f.claim.bindingId;
    input.profile = f.claim.profile;
    const manifest = compileManifest(input, capability);
    await new ManifestRepository(f.pool).save(manifest.manifest);
    const scope = await new StepJournal(f.store, f.tasks).open(
      f.claim,
      "native-recording-run",
      "native-recording-op",
      manifest.digest,
    );
    const repository = new EvidenceRepository(f.store);
    for (let i = 0; i < 8; i++) await transaction(f.pool, (db) => repository.bind(scope, db));
    await f.pool.query("UPDATE platform_task_claims SET fence=fence+1 WHERE turn_id=$1", [scope.turnId]);
    await expect(transaction(f.pool, (db) => repository.bind(scope, db))).rejects.toThrow("EVIDENCE_SCOPE_MISMATCH");
  } finally {
    await f.pool.end();
  }
});

test("a complete recorded call uses at most 24 database requests with every event and artifact retained", async () => {
  const f = await researchFixture();
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { CaptureSession } = await import("../../src/research/evidence/boundaries.js");
  const { ArtifactFilesystem } = await import("../../src/research/evidence/filesystem.js");
  const root = await mkdtemp(join(tmpdir(), "fleet-recording-budget-"));
  try {
    const scope = await scopeForTurn(f.store, f.claim.turn.id);
    await transaction(f.pool, (db) => new EvidenceRepository(f.store).bind(scope, db));
    const client = await f.pool.connect(),
      query = client.query.bind(client);
    let requests = 0,
      calls = 0;
    client.query = ((...args: unknown[]) => {
      requests++;

      return (query as (...args: unknown[]) => unknown)(...args);
    }) as typeof client.query;
    client.release();
    const capture = new CaptureSession(f.store, new ArtifactFilesystem(root));
    try {
      const result = await capture.withScope(scope, () =>
        capture.model(f.claim.turn, f.request(), {
          decide: async () => {
            calls++;
            return { decision: { kind: "wait" }, inputTokens: 7, outputTokens: 8 };
          },
        }),
      );
      expect(result.inputTokens).toBe(7);
      expect(calls).toBe(1);
      expect(requests).toBeLessThanOrEqual(24);
    } finally {
      client.query = query;
    }
    const page = await new EvidenceRepository(f.store).page(scope, {});
    expect(page.events.map((x) => x.kind)).toEqual([
      "run.started",
      "queue.leave",
      "model.request",
      "model.dispatched",
      "model.response",
    ]);
    expect(
      (await f.pool.query("SELECT count(*)::int n FROM research_artifacts WHERE run_id=$1", [scope.runId])).rows[0].n,
    ).toBe(2);
  } finally {
    await f.pool.end();
    await rm(root, { recursive: true, force: true });
  }
});

test("one parent and one completed copy do not scan unrelated retained history", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { CaptureSession } = await import("../../src/research/evidence/boundaries.js");
  const { ArtifactFilesystem } = await import("../../src/research/evidence/filesystem.js");
  const f = await researchFixture(),
    root = await mkdtemp(join(tmpdir(), "fleet-bounded-history-"));
  try {
    const scope = await scopeForTurn(f.store, f.claim.turn.id);
    const capture = new CaptureSession(f.store, new ArtifactFilesystem(root));
    const parent = await capture.emit(scope, "model.request", { text: "synthetic" }, {}, { required: true });
    expect(parent).toBeDefined();
    await f.pool.query(
      "INSERT INTO research_runs(run_id,agent_id,cohort_id,binding_id,manifest_digest,provenance,created_at,expires_at) SELECT 'unrelated-history',agent_id,cohort_id,binding_id,manifest_digest,provenance,created_at,expires_at FROM research_runs WHERE run_id=$1",
      [scope.runId],
    );
    await f.pool.query(
      "INSERT INTO research_events(id,run_id,stream_id,sequence,ordinal,producer_key,input_digest,event) SELECT gen_random_uuid(),'unrelated-history','history',n,n,n::text,repeat('a',64),'{}'::jsonb FROM generate_series(1,5000) n",
    );
    await f.pool.query(
      "INSERT INTO research_artifacts(id,run_id,scope,consent_version,content_type,privacy_class,retention_class,status,reserved_bytes,bytes,disk_bytes,chunks,inline_cipher,ciphertext_digest,created_at,expires_at,expected_bytes) SELECT gen_random_uuid(),'unrelated-history',scope||'{\"runId\":\"unrelated-history\"}'::jsonb,consent_version,content_type,privacy_class,retention_class,status,reserved_bytes,bytes,disk_bytes,chunks,inline_cipher,ciphertext_digest,created_at,expires_at,expected_bytes FROM research_artifacts CROSS JOIN generate_series(1,5000) WHERE run_id=$1",
      [scope.runId],
    );
    await f.pool.query("ANALYZE research_events,research_artifacts");
    await transaction(f.pool, async (db) => {
      await capture.artifacts.flushCopies(db);
      await new EvidenceRecorder(f.store).append(
        scope,
        { kind: "model.dispatched", streamId: "model", producerKey: "bounded-history", parentIds: [parent!.id] },
        db,
      );
      const scans = (
        await db.query(
          "SELECT relname,seq_tup_read FROM pg_stat_xact_user_tables WHERE relname IN ('research_events','research_artifacts')",
        )
      ).rows;
      expect(Object.fromEntries(scans.map((x) => [x.relname, Number(x.seq_tup_read)]))).toEqual({
        research_events: expect.any(Number),
        research_artifacts: expect.any(Number),
      });
      for (const row of scans) expect(Number(row.seq_tup_read), row.relname).toBeLessThanOrEqual(20);
    });
    const page = await new EvidenceRepository(f.store).page(scope, {});
    expect(page.events.at(-1)?.parentIds).toEqual([parent!.id]);
    expect(
      (await f.pool.query("SELECT inline_cipher FROM research_artifacts WHERE run_id=$1", [scope.runId])).rows[0]
        .inline_cipher,
    ).toBeNull();
  } finally {
    await f.pool.end();
    await rm(root, { recursive: true, force: true });
  }
});
