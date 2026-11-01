import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { CaptureSession } from "../../src/research/evidence/boundaries.js";
import { ArtifactFilesystem } from "../../src/research/evidence/filesystem.js";
import { scopeForTurn } from "../../src/research/evidence/repository.js";
import { researchFixture } from "../research-helpers.js";

test("a rejected capture event leaves no extra private artifact or quota reservation", async () => {
  const f = await researchFixture();
  const root = await mkdtemp(join(tmpdir(), "fleet-capture-atomicity-"));
  try {
    const capture = new CaptureSession(f.store, new ArtifactFilesystem(root));
    const scope = await scopeForTurn(f.store, f.claim.turn.id);
    await capture.emit(
      scope,
      "model.request",
      { text: "first synthetic body" },
      {},
      { producerKey: "same", required: true },
    );
    const before = (
      await f.pool.query(
        "SELECT artifact_reserved_bytes::text bytes,(SELECT count(*)::int FROM research_artifacts WHERE run_id=$1) artifacts FROM research_runs WHERE run_id=$1",
        [scope.runId],
      )
    ).rows[0];
    await expect(
      capture.emit(
        scope,
        "model.request",
        { text: "conflicting synthetic body" },
        {},
        { producerKey: "same", required: true },
      ),
    ).rejects.toThrow("EVIDENCE_UNAVAILABLE");
    const after = (
      await f.pool.query(
        "SELECT artifact_reserved_bytes::text bytes,(SELECT count(*)::int FROM research_artifacts WHERE run_id=$1) artifacts FROM research_runs WHERE run_id=$1",
        [scope.runId],
      )
    ).rows[0];
    expect(after).toEqual(before);
    expect(await capture.artifacts.files.list()).toHaveLength(0);
    expect(
      (
        await f.pool.query(
          "SELECT count(*)::int n FROM research_events WHERE run_id=$1 AND event->>'kind'='model.request'",
          [scope.runId],
        )
      ).rows[0].n,
    ).toBe(1);
  } finally {
    await f.pool.end();
    await rm(root, { recursive: true, force: true });
  }
});

test("an initial encoding failure remains fenced after recreating the capture session", async () => {
  const f = await researchFixture();
  const root = await mkdtemp(join(tmpdir(), "fleet-capture-first-gap-"));
  try {
    const scope = await scopeForTurn(f.store, f.claim.turn.id);
    const capture = new CaptureSession(f.store, new ArtifactFilesystem(root));
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    await expect(capture.emit(scope, "model.request", circular, {}, { required: true })).rejects.toThrow(
      "EVIDENCE_UNAVAILABLE",
    );
    expect(
      (await f.pool.query("SELECT capture_failed FROM research_runs WHERE run_id=$1", [scope.runId])).rows[0]
        ?.capture_failed,
    ).toBe(true);
    const restarted = new CaptureSession(f.store, new ArtifactFilesystem(root));
    await expect(restarted.preflight(scope)).rejects.toThrow("EVIDENCE_UNAVAILABLE");
  } finally {
    await f.pool.end();
    await rm(root, { recursive: true, force: true });
  }
});

test("inspection readiness refuses a schema missing the recording operation", async () => {
  const f = await researchFixture();
  const { packageReadiness } = await import("../../src/research/qualification/readiness.js");
  const { readFile } = await import("node:fs/promises");
  try {
    expect((await packageReadiness(f.pool, f.store.vault, undefined, false)).reasons).not.toContain(
      "RESEARCH_SCHEMA_UNAVAILABLE",
    );
    await f.pool.query(
      "DROP FUNCTION research_capture_write(jsonb,jsonb,jsonb,jsonb,text,bigint,timestamptz,jsonb,jsonb)",
    );
    expect((await packageReadiness(f.pool, f.store.vault, undefined, false)).reasons).toContain(
      "RESEARCH_SCHEMA_UNAVAILABLE",
    );
  } finally {
    await f.pool.query(await readFile("migrations/054_research_recording_operations.sql", "utf8"));
    await f.pool.end();
  }
});

