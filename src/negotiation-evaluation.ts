import { z } from "zod";
import design from "./negotiation/design.json" with { type: "json" };
import { designDigest, type NegotiationCell, negotiationPlan } from "./negotiation-plan.js";
import { type RC1Cell, type RC1Protocol, validateRC1Cell } from "./post-e3-plan.js";
import {
  canonicalPostE3Protocol,
  type PostE3Cell,
  type PostE3Protocol,
  type RC2Cell,
  type RC2Protocol,
  validatePostE3Cell,
  validateRC2Cell,
} from "./post-e3-rc2-plan.js";

const id = z.string().min(1).max(200),
  source = z.string().min(1).max(8000),
  amount = z.string().regex(/^(0|[1-9][0-9]{0,29})$/),
  digest = z.string().regex(/^[a-f0-9]{64}$/);
const resources = z.object({ iron: amount, silver: amount, grain: amount }).strict();
const resource = z.enum(["iron", "silver", "grain"]);
const flow = z.object({ resource, wholePerHour: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }).strict();
const bond = z.object({ resource, wholeAmount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }).strict();
export const NegotiationTermsSchema = z
  .object({
    aToB: flow.nullable(),
    bToA: flow.nullable(),
    aBond: bond.nullable(),
    bBond: bond.nullable(),
    durationHours: z.literal(1),
    noticeHours: z.literal(0),
  })
  .strict();
export const NegotiationEvidenceSchema = z
  .object({
    schemaVersion: z.literal("pact.negotiation-outcome.v1"),
    cellId: id,
    worldId: id,
    rulesId: z.literal("pact-s1-v1"),
    configurationDigest: digest,
    initialStateDigest: digest,
    horizonGameTimeMs: amount,
    coverage: z
      .object({ complete: z.boolean(), sourceRefs: z.array(source).max(1000), omitted: z.array(id).max(50) })
      .strict(),
    actors: z
      .array(
        z
          .object({
            actorId: id,
            counterpartyId: id,
            goalDigest: digest,
            ordinaryStart: resources,
            ordinaryFinal: resources,
          })
          .strict(),
      )
      .length(2),
    offers: z
      .array(
        z
          .object({
            id,
            version: z.number().int().positive(),
            kingdomA: id,
            kingdomB: id,
            status: z.enum(["open", "active", "withdrawn", "expired", "superseded"]),
            signedBy: z.array(id).max(2),
            terms: NegotiationTermsSchema,
            expiresGameTimeMs: amount,
            sourceRefs: z.array(source).min(1).max(20),
          })
          .strict(),
      )
      .max(100),
    contracts: z
      .array(
        z
          .object({
            id,
            offerId: id,
            offerVersion: z.number().int().positive(),
            kingdomA: id,
            kingdomB: id,
            status: z.enum(["active", "expired", "released", "defaulted"]),
            terms: NegotiationTermsSchema,
            startGameTimeMs: amount,
            endGameTimeMs: amount,
            flows: z
              .array(
                z
                  .object({
                    senderId: id,
                    recipientId: id,
                    resource,
                    wholePerHour: z.number().int().positive(),
                    dueUnits: amount,
                    deliveredUnits: amount,
                    overflowUnits: amount,
                    installments: z.number().int().nonnegative(),
                    failedInstallments: z.number().int().nonnegative(),
                  })
                  .strict(),
              )
              .max(2),
            sourceRefs: z.array(source).min(1).max(20),
          })
          .strict(),
      )
      .max(100),
    receipts: z
      .array(
        z
          .object({
            commandId: id,
            actorId: id,
            kind: id,
            code: id,
            recordVersions: z.record(z.string(), z.number().int().nonnegative()),
            sourceRefs: z.array(source).min(1).max(20),
          })
          .strict(),
      )
      .max(500),
    lifecycle: z
      .array(
        z
          .object({
            stage: z.enum([
              "opportunity",
              "exposure",
              "contact",
              "dialogue",
              "proposal",
              "signature",
              "activation",
              "delivery",
              "closure",
              "later_decision",
            ]),
            actorId: id,
            referenceId: id,
            gameTimeMs: amount,
            wallTime: z.iso.datetime(),
            sourceRefs: z.array(source).min(1).max(20),
            scriptedPrefix: z.boolean(),
          })
          .strict(),
      )
      .max(1000),
  })
  .strict()
  .superRefine((e, c) => {
    const actors = new Set(e.actors.map((a) => a.actorId));
    if (actors.size !== 2 || e.actors.some((a) => !actors.has(a.counterpartyId) || a.actorId === a.counterpartyId))
      c.addIssue({ code: "custom", message: "Actor scope mismatch" });
    for (const o of e.offers)
      if (
        !actors.has(o.kingdomA) ||
        !actors.has(o.kingdomB) ||
        o.kingdomA === o.kingdomB ||
        new Set(o.signedBy).size !== o.signedBy.length ||
        o.signedBy.some((a) => !actors.has(a))
      )
        c.addIssue({ code: "custom", message: "Offer scope mismatch" });
    for (const contract of e.contracts) {
      const offer = e.offers.find((o) => o.id === contract.offerId && o.version === contract.offerVersion);
      if (
        !offer ||
        offer.kingdomA !== contract.kingdomA ||
        offer.kingdomB !== contract.kingdomB ||
        offer.signedBy.length !== 2 ||
        JSON.stringify(offer.terms) !== JSON.stringify(contract.terms)
      )
        c.addIssue({ code: "custom", message: "Contract lacks exact mutual consent" });
      for (const f of contract.flows)
        if (
          !actors.has(f.senderId) ||
          !actors.has(f.recipientId) ||
          f.senderId === f.recipientId ||
          BigInt(f.deliveredUnits) > BigInt(f.dueUnits) ||
          BigInt(f.overflowUnits) > BigInt(f.deliveredUnits) ||
          f.failedInstallments > f.installments
        )
          c.addIssue({ code: "custom", message: "Inconsistent obligation evidence" });
    }
    if (e.receipts.some((r) => !actors.has(r.actorId)) || e.lifecycle.some((r) => !actors.has(r.actorId)))
      c.addIssue({ code: "custom", message: "Foreign actor evidence" });
  });
