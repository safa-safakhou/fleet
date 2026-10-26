import { createHash } from "node:crypto";
import { type Data, object } from "../../domain.js";
import type { AccountObjective, ProposalValidation } from "../../platform/contracts.js";
import { pactAgentBriefing } from "./briefing.js";
import { queuedConstructionProgress } from "./construction-progress.js";

const rows = (v: unknown): Data[] => (Array.isArray(v) ? v.map(object) : []);
function checkpoint(facts: Data) {
  const world = object(facts.world),
    intent = world.ambition;
  if (typeof intent !== "string" || !intent.trim()) return;
  const levels = rows(world.buildings).filter(
    (b) => typeof b.kind === "string" && Number.isSafeInteger(b.level) && Number(b.level) >= 0,
  );
  const progress = queuedConstructionProgress(facts);
  if (!levels.length) return;
  const briefing = pactAgentBriefing(facts),
    construction = object(briefing.construction);
  const ready = rows(construction.options).filter((o) => o.startStatus === "ready");
  const guide = object(facts.guide),
    allowed = object(world.authority).allowedActions ?? object(guide.mandate).allowedActions;
  const introductions =
    Array.isArray(allowed) &&
    allowed.includes("contact.request") &&
    Array.isArray(guide.contacts) &&
    Array.isArray(guide.contactRequests)
      ? rows(object(facts.discovery).players)
          .map((p) => p.kingdomId)
          .filter(
            (id): id is string =>
              typeof id === "string" &&
              id !== object(world.profile).kingdomId &&
              !rows(guide.contacts).some((c) => c.kingdomId === id) &&
              !rows(guide.contactRequests).some(
                (r) => r.status === "pending" && [r.kingdomId, r.senderKingdomId, r.recipientKingdomId].includes(id),
              ),
          )
      : [];
  const opportunities = {
    construction: [...new Set(ready.map((o) => `${o.building}:${o.targetLevel}`))].sort(),
    introductions: [...new Set(introductions)].sort(),
  };
  const actionable = opportunities.construction.length > 0 || opportunities.introductions.length > 0;
  if (!progress.length && !actionable) return;
  const basis = {
    completedLevels: Object.fromEntries(levels.map((b) => [String(b.kind), b.level])),
    queuedPhases: Object.fromEntries(progress.map((b) => [`${b.building}:${b.targetLevel}`, b.phase])),
    ...(actionable
      ? { opportunityRevision: createHash("sha256").update(JSON.stringify(opportunities)).digest("hex") }
      : {}),
  };
  const shortages = Object.fromEntries(
    progress
      .filter((b) => b.phase === "stock_shortage")
      .map((b) => [
        `${b.building}:${b.targetLevel}`,
        Object.fromEntries(rows(b.stockGaps).map((g) => [String(g.resource), g.shortfallWholeCeil ?? null])),
      ]),
  );
  return {
    intent,
    progress,
    basis,
    actionable,
    currentState: { ...basis, ...(actionable ? { opportunities } : {}), stockShortfallsWholeCeil: shortages },
  };
}
/** Owner intent stays verbatim; factual descriptions are reconciled, never rewritten in storage. */
export function pactCurrentObjective(facts: Data): AccountObjective | undefined {
  const current = checkpoint(facts);
  if (current) return { intent: current.intent, currentState: current.currentState };
  const intent = object(facts.world).ambition;
  return typeof intent === "string" && intent.trim() ? intent : undefined;
}
export function pactActionBasis(facts: Data): Data | undefined {
  return pactWaitSchema(facts) ? checkpoint(facts)?.basis : undefined;
}
const deferralSchema: Data = {
  type: "object",
  properties: {
    reason: { enum: ["different_owner_priority", "resource_reserve", "risk_review", "deliberate_pacing"] },
    explanation: { type: "string", minLength: 1, maxLength: 240 },
    reconsiderWhen: { type: "string", minLength: 1, maxLength: 160 },
  },
  required: ["reason", "explanation", "reconsiderWhen"],
  additionalProperties: false,
};
/** Confirmed blockers/opportunities only; a shape is not a game permission or action quota. */
export function pactWaitSchema(facts: Data): Data | undefined {
  const current = checkpoint(facts);
  if (!current || (!current.actionable && !current.progress.some((b) => b.phase === "stock_shortage"))) return;
  // Key/value truth is checked against the observation below. Do not duplicate
  // every observed key in generation: large goal/continuity packets share a budget.
  const map = (valueSchema: Data) => ({ type: "object", additionalProperties: valueSchema });
  return {
    type: "object",
    properties: {
      completedLevels: map({ type: "integer", minimum: 0 }),
      queuedPhases: map({
        type: "string",
        enum: ["active", "building_prerequisites", "stock_shortage", "queue_or_admission_check"],
      }),
      ...(current.actionable
        ? { opportunityRevision: { const: current.basis.opportunityRevision }, deferral: deferralSchema }
        : {}),
    },
    required: ["completedLevels", "queuedPhases", ...(current.actionable ? ["opportunityRevision", "deferral"] : [])],
    additionalProperties: false,
  };
}
function sameMap(actual: unknown, expected: Data) {
  const values = object(actual);
  return (
    Object.keys(values).length === Object.keys(expected).length &&
    Object.entries(expected).every(([k, v]) => values[k] === v)
  );
}
export function validatePactWait(basis: Data, facts: Data): ProposalValidation {
  return validateBasis(basis, facts, true);
}
function validateBasis(basis: Data, facts: Data, waiting: boolean): ProposalValidation {
  if (!pactWaitSchema(facts)) return { valid: true, code: "VALID" };
  const current = checkpoint(facts);
  if (!current) return { valid: true, code: "VALID" };
  if (
    Object.keys(basis).every((k) =>
      [
        "completedLevels",
        "queuedPhases",
        ...(current.actionable ? ["opportunityRevision", ...(waiting ? ["deferral"] : [])] : []),
      ].includes(k),
    ) &&
    sameMap(basis.completedLevels, current.basis.completedLevels) &&
    sameMap(basis.queuedPhases, current.basis.queuedPhases) &&
    (!current.actionable || basis.opportunityRevision === current.basis.opportunityRevision)
  ) {
    const d = object(basis.deferral);
    if (
      waiting &&
      current.actionable &&
      (!["different_owner_priority", "resource_reserve", "risk_review", "deliberate_pacing"].includes(
        String(d.reason),
      ) ||
        typeof d.explanation !== "string" ||
        !d.explanation.trim() ||
        d.explanation.length > 240 ||
        typeof d.reconsiderWhen !== "string" ||
        !d.reconsiderWhen.trim() ||
        d.reconsiderWhen.length > 160)
    )
      return {
        valid: false,
        code: "PACT_WAIT_DEFERRAL_REQUIRED",
        detail: { currentState: current.basis },
        guidance:
          "No action occurred. Ready prerequisite/development choices or introductions are present. Choose useful work/read, or explicitly defer with basis.deferral reason, explanation of the owner-goal tradeoff and reconsiderWhen. Waiting will not complete prerequisites or create incoming contacts. Do not invent a shortage or claim a proposal was committed.",
      };
    return { valid: true, code: "VALID" };
  }
  return {
    valid: false,
    code: "PACT_WAIT_STATE_MISMATCH",
    detail: { currentState: current.basis, stockShortfallsWholeCeil: current.currentState.stockShortfallsWholeCeil },
    guidance:
      "Wait not accepted. Reconcile basis with detail.currentState: completed levels are facts, stock_shortage needs resources, and ready prerequisites require their own commands. Visible peers need an introduction before incoming messages are possible. Choose useful permitted work/read, or explicitly explain a strategic deferral of available opportunities. Include current factual basis; do not duplicate queued work, cancel jobs or invent effects.",
  };
}

