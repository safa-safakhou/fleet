import {
  assessNegotiation,
  type NegotiationClaimReviews,
  type NegotiationEvidence,
} from "../../src/negotiation-evaluation.js";
import type { NegotiationCell } from "../../src/negotiation-plan.js";
/** Mechanical readiness only. Manual reviews remain unresolved and a later
 * exact source-backed review is mandatory before returning any assessment. */
export function nativeCompletionReady(
  cell: NegotiationCell,
  e: NegotiationEvidence,
  solo: NegotiationEvidence,
  allocations: NegotiationClaimReviews["allocations"],
) {
  if (cell.clockMode !== "native" || cell.family !== "C01") return false;
  const provisional = assessNegotiation(cell, e, solo, {
    evidenceLevel: "fake-provider",
    allocations,
    claims: [],
    reviews: [],
  });
  return (
    provisional.material === "pass" &&
    provisional.history === "pass" &&
    !provisional.criticalFailures.length &&
    provisional.reasons.every((r) => r === "UNRESOLVED_FACTUALITY") &&
    e.actors.every((a) =>
      e.lifecycle.some((l) => l.actorId === a.actorId && l.stage === "dialogue" && !l.scriptedPrefix),
    )
  );
}
