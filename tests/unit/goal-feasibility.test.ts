import { expect, it } from "vitest";
import { compactFacts } from "../../src/games/pact/adapter.js";
import { compactEnvironment } from "../../src/games/pact/environment.js";

it("delivers server feasibility intact without deriving permission or replacing owner intent", () => {
  const goalFeasibility = {
    schemaVersion: "pact.goal-feasibility.v1",
    hallUpgrades: [{ targetLevel: 4, costWhole: { iron: "1260", silver: "630" }, exceedsFullCeiling: ["iron"] }],
    ownerDecision: "unresolved",
  };
  const facts = compactFacts({
    world: { profile: { kingdomId: "own" }, ambition: "My own values" },
    guide: { goalFeasibility },
  });
  expect(facts.ambition).toBe("My own values");
  expect(facts.goalFeasibility).toEqual(goalFeasibility);
  expect(compactEnvironment({ ...facts, contacts: [{ history: "x".repeat(9000) }] }, 2500).goalFeasibility).toEqual(
    goalFeasibility,
  );
});