test("consent lost during standalone file publication blocks provider dispatch", async () => {
  const f = await researchFixture();
  const root = await mkdtemp(join(tmpdir(), "fleet-publication-consent-"));
  try {
    const scope = await scopeForTurn(f.store, f.claim.turn.id);
    const files = new ArtifactFilesystem(root),
      write = files.writeChunk.bind(files);
    let calls = 0;
    files.writeChunk = async (...args) => {
      await write(...args);
      await f.pool.query(
        "UPDATE cohorts SET observation_consent=false,observation_consent_version=observation_consent_version+1 WHERE id=$1",
        [f.group.id],
      );
    };
    const capture = new CaptureSession(f.store, files);
    await expect(
      capture.withScope(scope, () =>
        capture.model(
          f.claim.turn,
          { ...f.request(), messages: [{ role: "user", content: "x".repeat(65536) }] },
          {
            decide: async () => {
              calls++;
              return { decision: { kind: "wait" }, inputTokens: 7, outputTokens: 8 };
            },
          },
        ),
      ),
    ).rejects.toThrow("EVIDENCE_UNAVAILABLE");
    expect(calls).toBe(0);
    expect(
      (
        await f.pool.query(
          "SELECT count(*)::int n FROM research_events WHERE run_id=$1 AND event->>'kind'='model.dispatched'",
          [scope.runId],
        )
      ).rows[0].n,
    ).toBe(0);
    expect(
      (await f.pool.query("SELECT capture_failed FROM research_runs WHERE run_id=$1", [scope.runId])).rows[0]
        .capture_failed,
    ).toBe(true);
    const ids = await files.list();
    expect(ids.length).toBe(0);
  } finally {
    await f.pool.end();
    await rm(root, { recursive: true, force: true });
  }
});

test("cipher-copy acknowledgments preserve readable evidence and never cache consent", async () => {
  const f = await researchFixture(),
    root = await mkdtemp(join(tmpdir(), "fleet-copy-ack-"));
  try {
    const scope = await scopeForTurn(f.store, f.claim.turn.id),
      capture = new CaptureSession(f.store, new ArtifactFilesystem(root));
    const input = {
      model: { route: "ollama" as const, model: "fake" },
      messages: [{ role: "user", content: "bounded synthetic publication" }],
      schema: { type: "object" },
      maxOutputTokens: 100,
      signal: new AbortController().signal,
    };
    await capture.withScope(scope, () =>
      capture.model(f.claim.turn, input, {
        decide: async () => ({ decision: { kind: "wait" }, inputTokens: 7, outputTokens: 8 }),
      }),
    );
    const { EvidenceRepository } = await import("../../src/research/evidence/repository.js");
    const request = (await new EvidenceRepository(f.store).page(scope, {})).events.find(
      (e) => e.kind === "model.request",
    )!;
    const read = async (ref: (typeof request.artifacts)[0]) => {
      const parts = [];
      for await (const b of capture.artifacts.read(scope, ref)) parts.push(b);
      return JSON.parse(Buffer.concat(parts).toString());
    };
    expect((await read(request.artifacts[0])).messages).toEqual([
      { role: "user", content: "bounded synthetic publication" },
    ]);
    await capture.flush();
    expect((await read(request.artifacts[0])).messages).toEqual([
      { role: "user", content: "bounded synthetic publication" },
    ]);
    expect(
      (
        await f.pool.query(
          "SELECT count(*)::int n FROM research_artifacts WHERE run_id=$1 AND storage_backend='filesystem' AND inline_cipher IS NOT NULL",
          [scope.runId],
        )
      ).rows[0].n,
    ).toBe(0);
    const extra = await capture.emit(
      scope,
      "observation.record",
      { text: "late synthetic evidence" },
      {},
      { required: true },
    );
    const event = (await new EvidenceRepository(f.store).page(scope, {})).events.find((e) => e.id === extra!.id)!;
    await f.pool.query(
      "UPDATE cohorts SET observation_consent=false,observation_consent_version=observation_consent_version+1 WHERE id=$1",
      [f.group.id],
    );
    await expect(read(event.artifacts[0])).rejects.toThrow("ARTIFACT_WITHHELD");
    await capture.flush();
    await expect(read(event.artifacts[0])).rejects.toThrow("ARTIFACT_WITHHELD");
  } finally {
    await f.pool.end();
    await rm(root, { recursive: true, force: true });
  }
});

