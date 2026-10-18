import { createHash } from "node:crypto";
import { z } from "zod";
import type { Data } from "./domain.js";
import { safeCode } from "./domain.js";
import { compileGenerationSchema } from "./model-schema.js";
import type {
  CapabilityRequirements,
  EnvironmentAdapter,
  EnvironmentRef,
  SchemaRequirements,
} from "./platform/contracts.js";
import { requireCapabilities } from "./platform/environment-registry.js";
import type { EngineProfileRef } from "./platform/profiles.js";
/** Validate a supplied offline output. This function has no provider/network capability. */
export function qualifyOutput(schema: Data, messages: unknown[], output: unknown, limit = 24000) {
  const schemaId = createHash("sha256").update(JSON.stringify(schema)).digest("hex"),
    inputBytes = Buffer.byteLength(JSON.stringify(messages)) + Buffer.byteLength(JSON.stringify(schema));
  if (inputBytes > limit)
    return {
      schemaId,
      inputBytes,
      valid: false,
      stage: "delivery",
      diagnostics: [{ schemaId, fieldPath: "/", code: "CONTEXT_LIMIT" }],
    };
  const validate = compileGenerationSchema(schema),
    valid = validate(output);
  return {
    schemaId,
    inputBytes,
    valid,
    stage: valid ? "validation" : "generation",
    diagnostics: (validate.errors ?? [])
      .slice(0, 20)
      .map((e) => ({ schemaId, fieldPath: e.instancePath || "/", code: e.keyword })),
  };
}

// Reviewed static metadata, checked against the composed runtime by acceptance tests.
// No constructors, connections or inference are used by qualification.
export function profileRequirements(
  profile: EngineProfileRef,
): { capabilities: CapabilityRequirements; schemas?: SchemaRequirements } | undefined {
  if (profile.version !== "1") return;
  switch (profile.id) {
    case "legacy-loop":
    case "legacy-cognition":
      return {
        capabilities: { timing: ["realtime"] },
        schemas: { observations: ["pact.observation.v1"], actions: ["pact.action.v1"] },
      };
    case "reactive-basic":
      return { capabilities: { eventDelivery: ["native", "poll"] } };
    case "reactive-cognition":
      return { capabilities: { eventDelivery: ["native", "poll"], continuity: true } };
    case "specialist-coordinator":
      return { capabilities: { continuity: true, coordination: true } };
  }
}
export const QualificationProfile = z
  .object({ id: z.string().min(1).max(100), version: z.string().min(1).max(40) })
  .strict();
export const QualificationEnvironment = QualificationProfile.extend({
  instanceId: z.string().min(1).max(2000),
}).strict();
export const AdapterDescriptor = z
  .object({
    ref: QualificationProfile,
    schemas: z
      .object({
        observations: z.array(z.string().min(1)).min(1).max(100),
        actions: z.array(z.string().min(1)).min(1).max(100),
      })
      .strict(),
    capabilities: z
      .object({
        timing: z.enum(["turn", "realtime"]),
        events: z.enum(["native", "poll", "none"]),
        idempotency: z.enum(["native", "none"]),
        outcomeLookup: z.boolean(),
        parallelReasoning: z.boolean(),
        social: z.boolean(),
        simulationControls: z.boolean(),
        continuity: z.boolean().optional(),
        coordination: z.boolean().optional(),
      })
      .strict(),
  })
  .strict();
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
export function adapterDigest(adapter: Pick<EnvironmentAdapter, "ref" | "schemas" | "capabilities">) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        canonical({
          ref: adapter.ref,
          schemas: {
            observations: [...adapter.schemas.observations].sort(),
            actions: [...adapter.schemas.actions].sort(),
          },
          capabilities: adapter.capabilities,
        }),
      ),
    )
    .digest("hex");
}
const digest = z.string().regex(/^[a-f0-9]{64}$/),
  commit = z.string().regex(/^[a-f0-9]{40}$/);
