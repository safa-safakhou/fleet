import { createHash } from "node:crypto";
import { fromBinary, fromJson, toBinary, toJson } from "@bufbuild/protobuf";
import { z } from "zod";
import { BrokerEnvelopeSchema } from "./generated/fleet/v1/worker_pb.js";
export const Decimal = z
  .string()
  .regex(/^(0|[1-9][0-9]*)$/)
  .refine((v) => BigInt(v) <= 18446744073709551615n);
const id = z.string().min(1).max(2000);
export const ScopeSchema = z
  .object({
    runId: id,
    agentId: id,
    bindingId: id,
    turnId: id,
    taskId: id,
    operationId: id,
    operationEpoch: Decimal,
    participantId: id.optional(),
    manifestDigest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type RunScope = z.infer<typeof ScopeSchema>;
export const KeySchema = z.object({ operationId: id, operationEpoch: Decimal, logicalStepId: id }).strict();
export type OperationKey = z.infer<typeof KeySchema>;
export const ArtifactSchema = z
  .object({
    id,
    contentType: id,
    bytes: Decimal,
    chunks: Decimal,
    ciphertextDigest: z.string().regex(/^[a-f0-9]{64}$/),
    privacyClass: id,
    retentionClass: id,
  })
  .strict();
export type ArtifactRef = z.infer<typeof ArtifactSchema>;
export const RefSchema = z.object({ id, kind: id }).strict();
export type ResultRef = z.infer<typeof RefSchema>;
export const ResultSchema = z
  .object({
    status: z.enum(["completed", "not_dispatched", "pending", "unknown"]),
    allocationId: id.optional(),
    commandId: id.optional(),
    usage: z.object({ inputTokens: Decimal.nullable(), outputTokens: Decimal.nullable() }).strict().nullable(),
    artifacts: z.array(ArtifactSchema).optional(),
    resultRef: RefSchema.optional(),
  })
  .strict();
export type BrokerResult = z.infer<typeof ResultSchema>;
export const CoverageSchema = z
  .object({
    status: z.enum(["complete", "partial", "unavailable", "withheld", "expired"]),
    expected: Decimal,
    recorded: Decimal,
    reasons: z.array(id),
  })
  .strict()
  .refine((x) => BigInt(x.recorded) <= BigInt(x.expected));
export type Coverage = z.infer<typeof CoverageSchema>;
export const EnvelopeSchema = z
  .object({
    protocolVersion: z.literal(1),
    counter: Decimal,
    scope: ScopeSchema.optional(),
    result: ResultSchema.optional(),
    coverage: CoverageSchema.optional(),
  })
  .strict();
export type BrokerEnvelope = z.infer<typeof EnvelopeSchema>;
export function encodeEnvelope(input: unknown): Uint8Array {
  const value = EnvelopeSchema.parse(input);
  return toBinary(BrokerEnvelopeSchema, fromJson(BrokerEnvelopeSchema, value));
}
export function decodeEnvelope(bytes: Uint8Array): BrokerEnvelope {
  const raw = toJson(BrokerEnvelopeSchema, fromBinary(BrokerEnvelopeSchema, bytes)) as Record<string, unknown>;
  raw.counter ??= "0";
  if (raw.scope) (raw.scope as Record<string, unknown>).operationEpoch ??= "0";
  if (raw.result) {
    const result = raw.result as Record<string, unknown>;
    result.usage ??= null;
    if (Array.isArray(result.artifacts))
      for (const artifact of result.artifacts) {
        artifact.bytes ??= "0";
        artifact.chunks ??= "0";
      }
    if (result.usage) {
      const usage = result.usage as Record<string, unknown>;
      usage.inputTokens ??= null;
      usage.outputTokens ??= null;
    }
  }
  if (raw.coverage) {
    const c = raw.coverage as Record<string, unknown>;
    c.expected ??= "0";
    c.recorded ??= "0";
    c.reasons ??= [];
  }
  return EnvelopeSchema.parse(raw);
}
/** Canonical JSON is for Fleet-owned validated JSON values, not Protobuf binary identity. */
export function canonical(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype)
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  throw Error("NON_JSON_VALUE");
}
export const digest = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");
export type { CheckpointRef, WorkerCheckpoint } from "./generated/fleet/v1/common_pb.js";
export { ContractLimit } from "./generated/fleet/v1/common_pb.js";
export type { EventRef, EvidenceEvent } from "./generated/fleet/v1/evidence_pb.js";
export type { DecisionProposal, GameQuery, ModelRequest } from "./generated/fleet/v1/worker_pb.js";
export type {
  CapabilityFingerprint,
  ResolvedRunManifest,
  RunManifestInput,
  ValidationIssue,
} from "./manifests/compiler.js";
