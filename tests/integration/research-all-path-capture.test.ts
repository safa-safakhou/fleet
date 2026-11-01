import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { CaptureSession } from "../../src/research/evidence/boundaries.js";
import { CoverageService } from "../../src/research/evidence/coverage.js";
import { ArtifactFilesystem } from "../../src/research/evidence/filesystem.js";
import { EvidenceRepository, scopeForTurn } from "../../src/research/evidence/repository.js";
import { captureArchitectureTranscript } from "../architecture-transcript.js";
import { fakeBrokerScope } from "../fixtures/research/trace-corpus.js";
import { executionFixture } from "../fixtures/skills/execution.js";
import { researchFixture } from "../research-helpers.js";

test("all_owned_paths_reconcile without changing golden model packets", async () => {
  const root = await mkdtemp(join(tmpdir(), "fleet-all-capture-"));
  let completed = 0;
  try {
    for (const id of [
      "legacy-loop",
      "legacy-cognition",
      "reactive-basic",
      "reactive-cognition",
      "specialist-coordinator",
    ]) {
      let capture: CaptureSession | undefined;
      const transcript = await captureArchitectureTranscript(
        { id, version: "1" },
        {
          scenario: "action",
          onStore: async (store) => {
            capture = new CaptureSession(store, new ArtifactFilesystem(join(root, id)));
            store.observation = capture;
          },
          afterRun: async (store, claim) => {
            const scope = await scopeForTurn(store, claim.id);
            const page = await new EvidenceRepository(store).page(scope, {});
            const calls = (
              await store.pool.query("SELECT count(*)::int n FROM compute_ledger WHERE turn_id=$1", [claim.id])
            ).rows[0].n;
            expect(page.events.filter((e) => e.kind === "model.request").length).toBe(calls);
            expect(page.events.filter((e) => e.kind === "model.response").length).toBe(calls);
            expect((await new CoverageService(store).reconcile(scope.runId)).missing).toEqual([]);
            await capture!.artifacts.materialize(1000);
            completed++;
          },
        },
      );
      expect(transcript.commands).toHaveLength(1);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
  expect(completed).toBe(5);
}, 120000);
test("recording failure before dispatch refuses work; after dispatch preserves returned usage", async () => {
  const f = await researchFixture(),
    root = await mkdtemp(join(tmpdir(), "fleet-failure-capture-"));
  try {
    const files = new ArtifactFilesystem(root),
      capture = new CaptureSession(f.store, files);
    f.store.observation = capture;
    const original = files.writeChunk.bind(files);
    let calls = 0;
    files.writeChunk = async () => {
      throw Error("disk full");
    };
    const model = {
      decide: async () => {
        calls++;
        return { decision: { kind: "wait" }, inputTokens: 7, outputTokens: 8 };
      },
    };
    await expect(
      capture.model(f.claim.turn, { ...f.request(), messages: [{ role: "user", content: "x".repeat(65536) }] }, model),
    ).rejects.toThrow("EVIDENCE_UNAVAILABLE");
    expect(calls).toBe(0);
    files.writeChunk = original;
    const second = new CaptureSession(f.store, files);
    await f.pool.query("UPDATE research_runs SET capture_failed=false");
    const result = await second.model(f.claim.turn, f.request(), {
      decide: async () => {
        files.writeChunk = async () => {
          throw Error("disk full after dispatch");
        };
        return { decision: { kind: "wait", reason: "x".repeat(65536) }, inputTokens: 7, outputTokens: 8 };
      },
    });
    expect(result.inputTokens).toBe(7);
    expect(result.outputTokens).toBe(8);
    expect((await new CoverageService(f.store).reconcile(f.claim.turn.id)).status).toBe("partial");
  } finally {
    await f.pool.end();
    await rm(root, { recursive: true, force: true });
  }
});

test("skill dispatch and fake worker use the same native accounting and evidence scope", async () => {
  const f = await executionFixture(),
    root = await mkdtemp(join(tmpdir(), "fleet-skill-capture-"));
  try {
    const capture = new CaptureSession(f.store, new ArtifactFilesystem(root));
    f.store.observation = capture;
    const scope = fakeBrokerScope(await scopeForTurn(f.store, f.claim.turn.id));
    const result = await capture.withScope(scope, async () => {
      const begin = await capture.emit(scope, "skill.invoked", { input: f.input() });
      const inv = await f.runner().start(f.scope, f.input());
      await capture.emit(scope, "checkpoint.saved", { invocation: inv }, {}, { parents: begin ? [begin.id] : [] });
      return inv;
    });
    expect(result.state).toBe("completed");
    expect(f.board.executions).toBe(1);
    expect((await f.pool.query("SELECT * FROM compute_ledger")).rowCount).toBe(0);
    const page = await new EvidenceRepository(f.store).page(scope, {});
    expect(page.events.some((e) => e.kind === "command.prepared")).toBe(true);
    expect((await new CoverageService(f.store).reconcile(scope.runId)).missing).toEqual([]);
  } finally {
    await f.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("a failed scope lookup cannot roll back a known native command receipt", async () => {
  const f = await researchFixture(),
    root = await mkdtemp(join(tmpdir(), "fleet-receipt-capture-"));
  try {
    const capture = new CaptureSession(f.store, new ArtifactFilesystem(root)),
      scope = await scopeForTurn(f.store, f.claim.turn.id),
      command = "88888888-8888-4888-8888-888888888888";
    await capture.recorder.append(scope, { kind: "run.started", producerKey: "receipt-start", streamId: "run" });
    await f.store.pending(f.claim.turn, command, { kind: "synthetic" });
    const original = capture.scope.bind(capture);
    capture.scope = async (_claim, db) => {
      await db?.query("SELECT nonexistent_capture_field FROM research_runs");
      throw Error("capture scope unavailable");
    };
    f.store.observation = capture;
    await f.store.receipt(f.claim.turn, { commandId: command, code: "COMMITTED" });
    expect(
      (await f.pool.query("SELECT command_id FROM command_resolutions WHERE command_id=$1", [command])).rowCount,
    ).toBe(1);
    expect(
      (await f.pool.query("SELECT pending_command FROM turns WHERE id=$1", [scope.turnId])).rows[0].pending_command,
    ).toBeNull();
    capture.scope = original;
    await expect(capture.preflight(scope)).rejects.toThrow("EVIDENCE_UNAVAILABLE");
  } finally {
    await f.pool.end();
    await rm(root, { recursive: true, force: true });
  }
});

test("corrections retain their own allocation and purpose", async () => {
  const root = await mkdtemp(join(tmpdir(), "fleet-correction-capture-"));
  try {
    for (const profileId of ["legacy-loop", "reactive-basic"])
      await captureArchitectureTranscript(
        { id: profileId, version: "1" },
        {
          scenario: "correction",
          onStore: async (store) => {
            store.observation = new CaptureSession(store, new ArtifactFilesystem(root));
          },
          afterRun: async (store, claim) => {
            const scope = await scopeForTurn(store, claim.id),
              page = await new EvidenceRepository(store).page(scope, {}),
              calls = page.events.filter((e) => e.kind === "model.request");
            expect(calls.length).toBeGreaterThan(1);
            expect(new Set(calls.map((e) => e.attributes.allocationId)).size).toBe(calls.length);
            expect(calls[1].attributes.purpose).toBe("correction");
            expect((await new CoverageService(store).reconcile(scope.runId)).missing).toEqual([]);
          },
        },
      );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