export const EvidenceCoverage = z
  .object({
    schemaVersion: z.literal("fleet.profile-evidence.v1"),
    fleetCommit: commit,
    environmentCommit: commit,
    contractsDigest: digest,
    configurationDigest: digest,
    adapterDigest: digest,
    checks: z.record(z.string(), z.boolean()),
    outputs: z
      .array(
        z
          .object({
            schema: z.record(z.string(), z.unknown()),
            messages: z.array(z.unknown()).max(100),
            output: z.unknown(),
            expectedValid: z.boolean(),
            limit: z.number().int().min(1).max(24000),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    provider: z
      .object({
        route: z.string().min(1).max(200),
        model: z.string().min(1).max(200),
        settingsDigest: digest,
        checks: z
          .object({ usage: z.boolean(), timeout: z.boolean(), output: z.boolean(), capacity: z.boolean() })
          .strict(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export const ProfileEvidenceSchema = z
  .object({
    kind: z.enum(["deterministic_fake", "real_provider"]),
    profile: QualificationProfile,
    environment: QualificationEnvironment,
    passed: z.boolean(),
    sourceRefs: z.array(z.string().min(1).max(2000)).min(1).max(100),
    coverage: z.record(z.string(), z.unknown()),
  })
  .strict();
export type ProfileEvidence = {
  kind: "deterministic_fake" | "real_provider";
  profile: EngineProfileRef;
  environment: EnvironmentRef;
  passed: boolean;
  sourceRefs: string[];
  coverage: Data;
};
export type ProfileQualification = {
  offlinePassed: boolean;
  liveQualified: boolean;
  missing: string[];
  evidenceRefs: string[];
};
/** Pure artifact review, not certification of artifact authenticity or permission to execute. */
export function qualifyProfile(
  profile: EngineProfileRef,
  adapter: EnvironmentAdapter,
  evidence: ProfileEvidence[],
): ProfileQualification {
  const missing = new Set<string>(),
    refs = new Set<string>(),
    requirements = profileRequirements(profile);
  const result = (offlinePassed = false, liveQualified = false) => ({
    offlinePassed,
    liveQualified,
    missing: [...missing].sort(),
    evidenceRefs: [...refs].sort(),
  });
  if (!requirements) {
    missing.add("unsupported_profile");
    return result();
  }
  try {
    AdapterDescriptor.parse({ ref: adapter.ref, schemas: adapter.schemas, capabilities: adapter.capabilities });
    requireCapabilities(adapter, requirements.capabilities, requirements.schemas);
  } catch (error) {
    missing.add(safeCode(error));
    return result();
  }
  if (evidence.length > 100) {
    missing.add("evidence_limit");
    return result();
  }
  const checks = [
    "baselinePreservation",
    "capabilityAcceptance",
    "unknownUsageRetention",
    "pendingReconciliation",
    "authorization",
    "accounting",
    "stopFencing",
    "retention",
  ];
  if (requirements.capabilities.eventDelivery) checks.push("events");
  if (requirements.capabilities.continuity) checks.push("continuity");
  if (requirements.capabilities.coordination) checks.push("coordination");
  const subjects = new Set<string>(),
    providers = new Set<string>();
  let fake = false,
    real = false;
  for (const raw of evidence) {
    if (raw.profile?.id !== profile.id || raw.profile?.version !== profile.version) continue;
    const parsed = ProfileEvidenceSchema.safeParse(raw),
      covered = EvidenceCoverage.safeParse(raw.coverage);
    if (!parsed.success || !covered.success) {
      missing.add("invalid_evidence");
      continue;
    }
    const e = parsed.data,
      c = covered.data;
    if (e.environment.id !== adapter.ref.id || e.environment.version !== adapter.ref.version) {
      missing.add("environment_mismatch");
      continue;
    }
    subjects.add(
      JSON.stringify([
        e.environment.instanceId,
        c.fleetCommit,
        c.environmentCommit,
        c.contractsDigest,
        c.configurationDigest,
      ]),
    );
    if (c.adapterDigest !== adapterDigest(adapter)) missing.add("adapter_digest");
    if (!e.passed) missing.add("failed_evidence");
    for (const check of checks) if (c.checks[check] !== true) missing.add(`coverage:${check}`);
    for (const output of c.outputs) {
      try {
        const q = qualifyOutput(output.schema, output.messages, output.output, output.limit);
        if (q.stage === "delivery" || q.valid !== output.expectedValid) missing.add("output_validation");
      } catch {
        missing.add("output_validation");
      }
    }
    if (!c.outputs.some((o) => o.expectedValid)) missing.add("positive_output_sample");
    if (e.kind === "real_provider") {
      if (!c.provider || Object.values(c.provider.checks).some((v) => !v)) missing.add("provider_coverage");
      if (c.provider) providers.add(JSON.stringify(c.provider));
      real = true;
    } else {
      if (c.provider !== null) missing.add("fake_provider_label");
      fake = true;
    }
    for (const ref of e.sourceRefs) refs.add(ref);
  }
  if (subjects.size > 1) missing.add("mixed_evidence_subjects");
  if (providers.size > 1) missing.add("mixed_provider_routes");
  const valid = missing.size === 0,
    offlinePassed = valid && fake;
  if (!fake) missing.add("deterministic_fake");
  if (!real) missing.add("real_provider");
  return result(offlinePassed, offlinePassed && real);
}
