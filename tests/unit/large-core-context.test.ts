import { expect, it } from "vitest";
import { fitMessages } from "../../src/context.js";
import { FleetError } from "../../src/domain.js";

it("fits a post-command world whose indispensable core exceeds 12KB when the complete envelope still has room", () => {
  const receipt = { commandId: "confirmed-command", status: "accepted" };
  const context = {
    ownerValues: { mode: "account_autonomy", objectiveStatus: "provided", accountObjective: "Develop supplies" },
    continuation: { goal: null, goalStatus: "absent", outcomes: [receipt] },
    commandResults: [receipt],
    environment: { core: "x".repeat(14000), optional: "y".repeat(30000) },
  };
  const messages = fitMessages(
    context,
    "Trusted assignment",
    {},
    22000,
    (reads) => reads,
    undefined,
    (environment, allowance) => {
      if (allowance < 14020) throw new FleetError("CONTEXT_LIMIT");
      return { core: environment.core, coverage: { optionalOmitted: true } };
    },
  );
  const delivered = JSON.parse(messages[1].content);
  expect(delivered.environment.core).toHaveLength(14000);
  expect(delivered.commandResults).toEqual([receipt]);
  expect(delivered.priorAgentState.continuation.outcomes).toEqual([receipt]);
  expect(Buffer.byteLength(JSON.stringify(messages)) + 2).toBeLessThanOrEqual(22000);
});
