import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Connection } from "@temporalio/client";
import { msToTs } from "@temporalio/common/time";
import { expect, test } from "vitest";
import { StepJournal } from "../../src/research/broker/steps.js";
import { CaptureSession } from "../../src/research/evidence/boundaries.js";
import { CoverageService } from "../../src/research/evidence/coverage.js";
import { ArtifactFilesystem } from "../../src/research/evidence/filesystem.js";
import { compileManifest } from "../../src/research/manifests/compiler.js";
import { ManifestRepository } from "../../src/research/manifests/repository.js";
import { TemporalTaskOwner } from "../../src/research/orchestration/outbox.js";
import { startTaskRuntime } from "../../src/research/orchestration/worker.js";
import { capability, manifestInput } from "../fixtures/research/manifest.js";
import { platformFixture, profile } from "../platform-helpers.js";

const address = process.env.FLEET_QUALIFICATION_TEMPORAL_ADDRESS;
for (const mode of ["direct", "temporal"] as const)
  test.skipIf(mode === "temporal" && !address)(
    `eight simultaneous bindings retain distinct budgets/evidence under duplicate wakes through ${mode} delivery`,
    async () => {
      const runtimes: Awaited<ReturnType<typeof startTaskRuntime>>[] = [];
      const f = await platformFixture(8, 8),
        root = await mkdtemp(join(tmpdir(), "fleet-capacity-capture-"));
      const capture = new CaptureSession(f.store, new ArtifactFilesystem(root));
      f.store.observation = capture;
      let active = 0,
        peak = 0,
        calls = 0,
        release: () => void = () => {};
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      const host = f.host({
        decide: async () => {
          active++;
          calls++;
          peak = Math.max(peak, active);
          if (active === 8) release();
          await barrier;
          active--;
          return { decision: { kind: "wait" }, inputTokens: 7, outputTokens: 9 };
        },
      });
      const digests = new Map<string, string>();
      const digestFor = (bindingId: string) => {
        const digest = digests.get(bindingId);
        if (!digest) throw new Error("FIXTURE_SCOPE_MISSING");
        return digest;
      };
      const owner = new TemporalTaskOwner(f.store, f.tasks, { send: async () => {} }, async (claim) => {
        const scope = await new StepJournal(f.store, f.tasks).open(
          claim,
          `task:${claim.taskId}`,
          `task:${claim.taskId}`,
          digestFor(claim.bindingId),
        );
        await capture.withScope(scope, () => host.host.run(claim));
      });
      try {
        f.advance(Date.now() - f.now().getTime());
        const actors = [];
        for (let n = 0; n < 8; n++) {
          const group = await f.cohort(1, { deadlineAt: new Date(Date.now() + 7200000).toISOString() }),
            binding = group.bindings[0];
          await f.store.setState(group.id, "paused", false);
          await f.store.consent(group.id, true);
          const input = manifestInput();
          input.environment.bindingId = binding.id;
          input.profile = profile;
          input.model = { route: "ollama", model: "fake-model", parameters: { maxOutputTokens: 2000 } };
          const compiled = compileManifest(input, {
            ...capability,
            model: { ...capability.model, route: "ollama", model: "fake-model" },
          });
          await new ManifestRepository(f.pool).save(compiled.manifest);
          digests.set(binding.id, compiled.digest);
          await owner.enrollBinding(binding.id, compiled.digest);
          const task = await f.enqueue(binding, `event:contact:${n}`, `source:${n}`),
            row = (await f.pool.query("SELECT id FROM research_task_outbox WHERE task_id=$1", [task.id])).rows[0];
          actors.push({ cohortId: group.id, binding, task, ref: await owner.reference(row.id) });
          await f.store.setState(group.id, "running", true);
        }
        if (mode === "temporal") {
          if (!address || !/^127\.0\.0\.1:\d+$/.test(address)) throw new Error("OWNED_TEMPORAL_REQUIRED");
          const namespace = `fleet-synthetic-capacity-${randomUUID()}`,
            conn = await Connection.connect({ address });
          await conn.workflowService.registerNamespace({
            namespace,
            workflowExecutionRetentionPeriod: msToTs("1 day"),
          });
          await conn.close();
          for (const a of actors) {
            const runtime = await startTaskRuntime({
              store: f.store,
              tasks: f.tasks,
              address,
              namespace,
              manifestDigest: digestFor(a.binding.id),
              delivery: "manual",
              admissionOpen: () => true,
              run: async (claim) => {
                const scope = await new StepJournal(f.store, f.tasks).open(
                  claim,
                  `task:${claim.taskId}`,
                  `task:${claim.taskId}`,
                  digestFor(claim.bindingId),
                );
                await capture.withScope(scope, () => host.host.run(claim));
              },
            });
            runtimes.push(runtime);
          }
          expect(calls).toBe(0);
          await Promise.all(
            actors.map(async (a, i) => {
              // Worker deployment registration is asynchronous. Retry the same
              // durable wake identity, never a native execution or model request.
              for (let attempt = 0; attempt < 100; attempt++) {
                try {
                  await runtimes[i].owner.deliver(a.ref.deliveryId);
                  return;
                } catch (error) {
                  if ((error as { code?: string }).code !== "TEMPORAL_UNAVAILABLE" || attempt === 99) throw error;
                  await new Promise((resolve) => setTimeout(resolve, 50));
                }
              }
            }),
          );
          for (let n = 0; n < 200; n++) {
            const phases = await Promise.all(actors.map((a) => owner.inspect(a.ref)));
            if (phases.every((p) => p.phase === "completed")) break;
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        } else await Promise.all(actors.flatMap((a) => [owner.execute(a.ref), owner.execute(a.ref)]));
        expect(peak).toBe(8);
        expect(calls).toBe(8);
        for (const a of actors) {
          expect((await owner.inspect(a.ref)).phase).toBe("completed");
          const coverage = await new CoverageService(f.store).reconcile(`task:${a.task.id}`);
          expect(coverage.status).toBe("complete");
          const scopes = (
            await f.pool.query(
              "SELECT DISTINCT scope->>'bindingId' binding,scope->>'manifestDigest' digest FROM research_evidence_scopes WHERE run_id=$1",
              [`task:${a.task.id}`],
            )
          ).rows;
          expect(scopes).toEqual([{ binding: a.binding.id, digest: digests.get(a.binding.id) }]);
          expect(
            (
              await f.pool.query(
                "SELECT count(*)::int n FROM compute_ledger WHERE cohort_id=$1 AND status='reported'",
                [a.cohortId],
              )
            ).rows[0].n,
          ).toBe(1);
        }
        expect(
          (await f.pool.query("SELECT count(*)::int n FROM compute_ledger WHERE status IN('reserved','unknown')"))
            .rows[0].n,
        ).toBe(0);
      } finally {
        release();
        await f.pool.end();
        await rm(root, { recursive: true, force: true });
      }
    },
    120000,
  );
