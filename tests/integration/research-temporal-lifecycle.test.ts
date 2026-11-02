import { randomUUID } from "node:crypto";
import { Connection } from "@temporalio/client";
import { msToTs } from "@temporalio/common/time";
import { expect, test } from "vitest";
import { compileManifest } from "../../src/research/manifests/compiler.js";
import { ManifestRepository } from "../../src/research/manifests/repository.js";
import { TemporalTaskOwner } from "../../src/research/orchestration/outbox.js";
import { startTaskRuntime } from "../../src/research/orchestration/worker.js";
import { capability, manifestInput } from "../fixtures/research/manifest.js";
import { platformFixture } from "../platform-helpers.js";

const address = process.env.FLEET_QUALIFICATION_TEMPORAL_ADDRESS;
test.skipIf(!address)(
  "owned Temporal SDK closes after a waiting review and resumes only a new wake",
  async () => {
    if (!address) throw new Error("QUALIFICATION_ADDRESS_REQUIRED");
    expect(address).toMatch(/^127\.0\.0\.1:\d+$/);
    const namespace = `fleet-synthetic-lifecycle-${randomUUID()}`;
    const connection = await Connection.connect({ address });
    await connection.workflowService.registerNamespace({
      namespace,
      workflowExecutionRetentionPeriod: msToTs("1 day"),
    });
    await connection.close();
    const f = await platformFixture(1);
    let runtime: Awaited<ReturnType<typeof startTaskRuntime>> | undefined;
    let calls = 0;
    const waiting = new Set<string>();
    const host = f.host(
      {
        decide: async () => {
          calls++;
          return { decision: { kind: "wait" }, inputTokens: 1, outputTokens: 1 };
        },
      },
      async (ctx) => {
        await ctx.model.decide(ctx.claim, f.request(ctx.signal));
        if (waiting.has(ctx.binding.id)) await ctx.waitForEvent?.();
      },
    );
    try {
      f.advance(Date.now() - f.now().getTime());
      const actors = [];
      for (let i = 0; i < 2; i++) {
        const group = await f.cohort(1, { deadlineAt: new Date(Date.now() + 7200000).toISOString() });
        await f.store.setState(group.id, "paused", false);
        await f.store.consent(group.id, true);
        const binding = group.bindings[0],
          task = await f.enqueue(binding, "review", `first:${i}`);
        const input = manifestInput();
        input.profile = task.profile;
        input.environment.bindingId = binding.id;
        input.model = { route: "ollama", model: "fake-model", parameters: { maxOutputTokens: 2000 } };
        const compiled = compileManifest(input, {
          ...capability,
          model: { ...capability.model, route: "ollama", model: "fake-model" },
        });
        await new ManifestRepository(f.pool).save(compiled.manifest);
        await new TemporalTaskOwner(f.store, f.tasks, { send: async () => {} }, async () => {}).enroll(
          task.id,
          compiled.digest,
        );
        if (i === 0) waiting.add(binding.id);
        await f.store.setState(group.id, "running", true);
        actors.push({ binding, taskId: task.id, digest: compiled.digest });
      }
      for (const index of [0, 1, 0]) {
        const actor = actors[index];
        if (calls === 2) {
          f.advance(1800000);
          const task = await f.enqueue(actor.binding, "review", "second:0");
          expect(task.id).toBe(actor.taskId);
          expect(task.revision).toBe(2);
        }
        const before = calls;
        runtime = await startTaskRuntime({
          store: f.store,
          tasks: f.tasks,
          run: (claim) => host.host.run(claim),
          address,
          namespace,
          manifestDigest: actor.digest,
          admissionOpen: () => true,
        });
        let settled = false;
        for (let n = 0; n < 200; n++) {
          const row = (
            await f.pool.query(
              "SELECT o.phase,EXISTS(SELECT 1 FROM research_task_executions e WHERE e.task_id=o.task_id AND e.phase<>'settled') unsettled FROM research_task_owners o WHERE o.task_id=$1",
              [actor.taskId],
            )
          ).rows[0];
          if (calls === before + 1 && ["waiting", "completed"].includes(row.phase) && !row.unsettled) {
            settled = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        expect(settled).toBe(true);
        await runtime.close();
        runtime = undefined;
        expect(calls).toBe(before + 1);
      }
      expect(calls).toBe(3);
      expect(
        (await f.pool.query("SELECT count(*)::int n FROM compute_ledger WHERE status IN('reserved','unknown')")).rows[0]
          .n,
      ).toBe(0);
    } finally {
      await runtime?.close();
      await f.pool.end();
    }
  },
  120000,
);
