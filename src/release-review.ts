import { z } from "zod";

const sha = z.string().regex(/^[a-f0-9]{40}$/);
/** Pure review gate. Passing this is necessary evidence, never deployment authority. */
export const ReleaseReview = z
  .object({
    schemaVersion: z.literal("fleet.release-review.v1"),
    source: z
      .object({ gameCommit: sha, fleetCommit: sha, contractsDigest: z.string().regex(/^[a-f0-9]{64}$/) })
      .strict(),
    compatibleContracts: z.boolean(),
    migrationRehearsed: z.boolean(),
    preservationVerified: z.boolean(),
    retentionReviewed: z.boolean(),
    rollbackRehearsed: z.boolean(),
    quiescence: z
      .object({
        modelCalls: z.number().int().nonnegative(),
        pendingCommands: z.number().int().nonnegative(),
        credentialOperations: z.number().int().nonnegative(),
        callbacks: z.number().int().nonnegative(),
        workersFenced: z.boolean(),
      })
      .strict(),
    canaries: z.array(
      z
        .object({
          population: z.enum(["server_luna_50", "local_llm_10", "local_cognition_10"]),
          accountIds: z.array(z.string().uuid()).min(1),
          callLimit: z.number().int().positive(),
          tokenLimit: z.number().int().positive(),
          deadline: z.string().datetime(),
          minimumRounds: z.number().int().min(3),
          sourceQualified: z.boolean(),
          providerQualified: z.boolean(),
        })
        .strict(),
    ),
    ownerAuthorityResolved: z.boolean(),
    deploymentAuthorized: z.boolean(),
    pushAuthorized: z.boolean(),
  })
  .strict();
export function reviewRelease(value: unknown) {
  const v = ReleaseReview.parse(value),
    blockers: string[] = [];
  for (const key of [
    "compatibleContracts",
    "migrationRehearsed",
    "preservationVerified",
    "retentionReviewed",
    "rollbackRehearsed",
    "ownerAuthorityResolved",
    "deploymentAuthorized",
  ] as const)
    if (!v[key]) blockers.push(key);
  if (
    !v.quiescence.workersFenced ||
    [
      v.quiescence.modelCalls,
      v.quiescence.pendingCommands,
      v.quiescence.credentialOperations,
      v.quiescence.callbacks,
    ].some((n) => n !== 0)
  )
    blockers.push("quiescence");
  if (!v.canaries.length) blockers.push("exact_canary_proposal");
  for (const canary of v.canaries)
    if (!canary.sourceQualified || !canary.providerQualified) blockers.push(`qualification:${canary.population}`);
  const all = v.canaries.flatMap((c) => c.accountIds);
  if (new Set(all).size !== all.length) blockers.push("duplicate_canary_identity");
  return {
    readyForAuthorizedDeployment: blockers.length === 0,
    pushAuthorized: v.pushAuthorized,
    blockers,
    meaning: "Review evidence only; this function performs no deployment, account change, inference, replay or push.",
  };
}