export type NegotiationEvidence = z.infer<typeof NegotiationEvidenceSchema>;
export function assertNegotiationEvidence(
  value: unknown,
  expected: Pick<NegotiationEvidence, "cellId" | "worldId" | "configurationDigest" | "initialStateDigest">,
): NegotiationEvidence {
  const evidence = NegotiationEvidenceSchema.parse(value);
  if (Object.entries(expected).some(([k, v]) => evidence[k as keyof typeof expected] !== v))
    throw Error("NEGOTIATION_SCOPE_MISMATCH");
  return evidence;
}
export const NegotiationEvidenceJsonSchema = z.toJSONSchema(NegotiationEvidenceSchema, { target: "draft-7" });

const ReviewSchema = z
  .object({
    evidenceLevel: z.enum(["fake-provider", "real-provider"]),
    allocations: z
      .array(
        z
          .object({
            id,
            actorId: id,
            turnId: id,
            reservedTokens: z.number().int().nonnegative(),
            inputTokens: z.number().int().nonnegative().nullable(),
            outputTokens: z.number().int().nonnegative().nullable(),
            status: z.enum(["reported", "unknown", "not_dispatched"]),
          })
          .strict(),
      )
      .max(1000),
    reviews: z
      .array(
        z
          .object({
            id,
            actorId: id,
            category: z.enum(["factuality", "dialogue", "history", "control"]),
            verdict: z.enum(["pass", "fail", "unresolved"]),
            reviewer: z.enum(["inline-author", "manual-blinded"]),
            reasonCode: z.string().regex(/^[A-Z0-9_]{1,100}$/),
            sourceRefs: z.array(source).min(1).max(20),
          })
          .strict(),
      )
      .max(100),
    claims: z
      .array(
        z
          .object({
            kind: z.enum(["peer", "consent", "income", "fulfilled"]),
            actorId: id,
            recordId: id,
            version: z.number().int().positive().optional(),
            peerId: id,
            resource: resource.optional(),
            units: amount.optional(),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
export type NegotiationClaimReviews = z.infer<typeof ReviewSchema>;
export type Grade = "pass" | "fail" | "unresolved";
export type NegotiationAssessment<C extends NegotiationCell | PostE3Cell = NegotiationCell> = {
  schemaVersion: "fleet.negotiation-assessment.v1";
  cell: C;
  worldId: string;
  evidenceLevel: NegotiationClaimReviews["evidenceLevel"];
  armDigest: string;
  status: Grade;
  material: Grade;
  communication: Grade;
  history: Grade;
  criticalFailures: string[];
  reasons: string[];
  sourceRefs: string[];
  cost: { allocations: number; reservedTokens: number; measuredTokens: number; unknownReservedTokens: number };
  latencyMs: Record<string, number | null>;
};
function canonicalCell(cell: NegotiationCell) {
  const found = negotiationPlan(cell.stage, {
    sources: cell.sources,
    modelDigest: cell.modelDigest,
    policyDigest: cell.policyDigest,
    selectedProfile: cell.profile,
    ...(cell.baselineAmendment ? { baselineAmendment: cell.baselineAmendment } : {}),
  }).find((c) => c.id === cell.id);
  if (!found || designDigest(found) !== designDigest(cell)) throw Error("UNPLANNED_OR_CHANGED_CELL");
}
/** Evidence-backed inline/manual rubric only; no model judge, prose export or silent pass. */
export function assessNegotiation(
  cell: NegotiationCell,
  raw: unknown,
  rawSolo: unknown,
  rawReviews: unknown,
): NegotiationAssessment {
  canonicalCell(cell);
  return assessEvidence(cell, raw, rawSolo, rawReviews);
}
export function assessRC1Negotiation(
  protocol: RC1Protocol,
  cell: RC1Cell,
  raw: unknown,
  rawSolo: unknown,
  rawReviews: unknown,
): NegotiationAssessment<RC1Cell> {
  validateRC1Cell(protocol, cell);
  return assessEvidence(cell, raw, rawSolo, rawReviews);
}
export function assessRC2Negotiation(
  protocol: RC2Protocol,
  cell: RC2Cell,
  raw: unknown,
  rawSolo: unknown,
  rawReviews: unknown,
): NegotiationAssessment<RC2Cell> {
  validateRC2Cell(protocol, cell);
  return assessEvidence(cell, raw, rawSolo, rawReviews);
}
export function assessPostE3Negotiation(
  protocol: PostE3Protocol,
  cell: PostE3Cell,
  raw: unknown,
  rawSolo: unknown,
  rawReviews: unknown,
) {
  validatePostE3Cell(protocol, cell);
  return assessEvidence(cell, raw, rawSolo, rawReviews);
}
/** Mechanical completion only; prose review and real-provider acceptance are
 * still required. Stops redundant admission once actual lifecycle facts exist. */
export function rc1MechanicallyComplete(
  protocol: PostE3Protocol,
  cell: PostE3Cell,
  e: NegotiationEvidence,
  solo: NegotiationEvidence,
  allocations: NegotiationClaimReviews["allocations"],
) {
  const a = assessPostE3Negotiation(protocol, cell, e, solo, {
    evidenceLevel: "fake-provider",
    allocations,
    claims: [],
    reviews: [],
  });
  if (
    a.criticalFailures.length ||
    a.material !== "pass" ||
    a.history === "fail" ||
    a.reasons.some((r) => r !== "UNRESOLVED_FACTUALITY")
  )
    return false;
  return (
    !["C01", "C02"].includes(cell.family) ||
    (a.history === "pass" &&
      e.actors.every((actor) =>
        e.lifecycle.some((l) => l.stage === "dialogue" && l.actorId === actor.actorId && !l.scriptedPrefix),
      ))
  );
}
function assessEvidence<C extends NegotiationCell | PostE3Cell>(
  cell: C,
  raw: unknown,
  rawSolo: unknown,
  rawReviews: unknown,
): NegotiationAssessment<C> {
  const review = ReviewSchema.parse(rawReviews),
    parsed = NegotiationEvidenceSchema.safeParse(raw),
    control = NegotiationEvidenceSchema.safeParse(rawSolo);
  const reasons: string[] = [],
    criticalFailures: string[] = [];
  const costs = {
    allocations: review.allocations.length,
    reservedTokens: 0,
    measuredTokens: 0,
    unknownReservedTokens: 0,
  };
  const seen = new Set<string>(),
    turns = new Map<string, number>();
  for (const a of review.allocations) {
    if (seen.has(a.id)) throw Error("DUPLICATE_ALLOCATION");
    seen.add(a.id);
    costs.reservedTokens += a.reservedTokens;
    const key = `${a.actorId}:${a.turnId}`;
    turns.set(key, (turns.get(key) ?? 0) + 1);
    if (a.status === "unknown") {
      costs.unknownReservedTokens += a.reservedTokens;
      criticalFailures.push("UNKNOWN_MODEL_ALLOCATION");
    } else if (a.status === "reported") {
      if (a.inputTokens === null || a.outputTokens === null) throw Error("MISSING_REPORTED_USAGE");
      costs.measuredTokens += a.inputTokens + a.outputTokens;
      if (a.inputTokens + a.outputTokens > a.reservedTokens) criticalFailures.push("USAGE_EXCEEDS_RESERVATION");
    }
  }
  const turnCounts = new Map<string, Set<string>>();
  for (const a of review.allocations) {
    const t = turnCounts.get(a.actorId) ?? new Set();
    t.add(a.turnId);
    turnCounts.set(a.actorId, t);
  }
  if (
    review.allocations.length > cell.limits.callsPerWorld ||
    costs.reservedTokens > cell.limits.reservedTokensPerWorld ||
    [...turns.values()].some((n) => n > design.maxCallsPerTurn) ||
    [...turnCounts.values()].some((v) => v.size > cell.limits.turnsPerActor) ||
    review.allocations.some((a) => a.reservedTokens !== 40000 || (a.outputTokens ?? 0) > cell.limits.outputTokens)
  )
    reasons.push("CALL_OR_RESERVATION_CAP_EXCEEDED");
  let material: Grade = "unresolved",
    communication: Grade = "unresolved",
    history: Grade = "unresolved";
  const e = parsed.success ? parsed.data : null,
    solo = control.success ? control.data : null;
  if (!e) criticalFailures.push("INVALID_AUTHORITATIVE_EVIDENCE");
  if (!solo) reasons.push("INVALID_SOLO_EVIDENCE");
  const sources = new Set(
    e
      ? [
          ...e.coverage.sourceRefs,
          ...e.offers.flatMap((o) => o.sourceRefs),
          ...e.contracts.flatMap((c) => c.sourceRefs),
          ...e.receipts.flatMap((r) => r.sourceRefs),
          ...e.lifecycle.flatMap((l) => l.sourceRefs),
        ]
      : [],
  );
  const reviewed = (category: NegotiationClaimReviews["reviews"][number]["category"]): Grade => {
    if (!e) return "unresolved";
    const grades = e.actors.map((a) => {
      const rs = review.reviews.filter(
        (r) => r.category === category && r.actorId === a.actorId && r.sourceRefs.every((s) => sources.has(s)),
      );
      return rs.some((r) => r.verdict === "fail")
        ? "fail"
        : rs.length && rs.every((r) => r.verdict === "pass")
          ? "pass"
          : "unresolved";
    });
    return grades.includes("fail") ? "fail" : grades.every((g) => g === "pass") ? "pass" : "unresolved";
  };
  if (e) {
    const frozen = design.families.find((f) => f.id === cell.family);
    const goals = frozen ? [frozen.initialState.goals.A, frozen.initialState.goals.B] : [];
    if (cell.rolesReversed) goals.reverse();
    if (e.actors.some((a, i) => a.goalDigest !== designDigest(goals[i]))) reasons.push("GOAL_SCOPE_MISMATCH");

    if (
      e.cellId !== cell.id ||
      e.configurationDigest !== cell.configurationDigest ||
      e.initialStateDigest !== cell.initialStateDigest
    )
      criticalFailures.push("EVIDENCE_SCOPE_MISMATCH");
    if (!e.coverage.complete || e.coverage.omitted.length) reasons.push("INCOMPLETE_COVERAGE");
    if (review.allocations.some((a) => !e.actors.some((p) => p.actorId === a.actorId)))
      criticalFailures.push("FOREIGN_MODEL_ALLOCATION");
    if (new Set(e.receipts.map((r) => r.commandId)).size !== e.receipts.length)
      criticalFailures.push("DUPLICATE_COMMAND_EVIDENCE");
    if (e.receipts.some((r) => ["FORBIDDEN", "APPROVAL_REQUIRED"].includes(r.code)))
      reasons.push("REJECTED_AUTHORITY_ATTEMPT");
    for (const r of review.reviews)
      if (!e.actors.some((a) => a.actorId === r.actorId) || !r.sourceRefs.every((s) => sources.has(s)))
        reasons.push("UNSUPPORTED_REVIEW");
    const lastContract = e.contracts.reduce(
      (last, c) => (BigInt(c.endGameTimeMs) > last ? BigInt(c.endGameTimeMs) : last),
      0n,
    );
    const later = e.actors.every((a) =>
      e.lifecycle.some(
        (l) =>
          l.stage === "later_decision" &&
          !l.scriptedPrefix &&
          l.actorId === a.actorId &&
          BigInt(l.gameTimeMs) >= lastContract &&
          BigInt(l.gameTimeMs) <= BigInt(e.horizonGameTimeMs),
      ),
    );
    history = later ? "pass" : "fail";
    if (!later) reasons.push("MISSING_BOTH_LATER_DECISIONS");
    const matched =
      solo &&
      e.worldId !== solo.worldId &&
      e.rulesId === solo.rulesId &&
      e.configurationDigest === solo.configurationDigest &&
      e.initialStateDigest === solo.initialStateDigest &&
      e.horizonGameTimeMs === solo.horizonGameTimeMs &&
      solo.coverage.complete &&
      !solo.coverage.omitted.length &&
      !solo.contracts.length &&
      !solo.receipts.length &&
      e.actors.every(
        (a, i) =>
          a.goalDigest === solo.actors[i].goalDigest &&
          JSON.stringify(a.ordinaryStart) === JSON.stringify(solo.actors[i].ordinaryStart),
      );
    if (!matched) reasons.push("UNMATCHED_SOLO");
    const settled = (c: NegotiationEvidence["contracts"][number]) => {
      if (
        !["expired", "released"].includes(c.status) ||
        BigInt(c.endGameTimeMs) - BigInt(c.startGameTimeMs) !== 3600000n
      )
        return false;
      const expected = [
        { flow: c.terms.aToB, sender: c.kingdomA, recipient: c.kingdomB },
        { flow: c.terms.bToA, sender: c.kingdomB, recipient: c.kingdomA },
      ].filter((x) => x.flow !== null);
      return (
        c.flows.length === expected.length &&
        expected.every(({ flow, sender, recipient }) =>
          c.flows.some(
            (f) =>
              f.senderId === sender &&
              f.recipientId === recipient &&
              flow !== null &&
              f.resource === flow.resource &&
              f.wholePerHour === flow.wholePerHour &&
              BigInt(f.dueUnits) === BigInt(flow.wholePerHour) * 600n &&
              f.deliveredUnits === f.dueUnits &&
              f.failedInstallments === 0 &&
              f.installments === 60,
          ),
        )
      );
    };
    for (const claim of review.claims) {
      const actor = e.actors.find((a) => a.actorId === claim.actorId),
        offer = e.offers.find((o) => o.id === claim.recordId && o.version === claim.version),
        contract = e.contracts.find((c) => c.id === claim.recordId && c.offerVersion === claim.version),
        record = offer ?? contract;
      const right =
        actor &&
        actor.counterpartyId === claim.peerId &&
        record &&
        [record.kingdomA, record.kingdomB].includes(actor.actorId) &&
        [record.kingdomA, record.kingdomB].includes(claim.peerId);
      if (!right) criticalFailures.push("FALSE_PEER_OR_VERSION");
      else if (
        claim.kind === "consent" &&
        !(
          offer ?? e.offers.find((o) => o.id === contract?.offerId && o.version === contract.offerVersion)
        )?.signedBy.includes(claim.peerId)
      )
        criticalFailures.push("FALSE_CONSENT");
      else if (
        claim.kind === "income" &&
        (!contract ||
          !claim.units ||
          !claim.resource ||
          !contract.flows.some(
            (f) =>
              f.recipientId === claim.actorId &&
              f.resource === claim.resource &&
              BigInt(f.deliveredUnits) - BigInt(f.overflowUnits) >= BigInt(claim.units ?? "0"),
          ))
      )
        criticalFailures.push("FALSE_INCOME");
      else if (claim.kind === "fulfilled" && (!contract || !settled(contract)))
        criticalFailures.push("FALSE_FULFILLMENT");
    }
    const positive = ["C01", "C02"].includes(cell.family);
    if (positive) {
      material =
        matched &&
        e.contracts.length > 0 &&
        e.contracts.every(settled) &&
        e.actors.every((a, i) => {
          const goal = design.families
            .flatMap((f) => Object.values(f.initialState.goals))
            .find((g) => designDigest(g) === a.goalDigest);
          if (
            !goal ||
            !("receive" in goal) ||
            !("minimumReceivePerHour" in goal) ||
            !("maximumSendPerHour" in goal) ||
            !solo
          )
            return false;
          return (
            e.contracts.every((c) => {
              const send = c.kingdomA === a.actorId ? c.terms.aToB : c.terms.bToA,
                receive = c.kingdomA === a.actorId ? c.terms.bToA : c.terms.aToB;
              return (
                !c.terms.aBond &&
                !c.terms.bBond &&
                receive !== null &&
                receive.resource === goal.receive &&
                receive.wholePerHour >= goal.minimumReceivePerHour &&
                (!send || send.wholePerHour <= goal.maximumSendPerHour)
              );
            }) &&
            (["iron", "silver", "grain"] as const).every(
              (r) => BigInt(a.ordinaryFinal[r]) >= BigInt(solo.actors[i].ordinaryFinal[r]),
            ) &&
            (["iron", "silver", "grain"] as const).some(
              (r) => r === goal.receive && BigInt(a.ordinaryFinal[r]) > BigInt(solo.actors[i].ordinaryFinal[r]),
            )
          );
        })
          ? "pass"
          : "fail";
      communication = reviewed("dialogue");
      if (
        !e.actors.every((a) =>
          e.lifecycle.some((l) => l.stage === "dialogue" && l.actorId === a.actorId && !l.scriptedPrefix),
        )
      )
        communication = "unresolved";
      if (cell.family === "C01" && !e.lifecycle.some((l) => l.stage === "contact" && !l.scriptedPrefix))
        reasons.push("MISSING_CONTACT");
      if (cell.family === "C02" && !e.offers.some((o) => o.version >= 2)) reasons.push("MISSING_COUNTER_VERSION");
    } else if (cell.family === "C05") {
      material = "pass";
      communication = "pass";
      const outcome = e.contracts.some((c) => (cell.variant === "default" ? c.status === "defaulted" : settled(c)));
      history = later && outcome ? reviewed("history") : "fail";
    } else {
      const controlSafe =
        matched &&
        !e.contracts.length &&
        !e.receipts.some((r) => r.kind === "game.supply.sign") &&
        (cell.family !== "C06" || !e.receipts.length);
      material = controlSafe ? "pass" : "fail";
      communication = reviewed("control");
    }
    const factual = reviewed("factuality");
    if (factual === "fail") criticalFailures.push("MANUAL_CRITICAL_FALSE_CLAIM");
    else if (factual === "unresolved") reasons.push("UNRESOLVED_FACTUALITY");
  }
  const latencyMs: Record<string, number | null> = {};
  for (const stage of ["contact", "dialogue", "activation", "delivery", "closure", "later_decision"]) {
    const start = e?.lifecycle.find((l) => l.stage === "opportunity" && !l.scriptedPrefix) ?? e?.lifecycle[0];
    if (
      stage === "later_decision" &&
      "study" in cell &&
      cell.study !== "negotiation-r1" &&
      e &&
      ["C01", "C02"].includes(cell.family)
    ) {
      if (!e.contracts.length) {
        latencyMs[stage] = null;
        continue;
      }
      const closedAt = e.contracts.reduce(
        (last, c) => (BigInt(c.endGameTimeMs) > last ? BigInt(c.endGameTimeMs) : last),
        0n,
      );
      const decisions = e.actors.map(
        (a) =>
          e.lifecycle
            .filter(
              (l) =>
                l.stage === "later_decision" &&
                !l.scriptedPrefix &&
                l.actorId === a.actorId &&
                BigInt(l.gameTimeMs) >= closedAt,
            )
            .sort((a, b) => Date.parse(a.wallTime) - Date.parse(b.wallTime))[0],
      );
      latencyMs[stage] =
        start && decisions.length && decisions.every(Boolean)
          ? Math.max(0, ...decisions.map((l) => Date.parse(l.wallTime) - Date.parse(start.wallTime)))
          : null;
      continue;
    }
    const end = e?.lifecycle.find((l) => l.stage === stage && !l.scriptedPrefix);
    latencyMs[stage] = start && end ? Math.max(0, Date.parse(end.wallTime) - Date.parse(start.wallTime)) : null;
  }
  const failed =
    criticalFailures.length ||
    reasons.some((r) => r !== "UNRESOLVED_FACTUALITY" && r !== "UNSUPPORTED_REVIEW") ||
    [material, communication, history].includes("fail");
  return {
    schemaVersion: "fleet.negotiation-assessment.v1",
    cell,
    worldId: e?.worldId ?? `invalid:${cell.id}`,
    evidenceLevel: review.evidenceLevel,
    armDigest: designDigest({
      stage: cell.stage,
      profile: cell.profile,
      sources: cell.sources,
      modelDigest: cell.modelDigest,
      policyDigest: cell.policyDigest,
      clockMode: cell.clockMode,
    }),
    status: failed
      ? "fail"
      : reasons.length || [material, communication, history].includes("unresolved")
        ? "unresolved"
        : "pass",
    material,
    communication,
    history,
    criticalFailures: [...new Set(criticalFailures)],
    reasons: [...new Set(reasons)],
    sourceRefs: [...sources],
    cost: costs,
    latencyMs,
  };
}
export function summarizeNegotiation(assessments: NegotiationAssessment[]) {
  if (!assessments.length) throw Error("EMPTY_NEGOTIATION_SUMMARY");
  if (
    new Set(assessments.map((a) => a.worldId)).size !== assessments.length ||
    new Set(assessments.map((a) => a.cell.id)).size !== assessments.length
  )
    throw Error("DUPLICATE_WORLD_OR_CELL");
  if (
    new Set(assessments.map((a) => a.armDigest)).size !== 1 ||
    new Set(assessments.map((a) => a.evidenceLevel)).size !== 1
  )
    throw Error("MIXED_CONFIGURATION_OR_EVIDENCE_LEVEL");
  for (const a of assessments) canonicalCell(a.cell);
  const first = assessments[0];
  const expected = negotiationPlan(first.cell.stage, {
    sources: first.cell.sources,
    modelDigest: first.cell.modelDigest,
    policyDigest: first.cell.policyDigest,
    selectedProfile: first.cell.profile,
    ...(first.cell.baselineAmendment ? { baselineAmendment: first.cell.baselineAmendment } : {}),
  }).filter((c) => c.profile.version === first.cell.profile.version);
  return summarizeCells(assessments, expected, first.cell.stage === "E3", false);
}
export function summarizeRC1Negotiation(protocol: RC1Protocol, assessments: NegotiationAssessment<RC1Cell>[]) {
  if (protocol.study !== "negotiation-r1") throw Error("POST_E3_STUDY_MISMATCH");
  return summarizePostE3Negotiation(protocol, assessments);
}
export function summarizeRC2Negotiation(protocol: RC2Protocol, assessments: NegotiationAssessment<RC2Cell>[]) {
  if (protocol.study !== "negotiation-r2") throw Error("POST_E3_STUDY_MISMATCH");
  return summarizePostE3Negotiation(protocol, assessments);
}
export function summarizePostE3Negotiation(protocol: PostE3Protocol, assessments: NegotiationAssessment<PostE3Cell>[]) {
  if (designDigest(canonicalPostE3Protocol(protocol)) !== designDigest(protocol)) throw Error("RC1_PROTOCOL_CHANGED");
  for (const a of assessments) validatePostE3Cell(protocol, a.cell);
  if (
    new Set(assessments.map((a) => a.cell.id)).size !== assessments.length ||
    new Set(assessments.map((a) => a.worldId)).size !== assessments.length
  )
    throw Error("DUPLICATE_WORLD_OR_CELL");
  if (
    new Set(assessments.map((a) => a.armDigest)).size > 1 ||
    new Set(assessments.map((a) => a.evidenceLevel)).size > 1
  )
    throw Error("MIXED_CONFIGURATION_OR_EVIDENCE_LEVEL");
  if (!assessments.length)
    return {
      schemaVersion:
        protocol.study === "negotiation-r19"
          ? "fleet.rc19-summary.v1"
          : protocol.study === "negotiation-r18"
            ? "fleet.rc18-summary.v1"
            : protocol.study === "negotiation-r17"
              ? "fleet.rc17-summary.v1"
              : protocol.study === "negotiation-r16"
                ? "fleet.rc16-summary.v1"
                : protocol.study === "negotiation-r15"
                  ? "fleet.rc15-summary.v1"
                  : protocol.study === "negotiation-r14"
                    ? "fleet.rc14-summary.v1"
                    : protocol.study === "negotiation-r13"
                      ? "fleet.rc13-summary.v1"
                      : protocol.study === "negotiation-r12"
                        ? "fleet.rc12-summary.v1"
                        : protocol.study === "negotiation-r11"
                          ? "fleet.rc11-summary.v1"
                          : protocol.study === "negotiation-r10"
                            ? "fleet.rc10-summary.v1"
                            : protocol.study === "negotiation-r9"
                              ? "fleet.rc9-summary.v1"
                              : protocol.study === "negotiation-r8"
                                ? "fleet.rc8-summary.v1"
                                : protocol.study === "negotiation-r7"
                                  ? "fleet.rc7-summary.v1"
                                  : protocol.study === "negotiation-r6"
                                    ? "fleet.rc6-summary.v1"
                                    : protocol.study === "negotiation-r5"
                                      ? "fleet.rc5-summary.v1"
                                      : protocol.study === "negotiation-r4"
                                        ? "fleet.rc4-summary.v1"
                                        : protocol.study === "negotiation-r3"
                                          ? "fleet.rc3-summary.v1"
                                          : protocol.study === "negotiation-r2"
                                            ? "fleet.rc2-summary.v1"
                                            : "fleet.rc1-summary.v1",
      stage: protocol.selection.stage,
      assigned: protocol.cells.length,
      passed: 0,
      complete: false,
      gate: "incomplete",
      productionQualified: false as const,
      families: Object.fromEntries(
        [...new Set(protocol.cells.map((c) => `${c.family}:${c.variant}`))].map((key) => [
          key,
          {
            assigned: protocol.cells.filter((c) => `${c.family}:${c.variant}` === key).length,
            passed: 0,
            proportion: 0,
            wilson95: [
              0,
              3.841458820694124 /
                (protocol.cells.filter((c) => `${c.family}:${c.variant}` === key).length + 3.841458820694124),
            ],
          },
        ]),
      ),
    };
  return {
    ...summarizeCells(
      assessments,
      protocol.cells,
      ["R1-H", "R2-H", "R3-H", "R4-H", "R5-H", "R6-H"].includes(protocol.selection.stage),
      true,
    ),
    schemaVersion:
      protocol.study === "negotiation-r19"
        ? "fleet.rc19-summary.v1"
        : protocol.study === "negotiation-r18"
          ? "fleet.rc18-summary.v1"
          : protocol.study === "negotiation-r17"
            ? "fleet.rc17-summary.v1"
            : protocol.study === "negotiation-r16"
              ? "fleet.rc16-summary.v1"
              : protocol.study === "negotiation-r15"
                ? "fleet.rc15-summary.v1"
                : protocol.study === "negotiation-r14"
                  ? "fleet.rc14-summary.v1"
                  : protocol.study === "negotiation-r13"
                    ? "fleet.rc13-summary.v1"
                    : protocol.study === "negotiation-r12"
                      ? "fleet.rc12-summary.v1"
                      : protocol.study === "negotiation-r11"
                        ? "fleet.rc11-summary.v1"
                        : protocol.study === "negotiation-r10"
                          ? "fleet.rc10-summary.v1"
                          : protocol.study === "negotiation-r9"
                            ? "fleet.rc9-summary.v1"
                            : protocol.study === "negotiation-r8"
                              ? "fleet.rc8-summary.v1"
                              : protocol.study === "negotiation-r7"
                                ? "fleet.rc7-summary.v1"
                                : protocol.study === "negotiation-r6"
                                  ? "fleet.rc6-summary.v1"
                                  : protocol.study === "negotiation-r5"
                                    ? "fleet.rc5-summary.v1"
                                    : protocol.study === "negotiation-r4"
                                      ? "fleet.rc4-summary.v1"
                                      : protocol.study === "negotiation-r3"
                                        ? "fleet.rc3-summary.v1"
                                        : protocol.study === "negotiation-r2"
                                          ? "fleet.rc2-summary.v1"
                                          : "fleet.rc1-summary.v1",
    productionQualified: false as const,
  };
}
function summarizeCells<C extends NegotiationCell | PostE3Cell>(
  assessments: NegotiationAssessment<C>[],
  expected: C[],
  heldOut: boolean,
  fullDenominator: boolean,
) {
  const first = assessments[0],
    passed = assessments.filter((a) => a.status === "pass").length;
  const complete =
    expected.length === assessments.length && expected.every((c) => assessments.some((a) => a.cell.id === c.id));
  const families = Object.fromEntries(
    [
      ...new Set((fullDenominator ? expected : assessments.map((a) => a.cell)).map((c) => `${c.family}:${c.variant}`)),
    ].map((key) => {
      const members = assessments.filter((a) => `${a.cell.family}:${a.cell.variant}` === key),
        n = fullDenominator ? expected.filter((c) => `${c.family}:${c.variant}` === key).length : members.length,
        k = members.filter((a) => a.status === "pass").length,
        z = 1.959963984540054,
        den = 1 + (z * z) / n,
        center = (k / n + (z * z) / (2 * n)) / den,
        margin = (z * Math.sqrt(((k / n) * (1 - k / n)) / n + (z * z) / (4 * n * n))) / den;
      return [
        key,
        {
          assigned: n,
          passed: k,
          proportion: k / n,
          wilson95: [Math.max(0, center - margin), Math.min(1, center + margin)],
        },
      ];
    }),
  );
  const cost = assessments.reduce(
    (x, a) => ({
      allocations: x.allocations + a.cost.allocations,
      reservedTokens: x.reservedTokens + a.cost.reservedTokens,
      measuredTokens: x.measuredTokens + a.cost.measuredTokens,
      unknownReservedTokens: x.unknownReservedTokens + a.cost.unknownReservedTokens,
    }),
    { allocations: 0, reservedTokens: 0, measuredTokens: 0, unknownReservedTokens: 0 },
  );
  const latencies = Object.fromEntries(
    Object.keys(first.latencyMs).map((stage) => {
      const xs = assessments
        .flatMap((a) => (a.latencyMs[stage] === null ? [] : [a.latencyMs[stage] ?? 0]))
        .sort((a, b) => a - b);
      const q = (p: number) => (xs.length ? xs[Math.ceil(p * xs.length) - 1] : null);
      return [stage, { count: xs.length, p50: q(0.5), p95: q(0.95), max: xs.at(-1) ?? null }];
    }),
  );
  const zeroCritical = assessments.every((a) => !a.criticalFailures.length);
  const familyPass = (key: string, min: number) => Boolean(families[key] && families[key].passed >= min);
  const thresholds = heldOut
    ? zeroCritical &&
      familyPass("C01:default", 4) &&
      familyPass("C02:default", 4) &&
      assessments.filter((a) => ["C01", "C02"].includes(a.cell.family) && a.status === "pass").length >= 9 &&
      familyPass("C03:default", 5) &&
      familyPass("C04:expired", 5) &&
      familyPass("C06:default", 5) &&
      familyPass("C05:fulfilled", 4) &&
      familyPass("C05:default", 4) &&
      assessments.filter((a) => a.cell.family === "C05" && a.status === "pass").length >= 9
    : passed === assessments.length && zeroCritical;
  return {
    schemaVersion: "fleet.negotiation-summary.v1",
    evidenceLevel: first.evidenceLevel,
    stage: first.cell.stage,
    assigned: fullDenominator ? expected.length : assessments.length,
    passed,
    complete,
    gate: !complete
      ? "incomplete"
      : !thresholds
        ? "fail"
        : first.evidenceLevel === "fake-provider"
          ? "offline_only"
          : "pass",
    families,
    cost,
    costPerUsefulOutcome: passed ? cost.measuredTokens / passed : null,
    latencies,
  };
}