/** Modern action claims reconcile the same current checkpoint as waits. Bare legacy arguments stay unchanged. */
export function goalActionOutcomeSchema(facts: Data, kinds: string[], base?: Data): Data | undefined {
  if (!pactWaitSchema(facts)) return base;
  const current = checkpoint(facts);
  if (!current) return base;
  return {
    ...(base ?? { type: "object", additionalProperties: false }),
    properties: {
      ...object(base?.properties),
      actionKind: {
        type: "string",
        enum: kinds,
        description: "Must equal actual payload.kind. An offer or signature is not construction or delivery.",
      },
      basis: { const: current.basis },
    },
    required: [
      ...new Set([...(Array.isArray(base?.required) ? (base.required as string[]) : []), "actionKind", "basis"]),
    ],
  };
}
export function validateGoalAction(action: Data, facts: Data, outcome?: Data): ProposalValidation | undefined {
  if (!pactWaitSchema(facts)) return;
  const validation = validateBasis(object(outcome?.basis), facts, false);
  if (!validation.valid)
    return {
      ...validation,
      code: "PACT_ACTION_STATE_MISMATCH",
      guidance: `No command prepared. The action must use the same fresh construction facts as a wait. ${validation.guidance}`,
    };
  if (outcome?.actionKind !== action.kind)
    return {
      valid: false,
      code: "PACT_ACTION_EFFECT_MISMATCH",
      guidance:
        "No command prepared. expectedOutcome.actionKind must equal the actual payload.kind. A supply offer/signature is not construction or resource delivery. Reconcile the current resource blocker before choosing useful work/read or a justified wait.",
      detail: { actualActionKind: action.kind },
    };
}
