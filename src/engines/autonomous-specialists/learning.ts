import type { Original } from "../../modules/evidence/negotiation/v1.js";
export type LearningOpportunity = {
  episodeIds: string[];
  sourceIds: string[];
  priority: "low";
  outcome: "unproven" | "observed_success" | "observed_failure";
  reason: string;
};
export class LearningPolicy {
  opportunities(originals: Original[], enabled: boolean, remainingCalls: number): LearningOpportunity[] {
    if (!enabled || remainingCalls < 1) return [];
    const outcomes = originals
      .filter((o) => o.kind === "outcome" && (o.detail.fulfilled === true || o.detail.fulfilled === false))
      .slice(0, 2);
    if (outcomes.length)
      return outcomes.map((o) => ({
        episodeIds: [o.id],
        sourceIds: [o.id],
        priority: "low",
        outcome: o.detail.fulfilled === true ? "observed_success" : "observed_failure",
        reason: "Observed outcome supports a bounded hypothesis, not mastery",
      }));
    const repeated = originals.filter((o) => o.kind === "observation").slice(0, 2);
    return repeated.length === 2
      ? [
          {
            episodeIds: repeated.map((o) => o.id),
            sourceIds: repeated.map((o) => o.id),
            priority: "low",
            outcome: "unproven",
            reason: "Repeated observed work; effectiveness unproven",
          },
        ]
      : [];
  }
}
