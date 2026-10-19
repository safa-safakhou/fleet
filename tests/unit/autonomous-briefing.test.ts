import { expect, it } from "vitest";
import { object } from "../../src/domain.js";
import { compactFacts } from "../../src/games/pact/adapter.js";
import { compactEnvironment } from "../../src/games/pact/environment.js";

const facts = {
  world: {
    ambition: "Develop a resilient kingdom and choose your own legal actions",
    asOfGameTimeMs: 1000,
    authority: { allowedActions: ["building.queue", "world.read"] },
    buildings: [
      { kind: "hall", level: 1 },
      { kind: "farm", level: 1 },
      { kind: "barracks", level: 1 },
    ],
    builders: [
      {
        slot: 1,
        state: "waiting",
        kind: "hall",
        targetLevel: 2,
        instructionId: "hall-job",
        missingBuildings: [
          { kind: "farm", level: 2 },
          { kind: "barracks", level: 2 },
        ],
      },
      { slot: 2, state: null, instructionId: null },
    ],
    nextUpgradeChecks: [
      { kind: "farm", targetLevel: 2, prerequisiteCheck: "ready", missingBuildings: [] },
      {
        kind: "hall",
        targetLevel: 2,
        prerequisiteCheck: "hall_prerequisite",
        missingBuildings: [
          { kind: "farm", level: 2 },
          { kind: "barracks", level: 2 },
        ],
      },
    ],
  },
  guide: {
    mandate: { version: 2, allowedActions: ["building.queue", "world.read"] },
    constructionStockChecks: [
      { building: "farm", targetLevel: 2, stockAffordable: true, costWhole: { iron: "40", silver: "20" }, busy: false },
      { building: "hall", targetLevel: 2, stockAffordable: true, busy: true },
    ],
  },
};
it("makes a standing owner objective and observed prerequisite options survive packing without granting new authority", () => {
  const full = compactFacts(facts);
  const brief = object(full.agentBriefing);
  expect(brief.ownerIntent).toEqual({ status: "provided", objective: facts.world.ambition });
  expect(object(brief.execution).lease).toBe("managed_by_host");
  expect(object(brief.execution).allowedActions).toEqual(facts.world.authority.allowedActions);
  expect(object(brief.construction).availableQueueSlots).toEqual([2]);
  expect(object(brief.construction).options).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        building: "farm",
        targetLevel: 2,
        prerequisiteCheck: "ready",
        stockAffordable: true,
        busy: false,
      }),
      expect.objectContaining({ building: "hall", busy: true, prerequisiteCheck: "hall_prerequisite" }),
    ]),
  );
  const packed = compactEnvironment({ ...full, optionalHistory: "x".repeat(40000) }, 12000);
  expect(packed.agentBriefing).toEqual(brief);
  expect(object(brief.execution).humanOnly).toContain(
    "Explicit human-only actions still require their existing owner approval.",
  );
});
it("does not invent an objective, stock affordability, queue slot or permission when the owned facts omit them", () => {
  const brief = object(compactFacts({ world: {}, guide: {} }).agentBriefing);
  expect(brief.ownerIntent).toEqual({ status: "absent", objective: null });
  expect(object(brief.execution).allowedActions).toEqual([]);
  expect(object(brief.construction).availableQueueSlots).toEqual([]);
  expect(object(brief.construction).options).toEqual([]);
});
