import { FleetError, object, safeCode } from "../../src/domain.js";
import type { DecisionFeedback } from "../../src/platform/decision-feedback.js";
import {
  bindObservedFacts,
  constrainLegalChoices,
  validateNumericObjective,
} from "../../src/platform/grounded-decision.js";
import { type createKingdomWorkflow, kingdomWorkflowSchema } from "../../tests/fixtures/kingdom-feedback-workflow.js";

export type KingdomRepairs = { facts: boolean; legal: boolean; refresh: boolean; objective: boolean };
export const noKingdomRepairs: KingdomRepairs = { facts: false, legal: false, refresh: false, objective: false };
export const allKingdomRepairs: KingdomRepairs = { facts: true, legal: true, refresh: true, objective: true };
type Snapshot = ReturnType<ReturnType<typeof createKingdomWorkflow>["snapshot"]>;
type Schema = {
  type: string;
  additionalProperties: boolean;
  required: string[];
  properties: Record<string, Record<string, unknown>>;
};
/** Synthetic adapter only. Generic platform utilities never import this toy-game oracle. */
export function createGroundedKingdomPolicy(env: ReturnType<typeof createKingdomWorkflow>, repairs: KingdomRepairs) {
  let observed: Snapshot | null = null;
  const scores = () => {
    const current = observed;
    if (!current) return { none: "0" } as Record<string, string>;
    return Object.fromEntries([
      ...current.offers.filter((o) => BigInt(o.cost) <= BigInt(current.spendable)).map((o) => [o.id, o.iron]),
      ["none", "0"],
    ]);
  };
  const schema = (): Schema => {
    let value = structuredClone(kingdomWorkflowSchema) as Schema;
    if (repairs.facts) {
      for (const field of ["gold", "spendable", "delivery"]) delete value.properties[field];
      value.required = value.required.filter((field) => !["gold", "spendable", "delivery"].includes(field));
      value.properties.bindingId = { const: env.bindingId };
      value.properties.requestId = { const: env.requestId };
      if (observed) value.properties.revision = { const: observed.revision };
    }
    if (repairs.legal) value = constrainLegalChoices(value, "offerId", Object.keys(scores())) as Schema;
    return value;
  };
  const resolve = (raw: unknown) => {
    const proposal = object(raw);
    if (!repairs.facts || proposal.kind === "read" || proposal.kind === "wait") return proposal;
    if (!observed) throw new FleetError("READ_REQUIRED", true);
    return bindObservedFacts(raw, {
      bindingId: env.bindingId,
      requestId: env.requestId,
      revision: observed.revision,
      facts: { gold: observed.gold, spendable: observed.spendable, delivery: observed.delivery },
    });
  };
  return {
    schema,
    resolve,
    observe(value: unknown) {
      const snapshot = object(value);
      if (
        snapshot.kind !== "observation" ||
        snapshot.bindingId !== env.bindingId ||
        snapshot.requestId !== env.requestId
      )
        throw new FleetError("OBSERVATION_SCOPE_MISMATCH", true);
      observed = structuredClone(snapshot) as Snapshot;
      return repairs.legal
        ? {
            ...snapshot,
            legalChoices: Object.keys(scores()),
            fallback:
              "Choose offerId=none when no paid choice is legal. A legal choice is not necessarily the best objective choice.",
          }
        : snapshot;
    },
    validate(raw: unknown): DecisionFeedback | null {
      let proposal: Record<string, unknown>;
      try {
        proposal = resolve(raw);
      } catch (error) {
        return {
          code: safeCode(error),
          message:
            "Use only the current observed binding/revision reference. Exact facts are supplied by the host; do not author fact fields.",
          retryable: true,
        };
      }
      const legality = env.validate(proposal);
      if (legality) return legality;
      if (repairs.objective && ["propose", "answer"].includes(String(proposal.kind)))
        return validateNumericObjective(String(proposal.offerId), scores());
      return null;
    },
    independentlyValid(raw: unknown) {
      try {
        const proposal = resolve(raw);
        return (
          env.legalIndependently(proposal) &&
          (!repairs.objective || proposal.kind === "read" || proposal.offerId === env.grade().expectedOffer)
        );
      } catch {
        return false;
      }
    },
    refresh(feedback: DecisionFeedback) {
      if (!repairs.refresh || feedback.code !== "STALE_OBSERVATION") return null;
      // The env closure is already bound; this is an authorized read, never a model/game command replay.
      const value = env.accept({ kind: "read" });
      const snapshot = object(value);
      if (
        snapshot.kind !== "observation" ||
        snapshot.bindingId !== env.bindingId ||
        snapshot.requestId !== env.requestId
      )
        throw new FleetError("OBSERVATION_SCOPE_MISMATCH", true);
      observed = structuredClone(snapshot) as Snapshot;
      return repairs.legal ? { ...snapshot, legalChoices: Object.keys(scores()) } : snapshot;
    },
  };
}
