import { z } from "zod";

const stages = ["delivery", "generation", "validation", "authority", "commit", "activation", "fulfilment"] as const;
const id = z.string().regex(/^[a-zA-Z0-9_.:+-]{1,160}$/);
/** Minimal consented aggregate evidence. Strict shape deliberately excludes prompts/messages/secrets. */
export const EvaluationRecord = z
  .object({
    replicaId: id,
    scenario: id,
    arm: id,
    seed: z.number().int(),
    split: z.enum(["development", "heldOut"]),
    evidence: z.enum(["deterministic_fake", "real_provider"]),
    configurationDigest: z.string().regex(/^[a-f0-9]{64}$/),
    attempted: z.array(z.enum(stages)),
    passed: z.array(z.enum(stages)),
    failedStage: z.enum(stages).nullable(),
    goalEligibility: z.enum(["supported", "owner_decision_required", "unsupported_mechanic"]),
    goalCompleted: z.boolean(),
    obligationsDue: z.number().int().nonnegative(),
    obligationsFulfilled: z.number().int().nonnegative(),
    materialBenefitVerified: z.boolean(),
    soloControlReplicaId: id.nullable(),
    authoritativeReadback: z.boolean(),
    justifiedWait: z.boolean(),
    calls: z.number().int().nonnegative(),
    reportedTokens: z.number().int().nonnegative(),
    unknownAllocatedTokens: z.number().int().nonnegative(),
    latencyMs: z.number().nonnegative(),
    diagnostics: z
      .array(
        z
          .object({
            schemaId: id,
            fieldPath: z
              .string()
              .regex(/^\/[a-zA-Z0-9_~/-]*$/)
              .max(180),
            code: id,
          })
          .strict(),
      )
      .max(20),
  })
  .strict()
  .superRefine((r, c) => {
    if (
      new Set(r.attempted).size !== r.attempted.length ||
      new Set(r.passed).size !== r.passed.length ||
      r.passed.some((s) => !r.attempted.includes(s)) ||
      (r.failedStage && (!r.attempted.includes(r.failedStage) || r.passed.includes(r.failedStage)))
    )
      c.addIssue({ code: "custom", message: "Inconsistent stage denominator" });
    if (
      r.obligationsFulfilled > r.obligationsDue ||
      (r.goalCompleted && r.goalEligibility !== "supported") ||
      ((r.goalCompleted || r.obligationsFulfilled > 0 || r.materialBenefitVerified) && !r.authoritativeReadback) ||
      (r.materialBenefitVerified && !r.soloControlReplicaId)
    )
      c.addIssue({ code: "custom", message: "Outcome requires eligible authoritative/control evidence" });
  });
export function evaluate(records: unknown[]) {
  const rows = records.map((r) => EvaluationRecord.parse(r));
  if (new Set(rows.map((r) => r.replicaId)).size !== rows.length) throw Error("DUPLICATE_REPLICA");
  if (new Set(rows.map((r) => r.evidence)).size > 1) throw Error("MIXED_EVIDENCE_LEVELS");
  // Return each arm/configuration/scenario/split separately; shared-world players are not replicas.
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = [row.scenario, row.arm, row.split, row.configurationDigest].join(":");
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups].map(([group, rs]) => {
    const count = (f: (r: (typeof rs)[number]) => boolean) => rs.filter(f).length;
    const useful = count((r) => r.goalCompleted || r.obligationsFulfilled > 0 || r.materialBenefitVerified),
      supported = count((r) => r.goalEligibility === "supported");
    const calls = rs.reduce((s, r) => s + r.calls, 0),
      reportedTokens = rs.reduce((s, r) => s + r.reportedTokens, 0),
      unknownAllocatedTokens = rs.reduce((s, r) => s + r.unknownAllocatedTokens, 0);
    return {
      group,
      evidence: rs[0]?.evidence,
      replicas: rs.length,
      goals: {
        completed: count((r) => r.goalCompleted),
        eligible: supported,
        unresolvedOrUnsupported: rs.length - supported,
      },
      stages: Object.fromEntries(
        stages.map((stage) => [
          stage,
          {
            attempted: count((r) => r.attempted.includes(stage)),
            passed: count((r) => r.passed.includes(stage)),
            failed: count((r) => r.failedStage === stage),
          },
        ]),
      ),
      obligations: {
        due: rs.reduce((s, r) => s + r.obligationsDue, 0),
        fulfilled: rs.reduce((s, r) => s + r.obligationsFulfilled, 0),
      },
      materialBenefitVersusSolo: count((r) => r.materialBenefitVerified),
      justifiedWaits: count((r) => r.justifiedWait),
      usefulOutcomes: useful,
      calls,
      reportedTokens,
      unknownAllocatedTokens,
      callsPerUsefulOutcome: useful ? calls / useful : null,
      conservativeTokensPerUsefulOutcome: useful ? (reportedTokens + unknownAllocatedTokens) / useful : null,
      meanLatencyMs: rs.reduce((s, r) => s + r.latencyMs, 0) / rs.length,
    };
  });
}
