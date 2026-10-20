import { expect, it } from "vitest";
import { fitMessages } from "../../src/context.js";

it("presents the authenticated current assignment separately from a previous agent's empty goal and stale wait", () => {
  const authored = { goal: null, goalStatus: "absent", outcomes: [{ summary: "Awaiting owner direction" }] };
  const prior = {
    continuation: authored,
    privateNotes: "No action needed",
    lastOutcome: "WAIT",
    lastIntent: "Await owner",
  };
  const context = {
    ownerValues: {
      mode: "account_autonomy",
      objectiveStatus: "provided",
      accountObjective: "Develop reliable supplies",
    },
    ...prior,
    environment: { asOfGameTimeMs: 1000 },
  };
  const packet = JSON.parse(fitMessages(context, "Trusted instruction", {}, 20000, (reads) => reads)[1].content);
  expect(packet.currentAssignment).toMatchObject({ objective: "Develop reliable supplies", status: "provided" });
  expect(packet.priorAgentState).toMatchObject(prior);
  expect(packet.continuation).toBeUndefined();
  expect(packet.privateNotes).toBeUndefined();
  expect(packet.lastIntent).toBeUndefined();
  expect(packet.environment).toEqual({ asOfGameTimeMs: 1000 });
  expect(context.continuation).toBe(authored);
});

it("does not manufacture an assignment from an old plan or a generated strategy", () => {
  const context = {
    ownerValues: { mode: "account_autonomy", objectiveStatus: "absent", accountObjective: null },
    continuation: { goal: "Old agent goal", goalStatus: "provided" },
    privateNotes: "Old notes",
  };
  const packet = JSON.parse(fitMessages(context, "Trusted instruction", {}, 20000, (reads) => reads)[1].content);
  expect(packet.currentAssignment).toBeUndefined();
  expect(packet.continuation).toEqual(context.continuation);
});
