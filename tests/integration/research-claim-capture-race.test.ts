import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { StepJournal } from "../../src/research/broker/steps.js";
import { CaptureSession } from "../../src/research/evidence/boundaries.js";
import { ArtifactFilesystem } from "../../src/research/evidence/filesystem.js";
import { EvidenceRepository, scopeForTurn } from "../../src/research/evidence/repository.js";
import { compileManifest } from "../../src/research/manifests/compiler.js";
import { ManifestRepository } from "../../src/research/manifests/repository.js";
import { TemporalTaskOwner } from "../../src/research/orchestration/outbox.js";
import { capability, manifestInput } from "../fixtures/research/manifest.js";
import { platformFixture } from "../platform-helpers.js";

async function fixture() {
  const f = await platformFixture(1);
  const binding = f.group.bindings[0],
    task = await f.enqueue(binding, "review", "synthetic:first"),
    input = manifestInput();
  input.environment.bindingId = binding.id;
  input.profile = task.profile;
  const manifest = compileManifest(input, capability);
  await new ManifestRepository(f.pool).save(manifest.manifest);
  await f.store.consent(f.group.id, true);
  await f.store.setState(f.group.id, "paused", false);
  return { ...f, binding, task, manifest: manifest.digest };
}

test("a Temporal turn is first visible with its research scope; overlapping unscoped session close survives journal open", async () => {
  const f = await fixture(),
    root = await mkdtemp(join(tmpdir(), "claim-capture-"));
  try {
    const capture = new CaptureSession(f.store, new ArtifactFilesystem(root));
    f.store.observation = capture;
    let checked = false;
    const owner = new TemporalTaskOwner(f.store, f.tasks, { send: async () => {} }, async (claim) => {
      const first = await scopeForTurn(f.store, claim.turn.id);
      expect(first.runId).toBe(`task:${claim.taskId}`);
      expect(
        (await f.pool.query("SELECT provenance FROM research_runs WHERE run_id=$1", [first.runId])).rows[0].provenance,
      ).toBe("research");
      const request = await capture.emit(
        first,
        "game.read.request",
        { method: "close", args: [] },
        {},
        { required: true },
      );
      if (!request) throw new Error("SYNTHETIC_REQUEST_CAPTURE_MISSING");
      const opened = await new StepJournal(f.store, f.tasks).open(claim, first.runId, first.operationId, f.manifest);
      expect(opened).toEqual(first);
      await capture.emit(
        first,
        "game.read.response",
        { method: "close" },
        {},
        { required: true, parents: [request.id] },
      );
      expect(
        (
          await f.pool.query(
            "SELECT count(*)::int n FROM research_runs WHERE capture_failed OR provenance='compatibility'",
          )
        ).rows[0].n,
      ).toBe(0);
      checked = true;
      await f.tasks.finish(claim, "WAIT");
    });
    await owner.enroll(f.task.id, f.manifest);
    await f.store.setState(f.group.id, "running", true);
    const id = (await f.pool.query("SELECT id FROM research_task_outbox WHERE task_id=$1", [f.task.id])).rows[0].id;
    await owner.execute(await owner.reference(id));
    expect(checked).toBe(true);
  } finally {
    await f.pool.end();
    await rm(root, { recursive: true, force: true });
  }
});

test("failed atomic evidence binding rolls back admission, claim and operation before turn visibility", async () => {
  const f = await fixture();
  const failure = vi
    .spyOn(EvidenceRepository.prototype, "bind")
    .mockRejectedValue(new Error("SYNTHETIC_CAPTURE_BIND_FAILURE"));
  try {
    let ran = false;
    const owner = new TemporalTaskOwner(f.store, f.tasks, { send: async () => {} }, async () => {
      ran = true;
    });
    await owner.enroll(f.task.id, f.manifest);
    await f.store.setState(f.group.id, "running", true);
    const id = (await f.pool.query("SELECT id FROM research_task_outbox WHERE task_id=$1", [f.task.id])).rows[0].id;
    await owner.execute(await owner.reference(id));
    expect(ran).toBe(false);
    for (const table of ["turns", "platform_task_claims", "research_operations", "research_runs", "compute_ledger"])
      expect((await f.pool.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n).toBe(0);
    expect((await f.tasks.get(f.task.id)).state).toBe("ready");
  } finally {
    failure.mockRestore();
    await f.pool.end();
  }
});
