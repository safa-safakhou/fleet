import { type Data, object } from "../../domain.js";
import type { AccountObjective, ProposalValidation } from "../../platform/contracts.js";
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
  if (!levels.length || !progress.length) return;
  const basis = {
    completedLevels: Object.fromEntries(levels.map((b) => [String(b.kind), b.level])),
    queuedPhases: Object.fromEntries(progress.map((b) => [`${b.building}:${b.targetLevel}`, b.phase])),
  };
  const shortages = Object.fromEntries(
    progress
      .filter((b) => b.phase === "stock_shortage")
      .map((b) => [
        `${b.building}:${b.targetLevel}`,
        Object.fromEntries(rows(b.stockGaps).map((g) => [String(g.resource), g.shortfallWholeCeil ?? null])),
      ]),
  );
  return { intent, progress, basis, currentState: { ...basis, stockShortfallsWholeCeil: shortages } };
}
/** Owner intent stays verbatim; factual descriptions are reconciled, never rewritten in storage. */
export function pactCurrentObjective(facts: Data): AccountObjective | undefined {
  const current = checkpoint(facts);
  if (current) return { intent: current.intent, currentState: current.currentState };
  const intent = object(facts.world).ambition;
  return typeof intent === "string" && intent.trim() ? intent : undefined;
}
/** Opt-in only for a confirmed current stock blocker; missing coverage never invents one. */
export function pactWaitSchema(facts: Data): Data | undefined {
  const current = checkpoint(facts);
  if (!current?.progress.some((b) => b.phase === "stock_shortage")) return;
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
    },
    required: ["completedLevels", "queuedPhases"],
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
  if (!pactWaitSchema(facts)) return { valid: true, code: "VALID" };
  const current = checkpoint(facts);
  if (!current) return { valid: true, code: "VALID" };
  if (
    Object.keys(basis).length === 2 &&
    sameMap(basis.completedLevels, current.basis.completedLevels) &&
    sameMap(basis.queuedPhases, current.basis.queuedPhases)
  )
    return { valid: true, code: "VALID" };
  return {
    valid: false,
    code: "PACT_WAIT_STATE_MISMATCH",
    detail: { currentState: current.basis, stockShortfallsWholeCeil: current.currentState.stockShortfallsWholeCeil },
    guidance:
      "Wait not accepted. Completed levels are current facts, not missing work. Reconcile owner intent against currentState: stock_shortage needs resources. Choose useful permitted work/read, or a wait based on the actual stock/risk constraint; include an accurate basis. Do not duplicate queued work, cancel jobs or invent resource effects.",
  };
}
