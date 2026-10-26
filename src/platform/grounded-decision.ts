import { FleetError, object } from "../domain.js";
import type { DecisionFeedback } from "./decision-feedback.js";

export type ObservedDecisionFacts = {
  bindingId: string;
  requestId: string;
  revision: string;
  facts: Record<string, unknown>;
};
/** Facts are resolved from the host observation, never repaired from model-authored numbers. */
export function bindObservedFacts(value: unknown, observed: ObservedDecisionFacts) {
  const proposal = object(value);
  if (proposal.bindingId !== observed.bindingId || proposal.requestId !== observed.requestId)
    throw new FleetError("DECISION_SCOPE_MISMATCH", true);
  if (proposal.revision !== observed.revision) throw new FleetError("DECISION_REVISION_MISMATCH", true);
  const keys = Object.keys(observed.facts);
  if (keys.some((key) => ["bindingId", "requestId", "revision", "kind", "offerId"].includes(key)))
    throw new FleetError("INVALID_OBSERVED_FACTS", true);
  if (keys.some((key) => Object.hasOwn(proposal, key))) throw new FleetError("MODEL_AUTHORED_BOUND_FACT", true);
  return { ...proposal, ...structuredClone(observed.facts) };
}

export function constrainLegalChoices(schema: Record<string, unknown>, field: string, choices: string[]) {
  if (
    !choices.length ||
    choices.length > 64 ||
    new Set(choices).size !== choices.length ||
    choices.some((id) => !id || id.length > 160)
  )
    throw new FleetError("INVALID_LEGAL_CHOICES", true);
  const properties = object(schema.properties) as Record<string, Record<string, unknown>>;
  if (!Object.hasOwn(properties, field)) throw new FleetError("INVALID_LEGAL_CHOICE_FIELD", true);
  return {
    ...structuredClone(schema),
    properties: { ...structuredClone(properties), [field]: { type: "string", enum: [...choices] } },
  };
}

/** Explicit numeric goals only. Legal-but-inferior proposals receive feedback, not silent substitution. */
export function validateNumericObjective(choice: string, scores: Record<string, string>): DecisionFeedback | null {
  const entries = Object.entries(scores);
  if (
    !entries.length ||
    entries.length > 64 ||
    !Object.hasOwn(scores, choice) ||
    entries.some(([id, score]) => !id || id.length > 160 || score.length > 100 || !/^-?(0|[1-9][0-9]*)$/.test(score))
  )
    throw new FleetError("INVALID_OBJECTIVE_SCORES", true);
  const best = entries.reduce((best, entry) => (BigInt(entry[1]) > BigInt(best[1]) ? entry : best));
  if (BigInt(scores[choice]) === BigInt(best[1])) return null;
  return {
    code: "OBJECTIVE_NOT_MET",
    retryable: true,
    message: `The explicit goal is to maximize the supplied score. Choice ${choice} yields ${scores[choice]}, while legal choice ${best[0]} yields ${best[1]}. Re-evaluate the legal alternatives while preserving all constraints. No effect executed.`,
  };
}
