import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { isDeepStrictEqual } from "node:util";
import { transaction } from "../db.js";
import { FleetError, type ModelPort, type ModelSettings, safeCode } from "../domain.js";
import { Observability } from "../observability.js";
import type { Claim, Store } from "../store.js";
import type { TaskClaim, TaskStore } from "./tasks.js";
export type ModelResult = Awaited<ReturnType<ModelPort["decide"]>>;
export class RouteCapacity {
  constructor(
    private store: Store,
    private policy: (model: ModelSettings) => { key: string; capacity: number },
  ) {}
  async run<T>(claim: Claim, request: Parameters<ModelPort["decide"]>[0], operation: () => Promise<T>): Promise<T> {
    const queuedAt = this.store.now().getTime();
    const observation = new Observability(this.store);
    const policy = this.policy(request.model),
      id = randomUUID();
    if (
      !Number.isInteger(policy.capacity) ||
      policy.capacity < 1 ||
      policy.capacity > 16 ||
      (request.model.route === "codex-cli" && policy.capacity !== 1)
    )
      throw new FleetError("INVALID_PROVIDER_CAPACITY", true);
    await this.store.active(claim);
    await transaction(this.store.pool, async (db) => {
      await db.query("INSERT INTO model_capacity_routes(route_key,capacity) VALUES($1,$2) ON CONFLICT DO NOTHING", [
        policy.key,
        policy.capacity,
      ]);
      const row = (await db.query("SELECT capacity FROM model_capacity_routes WHERE route_key=$1", [policy.key]))
        .rows[0];
      if (row.capacity !== policy.capacity) throw new FleetError("PROVIDER_CAPACITY_MISMATCH", true);
      await db.query(
        "INSERT INTO model_capacity_leases(id,route_key,turn_id,state,expires_at) VALUES($1,$2,$3,'queued',$4)",
        [id, policy.key, claim.id, claim.deadline],
      );
    });
    try {
      await observation.record(claim, "thinking", "Provider capacity queued", {
        route: request.model.route,
        capacity: policy.capacity,
      });
      while (true) {
        if (request.signal.aborted)
          throw new FleetError(
            safeCode(request.signal.reason) === "DEADLINE_MISSED" ? "DEADLINE_MISSED" : "CLAIM_FENCED",
            true,
          );
        await this.store.active(claim);
        const admitted = await transaction(this.store.pool, async (db) => {
          await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,19281470))", [policy.key]);
          await db.query(
            "DELETE FROM model_capacity_leases l USING turns t WHERE l.turn_id=t.id AND l.expires_at<=$1 AND t.state<>'running'",
            [this.store.now()],
          );
          const active = (
            await db.query("SELECT count(*)::int n FROM model_capacity_leases WHERE route_key=$1 AND state='active'", [
              policy.key,
            ])
          ).rows[0].n;
          const next = (
            await db.query(
              "SELECT id FROM model_capacity_leases WHERE route_key=$1 AND state='queued' ORDER BY sequence LIMIT 1",
              [policy.key],
            )
          ).rows[0];
          if (active >= policy.capacity || next?.id !== id) return false;
          await db.query("UPDATE model_capacity_leases SET state='active' WHERE id=$1", [id]);
          return true;
        });
        if (admitted) break;
        try {
          await delay(20, undefined, { signal: request.signal });
        } catch {
          throw new FleetError(
            safeCode(request.signal.reason) === "DEADLINE_MISSED" ? "DEADLINE_MISSED" : "CLAIM_FENCED",
            true,
          );
        }
      }
      await this.store.active(claim);
      if (request.signal.aborted)
        throw new FleetError(
          safeCode(request.signal.reason) === "DEADLINE_MISSED" ? "DEADLINE_MISSED" : "CLAIM_FENCED",
          true,
        );
      await observation.record(claim, "thinking", "Provider capacity admitted", {
        route: request.model.route,
        capacity: policy.capacity,
        queueDelayMs: Math.max(0, this.store.now().getTime() - queuedAt),
      });
      await this.store.active(claim);
      return await operation();
    } finally {
      await this.store.pool.query("DELETE FROM model_capacity_leases WHERE id=$1", [id]);
    }
  }
  wrap(model: ModelPort, current: () => Claim | undefined): ModelPort {
    return {
      tracksDispatch: model.tracksDispatch,
      decide: async (request) => {
        const claim = current();
        if (!claim) throw new FleetError("MODEL_CLAIM_REQUIRED", true);
        return this.run(claim, request, () => model.decide(request));
      },
    };
  }
}
export class ModelAdmission {
  constructor(
    private store: Store,
    private tasks: TaskStore,
    private provider: ModelPort,
    private capacity: RouteCapacity,
    private guard?: (claim: TaskClaim) => Promise<void>,
  ) {}
  guarded(guard: (claim: TaskClaim) => Promise<void>) {
    return new ModelAdmission(this.store, this.tasks, this.provider, this.capacity, guard);
  }
  async decide(claim: TaskClaim, request: Parameters<ModelPort["decide"]>[0]): Promise<ModelResult> {
    await this.tasks.check(claim);
    const cohort = await this.store.cohort(claim.turn.cohortId);
    const turn = { ...claim.turn, cohort };
    const budget = cohort.budget;
    if (
      !budget ||
      !isDeepStrictEqual(request.model, cohort.model) ||
      !Number.isSafeInteger(request.maxOutputTokens) ||
      request.maxOutputTokens > budget.maxOutputTokens ||
      request.maxOutputTokens < 1 ||
      Buffer.byteLength(JSON.stringify(request.messages)) + Buffer.byteLength(JSON.stringify(request.schema)) >
        budget.inputByteLimit
    )
      throw new FleetError("MODEL_REQUEST_NOT_ADMITTED", true);
    return this.capacity.run(turn, request, async () => {
      await this.guard?.(claim);
      await this.tasks.check(claim);
      if (this.provider.tracksDispatch) await this.store.phase(turn, "model_preparing_tracked");
      const allocation = await this.store.reserveCall(turn);
      let dispatched = false,
        invoked = false,
        execution = 0,
        modelStartedAt = this.store.now().getTime();
      const observation = new Observability(this.store);
      try {
        await this.store.phase(turn, this.provider.tracksDispatch ? "model_reserved_tracked" : "model_reserved");
        execution = (await this.store.pool.query("SELECT calls FROM turns WHERE id=$1", [turn.id])).rows[0].calls;
        await observation.recordDebug(turn, "ready", "Model request", {
          execution,
          model: request.model,
          messages: request.messages,
          outputSchema: request.schema,
          maxOutputTokens: request.maxOutputTokens,
        });
        modelStartedAt = this.store.now().getTime();
        invoked = true;
        const result = await this.provider.decide({
          ...request,
          signal: AbortSignal.any([
            request.signal,
            AbortSignal.timeout(
              Math.max(1, Math.min(90000, claim.turn.deadline.getTime() - this.store.now().getTime())),
            ),
          ]),
          onDispatch: async () => {
            await this.tasks.check(claim);
            await this.store.phase(turn, "model_dispatched");
            dispatched = true;
            await request.onDispatch?.();
          },
        });
        const elapsedMs = Math.max(0, this.store.now().getTime() - modelStartedAt);
        await this.store.recordUsage(allocation, result.inputTokens, result.outputTokens);
        await observation.recordDebug(turn, "deciding", "Model response", {
          execution,
          elapsedMs,
          decision: result.decision,
          decisionError: result.decisionError ?? null,
          outputText: result.outputText ?? null,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          coverage: "Provider final answer only; provider internal reasoning is not captured.",
        });
        if (result.inputTokens === null || result.outputTokens === null) throw new FleetError("USAGE_UNKNOWN");
        if (result.inputTokens + result.outputTokens > budget.perCallTokenLimit) throw new FleetError("USAGE_EXCEEDED");
        await this.tasks.check(claim);
        await this.store.phase(turn, "model_settled");
        return result;
      } catch (error) {
        const notDispatched =
          !invoked ||
          (error instanceof FleetError && error.notDispatched) ||
          Boolean(this.provider.tracksDispatch && !dispatched);
        if (notDispatched) await this.store.notDispatched(allocation);
        else await this.store.recordUsage(allocation, null, null);
        await observation
          .recordDebug(turn, "thinking", "Model execution failed", {
            execution,
            code: safeCode(error),
            elapsedMs: Math.max(0, this.store.now().getTime() - modelStartedAt),
            notDispatched,
          })
          .catch(() => {});
        throw error;
      }
    });
  }
}
