import { randomUUID } from "node:crypto";
import { z } from "zod";
import { designDigest } from "./negotiation-plan.js";

const digest = z.string().regex(/^[a-f0-9]{64}$/),
  revision = z.string().regex(/^[a-f0-9]{40}$/),
  selectionSchema = z
    .object({
      sources: z.object({ fleet: revision, pact: revision }).strict(),
      modelDigest: digest,
      policyDigest: digest,
      settingsDigest: digest,
      bundleDigest: digest,
      batchNonce: z.uuid().optional(),
    })
    .strict();
export function prepareSpecialistQualification(raw: unknown) {
  const parsed = selectionSchema.parse(raw),
    selection = { ...parsed, batchNonce: parsed.batchNonce ?? randomUUID() };
  const cells = (["resources-diplomacy", "full"] as const).flatMap((preset) =>
    (["advisory", "guarded"] as const).flatMap((skillMode) =>
      (["existing-goal", "changed-consent-reserve"] as const).map((scenario) => {
        const roles =
            preset === "full" ? ["resources", "diplomacy", "defense", "development"] : ["resources", "diplomacy"],
          n = roles.length,
          cell = {
            id: `KQ1:${preset}:${skillMode}:${scenario}`,
            selection,
            profile: { id: "autonomous-specialists", version: "1" },
            preset,
            skillMode,
            scenario,
            counterexampleTiming:
              scenario === "changed-consent-reserve" ? "before_first_model_decision" : "not_applicable",
            roles,
            limits: {
              turnsPerRole: 4,
              callsPerTurn: 3,
              calls: n * 12,
              reservedTokens: n * 480000,
              reservationPerCall: 40000,
              inputBytes: 24000,
              outputTokens: 2000,
              wallDeadlineMs: 2700000,
              gameHorizonMinutes: 120,
            },
            workLimits: { reads: n * 128, actions: n * 12, messages: n * 32, steps: n * 256, wallTimeMs: 7200000 },
          };
        return { ...cell, configurationDigest: designDigest(cell) };
      }),
    ),
  );
  const protocol = {
    schemaVersion: "fleet.specialist-qualification-protocol.v1" as const,
    stage: "KQ1" as const,
    batchNonce: selection.batchNonce,
    selection,
    cells,
    maxima: { turns: 96, calls: 288, reservedTokens: 11520000, wallDeadlineMs: 21600000 },
    productionQualification: false,
  };
  return { ...protocol, digest: designDigest(protocol) };
}
export type SpecialistProtocol = ReturnType<typeof prepareSpecialistQualification>;
export type SpecialistCell = SpecialistProtocol["cells"][number];
const bindingSchema = z
  .object({
    cellId: z.string().min(1),
    worldId: z.uuid(),
    cohortId: z.uuid(),
    actorId: z.uuid(),
    peerId: z.uuid(),
    bindingId: z.uuid(),
    fixtureNonce: digest,
    evidenceRef: z.string().min(1),
    keyRef: z.string().min(1),
  })
  .strict();
export const SpecialistGrantSchema = z
  .object({
    schemaVersion: z.literal("fleet.specialist-qualification-grant.v1"),
    approved: z.literal(true),
    authorizationRef: z.string().min(1),
    protocolDigest: digest,
    batchNonce: z.uuid(),
    startsAt: z.iso.datetime(),
    cutoffAt: z.iso.datetime(),
    scope: z.literal("new_owned_synthetic_worlds"),
    bindings: z.array(bindingSchema).length(8),
  })
  .strict();
export type SpecialistGrant = z.infer<typeof SpecialistGrantSchema>;
export function validateSpecialistGrant(
  protocol: SpecialistProtocol,
  raw: unknown,
  now: number,
  usedNonces: string[] = [],
) {
  const reasons: string[] = [],
    parsed = SpecialistGrantSchema.safeParse(raw);
  let canonical: SpecialistProtocol | undefined;
  try {
    canonical = prepareSpecialistQualification(protocol.selection);
  } catch {
    /* Refuse malformed selections. */
  }
  if (!canonical || designDigest(canonical) !== designDigest(protocol)) reasons.push("KQ1_CHANGED_PROTOCOL");
  if (!parsed.success) return { valid: false, reasons: [...reasons, "KQ1_EXACT_GRANT_REQUIRED"] };
  const grant = parsed.data;
  if (grant.protocolDigest !== protocol.digest || grant.batchNonce !== protocol.batchNonce)
    reasons.push("KQ1_GRANT_SCOPE");
  if (
    !Number.isFinite(now) ||
    Date.parse(grant.startsAt) > now ||
    Date.parse(grant.cutoffAt) <= now ||
    Date.parse(grant.cutoffAt) <= Date.parse(grant.startsAt) ||
    Date.parse(grant.cutoffAt) - Date.parse(grant.startsAt) > 21600000
  )
    reasons.push("KQ1_UTC_WINDOW");
  if (usedNonces.includes(grant.batchNonce)) reasons.push("KQ1_NONCE_CONSUMED");
  const identities = new Set<string>();
  for (const b of grant.bindings)
    for (const id of [b.worldId, b.cohortId, b.actorId, b.peerId, b.bindingId]) {
      if (identities.has(id)) reasons.push("KQ1_DUPLICATE_IDENTITY");
      identities.add(id);
    }
  if (
    new Set(grant.bindings.map((b) => b.cellId)).size !== 8 ||
    protocol.cells.some((c) => !grant.bindings.some((b) => b.cellId === c.id))
  )
    reasons.push("KQ1_CELL_BINDINGS");
  return { valid: !reasons.length, reasons: [...new Set(reasons)] };
}

