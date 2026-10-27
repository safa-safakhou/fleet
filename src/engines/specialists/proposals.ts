import { z } from "zod";
import type { Observation } from "../../platform/contracts.js";

export type { Proposal } from "../../platform/contracts.js";

const label = z.string().min(1).max(200),
  ref = z.string().min(1).max(8000),
  units = z.string().regex(/^\d{1,30}$/),
  data = z.record(z.string(), z.unknown());
export const DomainTimeSchema = z.object({ clockId: label, value: label }).strict();
export const StructuredClaimSchema = z.discriminatedUnion("kind", [
  z.object({ schemaId: label, key: label, kind: z.literal("resource"), units }).strict(),
  z.object({ schemaId: label, key: label, kind: z.literal("authority"), units }).strict(),
  z.object({ schemaId: label, key: label, kind: z.literal("promise"), value: label }).strict(),
]);
export const CoordinationFrameSchema = z
  .object({
    schemaVersion: z.literal("fleet.coordination.v1"),
    evidenceFrameRef: z.uuid().optional(),
    atomicExpectedVersion: z.literal(true),
    claimSchemas: z.array(z.object({ id: label, kind: z.enum(["resource", "authority", "promise"]) }).strict()).max(32),
    capacities: z.array(z.object({ schemaId: label, key: label, remainingUnits: units }).strict()).max(64),
    promises: z.array(z.object({ schemaId: label, key: label, value: label }).strict()).max(64),
    focuses: z
      .array(z.object({ id: label, sourceRefs: z.array(ref).min(1).max(20), observation: data }).strict())
      .max(20),
    ownerPriorities: data,
    coverage: data,
  })
  .strict();
export const ProposalSchema = z
  .object({
    taskId: label,
    evidenceFrameRef: z.uuid().optional(),
    intent: z
      .object({
        commandId: z.uuid(),
        bindingId: label,
        schemaId: label,
        expectedVersion: z.string().min(1).max(200),
        payload: data,
      })
      .strict(),
    evidenceRefs: z.array(ref).min(1).max(20),
    expectedOutcome: data,
    claims: z.array(StructuredClaimSchema).max(16),
    conflicts: z.array(label).max(12),
    validUntil: DomainTimeSchema.optional(),
  })
  .strict();
export const WorkerResultSchema = z
  .object({
    summary: z.string().max(400),
    deferral: z
      .object({
        reason: z.enum(["different_owner_priority", "resource_reserve", "risk_review", "deliberate_pacing"]),
        explanation: z.string().min(1).max(240),
        reconsiderWhen: z.string().min(1).max(160),
      })
      .strict()
      .optional(),
    proposal: ProposalSchema.omit({ taskId: true, evidenceFrameRef: true })
      .extend({ intent: z.object({ schemaId: label, payload: data }).strict() })
      .strict()
      .nullable(),
  })
  .strict();
/** Only declared, environment-checked structured effects; language consistency is a separate judgment. */
export function checkProposals(
  raw: unknown[],
  observation: Observation,
): { valid: boolean; code: string; conflictRefs: string[] } {
  const deny = (code: string, ref = "") => ({ valid: false, code, conflictRefs: ref ? [ref] : [] });
  const frame = CoordinationFrameSchema.safeParse(observation.coordination);
  if (!frame.success) return deny("COORDINATION_PROTOCOL_REQUIRED");
  const proposals = raw.map((p) => ProposalSchema.safeParse(p));
  if (proposals.some((p) => !p.success)) return deny("INVALID_PROPOSAL");
  const schemas = new Map(frame.data.claimSchemas.map((s) => [s.id, s.kind]));
  if (schemas.size !== frame.data.claimSchemas.length) return deny("INVALID_CLAIM_PROTOCOL");
  const pools = new Map<string, bigint>(),
    promises = new Map<string, string>(),
    conflicts = new Set<string>(),
    commands = new Set<string>();
  for (const pool of frame.data.capacities) {
    const key = JSON.stringify([pool.schemaId, pool.key]);
    if (pools.has(key) || !["resource", "authority"].includes(schemas.get(pool.schemaId) ?? ""))
      return deny("INVALID_CLAIM_PROTOCOL");
    pools.set(key, BigInt(pool.remainingUnits));
  }
  for (const promise of frame.data.promises) {
    const key = JSON.stringify([promise.schemaId, promise.key]);
    if (schemas.get(promise.schemaId) !== "promise" || (promises.has(key) && promises.get(key) !== promise.value))
      return deny("INVALID_CLAIM_PROTOCOL");
    promises.set(key, promise.value);
  }
  for (const parsed of proposals) {
    if (!parsed.success) continue;
    const p = parsed.data;
    if (p.intent.expectedVersion !== observation.revision) return deny("STALE_PROPOSAL", p.intent.commandId);
    if (commands.has(p.intent.commandId)) return deny("DUPLICATE_PROPOSAL", p.intent.commandId);
    commands.add(p.intent.commandId);
    if (p.evidenceRefs.some((r) => !observation.sourceRefs.includes(r))) return deny("PROPOSAL_SOURCE_NOT_OBSERVED");
    if (p.validUntil) {
      const t = p.validUntil,
        current = observation.environmentTime;
      if (t.clockId !== current.clockId) return deny("PROPOSAL_CLOCK_UNAVAILABLE");
      const expired =
        t.clockId === "utc"
          ? !Number.isFinite(Date.parse(t.value)) ||
            !Number.isFinite(Date.parse(current.value)) ||
            Date.parse(t.value) <= Date.parse(current.value)
          : !/^\d+$/.test(t.value) || !/^\d+$/.test(current.value) || BigInt(t.value) <= BigInt(current.value);
      if (expired) return deny("STALE_PROPOSAL", p.intent.commandId);
    }
    for (const ref of p.conflicts) {
      if (conflicts.has(ref)) return deny("DECLARED_PROPOSAL_CONFLICT", ref);
      conflicts.add(ref);
    }
    for (const c of p.claims) {
      if (schemas.get(c.schemaId) !== c.kind) return deny("UNSUPPORTED_CLAIM_SCHEMA", c.schemaId);
      const key = JSON.stringify([c.schemaId, c.key]);
      if (c.kind === "promise") {
        if (promises.has(key) && promises.get(key) !== c.value) return deny("STRUCTURED_PROMISE_CONFLICT", key);
        promises.set(key, c.value);
      } else {
        const available = pools.get(key);
        if (available === undefined) return deny("UNKNOWN_CLAIM_CAPACITY", key);
        if (BigInt(c.units) > available) return deny("STRUCTURED_CAPACITY_CONFLICT", key);
        pools.set(key, available - BigInt(c.units));
      }
    }
  }
  return { valid: true, code: "STRUCTURED_CLAIMS_COMPATIBLE", conflictRefs: [] };
}
