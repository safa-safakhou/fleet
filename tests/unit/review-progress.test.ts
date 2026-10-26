import { expect, it } from "vitest";
import { reviewProgress } from "../../scripts/lib/review-progress.js";

it("identifies repeated zero-action waits without mistaking commands/errors for waiting", () => {
  const r = (agentId: string, code: string, actions = 0) => ({ agentId, code, actions });
  expect(
    reviewProgress([
      r("a", "WAIT"),
      r("b", "FORBIDDEN"),
      r("a", "WAIT"),
      r("a", "WAIT"),
      r("a", "COMMITTED", 1),
      r("a", "WAIT"),
      r("b", "WAIT"),
    ]),
  ).toEqual([
    { agentId: "a", consecutiveWaits: 3, latestCode: "WAIT", reviewNeeded: true, historyTruncated: false },
    { agentId: "b", consecutiveWaits: 0, latestCode: "FORBIDDEN", reviewNeeded: false, historyTruncated: false },
  ]);
});
