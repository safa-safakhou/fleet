import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { StepJournal } from "../../src/research/broker/steps.js";
import { CaptureSession } from "../../src/research/evidence/boundaries.js";
import { CoverageService } from "../../src/research/evidence/coverage.js";
import { ArtifactFilesystem } from "../../src/research/evidence/filesystem.js";
import { compileManifest } from "../../src/research/manifests/compiler.js";
import { ManifestRepository } from "../../src/research/manifests/repository.js";
import { TemporalTaskOwner } from "../../src/research/orchestration/outbox.js";
import { capability, manifestInput } from "../fixtures/research/manifest.js";
import { platformFixture } from "../platform-helpers.js";

test("24 kingdoms complete and event-wait independently, inheriting or waking the second review without replay", async () => {
  const f = await platformFixture(1),
    root = await mkdtemp(join(tmpdir(), "fleet-24-owner-"));
  try {
    f.advance(Date.now() - f.now().getTime());
    const capture = new CaptureSession(f.store, new ArtifactFilesystem(root));
    f.store.observation = capture;
    const actors: {
      cohortId: string;
      binding: (typeof f.group.bindings)[number];
      digest: string;
      firstTaskId: string;
    }[] = [];
    const mapping = new Map<string, string>();
    const eventWaiting = new Set<string>();
    let calls = 0,
      active = 0,
      peak = 0;
    const host = f.host(
      {
        decide: async () => {
          active++;
          peak = Math.max(peak, active);
          calls++;
          active--;
          return { decision: { kind: "wait" }, inputTokens: 7, outputTokens: 8 };
        },
      },
      async (ctx) => {
        await ctx.model.decide(ctx.claim, f.request(ctx.signal));
        if (eventWaiting.has(ctx.binding.id)) await ctx.waitForEvent?.();
      },
    );
    let failure: unknown;
    const owner = new TemporalTaskOwner(f.store, f.tasks, { send: async () => {} }, async (claim) => {
      const digest = mapping.get(claim.bindingId)!;
      const scope = await new StepJournal(f.store, f.tasks).open(
        claim,
        `task:${claim.taskId}`,
        `task:${claim.taskId}`,
        digest,
      );
      try {
        await capture.withScope(scope, () => host.host.run(claim));
      } catch (error) {
        failure = error;
        throw error;
      }
    });
    for (let n = 0; n < 24; n++) {
      const group = await f.cohort(1, { deadlineAt: new Date(Date.now() + 7200000).toISOString() }),
        binding = group.bindings[0];
      await f.store.setState(group.id, "paused", false);
      await f.store.consent(group.id, true);
      const task = await f.enqueue(binding, "kingdom-review", `fixture:first:${n}`),
        input = manifestInput();
      input.environment.bindingId = binding.id;
      input.profile = task.profile;
      input.model = { route: "ollama", model: "fake-model", parameters: { maxOutputTokens: 2000 } };
      input.limits = { calls: "4", tokens: "160000", concurrency: 1 };
      const manifest = compileManifest(input, {
        ...capability,
        model: { ...capability.model, route: "ollama", model: "fake-model" },
      });
      await new ManifestRepository(f.pool).save(manifest.manifest);
      mapping.set(binding.id, manifest.digest);
      if (n % 2) eventWaiting.add(binding.id);
      await owner.enroll(task.id, manifest.digest);
      actors.push({ cohortId: group.id, binding, digest: manifest.digest, firstTaskId: task.id });
      await f.store.setState(group.id, "running", true);
    }
    expect(new Set(actors.map((a) => a.digest)).size).toBe(24);
    for (const actor of actors) {
      expect(await f.tasks.claim("ordinary-must-not-take-it", f.now(), actor.firstTaskId)).toBeNull();
      const id = (await f.pool.query("SELECT id FROM research_task_outbox WHERE task_id=$1", [actor.firstTaskId]))
          .rows[0].id,
        ref = await owner.reference(id);
      expect(ref.manifestDigest).toBe(actor.digest);
      await owner.execute(ref);
      expect(failure).toBeUndefined();
      await owner.execute(ref);
      expect((await owner.inspect(ref)).phase).toBe(eventWaiting.has(actor.binding.id) ? "waiting" : "completed");
    }
    f.advance(30 * 60000);
    for (const [n, actor] of actors.entries()) {
      const task = await f.enqueue(actor.binding, "kingdom-review", `fixture:second:${n}`);
      if (eventWaiting.has(actor.binding.id)) {
        expect(task.id).toBe(actor.firstTaskId);
        expect(task.revision).toBe(2);
      } else expect(task.id).not.toBe(actor.firstTaskId);
      const owned = (
        await f.pool.query("SELECT scheduler_owner,research_manifest_digest FROM platform_tasks WHERE id=$1", [task.id])
      ).rows[0];
      expect(owned).toEqual({ scheduler_owner: "temporal", research_manifest_digest: actor.digest });
      const ref = await owner.reference(
        (
          await f.pool.query("SELECT id FROM research_task_outbox WHERE task_id=$1 ORDER BY created_at DESC,id DESC", [
            task.id,
          ])
        ).rows[0].id,
      );
      await owner.execute(ref);
      expect((await owner.inspect(ref)).phase).toBe(eventWaiting.has(actor.binding.id) ? "waiting" : "completed");
      expect(
        (await f.pool.query("SELECT count(*)::int n FROM turns WHERE cohort_id=$1", [actor.cohortId])).rows[0].n,
      ).toBe(2);
      expect((await new CoverageService(f.store).reconcile(`task:${task.id}`)).status).toBe("complete");
    }
    expect(calls).toBe(48);
    expect(peak).toBe(1);
    expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger WHERE status='reported'")).rows[0].n).toBe(
      48,
    );
    expect(
      (await f.pool.query("SELECT count(*)::int n FROM compute_ledger WHERE status IN('reserved','unknown')")).rows[0]
        .n,
    ).toBe(0);
  } finally {
    await f.pool.end();
    await rm(root, { recursive: true, force: true });
  }
}, 120000);
