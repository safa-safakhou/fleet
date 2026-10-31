import { Ajv } from "ajv";
import { FleetError } from "../../domain.js";
import { canonical, digest } from "../contracts.js";
import schema from "../generated/run-manifest-schema.js";
import { recipeManifestIssues } from "../recipes/pact-reference.js";
export interface RunManifestInput {
  schemaVersion: "fleet.run/v1";
  profile: { id: string; version: string };
  build: { source: string; build: string; dependencies: string };
  environment: {
    kind: "pact";
    bindingId: string;
    worldIncarnation: string;
    apiVersion: string;
    observationVersion: string;
    effectsVersion: string;
  };
  components: Record<string, string>;
  roles: { id: string; authority: "actor" | "advisory" }[];
  model: { route: string; model: string; parameters: { maxOutputTokens: number; temperature?: number; topP?: number } };
  context: { policy: string; maxBytes: number; maxTokens: number; maxObservationAgeMs: number; compression: boolean };
  retrieval: { strategy: "baseline-v1" | "fts-v1" | "vector-exact-v1" | "rrf-v1"; language: string; topK: number };
  memory: {
    namespace: string;
    indexPolicy: "disabled" | "consented";
    indexConsentRef?: string;
    embedding?: { revision: string; digest: string; dimension: number; normalization: "l2" | "none" };
  };
  tools: string[];
  clock: { observationId: string; deadlineId: string; deadlineValue: string };
  limits: { calls: string; tokens: string; concurrency: number };
  evidence: { required: boolean; retentionDays: 30; maxArtifactBytes: string };
  protections: {
    identity: boolean;
    permission: boolean;
    lease: boolean;
    privacy: boolean;
    budget: boolean;
    fencing: boolean;
    journal: boolean;
  };
  checkpoint: { version: string };
  evaluation: { evaluator: string; dataset: string; split: string };
  seed: string;
  expectedCapabilityDigest?: string;
}
export interface CapabilityFingerprint {
  components: Record<string, string[]>;
  environment: {
    apiVersion: string;
    observationVersion: string;
    effectsVersion: string;
    worldIncarnation: string;
    clockId: string;
  };
  model: { route: string; model: string; jsonSchema: boolean; tools: boolean; contextWindow: number };
  checkpointVersion: string;
  maxObservationAgeMs: number;
  allowedTools: string[];
  indexGrants: { ref: string; bindingId: string; namespace: string; embeddingRevision?: string; dimension?: number }[];
}
export interface ResolvedRunManifest extends RunManifestInput {
  status: "experimental";
  capabilityDigest: string;
}
export type ValidationIssue = { code: string; path: string };
const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);
export function isManifestInput(input: unknown): input is RunManifestInput {
  return Boolean(validate(input));
}
export function validateCompatibility(input: RunManifestInput, capability: CapabilityFingerprint): ValidationIssue[] {
  if (!validate(input)) return [{ code: "INVALID_MANIFEST", path: validate.errors?.[0]?.instancePath ?? "" }];
  const errors: ValidationIssue[] = [...recipeManifestIssues(input)];
  const fail = (code: string, path: string) => errors.push({ code, path });
  for (const [name, ref] of Object.entries(input.components))
    if (!Object.hasOwn(capability.components, name) || !capability.components[name].includes(ref))
      fail("COMPONENT_UNSUPPORTED", `/components/${name}`);
  if (Object.values(input.protections).some((v) => v !== true) || !input.evidence.required)
    fail("PROTECTION_REQUIRED", "/protections");
  if (
    input.clock.observationId !== capability.environment.clockId ||
    input.clock.deadlineId !== input.clock.observationId
  )
    fail("CLOCK_INCOMPATIBLE", "/clock");
  if (
    input.clock.deadlineId === "utc"
      ? !Number.isFinite(Date.parse(input.clock.deadlineValue)) ||
        new Date(input.clock.deadlineValue).toISOString() !== input.clock.deadlineValue
      : !/^(0|[1-9][0-9]*)$/.test(input.clock.deadlineValue)
  )
    fail("CLOCK_INCOMPATIBLE", "/clock/deadlineValue");
  if (input.context.maxObservationAgeMs > capability.maxObservationAgeMs)
    fail("OBSERVATION_STALE", "/context/maxObservationAgeMs");
  if (!capability.model.jsonSchema || (input.tools.length > 0 && !capability.model.tools))
    fail("MODEL_SCHEMA_UNSUPPORTED", "/model");
  if (input.model.route !== capability.model.route || input.model.model !== capability.model.model)
    fail("CAPABILITY_CHANGED", "/model");
  for (const key of ["apiVersion", "observationVersion", "effectsVersion", "worldIncarnation"] as const)
    if (input.environment[key] !== capability.environment[key]) fail("CAPABILITY_CHANGED", `/environment/${key}`);
  if (input.expectedCapabilityDigest && input.expectedCapabilityDigest !== digest(capability))
    fail("CAPABILITY_CHANGED", "/expectedCapabilityDigest");
  if (input.checkpoint.version !== capability.checkpointVersion) fail("CHECKPOINT_INCOMPATIBLE", "/checkpoint");
  if (input.context.maxTokens + input.model.parameters.maxOutputTokens > capability.model.contextWindow)
    fail("CONTEXT_CAPACITY_REQUIRED", "/context");
  if (input.tools.some((tool) => !capability.allowedTools.includes(tool))) fail("TOOL_UNSUPPORTED", "/tools");
  if (
    input.roles.filter((r) => r.authority === "actor").length > 1 ||
    new Set(input.roles.map((r) => r.id)).size !== input.roles.length
  )
    fail("AUTHORITY_CONFLICT", "/roles");
  for (const key of [input.limits.calls, input.limits.tokens, input.evidence.maxArtifactBytes])
    if (BigInt(key) < 1n || BigInt(key) > 18446744073709551615n) fail("RESOURCE_LIMIT_INVALID", "/limits");
  const e = input.memory.embedding;
  if (e && e.dimension < 1) fail("EMBEDDING_INCOMPATIBLE", "/memory/embedding");
  if (["vector-exact-v1", "rrf-v1"].includes(input.retrieval.strategy) && !e)
    fail("EMBEDDING_INCOMPATIBLE", "/memory/embedding");
  const needsIndex = input.retrieval.strategy !== "baseline-v1" || input.memory.indexPolicy === "consented";
  const grant = capability.indexGrants.find(
    (g) =>
      g.ref === input.memory.indexConsentRef &&
      g.bindingId === input.environment.bindingId &&
      g.namespace === input.memory.namespace,
  );
  if (needsIndex && (input.memory.indexPolicy !== "consented" || !grant)) fail("INDEX_PERMISSION_REQUIRED", "/memory");
  if (e && grant && (grant.embeddingRevision !== e.revision || grant.dimension !== e.dimension))
    fail("EMBEDDING_INCOMPATIBLE", "/memory/embedding");
  return errors;
}
export function compileManifest(
  input: RunManifestInput,
  capability: CapabilityFingerprint,
): { manifest: ResolvedRunManifest; digest: string } {
  // Reject non-JSON values before normalization can erase them.
  canonical(input);
  canonical(capability);
  const issues = validateCompatibility(input, capability);
  if (issues.length) throw new FleetError(issues[0].code, true);
  const manifest: ResolvedRunManifest = {
    ...structuredClone(input),
    model: { ...input.model, parameters: { temperature: 1, topP: 1, ...input.model.parameters } },
    status: "experimental",
    capabilityDigest: digest(capability),
  };
  return { manifest, digest: digest(manifest) };
}
