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
