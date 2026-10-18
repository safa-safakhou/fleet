import { expect, it } from "vitest";
import { validatePactProposal } from "../../src/games/pact/proposals.js";

it("rejects the two archived malformed payloads while preserving a legitimate action", () => {
  for (const payload of [
    { commandId: "stale-receipt-repair", action: { fix: true } },
    { commandId: "scarcity-trade:decline", action: "decline" },
  ])
    expect(validatePactProposal(payload, {}).valid).toBe(false);
  expect(
    validatePactProposal({ kind: "game.building.queue", building: "farm", targetLevel: 2, slot: 1 }, {}).valid,
  ).toBe(true);
});