test("an unencodable model request preserves queue metadata and blocks dispatch across restart", async () => {
  const f = await researchFixture();
  const root = await mkdtemp(join(tmpdir(), "fleet-request-queue-failure-"));
  try {
    const scope = await scopeForTurn(f.store, f.claim.turn.id);
    const capture = new CaptureSession(f.store, new ArtifactFilesystem(root));
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    let calls = 0;
    await expect(
      capture.withScope(scope, () =>
        capture.model(
          { id: f.claim.turn.id, agentId: scope.agentId, cohortId: f.claim.turn.cohortId },
          {
            model: { route: "ollama", model: "fake" },
            messages: [{ role: "user", content: "synthetic" }],
            schema: circular,
            maxOutputTokens: 10,
            signal: new AbortController().signal,
          },
          {
            decide: async () => {
              calls++;
              return { decision: { kind: "wait" }, inputTokens: 1, outputTokens: 1 };
            },
          },
        ),
      ),
    ).rejects.toThrow("EVIDENCE_UNAVAILABLE");
    expect(calls).toBe(0);
    const { EvidenceRepository } = await import("../../src/research/evidence/repository.js");
    const events = (await new EvidenceRepository(f.store).page(scope, {})).events;
    expect(events.map((e) => e.kind)).toEqual(["run.started", "queue.leave"]);
    expect(
      (await f.pool.query("SELECT count(*)::int n FROM research_artifacts WHERE run_id=$1", [scope.runId])).rows[0].n,
    ).toBe(0);
    await expect(new CaptureSession(f.store, new ArtifactFilesystem(root)).preflight(scope)).rejects.toThrow(
      "EVIDENCE_UNAVAILABLE",
    );
  } finally {
    await f.pool.end();
    await rm(root, { recursive: true, force: true });
  }
});