const units = z.number().int().nonnegative();
const evidenceSchema = z
  .object({
    complete: z.boolean(),
    evidenceLevel: z.enum(["fake-provider", "real-provider"]),
    sourceRefs: z.array(z.string().min(1)).min(1),
    allocations: z.array(
      z
        .object({
          id: z.uuid(),
          reservedTokens: units,
          inputTokens: units.nullable(),
          outputTokens: units.nullable(),
          status: z.enum(["reported", "unknown", "not_dispatched"]),
        })
        .strict(),
    ),
    roleTurns: z.record(z.string(), units),
    criticalFailures: z.array(z.string().min(1)),
    actualFullDelivery: z.boolean(),
    exactExistingGoal: z.boolean(),
    zeroCallReuseOpportunities: units,
    prohibitedEffects: units,
    learningObserved: z.boolean(),
    work: z.object({ reads: units, actions: units, messages: units, steps: units, wallTimeMs: units }).strict(),
  })
  .strict();
export type SpecialistCellEvidence = z.infer<typeof evidenceSchema>;
/** Diagnostic evidence only. Never upgrades a failed negotiation release gate. */
export function assessSpecialistCell(cell: SpecialistCell, raw: unknown) {
  const canonical = prepareSpecialistQualification(cell.selection).cells.find((c) => c.id === cell.id);
  if (!canonical || designDigest(canonical) !== designDigest(cell)) throw Error("KQ1_CHANGED_CELL");
  const e = evidenceSchema.parse(raw),
    criticalFailures = [...e.criticalFailures],
    reasons: string[] = [];
  let measuredTokens: number | null = 0,
    reservedTokens = 0,
    unknownReservedTokens = 0;
  const ids = new Set<string>();
  for (const a of e.allocations) {
    if (ids.has(a.id)) throw Error("KQ1_DUPLICATE_ALLOCATION");
    ids.add(a.id);
    reservedTokens += a.reservedTokens;
    if (a.reservedTokens !== 40000) criticalFailures.push("KQ1_RESERVATION_DRIFT");
    if (a.status === "unknown") {
      unknownReservedTokens += a.reservedTokens;
      measuredTokens = null;
      criticalFailures.push("KQ1_UNKNOWN_USAGE");
    } else if (a.status === "reported") {
      if (a.inputTokens === null || a.outputTokens === null) throw Error("KQ1_MISSING_REPORTED_USAGE");
      if (a.inputTokens + a.outputTokens > a.reservedTokens) criticalFailures.push("KQ1_USAGE_EXCEEDS_RESERVATION");
      if (measuredTokens !== null) measuredTokens += a.inputTokens + a.outputTokens;
    }
  }
  if (e.allocations.length > cell.limits.calls || reservedTokens > cell.limits.reservedTokens)
    criticalFailures.push("KQ1_MODEL_CAP");
  if (Object.entries(e.roleTurns).some(([r, n]) => !cell.roles.includes(r) || n > 4))
    criticalFailures.push("KQ1_ROLE_TURN_CAP");
  if (cell.roles.some((r) => e.roleTurns[r] !== 4)) reasons.push("KQ1_ROLE_COVERAGE");
  if (Object.entries(e.work).some(([k, n]) => n > cell.workLimits[k as keyof typeof cell.workLimits]))
    criticalFailures.push("KQ1_PARENT_WORK_CAP");
  if (e.prohibitedEffects) criticalFailures.push("KQ1_PROHIBITED_EFFECT");
  if (!e.complete) reasons.push("KQ1_INCOMPLETE_EVIDENCE");
  if (e.evidenceLevel !== "real-provider") reasons.push("KQ1_REAL_PROVIDER_UNQUALIFIED");
  if (!e.allocations.some((a) => a.status === "reported")) reasons.push("KQ1_NO_REPORTED_MODEL_EVIDENCE");
  if (cell.scenario === "existing-goal") {
    if (!e.exactExistingGoal) reasons.push("KQ1_NO_PRIOR_EXACT_GOAL");
    if (!e.actualFullDelivery) reasons.push("KQ1_FULL_DELIVERY_UNOBSERVED");
    if (cell.skillMode === "guarded" && !e.zeroCallReuseOpportunities) reasons.push("KQ1_ZERO_CALL_REUSE_UNOBSERVED");
  }
  return {
    cellId: cell.id,
    evidenceLevel: e.evidenceLevel,
    status: criticalFailures.length || reasons.length ? ("fail" as const) : ("pass" as const),
    productionQualified: false as const,
    criticalFailures: [...new Set(criticalFailures)],
    reasons,
    allocations: e.allocations.length,
    reservedTokens,
    measuredTokens,
    unknownReservedTokens,
    work: e.work,
    learningObserved: e.learningObserved,
    sourceRefs: e.sourceRefs,
  };
}
