import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { isDeepStrictEqual } from "node:util";
import { recordCallRequest, recordCallResponse } from "../call-metrics.js";
import { transaction } from "../db.js";
import { FleetError, type ModelPort, type ModelSettings, safeCode } from "../domain.js";
import { modelCallBound } from "../model-bounds.js";
import { modelFailureProgress } from "../model-progress.js";
import { recoverModelOutput } from "../model-recovery.js";
import { Observability } from "../observability.js";
import type { Claim, Store } from "../store.js";
import type { CapacityDemand, CapacityResource } from "./cache-profile.js";
import { type FeedbackPolicy, runDecisionFeedback } from "./decision-feedback.js";
import type { TaskClaim, TaskStore } from "./tasks.js";
export type ModelResult = Awaited<ReturnType<ModelPort["decide"]>> & { allocationId?: string };
export class RouteCapacity {
  constructor(
    private store: Store,
    private policy: (model: ModelSettings) => {
      key: string;
      capacity: number;
      tokenCapacity?: number;
      resource?: CapacityResource;
    },
    private demand?: (request: Parameters<ModelPort["decide"]>[0]) => Promise<CapacityDemand>,
  ) {}
  async run<T>(
    claim: Claim,
    request: Parameters<ModelPort["decide"]>[0],
    operation: () => Promise<T>,
    siblingWorker = false,
  ): Promise<T> {
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
    let tokenUnits: number | null = null,
      resourceUnits: number | null = null;
    if (
      policy.resource &&
      (!/^[a-zA-Z0-9._-]{1,80}$/.test(policy.resource.unit) ||
        !/^[a-f0-9]{64}$/.test(policy.resource.fingerprint) ||
        !Number.isSafeInteger(policy.resource.capacity) ||
        policy.resource.capacity < 1 ||
        policy.resource.capacity > 4194304)
    )
      throw new FleetError("INVALID_PROVIDER_CAPACITY", true);
    if (policy.tokenCapacity !== undefined || policy.resource !== undefined) {
      if (
        (policy.tokenCapacity !== undefined &&
          (!Number.isSafeInteger(policy.tokenCapacity) ||
            policy.tokenCapacity < 1 ||
            policy.tokenCapacity > 4194304)) ||
        !this.demand
      )
        throw new FleetError("INVALID_PROVIDER_CAPACITY", true);
      // Tokenizer/network work stays outside accounting transactions.
      try {
        const demand = await this.demand(request);
        tokenUnits = typeof demand === "number" ? demand : demand.tokenUnits;
        resourceUnits = typeof demand === "number" ? null : demand.resourceUnits;
      } catch (error) {
        if (error instanceof FleetError && error.notDispatched) throw error;
        throw new FleetError("PROVIDER_TOKENIZER_UNAVAILABLE", true);
      }
      if (!Number.isSafeInteger(tokenUnits) || tokenUnits < 1 || tokenUnits > (policy.tokenCapacity ?? 4194304))
        throw new FleetError("PROVIDER_CONTEXT_CAPACITY", true);
      if (
        policy.resource &&
        (!Number.isSafeInteger(resourceUnits) ||
          resourceUnits === null ||
          resourceUnits < 1 ||
          resourceUnits > policy.resource.capacity)
      )
        throw new FleetError("PROVIDER_RESOURCE_CAPACITY", true);
      await this.store.active(claim);
    }
    await transaction(this.store.pool, async (db) => {
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,19281492))", [claim.id]);
      if (
        (
          await db.query(
            "SELECT 1 FROM model_capacity_leases WHERE turn_id=$1 AND (NOT $2::boolean OR NOT sibling_worker) LIMIT 1",
            [claim.id, siblingWorker],
          )
        ).rowCount
      )
        throw new FleetError("TURN_MODEL_CALL_ACTIVE", true);
      await db.query(
        "INSERT INTO model_capacity_routes(route_key,capacity,token_capacity,resource_unit,resource_capacity,resource_fingerprint) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING",
        [
          policy.key,
          policy.capacity,
          policy.tokenCapacity ?? null,
          policy.resource?.unit ?? null,
          policy.resource?.capacity ?? null,
          policy.resource?.fingerprint ?? null,
        ],
      );
      const row = (
        await db.query(
          "SELECT capacity,token_capacity,resource_unit,resource_capacity,resource_fingerprint FROM model_capacity_routes WHERE route_key=$1",
          [policy.key],
        )
      ).rows[0];
      if (
        row.capacity !== policy.capacity ||
        (row.token_capacity === null ? undefined : Number(row.token_capacity)) !== policy.tokenCapacity ||
        (row.resource_unit ?? undefined) !== policy.resource?.unit ||
        (row.resource_capacity === null ? undefined : Number(row.resource_capacity)) !== policy.resource?.capacity ||
        (row.resource_fingerprint ?? undefined) !== policy.resource?.fingerprint
      )
        throw new FleetError("PROVIDER_CAPACITY_MISMATCH", true);
      await db.query(
        "INSERT INTO model_capacity_leases(id,route_key,turn_id,state,expires_at,sibling_worker,token_units,resource_units) VALUES($1,$2,$3,'queued',$4,$5,$6,$7)",
        [id, policy.key, claim.id, claim.deadline, siblingWorker, tokenUnits, resourceUnits],
      );
    });
    try {
      await observation.record(claim, "thinking", "Provider capacity queued", {
        route: request.model.route,
        capacity: policy.capacity,
        tokenCapacity: policy.tokenCapacity,
        tokenUnits,
        resource: policy.resource,
        resourceUnits,
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
            await db.query(
              "SELECT count(*)::int n,coalesce(sum(coalesce(token_units,$2)),0)::text tokens,coalesce(sum(coalesce(resource_units,$3)),0)::text resources FROM model_capacity_leases WHERE route_key=$1 AND state='active'",
              [policy.key, policy.tokenCapacity ?? 0, policy.resource?.capacity ?? 0],
            )
          ).rows[0];
          const next = (
            await db.query(
              "SELECT id FROM model_capacity_leases WHERE route_key=$1 AND state='queued' ORDER BY sequence LIMIT 1",
              [policy.key],
            )
          ).rows[0];
          if (
            active.n >= policy.capacity ||
            next?.id !== id ||
            (policy.tokenCapacity !== undefined &&
              Number(active.tokens) + (tokenUnits ?? policy.tokenCapacity) > policy.tokenCapacity) ||
            (policy.resource !== undefined &&
              Number(active.resources) + (resourceUnits ?? policy.resource.capacity) > policy.resource.capacity)
          )
            return false;
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
        tokenCapacity: policy.tokenCapacity,
        tokenUnits,
        resource: policy.resource,
        resourceUnits,
        queueDelayMs: Math.max(0, this.store.now().getTime() - queuedAt),
      });
      await this.store.active(claim);
      return await operation();
    } finally {
      await this.store.pool.query("DELETE FROM model_capacity_leases WHERE id=$1", [id]);
    }
  }
  supportsOverlap(model: ModelSettings) {
    return model.route !== "codex-cli" && this.policy(model).capacity > 1;
  }
  wrap(model: ModelPort, current: () => Claim | undefined): ModelPort {
    return {
      tracksDispatch: model.tracksDispatch,
      contextWindow: (selected) => model.contextWindow?.(selected),
      decide: async (request) => {
        const claim = current();
        if (!claim) throw new FleetError("MODEL_CLAIM_REQUIRED", true);
        return this.run(claim, request, async () => {
          const allocations = (
            await this.store.pool.query(
              "SELECT a.allocation_id FROM architecture_allocations a JOIN compute_ledger l ON l.id=a.allocation_id WHERE a.turn_id=$1 AND l.status='reserved' ORDER BY l.created_at LIMIT 2",
              [claim.id],
            )
          ).rows;
          if (!allocations.length) return model.decide(request);
          if (allocations.length !== 1) throw new FleetError("MODEL_ALLOCATION_SCOPE_MISMATCH", true);
          const id = allocations[0].allocation_id;
          await this.store.active(claim);
          await this.store.pool.query(
            "UPDATE architecture_allocations SET tracked=$2,dispatch_state=$3,updated_at=$4 WHERE allocation_id=$1",
            [
              id,
              Boolean(model.tracksDispatch),
              model.tracksDispatch ? "prepared" : "invoking_untracked",
              this.store.now(),
            ],
          );
          return model.decide({
            ...request,
            onDispatch: async () => {
              await this.store.active(claim);
              await request.onDispatch?.();
              await this.store.pool.query(
                "UPDATE architecture_allocations SET dispatch_state='dispatched',updated_at=$2 WHERE allocation_id=$1",
                [id, this.store.now()],
              );
            },
          });
        });
      },
    };
  }
}
export type ModelStage = { kind: "worker" | "coordinator"; focusId?: string; retryReserveCalls?: number };
export class ModelAdmission {
  constructor(
    private store: Store,
    private tasks: TaskStore,
    private provider: ModelPort,
    private capacity: RouteCapacity,
    private guard?: (claim: TaskClaim) => Promise<void>,
    private siblingWorkers = false,
    private settledReview?: (claim: TaskClaim, result: ModelResult) => Promise<void>,
  ) {}
  guarded(guard: (claim: TaskClaim) => Promise<void>, siblingWorkers = false) {
    return new ModelAdmission(
      this.store,
      this.tasks,
      this.provider,
      this.capacity,
      guard,
      siblingWorkers,
      this.settledReview,
    );
  }
  /** Operator review happens after known usage is durably settled, outside the
   * provider uncertainty handler, and before any correction or engine action. */
  reviewed(review: (claim: TaskClaim, result: ModelResult) => Promise<void>) {
    return new ModelAdmission(
      this.store,
      this.tasks,
      this.provider,
      this.capacity,
      this.guard,
      this.siblingWorkers,
      review,
    );
  }
  supportsSiblingReasoning(model: ModelSettings) {
    return this.siblingWorkers && this.capacity.supportsOverlap(model);
  }
  /** Planning snapshot only. Each actual call still reserves atomically in the shared ledger. */
  async remainingCalls(claim: TaskClaim): Promise<number> {
    return transaction(this.store.pool, async (db) => {
      await db.query("SELECT id FROM cohorts WHERE id=$1 FOR UPDATE", [claim.turn.cohortId]);
      await this.tasks.check(claim, db);
      const cohort = await this.store.cohort(claim.turn.cohortId, db),
        b = cohort.budget;
      if (!b) return 0;
      const turn = (await db.query("SELECT calls FROM turns WHERE id=$1", [claim.turn.id])).rows[0];
      let remaining = Math.max(0, b.maxCallsPerTurn - turn.calls);
      if (b.mode !== "continuous") {
        const period = b.mode === "daily" ? this.store.now().toISOString().slice(0, 10) : "lifetime";
        const used = (
          await db.query(
            "SELECT count(*)::int calls,coalesce(sum(tokens),0)::text tokens FROM compute_ledger WHERE cohort_id=$1 AND period=$2",
            [cohort.id, period],
          )
        ).rows[0];
        remaining = Math.max(
          0,
          Math.min(
            remaining,
            b.callLimit - used.calls,
            Number((BigInt(b.tokenLimit) - BigInt(used.tokens)) / BigInt(b.perCallTokenLimit)),
          ),
        );
      }
      return remaining;
    });
  }
  async decide(
    claim: TaskClaim,
    request: Parameters<ModelPort["decide"]>[0],
    stage?: ModelStage,
  ): Promise<ModelResult> {
    if (request.decisionEvidence && request.decisionEvidence.bindingId !== claim.bindingId)
      throw new FleetError("DECISION_BINDING_SCOPE_REQUIRED", true);
    const cohort = await this.store.cohort(claim.turn.cohortId);
    const floor = stage?.kind === "worker" ? (stage.retryReserveCalls ?? 1) : 0;
    return recoverModelOutput(request, {
      inputByteLimit: cohort.budget?.inputByteLimit ?? 0,
      attempt: (input, attempt) => this.decideOnce(claim, input, stage, attempt > 1 ? floor : 0),
      canRetry: async () => (await this.remainingCalls(claim)) > floor,
      onRetry: async (detail) => {
        await new Observability(this.store).recordDebug(claim.turn, "thinking", "Model output retry", {
          ...detail,
          ...(stage ? { stage } : {}),
          policy: "One corrective attempt within existing allowance; no command replay or mode change.",
        });
      },
    });
  }
  /** Explicit semantic correction; each proposal is separately admitted and accounted.
   * The trusted engine supplies validation. This never executes or retries a game command. */
  async decideWithFeedback(
    claim: TaskClaim,
    request: Parameters<ModelPort["decide"]>[0],
    policy: Pick<FeedbackPolicy, "validate" | "maxAttempts" | "prepareRetry">,
    stage?: ModelStage,
  ) {
    if (request.decisionEvidence && request.decisionEvidence.bindingId !== claim.bindingId)
      throw new FleetError("DECISION_BINDING_SCOPE_REQUIRED", true);
    const cohort = await this.store.cohort(claim.turn.cohortId);
    const floor = stage?.kind === "worker" ? (stage.retryReserveCalls ?? 1) : 0;
    const outcome = await runDecisionFeedback(request, {
      ...policy,
      inputByteLimit: cohort.budget?.inputByteLimit ?? 0,
      attempt: (input, n) => this.decideOnce(claim, input, stage, n > 1 ? floor : 0),
      canRetry: async () => (await this.remainingCalls(claim)) > floor,
    });
    await new Observability(this.store).recordDebug(claim.turn, "thinking", "Bounded proposal feedback", {
      stopReason: outcome.stopReason,
      ...outcome.metrics,
    });
    return outcome;
  }
  private async decideOnce(
    claim: TaskClaim,
    request: Parameters<ModelPort["decide"]>[0],
    stage?: ModelStage,
    reserveCalls = 0,
  ): Promise<ModelResult> {
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
    const settled = await this.capacity.run(
      turn,
      request,
      async () => {
        await this.guard?.(claim);
        await this.tasks.check(claim);
        if (this.provider.tracksDispatch) await this.store.phase(turn, "model_preparing_tracked");
        const allocation = await this.store.reserveCall(turn, reserveCalls);
        await this.store.pool.query(
          "UPDATE architecture_allocations SET tracked=$2,updated_at=$3 WHERE allocation_id=$1",
          [allocation, Boolean(this.provider.tracksDispatch), this.store.now()],
        );
        let dispatched = false,
          invoked = false,
          execution = 0,
          modelStartedAt = this.store.now().getTime();
        const observation = new Observability(this.store);
        try {
          await recordCallRequest(this.store, allocation, request, budget.inputByteLimit, this.provider);
          await this.store.phase(turn, this.provider.tracksDispatch ? "model_reserved_tracked" : "model_reserved");
          execution = (await this.store.pool.query("SELECT calls FROM turns WHERE id=$1", [turn.id])).rows[0].calls;
          await observation.recordDebug(turn, "ready", "Model request", {
            execution,
            allocationId: allocation,
            ...(stage ? { stage: { ...stage, parentBudgetId: turn.cohortId, taskId: claim.taskId } } : {}),
            model: request.model,
            messages: request.messages,
            outputSchema: request.schema,
            maxOutputTokens: request.maxOutputTokens,
          });
          modelStartedAt = this.store.now().getTime();
          await this.tasks.check(claim);
          if (!this.provider.tracksDispatch) {
            const update = await this.store.pool.query(
              "UPDATE architecture_allocations a SET dispatch_state='invoking_untracked',updated_at=$2 WHERE allocation_id=$1 AND EXISTS(SELECT 1 FROM compute_ledger l WHERE l.id=a.allocation_id AND l.status='reserved')",
              [allocation, this.store.now()],
            );
            if (
              !update.rowCount &&
              (await this.store.pool.query("SELECT 1 FROM architecture_operations WHERE turn_id=$1", [turn.id]))
                .rowCount
            )
              throw new FleetError("TASK_FENCED", true);
          }
          invoked = true;
          const result = await this.provider.decide({
            ...request,
            signal: AbortSignal.any([
              request.signal,
              AbortSignal.timeout(
                Math.max(
                  1,
                  Math.min(modelCallBound(request.model), claim.turn.deadline.getTime() - this.store.now().getTime()),
                ),
              ),
            ]),
            onDispatch: async () => {
              await this.tasks.check(claim);
              await this.store.phase(turn, "model_dispatched");
              await this.store.pool.query(
                "UPDATE architecture_allocations SET dispatch_state='dispatched',updated_at=$2 WHERE allocation_id=$1",
                [allocation, this.store.now()],
              );
              dispatched = true;
              await request.onDispatch?.();
            },
          });
          const elapsedMs = Math.max(0, this.store.now().getTime() - modelStartedAt);
          await this.store.recordUsage(allocation, result.inputTokens, result.outputTokens);
          await recordCallResponse(this.store, allocation, result, elapsedMs);
          await observation.recordDebug(turn, "deciding", "Model response", {
            execution,
            allocationId: allocation,
            ...(stage ? { stage: { ...stage, parentBudgetId: turn.cohortId, taskId: claim.taskId } } : {}),
            elapsedMs,
            decision: result.decision,
            decisionError: result.decisionError ?? null,
            outputText: result.outputText ?? null,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            providerMetadata: result.providerMetadata ?? null,
            generationProgress: result.execution,
            coverage: "Provider final answer only; provider internal reasoning is not captured.",
          });
          if (result.inputTokens === null || result.outputTokens === null) throw new FleetError("USAGE_UNKNOWN");
          if (result.inputTokens + result.outputTokens > budget.perCallTokenLimit)
            throw new FleetError("USAGE_EXCEEDED");
          await this.tasks.check(claim);
          await this.store.phase(turn, "model_settled");
          return { ...result, allocationId: allocation };
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
              allocationId: allocation,
              ...(stage ? { stage: { ...stage, parentBudgetId: turn.cohortId, taskId: claim.taskId } } : {}),
              code: safeCode(error),
              elapsedMs: Math.max(0, this.store.now().getTime() - modelStartedAt),
              notDispatched,
              generationProgress: modelFailureProgress(error),
            })
            .catch(() => {});
          throw error;
        }
      },
      this.siblingWorkers && stage?.kind === "worker",
    );
    if (this.settledReview) {
      await this.settledReview(claim, settled);
      await this.tasks.check(claim);
    }
    return settled;
  }
}
