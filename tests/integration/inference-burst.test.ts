import { expect, it } from "vitest";
import type { ModelPort } from "../../src/domain.js";
import { RouteCapacity } from "../../src/platform/admission.js";
import { TaskStore } from "../../src/platform/tasks.js";
import { WorkerPool } from "../../src/platform/worker-pool.js";
import { platformFixture } from "../platform-helpers.js";

it("bounds a mixed 24-actor burst and defers excess work without unknown usage or expired workers", async () => {
  const f = await platformFixture(4);
  const jobs: { endsAt: number; finish: () => void }[] = [];
  const runs: Promise<unknown>[] = [];
  const workers = new WorkerPool(8, 8);
  const model = { route: "ollama" as const, model: "synthetic-nemotron-4b", thinking: true };
  const blocks = [32, 32, 32, 35, 50, 42, 54, 36];
  const durations = [150000, 20000, 15000, 30000, 140000, 20000, 45000, 25000];
  let completedCalls = 0;
  let providerActive = 0,
    peakProvider = 0,
    peakBlocks = 0,
    claimed = 0,
    done = 0;
  let currentBlocks = 0;
  const identities = new Set<string>();
  const route = new RouteCapacity(
    f.store,
    () => ({
      key: "burst",
      capacity: 4,
      resource: { unit: "kv-cache-blocks.v1", capacity: 92, fingerprint: "a".repeat(64) },
    }),
    async (r) => ({ tokenUnits: 100, resourceUnits: blocks[Number(r.messages[0].content)] }),
    { workerCapacity: 8 },
  );
  const provider: ModelPort = {
    tracksDispatch: true,
    async decide(r) {
      await r.onDispatch?.();
      const index = Number(r.messages[0].content);
      providerActive++;
      currentBlocks += blocks[index];
      peakProvider = Math.max(peakProvider, providerActive);
      peakBlocks = Math.max(peakBlocks, currentBlocks);
      await new Promise<void>((finish) => jobs.push({ endsAt: f.now().getTime() + durations[index], finish }));
      completedCalls++;
      providerActive--;
      currentBlocks -= blocks[index];
      return { decision: { kind: "wait" }, inputTokens: 50, outputTokens: 10 };
    },
  };
  const h = f.host(
    provider,
    async (ctx) => {
      await ctx.model.decide(ctx.claim, {
        ...f.request(ctx.signal),
        model,
        messages: [{ role: "user", content: String(ctx.claim.turn.agent.ordinal % 8) }],
      });
    },
    {},
    undefined,
    route,
  );
  try {
    const group = await f.cohort(24, { model, concurrency: 16 });
    for (const binding of group.bindings) await f.enqueue(binding);
    const tasks = new TaskStore(f.store, f.bindings, 8, f.environments);
    for (let step = 0; step < 200 && done < 24; step++) {
      while (claimed < 24 && workers.hasCapacity) {
        const claim = await tasks.claim("burst-worker", f.now());
        if (!claim) break;
        claimed++;
        identities.add(claim.turn.agentId);
        runs.push(
          workers
            .run(() => h.host.run(claim))
            .catch((e) => e)
            .finally(() => {
              done++;
            }),
        );
      }
      // Let real database transactions/polls settle before advancing the injected game-independent clock.
      await new Promise((r) => setTimeout(r, 35));
      const state = (
        await f.pool.query(
          "SELECT count(*)::int total,count(*) FILTER(WHERE NOT worker_waiting)::int executing FROM turns WHERE state='running'",
        )
      ).rows[0];
      expect(state.total).toBeLessThanOrEqual(16);
      expect(state.executing).toBeLessThanOrEqual(8);
      expect(providerActive).toBeLessThanOrEqual(4);
      expect(currentBlocks).toBeLessThanOrEqual(92);
      const queued = (
        await f.pool.query("SELECT min(expires_at) expires FROM model_capacity_leases WHERE state='queued'")
      ).rows[0].expires as Date | null;
      const next = Math.min(...jobs.map((j) => j.endsAt), queued ? queued.getTime() + 1 : Infinity);
      if (Number.isFinite(next) && next > f.now().getTime()) f.advance(next - f.now().getTime());
      for (const job of [...jobs])
        if (job.endsAt <= f.now().getTime()) {
          jobs.splice(jobs.indexOf(job), 1);
          job.finish();
        }
      await f.store.recoverExpired();
      await tasks.recover();
    }
    expect(claimed).toBe(24);
    expect(done).toBe(24);
    expect(identities.size).toBe(24);
    expect(peakProvider).toBeGreaterThan(1);
    expect(peakProvider).toBeLessThanOrEqual(4);
    expect(peakBlocks).toBeLessThanOrEqual(92);
    const outcomes = (await f.pool.query("SELECT code,count(*)::int n FROM turns GROUP BY code")).rows;
    expect(outcomes.every((r) => ["WAIT", "MODEL_ADMISSION_DEFERRED"].includes(r.code))).toBe(true);
    expect(outcomes.find((r) => r.code === "WAIT")?.n).toBeGreaterThan(0);
    expect(outcomes.find((r) => r.code === "MODEL_ADMISSION_DEFERRED")?.n).toBeGreaterThan(0);
    expect((await f.pool.query("SELECT 1 FROM compute_ledger WHERE status IN('unknown','reserved')")).rowCount).toBe(0);
    expect((await f.pool.query("SELECT 1 FROM agents WHERE state='needs_owner'")).rowCount).toBe(0);
    expect((await f.pool.query("SELECT 1 FROM model_capacity_leases")).rowCount).toBe(0);
    expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger WHERE status='reported'")).rows[0].n).toBe(
      completedCalls,
    );
    expect(f.board.executions).toBe(0);
  } finally {
    for (const job of jobs) job.finish();
    workers.close();
    await h.host.stop();
    await Promise.allSettled(runs);
    await workers.drain();
    await f.pool.end();
  }
}, 30000);
