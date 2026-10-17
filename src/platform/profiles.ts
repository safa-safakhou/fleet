import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { ModelSettings } from "../domain.js";
import baseline from "../engines/legacy/baseline.json" with { type: "json" };
import type { Claim } from "../store.js";

export interface EngineProfileRef {
  id: string;
  version: string;
}

export function legacyProfileFor(model: ModelSettings): EngineProfileRef {
  return { id: model.cognition ? "legacy-cognition" : "legacy-loop", version: "1" };
}

export interface LegacyManifest {
  sourceRevision: string;
  artifactDigest: string;
  configurationDigest: string;
  provenance: "recorded" | "inferred_legacy";
}

export interface LegacyExecution {
  provenance: "recorded";
  profile: EngineProfileRef;
  baseline: { sourceRevision: string; artifactDigest: string; artifactKind: "source-snapshot" };
  configurationDigest: string;
  continuity: { cognition: string | null; recallAssist: string | null };
}

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const RetainedExecution = z
  .object({
    provenance: z.literal("recorded"),
    profile: z.object({ id: z.enum(["legacy-loop", "legacy-cognition"]), version: z.literal("1") }).strict(),
    baseline: z
      .object({
        sourceRevision: z.string().regex(/^[a-f0-9]{40}$/),
        artifactDigest: digest,
        artifactKind: z.literal("source-snapshot"),
      })
      .strict(),
    configurationDigest: digest,
    continuity: z
      .object({
        cognition: z.literal("llm-centered-v1").nullable(),
        recallAssist: z.literal("laya-recall-v1").nullable(),
      })
      .strict(),
  })
  .strict();

export function retainedLegacyExecution(value: unknown): LegacyExecution | undefined {
  const parsed = RetainedExecution.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

const execution = new AsyncLocalStorage<{ turnId: string; detail: LegacyExecution }>();

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}

/** Records a reference to the pinned source baseline, never a claim about the installed binary. */
export function legacyManifestFor(claim: Claim, integrationId: string): LegacyManifest {
  const configuration = {
    model: claim.cohort.model,
    budget: claim.cohort.budget,
    intervalMinutes: claim.cohort.interval_minutes,
    anchorAt: claim.cohort.anchor_at?.toISOString() ?? null,
    ordinal: claim.agent.ordinal,
    strategy: claim.agent.strategy,
    ownerGuidance: claim.cohort.owner_guidance,
    ownerPolicy: claim.cohort.synthetic_owner_policy,
    integrationId,
  };
  return {
    sourceRevision: baseline.sourceRevision,
    artifactDigest: baseline.artifactDigest,
    configurationDigest: createHash("sha256")
      .update(JSON.stringify(canonical(configuration)))
      .digest("hex"),
    provenance: "recorded",
  };
}

export function withLegacyExecution<T>(claim: Claim, integrationId: string, operation: () => T): T {
  if (!claim.cohort.model || !claim.cohort.budget) return operation();
  const manifest = legacyManifestFor(claim, integrationId);
  return execution.run(
    {
      turnId: claim.id,
      detail: {
        provenance: "recorded",
        profile: legacyProfileFor(claim.cohort.model),
        baseline: {
          sourceRevision: manifest.sourceRevision,
          artifactDigest: manifest.artifactDigest,
          artifactKind: "source-snapshot",
        },
        configurationDigest: manifest.configurationDigest,
        continuity: {
          cognition: claim.cohort.model.cognition ?? null,
          recallAssist: claim.cohort.model.recallAssist ?? null,
        },
      },
    },
    operation,
  );
}

export function legacyExecutionFor(turnId: string): LegacyExecution | undefined {
  const current = execution.getStore();
  return current?.turnId === turnId ? current.detail : undefined;
}

export function inferredLegacyExecution() {
  return {
    provenance: "inferred_legacy" as const,
    profile: null,
    baseline: null,
    configurationDigest: null,
    continuity: null,
    coverage:
      "No retained consented engine manifest. Legacy family association only; exact historical version and configuration are unrecorded, expired or withheld.",
  };
}
