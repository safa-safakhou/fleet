import { expect, it } from "vitest";
import { reconcileContinuation } from "../../src/continuation.js";

const state = {
  version: 1,
  goal: { id: "farm-goal", title: "Improve reliable food" },
  steps: [
    {
      id: "farm",
      intent: "Finish Farm III",
      dependsOn: [],
      postcondition: { kind: "building_level", referenceId: "farm", operator: "at_least" as const, value: 3 },
    },
  ],
  nextStepId: "farm",
  wait: {
    reason: "The farm is still building",
    until: { kind: "building_level", referenceId: "farm", operator: "at_least" as const, value: 3 },
  },
  ownerIntentFingerprint: "current",
  outcomes: [{ category: "committed", code: "COMMITTED" }],
  proposalKeys: {},
};
it("invalidates a stale completed-Farm wait only from fresh observed facts, not a queue receipt", () => {
  const before = structuredClone(state);
  expect(
    reconcileContinuation(state, [{ kind: "building_level", referenceId: "farm", value: 2 }], "current").goalStatus,
  ).toBe("waiting");
  expect(reconcileContinuation(state, [], "current").steps[0].status).toBe("unknown");
  const complete = reconcileContinuation(state, [{ kind: "building_level", referenceId: "farm", value: 3 }], "current");
  expect(complete.wait).toBeNull();
  expect(complete.goalStatus).toBe("observed_complete");
  expect(complete.reconsideration).toContain("Fresh facts");
  expect(state).toEqual(before);
});
it("treats changed owner intent as a review condition and preserves the old authored goal", () => {
  const changed = reconcileContinuation(
    state,
    [{ kind: "building_level", referenceId: "farm", value: 3 }],
    "new-intent",
  );
  expect(changed.goalStatus).toBe("needs_review");
  expect(changed.goal).toEqual(state.goal);
  expect(changed.wait).toEqual(state.wait);
});
it("retains dependency gates when postconditions are missing or unmet", () => {
  const blocked = reconcileContinuation(
    {
      ...state,
      steps: [
        {
          ...state.steps[0],
          id: "hall",
          postcondition: { kind: "building_level", referenceId: "hall", operator: "at_least", value: 2 },
        },
        { ...state.steps[0], dependsOn: ["hall"] },
      ],
    },
    [
      { kind: "building_level", referenceId: "hall", value: 1 },
      { kind: "building_level", referenceId: "farm", value: 2 },
    ],
    "current",
  );
  expect(blocked.steps[1].status).toBe("blocked_by_dependency");
  expect(blocked.goalStatus).toBe("waiting");
});