test("a lost capture commit acknowledgment preserves encrypted files without retrying the model", async () => {
  const f = await researchFixture();
  const root = await mkdtemp(join(tmpdir(), "fleet-ambiguous-capture-"));
  const query = f.pool.query.bind(f.pool);
  try {
    const scope = await scopeForTurn(f.store, f.claim.turn.id);
    let lost = false,
      calls = 0;
    f.pool.query = (async (...args: any[]) => {
      const result = await (query as (...args: any[]) => Promise<any>)(...args);
      if (!lost && /SELECT research_capture_(write|dispatch)\(/.test(String(args[0]))) {
        lost = true;
        throw new Error("synthetic lost commit acknowledgment");
      }
      return result;
    }) as typeof f.pool.query;
    const capture = new CaptureSession(f.store, new ArtifactFilesystem(root));
    await expect(
      capture.withScope(scope, () =>
        capture.model(f.claim.turn, f.request(), {
          decide: async () => {
            calls++;
            return { decision: { kind: "wait" }, inputTokens: 1, outputTokens: 1 };
          },
        }),
      ),
    ).rejects.toThrow("EVIDENCE_UNAVAILABLE");
    expect(lost).toBe(true);
    expect(calls).toBe(0);
    const { EvidenceRepository } = await import("../../src/research/evidence/repository.js");
    const events = (await new EvidenceRepository(f.store).page(scope, {})).events;
    expect(events.filter((e) => e.kind === "model.request")).toHaveLength(1);
    expect(events.filter((e) => e.kind === "queue.leave")).toHaveLength(1);
    const request = events.find((e) => e.kind === "model.request")!;
    const chunks = [];
    for await (const chunk of capture.artifacts.read(scope, request.artifacts[0])) chunks.push(chunk);
    expect(Buffer.concat(chunks).length).toBeGreaterThan(0);
    await expect(new CaptureSession(f.store, new ArtifactFilesystem(root)).preflight(scope)).rejects.toThrow(
      "EVIDENCE_UNAVAILABLE",
    );
  } finally {
    f.pool.query = query;
    await f.pool.end();
    await rm(root, { recursive: true, force: true });
  }
});

test("copy acknowledgment skips a locked artifact and leaves restart reconciliation intact", async () => {
  const f = await researchFixture(),
    root = await mkdtemp(join(tmpdir(), "fleet-locked-copy-"));
  const locker = await f.pool.connect();
  try {
    const scope = await scopeForTurn(f.store, f.claim.turn.id);
    const capture = new CaptureSession(f.store, new ArtifactFilesystem(root));
    const event = await capture.emit(
      scope,
      "model.request",
      { text: "synthetic locked copy".repeat(4096) },
      {},
      { required: true },
    );
    const id = (await f.pool.query("SELECT id FROM research_artifacts WHERE run_id=$1", [scope.runId])).rows[0].id;
    await locker.query("BEGIN");
    await locker.query("SELECT 1 FROM research_artifacts WHERE id=$1 FOR UPDATE", [id]);
    const { transaction } = await import("../../src/db.js");
    await transaction(f.pool, async (db) => {
      await db.query("SET LOCAL lock_timeout='100ms'");
      await capture.artifacts.flushCopies(db);
      expect(
        (await db.query("SELECT inline_cipher IS NOT NULL pending FROM research_artifacts WHERE id=$1", [id])).rows[0]
          .pending,
      ).toBe(true);
    });
    await locker.query("COMMIT");
    const restarted = new CaptureSession(f.store, new ArtifactFilesystem(root));
    await restarted.preflight(scope);
    expect(
      (await f.pool.query("SELECT inline_cipher FROM research_artifacts WHERE id=$1", [id])).rows[0].inline_cipher,
    ).toBeNull();
    const { EvidenceRepository } = await import("../../src/research/evidence/repository.js");
    const stored = (await new EvidenceRepository(f.store).page(scope, {})).events.find((x) => x.id === event!.id)!;
    const chunks = [];
    for await (const chunk of restarted.artifacts.read(scope, stored.artifacts[0])) chunks.push(chunk);
    expect(JSON.parse(Buffer.concat(chunks).toString())).toEqual({ text: "synthetic locked copy".repeat(4096) });
  } finally {
    await locker.query("ROLLBACK").catch(() => {});
    locker.release();
    await f.pool.end();
    await rm(root, { recursive: true, force: true });
  }
});

test("inspection readiness refuses a missing indexed parent lookup", async () => {
  const f = await researchFixture();
  const { packageReadiness } = await import("../../src/research/qualification/readiness.js");
  const { readFile } = await import("node:fs/promises");
  try {
    expect((await packageReadiness(f.pool, f.store.vault, undefined, false)).reasons).not.toContain(
      "RESEARCH_SCHEMA_UNAVAILABLE",
    );
    await f.pool.query("DROP FUNCTION research_parent_run(uuid)");
    expect((await packageReadiness(f.pool, f.store.vault, undefined, false)).reasons).toContain(
      "RESEARCH_SCHEMA_UNAVAILABLE",
    );
  } finally {
    await f.pool.query(await readFile("migrations/055_research_indexed_lookups.sql", "utf8"));
    await f.pool.end();
  }
});

test("small canonical bodies survive flush and restart without filesystem publication", async () => {
  const f = await researchFixture(),
    root = await mkdtemp(join(tmpdir(), "fleet-canonical-tier-"));
  try {
    const scope = await scopeForTurn(f.store, f.claim.turn.id),
      files = new ArtifactFilesystem(root);
    files.writeChunk = async () => {
      throw Error("filesystem must not be required for a SQL artifact");
    };
    const capture = new CaptureSession(f.store, files);
    await capture.emit(scope, "model.request", { text: "canonical synthetic body" }, {}, { required: true });
    const { EvidenceRepository } = await import("../../src/research/evidence/repository.js");
    const ref = (await new EvidenceRepository(f.store).page(scope, {})).events.find((e) => e.kind === "model.request")!
      .artifacts[0];
    await f.pool.query("SELECT research_acknowledge_copies($1::jsonb)", [
      JSON.stringify([{ id: ref.id, digest: ref.ciphertextDigest }]),
    ]);
    await capture.flush();
    const restarted = new CaptureSession(f.store, files);
    await restarted.preflight(scope);
    expect(
      (
        await f.pool.query(
          "SELECT storage_backend,inline_cipher IS NOT NULL retained FROM research_artifacts WHERE id=$1",
          [ref.id],
        )
      ).rows[0],
    ).toEqual({ storage_backend: "postgres", retained: true });
    expect(await files.list()).toEqual([]);
    const parts = [];
    for await (const part of restarted.artifacts.read(scope, ref)) parts.push(part);
    expect(JSON.parse(Buffer.concat(parts).toString())).toEqual({ text: "canonical synthetic body" });
    expect((await restarted.prepareModel(scope)).pending).toBe(false);
  } finally {
    await f.pool.end();
    await rm(root, { recursive: true, force: true });
  }
});

test.each(["cipher", "missing-digest"])(
  "canonical storage %s corruption rolls back request, quota and bytes before provider dispatch",
  async (fault) => {
    const f = await researchFixture(),
      root = await mkdtemp(join(tmpdir(), "fleet-canonical-corrupt-"));
    try {
      const scope = await scopeForTurn(f.store, f.claim.turn.id);
      await f.pool.query(`CREATE FUNCTION fixture_corrupt_cipher() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN ${fault === "cipher" ? `NEW.inline_cipher='["corrupted"]'::jsonb;` : `NEW.chunks=jsonb_set(NEW.chunks,'{0,digest}','null'::jsonb);`} RETURN NEW; END $$;
      CREATE TRIGGER fixture_corrupt_cipher BEFORE INSERT ON research_artifacts FOR EACH ROW EXECUTE FUNCTION fixture_corrupt_cipher()`);
      const capture = new CaptureSession(f.store, new ArtifactFilesystem(root));
      let calls = 0;
      await expect(
        capture.withScope(scope, () =>
          capture.model(f.claim.turn, f.request(), {
            decide: async () => {
              calls++;
              return { decision: { kind: "wait" }, inputTokens: 7, outputTokens: 8 };
            },
          }),
        ),
      ).rejects.toThrow("EVIDENCE_UNAVAILABLE");
      expect(calls).toBe(0);
      expect(
        (await f.pool.query("SELECT count(*)::int n FROM research_artifacts WHERE run_id=$1", [scope.runId])).rows[0].n,
      ).toBe(0);
      expect(
        (
          await f.pool.query(
            "SELECT artifact_reserved_bytes::text bytes,capture_failed FROM research_runs WHERE run_id=$1",
            [scope.runId],
          )
        ).rows[0],
      ).toEqual({ bytes: "0", capture_failed: true });
      await expect(new CaptureSession(f.store, new ArtifactFilesystem(root)).preflight(scope)).rejects.toThrow(
        "EVIDENCE_UNAVAILABLE",
      );
    } finally {
      await f.pool.query(
        "DROP TRIGGER IF EXISTS fixture_corrupt_cipher ON research_artifacts; DROP FUNCTION IF EXISTS fixture_corrupt_cipher()",
      );
      await f.pool.end();
      await rm(root, { recursive: true, force: true });
    }
  },
);

for (const reason of ["expiry", "revocation"] as const)
  test(`canonical SQL bodies are inaccessible and purged on ${reason}`, async () => {
    const f = await researchFixture(),
      root = await mkdtemp(join(tmpdir(), "fleet-canonical-retention-"));
    try {
      const scope = await scopeForTurn(f.store, f.claim.turn.id),
        capture = new CaptureSession(f.store, new ArtifactFilesystem(root));
      await capture.emit(scope, "model.request", { text: "synthetic retained body" }, {}, { required: true });
      const { EvidenceRepository } = await import("../../src/research/evidence/repository.js");
      const ref = (await new EvidenceRepository(f.store).page(scope, {})).events.find(
        (e) => e.kind === "model.request",
      )!.artifacts[0];
      if (reason === "expiry")
        await f.pool.query("UPDATE research_artifacts SET expires_at=$2 WHERE id=$1", [ref.id, new Date(0)]);
      else await f.pool.query("UPDATE cohorts SET observation_consent=false WHERE id=$1", [f.group.id]);
      const read = async () => {
        for await (const _ of capture.artifacts.read(scope, ref)) {
          /* exhaust */
        }
      };
      await expect(read()).rejects.toThrow(reason === "expiry" ? "ARTIFACT_EXPIRED" : "ARTIFACT_WITHHELD");
      await capture.artifacts.expire(f.store.now());
      expect(
        (await f.pool.query("SELECT inline_cipher,purged FROM research_artifacts WHERE id=$1", [ref.id])).rows[0],
      ).toEqual({ inline_cipher: null, purged: true });
      expect(
        (
          await f.pool.query("SELECT artifact_reserved_bytes::text bytes FROM research_runs WHERE run_id=$1", [
            scope.runId,
          ])
        ).rows[0].bytes,
      ).toBe("0");
    } finally {
      await f.pool.end();
      await rm(root, { recursive: true, force: true });
    }
  });

test("immediate dispatch commits validated canonical input and its dispatch event together before invocation", async () => {
  const f = await researchFixture(),
    root = await mkdtemp(join(tmpdir(), "fleet-atomic-dispatch-"));
  try {
    await f.pool.query(`CREATE TABLE fixture_dispatch_transactions(kind text,xid text);
      CREATE FUNCTION fixture_dispatch_transaction() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
       IF NEW.event->>'kind' IN ('model.request','model.dispatched') THEN INSERT INTO fixture_dispatch_transactions VALUES(NEW.event->>'kind',pg_current_xact_id()::text); END IF; RETURN NEW; END $$;
      CREATE TRIGGER fixture_dispatch_transaction AFTER INSERT ON research_events FOR EACH ROW EXECUTE FUNCTION fixture_dispatch_transaction()`);
    const scope = await scopeForTurn(f.store, f.claim.turn.id),
      capture = new CaptureSession(f.store, new ArtifactFilesystem(root));
    let calls = 0;
    await capture.withScope(scope, () =>
      capture.model(f.claim.turn, f.request(), {
        decide: async () => {
          calls++;
          const rows = (await f.pool.query("SELECT kind,xid FROM fixture_dispatch_transactions ORDER BY kind")).rows;
          expect(rows.map((x) => x.kind)).toEqual(["model.dispatched", "model.request"]);
          expect(new Set(rows.map((x) => x.xid)).size).toBe(1);
          return { decision: { kind: "wait" }, inputTokens: 7, outputTokens: 8 };
        },
      }),
    );
    expect(calls).toBe(1);
  } finally {
    await f.pool.query(
      "DROP TRIGGER IF EXISTS fixture_dispatch_transaction ON research_events; DROP FUNCTION IF EXISTS fixture_dispatch_transaction(); DROP TABLE IF EXISTS fixture_dispatch_transactions",
    );
    await f.pool.end();
    await rm(root, { recursive: true, force: true });
  }
});

test("a provider that reports dispatch keeps preparation and dispatch as distinct durable stages", async () => {
  const f = await researchFixture(),
    root = await mkdtemp(join(tmpdir(), "fleet-tracked-dispatch-"));
  try {
    const scope = await scopeForTurn(f.store, f.claim.turn.id),
      capture = new CaptureSession(f.store, new ArtifactFilesystem(root));
    const events = async () =>
      (
        await f.pool.query("SELECT event->>'kind' kind FROM research_events WHERE run_id=$1 ORDER BY ordinal", [
          scope.runId,
        ])
      ).rows.map((x) => x.kind);
    await capture.withScope(scope, () =>
      capture.model(f.claim.turn, f.request(), {
        tracksDispatch: true,
        decide: async (input) => {
          expect(await events()).toEqual(["run.started", "queue.leave", "model.request"]);
          await input.onEvidence?.({
            kind: "prepared",
            body: { messages: [{ role: "user", content: "synthetic prepared packet" }] },
          });
          expect(await events()).toEqual(["run.started", "queue.leave", "model.request", "context.prepared"]);
          await input.onDispatch?.();
          await input.onDispatch?.();
          expect(await events()).toEqual([
            "run.started",
            "queue.leave",
            "model.request",
            "context.prepared",
            "model.dispatched",
          ]);
          return { decision: { kind: "wait" }, inputTokens: 7, outputTokens: 8 };
        },
      }),
    );
    expect((await events()).at(-1)).toBe("model.response");
  } finally {
    await f.pool.end();
    await rm(root, { recursive: true, force: true });
  }
});

test("fresh response consent withholds bytes while preserving known provider usage", async () => {
  const f = await researchFixture(),
    root = await mkdtemp(join(tmpdir(), "fleet-response-withheld-"));
  try {
    const scope = await scopeForTurn(f.store, f.claim.turn.id),
      capture = new CaptureSession(f.store, new ArtifactFilesystem(root));
    const result = await capture.withScope(scope, () =>
      capture.model(f.claim.turn, f.request(), {
        decide: async () => {
          await f.pool.query("UPDATE cohorts SET observation_consent=false WHERE id=$1", [f.group.id]);
          return { decision: { kind: "wait" }, inputTokens: 7, outputTokens: 8 };
        },
      }),
    );
    expect(result).toMatchObject({ inputTokens: 7, outputTokens: 8 });
    const { EvidenceRepository } = await import("../../src/research/evidence/repository.js");
    const response = (await new EvidenceRepository(f.store).page(scope, {})).events.find(
      (e) => e.kind === "model.response",
    )!;
    expect(response.coverage).toEqual({
      status: "withheld",
      expected: "1",
      recorded: "0",
      reasons: ["CONSENT_WITHHELD"],
    });
    expect(response.artifacts).toEqual([]);
    expect(
      (await f.pool.query("SELECT count(*)::int n FROM research_artifacts WHERE run_id=$1", [scope.runId])).rows[0].n,
    ).toBe(1);
  } finally {
    await f.pool.end();
    await rm(root, { recursive: true, force: true });
  }
});

test("withheld metadata survives an unencodable body without storing it", async () => {
  const f = await researchFixture(),
    root = await mkdtemp(join(tmpdir(), "fleet-unencodable-withheld-"));
  try {
    const scope = await scopeForTurn(f.store, f.claim.turn.id),
      capture = new CaptureSession(f.store, new ArtifactFilesystem(root));
    await f.pool.query("UPDATE cohorts SET observation_consent=false WHERE id=$1", [f.group.id]);
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(await capture.emit(scope, "observation.record", circular, {}, { required: true })).toBeDefined();
    const { EvidenceRepository } = await import("../../src/research/evidence/repository.js");
    const event = (await new EvidenceRepository(f.store).page(scope, {})).events.at(-1)!;
    expect(event.coverage.status).toBe("withheld");
    expect(event.artifacts).toEqual([]);
    expect(
      (
        await f.pool.query(
          "SELECT capture_failed,artifact_reserved_bytes::text bytes FROM research_runs WHERE run_id=$1",
          [scope.runId],
        )
      ).rows[0],
    ).toEqual({ capture_failed: false, bytes: "0" });
  } finally {
    await f.pool.end();
    await rm(root, { recursive: true, force: true });
  }
});
