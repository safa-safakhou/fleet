import { z } from "zod";
import type { Data } from "./domain.js";
import type { EnvironmentAdapter } from "./platform/contracts.js";
import {
  AdapterDescriptor,
  EvidenceCoverage,
  ProfileEvidenceSchema,
  QualificationEnvironment,
  QualificationProfile,
  qualifyProfile,
} from "./qualification.js";

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
export const PreservationReview = ReleaseReview.omit({ canaries: true });
function preservationBlockers(v: z.infer<typeof PreservationReview>) {
  const blockers: string[] = [];
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
  return blockers;
}
export function reviewRelease(value: unknown) {
  const v = ReleaseReview.parse(value),
    blockers = preservationBlockers(v);
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

const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const ProfileReleaseReview = z
  .object({
    schemaVersion: z.literal("fleet.profile-release.v1"),
    release: PreservationReview,
    reviewedAt: z.string().datetime(),
    runAuthorized: z.boolean(),
    dependencyAuditPassed: z.boolean(),
    runs: z
      .array(
        z
          .object({
            profile: QualificationProfile,
            environment: QualificationEnvironment,
            adapter: AdapterDescriptor,
            configurationDigest: digest,
            provider: z
              .object({ route: z.string().min(1).max(200), model: z.string().min(1).max(200), settingsDigest: digest })
              .strict(),
            actors: z
              .array(z.object({ cohortId: z.string().uuid(), actorRef: z.string().min(1).max(2000) }).strict())
              .min(1)
              .max(100),
            callLimit: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
            tokenLimit: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
            perCallTokenLimit: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
            concurrency: z.literal(1),
            startsAt: z.string().datetime(),
            deadline: z.string().datetime(),
            minimumRounds: z.number().int().min(3),
            stopConditions: z.array(
              z.enum(["unknown_usage", "pending_command", "authorization_loss", "deadline", "budget"]),
            ),
            monitoringRefs: z.array(z.string().min(1).max(2000)).min(1).max(100),
            evidence: z.array(ProfileEvidenceSchema).max(100),
          })
          .strict(),
      )
      .max(20),
  })
  .strict();
/** Shared preservation review plus environment-neutral bounded run proposals. Never executes the proposal. */
export function reviewProfileRelease(manifest: Data): ReturnType<typeof reviewRelease> & { executionEnabled: boolean } {
  const v = ProfileReleaseReview.parse(manifest),
    blockers = preservationBlockers(v.release);
  if (!v.runs.length) blockers.push("exact_run_proposal");
  if (!v.runAuthorized) blockers.push("run_authorization");
  if (!v.dependencyAuditPassed) blockers.push("dependency_audit");
  const identities = new Set<string>(),
    cohorts = new Set<string>();
  for (const [index, run] of v.runs.entries()) {
    const mark = (reason: string) => blockers.push(`run:${index}:${reason}`);
    const adapter: EnvironmentAdapter = {
      ...run.adapter,
      presentation: { accountLabel: "Account", actorLabel: "Actor", entityLabel: "Entity", defaultGoal: "" },
      connect: async () => {
        throw Error("REVIEW_ONLY");
      },
    };
    const qualification = qualifyProfile(run.profile, adapter, run.evidence);
    if (!qualification.liveQualified) for (const missing of qualification.missing) mark(`qualification:${missing}`);
    if (run.environment.id !== adapter.ref.id || run.environment.version !== adapter.ref.version) mark("environment");
    if (Date.parse(run.startsAt) < Date.parse(v.reviewedAt) || Date.parse(run.deadline) <= Date.parse(run.startsAt))
      mark("time_window");
    if (run.tokenLimit < run.perCallTokenLimit) mark("token_cap");
    if (
      ["unknown_usage", "pending_command", "authorization_loss", "deadline", "budget"].some(
        (c) => !run.stopConditions.includes(c as (typeof run.stopConditions)[number]),
      )
    )
      mark("stop_conditions");
    for (const e of run.evidence) {
      if (e.profile.id !== run.profile.id || e.profile.version !== run.profile.version) {
        mark("foreign_profile");
        continue;
      }
      const c = EvidenceCoverage.safeParse(e.coverage);
      if (!c.success) {
        mark("invalid_evidence");
        continue;
      }
      if (
        e.environment.id !== run.environment.id ||
        e.environment.version !== run.environment.version ||
        e.environment.instanceId !== run.environment.instanceId
      )
        mark("evidence_environment");
      if (
        c.data.fleetCommit !== v.release.source.fleetCommit ||
        c.data.environmentCommit !== v.release.source.gameCommit ||
        c.data.contractsDigest !== v.release.source.contractsDigest ||
        c.data.configurationDigest !== run.configurationDigest
      )
        mark("evidence_source_configuration");
      const provider = c.data.provider;
      if (
        e.kind === "real_provider" &&
        (!provider ||
          provider.route !== run.provider.route ||
          provider.model !== run.provider.model ||
          provider.settingsDigest !== run.provider.settingsDigest)
      )
        mark("evidence_provider");
    }
    const localCohorts = new Set<string>();
    for (const actor of run.actors) {
      const identity = JSON.stringify([run.environment, actor.actorRef]);
      if (identities.has(identity) || cohorts.has(actor.cohortId)) blockers.push("duplicate_run_identity");
      identities.add(identity);
      localCohorts.add(actor.cohortId);
    }
    for (const id of localCohorts) cohorts.add(id);
  }
  const unique = [...new Set(blockers)];
  return {
    readyForAuthorizedDeployment: unique.length === 0,
    pushAuthorized: v.release.pushAuthorized,
    blockers: unique,
    executionEnabled: unique.length === 0,
    meaning:
      "Review evidence only; this function performs no deployment, account change, inference, replay or push. executionEnabled describes proposal eligibility, never an operational switch.",
  };
}
