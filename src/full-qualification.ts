import { createHash } from "node:crypto";
import { z } from "zod";
import type { RecallPort } from "./cognition.js";
import { transaction } from "./db.js";
import { FleetError, type ModelPort, safeCode } from "./domain.js";
import {
  type PreparedQualification,
  prepareQualification,
  type QualificationFixtures,
  type QualificationLedger,
  qualificationModelDigest,
  runQualification,
} from "./qualification-run.js";
export const FullQualificationApproval = z
  .object({
    schemaVersion: z.literal("fleet.full-local-qualification.v1"),
    id: z.uuid(),
    authorizationRef: z.string().min(5).max(160),
    approved: z.literal(true),
    sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
    historyRunId: z.uuid(),
    historyDigest: z.string().regex(/^[a-f0-9]{64}$/),
    baselineExecutions: z.literal(96),
    baselineReservedTokens: z.literal(3840000),
    startsAt: z.iso.datetime(),
    deadlineAt: z.iso.datetime(),
    thinkingPlanId: z.uuid(),
    nonThinkingPlanId: z.uuid(),
    endpoint: z.string(),
    helperEndpoint: z.string(),
    modelDigest: z.literal(qualificationModelDigest),
    scope: z.literal("synthetic_fixtures_only"),
    executionLimit: z.literal(208),
    tokenLimit: z.literal(8320000),
    helperLimit: z.literal(96),
  })
  .strict();
export function prepareFullQualification(raw: unknown) {
  const approval = FullQualificationApproval.parse(raw);
  if (new Set([approval.id, approval.thinkingPlanId, approval.nonThinkingPlanId, approval.historyRunId]).size !== 4)
    throw new FleetError("QUALIFICATION_BATCH_SCOPE");
  const plans = [true, false].map((thinking) =>
    prepareQualification({
      schemaVersion: "fleet.local-qualification.v3",
      id: thinking ? approval.thinkingPlanId : approval.nonThinkingPlanId,
      authorizationRef: `${approval.authorizationRef}:${thinking}`,
      approved: true,
      fleetCommit: approval.sourceCommit,
      modelDigest: approval.modelDigest,
      model: { route: "ollama", model: "nemotron-3-nano:4b", thinking },
      endpoint: approval.endpoint,
      helperEndpoint: approval.helperEndpoint,
      startsAt: approval.startsAt,
      deadlineAt: approval.deadlineAt,
      scope: approval.scope,
      executionLimit: 104,
      tokenLimit: 4160000,
      helperLimit: 48,
    }),
  );
  approval.endpoint = plans[0].plan.endpoint;
  approval.helperEndpoint = plans[0].plan.helperEndpoint;
  return { approval, plans, digest: createHash("sha256").update(JSON.stringify(approval)).digest("hex") };
}
export type FullQualification = ReturnType<typeof prepareFullQualification>;
export async function createFullQualification(ledger: QualificationLedger, p: FullQualification) {
  await transaction(ledger.pool, async (db) => {
    const old = (
      await db.query(
        "SELECT *,now()>=$2::timestamptz AND now()<$3::timestamptz timely FROM qualification_runs WHERE id=$1 FOR UPDATE",
        [p.approval.historyRunId, p.approval.startsAt, p.approval.deadlineAt],
      )
    ).rows[0];
    if (old?.digest !== p.approval.historyDigest || old.state !== "blocked" || !old.timely)
      throw new FleetError("QUALIFICATION_BATCH_HISTORY");
    const usage = (
      await db.query(
        "SELECT count(*)::int n,coalesce(sum(tokens),0)::int tokens,count(*) FILTER(WHERE state IN('prepared','dispatched','unknown'))::int unresolved FROM qualification_calls WHERE run_id=$1",
        [p.approval.historyRunId],
      )
    ).rows[0];
    if (usage.n !== 96 || usage.tokens !== 3840000 || usage.unresolved)
      throw new FleetError("QUALIFICATION_BATCH_HISTORY");
    if (
      (
        await db.query("SELECT 1 FROM qualification_batches WHERE id=$1 OR authorization_ref=$2 OR history_run_id=$3", [
          p.approval.id,
          p.approval.authorizationRef,
          p.approval.historyRunId,
        ])
      ).rowCount
    )
      throw new FleetError("QUALIFICATION_BATCH_AUTHORIZATION_REUSED");
    await db.query(
      "INSERT INTO qualification_batches(id,authorization_ref,history_run_id,digest,plan) VALUES($1,$2,$3,$4,$5)",
      [p.approval.id, p.approval.authorizationRef, p.approval.historyRunId, p.digest, p.approval],
    );
    for (const plan of p.plans) {
      await ledger.create(plan, db);
      await db.query("INSERT INTO qualification_batch_runs(batch_id,run_id,thinking) VALUES($1,$2,$3)", [
        p.approval.id,
        plan.plan.id,
        plan.plan.model.thinking,
      ]);
    }
  });
}
export async function fullQualificationSummary(ledger: QualificationLedger, p: FullQualification) {
  const modes = await Promise.all(
    p.plans.map(async (plan) => ({
      thinking: plan.plan.model.thinking,
      runId: plan.plan.id,
      ...(await ledger.summary(plan)),
    })),
  );
  const batch = (await ledger.pool.query("SELECT state,code FROM qualification_batches WHERE id=$1", [p.approval.id]))
    .rows[0];
  return {
    state: batch?.state ?? "not_created",
    code: batch?.code ?? null,
    passed: batch?.state === "done" && modes.every((m) => m.passed),
    rawPassed: batch?.state === "done" && modes.every((m) => m.rawPassed),
    executions: modes.reduce((n, m) => n + m.executions, 0),
    reservedTokens: modes.reduce((n, m) => n + m.reservedTokens, 0),
    accountedTokens: modes.reduce((n, m) => n + m.accountedTokens, 0),
    reportedTokens: modes.reduce((n, m) => n + m.reportedInputTokens + m.reportedOutputTokens, 0),
    unknown: modes.reduce((n, m) => n + m.unknown, 0),
    helperCalls: modes.reduce((n, m) => n + m.helperCalls, 0),
    modes,
  };
}
export async function runFullQualification(
  ledger: QualificationLedger,
  p: FullQualification,
  ports: {
    model: ModelPort;
    recall: RecallPort;
    fixtures: (p: PreparedQualification) => Promise<QualificationFixtures>;
    progress?: (event: Record<string, unknown>) => void;
  },
) {
  await createFullQualification(ledger, p);
  for (const plan of p.plans) {
    try {
      await runQualification(plan, {
        ledger,
        model: ports.model,
        recall: ports.recall,
        fixtures: await ports.fixtures(plan),
        progress: (event) => ports.progress?.({ thinking: plan.plan.model.thinking, ...event }),
      });
    } catch (error) {
      ports.progress?.({ thinking: plan.plan.model.thinking, error: safeCode(error) });
    }
    const result = await fullQualificationSummary(ledger, p);
    if (result.unknown || result.modes.some((m) => m.unresolved || m.unsafeTrials) || result.state !== "active") {
      await ledger.pool.query(
        "UPDATE qualification_batches SET state='blocked',code=coalesce(code,'QUALIFICATION_BATCH_STOPPED') WHERE id=$1",
        [p.approval.id],
      );
      return fullQualificationSummary(ledger, p);
    }
  }
  await ledger.pool.query("UPDATE qualification_batches SET state='done' WHERE id=$1 AND state='active'", [
    p.approval.id,
  ]);
  return fullQualificationSummary(ledger, p);
}
