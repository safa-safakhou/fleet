import { randomUUID } from "node:crypto";
import { z } from "zod";
import { transaction } from "../../db.js";
import { FleetError } from "../../domain.js";
import type { ResearchBroker } from "../broker/server.js";
import type { WorkerSession } from "../broker/session.js";
import { canonical, digest, type OperationKey, type RunScope } from "../contracts.js";
import { ManifestRepository } from "../manifests/repository.js";
export const EvaluationInputSchema = z
  .object({
    datasetId: z.string().min(1).max(200),
    candidateId: z.string().min(1).max(200),
    caseId: z.string().min(1).max(200),
    phase: z.enum(["candidate", "teacher", "judge", "repair"]),
    format: z.enum(["decision", "dspy"]).default("decision"),
    prompt: z.string().min(1).max(20000),
  })
  .strict();
export type EvaluationGrant = {
  datasetId: string;
  datasetDigest: string;
  mode: "offline";
  split: "development" | "train-development" | "heldout";
  maxCalls: number;
  budgetId?: string;
  totalCalls?: number;
  maxTokens?: string;
  cases: { id: string; split: string }[];
  candidates: string[];
};
/** Installed by the native kernel for an isolated evaluation operation, never by a worker request. */
export class EvaluationBroker {
  private constructor(
    readonly broker: ResearchBroker,
    readonly scope: RunScope,
    readonly grant: EvaluationGrant,
    readonly id: string,
  ) {}
  static async install(broker: ResearchBroker, scope: RunScope, grant: EvaluationGrant) {
    await broker.journal.assertCurrent(scope);
    const manifest = await new ManifestRepository(broker.store.pool).load(scope.manifestDigest);
    if (
      grant.mode !== "offline" ||
      grant.maxCalls < 1 ||
      grant.maxCalls > 16 ||
      manifest.tools.length ||
      manifest.roles.some((r) => r.authority !== "advisory") ||
      manifest.evaluation.dataset !== grant.datasetDigest ||
      manifest.evaluation.split !== grant.split ||
      BigInt(manifest.limits.calls) < BigInt(grant.maxCalls)
    )
      throw new FleetError("EVALUATION_SCOPE_REQUIRED", true);
    const id = randomUUID();
    const budgetId = grant.budgetId ?? randomUUID();
    if (!grant.budgetId)
      await broker.store.pool.query("INSERT INTO research_evaluation_budgets VALUES($1,$2,$3)", [
        budgetId,
        grant.totalCalls ?? grant.maxCalls,
        grant.maxTokens ?? "1000000",
      ]);
    await broker.store.pool.query("INSERT INTO research_evaluation_grants VALUES($1,$2,$3,$4,'offline',$5,$6)", [
      id,
      scope.operationId,
      budgetId,
      grant.datasetDigest,
      grant.maxCalls,
      broker.store.now(),
    ]);
    grant = { ...grant, budgetId };
    return new EvaluationBroker(broker, scope, structuredClone(grant), id);
  }
  async dispatch(session: WorkerSession, scope: RunScope, key: OperationKey, raw: unknown) {
    const input = EvaluationInputSchema.parse(raw);
    if (
      canonical(scope) !== canonical(this.scope) ||
      input.datasetId !== this.grant.datasetId ||
      !this.grant.candidates.includes(input.candidateId)
    )
      throw new FleetError("EVALUATION_SCOPE_REQUIRED", true);
    const row = this.grant.cases.find((c) => c.id === input.caseId);
    if (
      !row ||
      (row.split === "heldout" && this.grant.split !== "heldout") ||
      (this.grant.split === "heldout" && row.split !== "heldout") ||
      (this.grant.split === "development" && row.split !== "development") ||
      (input.phase === "teacher" && row.split !== "train")
    )
      throw new FleetError("DATASET_SCOPE_DENIED", true);
    const nativeContext = await this.broker.sessions.assert(session, scope);
    const tokenReservation = nativeContext.ports.services.configuration.budget.perCallTokenLimit;
    const hash = digest({ operationId: scope.operationId, input }),
      purpose =
        input.phase === "teacher"
          ? "optimizer"
          : input.phase === "judge"
            ? "judge"
            : input.phase === "repair"
              ? "correction"
              : "decision";
    await transaction(this.broker.store.pool, async (db) => {
      await this.broker.journal.assertCurrent(scope, db);
      const budget = (
        await db.query(
          "SELECT b.* FROM research_evaluation_budgets b JOIN research_evaluation_grants g ON g.budget_id=b.id WHERE g.id=$1 FOR UPDATE OF b",
          [this.id],
        )
      ).rows[0];
      const existing = (
        await db.query("SELECT input_digest FROM research_evaluation_calls WHERE grant_id=$1 AND logical_step_id=$2", [
          this.id,
          key.logicalStepId,
        ])
      ).rows[0];
      if (existing) {
        if (existing.input_digest !== hash) throw new FleetError("EVALUATION_INPUT_CONFLICT", true);
        return;
      }
      const count = (
        await db.query("SELECT count(*)::int n FROM research_evaluation_calls WHERE grant_id=$1", [this.id])
      ).rows[0].n;
      const total = (
        await db.query(
          "SELECT count(*)::int n,coalesce(sum(CASE WHEN c.allocation_id IS NOT NULL THEN l.tokens WHEN c.status='not_dispatched' THEN 0 ELSE c.token_reservation END),0)::text tokens FROM research_evaluation_calls c JOIN research_evaluation_grants g ON g.id=c.grant_id LEFT JOIN compute_ledger l ON l.id=c.allocation_id WHERE g.budget_id=$1",
          [budget.id],
        )
      ).rows[0];
      if (count >= this.grant.maxCalls || total.n >= budget.max_calls)
        throw new FleetError("EVALUATION_CALL_CAP", true);
      if (BigInt(total.tokens) + BigInt(tokenReservation) > BigInt(budget.max_tokens))
        throw new FleetError("EVALUATION_TOKEN_CAP", true);
      await db.query(
        "INSERT INTO research_evaluation_calls(grant_id,logical_step_id,input_digest,dataset_id,candidate_id,case_id,phase,purpose,token_reservation,status,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'reserved',$10)",
        [
          this.id,
          key.logicalStepId,
          hash,
          input.datasetId,
          input.candidateId,
          input.caseId,
          input.phase,
          purpose,
          tokenReservation,
          this.broker.store.now(),
        ],
      );
    });
    try {
      const result = await this.broker.capture.withPurpose(purpose, () =>
        this.broker.requestModel(session, scope, key, {
          messages: [
            {
              role: "system",
              content: JSON.stringify({
                fleetEvaluation: { caseId: input.caseId, candidateId: input.candidateId, phase: input.phase },
              }),
            },
            { role: "user", content: input.prompt },
          ],
          schema: { type: "object", additionalProperties: true },
          maxOutputTokens: 100,
          purpose: "helper",
        }),
      );
      await this.broker.store.pool.query(
        "UPDATE research_evaluation_calls SET allocation_id=$3,status=$4 WHERE grant_id=$1 AND logical_step_id=$2",
        [this.id, key.logicalStepId, result.allocationId ?? null, result.status],
      );
      return result;
    } catch (error) {
      const native = (
        await this.broker.store.pool.query(
          "SELECT result FROM research_steps WHERE operation_id=$1 AND logical_step_id=$2",
          [scope.operationId, key.logicalStepId],
        )
      ).rows[0]?.result;
      await this.broker.store.pool.query(
        "UPDATE research_evaluation_calls SET allocation_id=$3,status=$4 WHERE grant_id=$1 AND logical_step_id=$2",
        [this.id, key.logicalStepId, native?.allocationId ?? null, native?.status ?? "not_dispatched"],
      );
      throw error;
    }
  }
}
