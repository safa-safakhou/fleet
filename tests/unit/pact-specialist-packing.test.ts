import { expect, it } from "vitest";
import { expandFactTables } from "../../src/fact-table.js";
import { projectPactObservation } from "../../src/games/pact/negotiation-state.js";
import { packPactObservation } from "../../src/games/pact/packing.js";
import type { Observation } from "../../src/platform/contracts.js";

it("keeps mandatory own goal/stock/authority/building/training facts and whole scoped answers in the new view", () => {
  const world = {
    profile: { kingdomId: "owner" },
    ambition: "Owner Hall goal",
    asOfGameTimeMs: 100,
    balances: {
      iron: {
        ordinaryUnits: "60000",
        lockedUnits: "0",
        foundingAllowanceUnits: "1000",
        capacityUnits: "60000",
        facts: { ordinaryWhole: 100 },
      },
      silver: {
        ordinaryUnits: "30000",
        lockedUnits: "0",
        foundingAllowanceUnits: "0",
        capacityUnits: "60000",
        facts: { ordinaryWhole: 50 },
      },
    },
    authority: {
      mandateVersion: 3,
      allowedActions: ["building.queue", "supply.sign"],
      resources: { iron: { headroomUnits: "60000" }, silver: { headroomUnits: "30000" } },
    },
    buildings: [
      { kind: "farm", level: 2 },
      { kind: "hall", level: 1 },
    ],
    builders: [{ slot: 1, state: "active", kind: "farm", targetLevel: 2 }],
    training: [{ type: "spearman", count: 1, state: "active" }],
    nextUpgradeChecks: [
      {
        kind: "hall",
        targetLevel: 2,
        prerequisiteCheck: "missing",
        missingBuildings: [{ kind: "barracks", level: 2 }],
      },
    ],
    upkeep: { foodUnits: "10" },
    charges: { immediate: "0" },
  };
  const input: Observation = {
    schemaId: "pact.observation.v1",
    revision: "r",
    observedAt: "2026-10-21T00:00:00Z",
    environmentTime: { clockId: "pact.game-time-ms", value: "100" },
    sourceRefs: ["original:read"],
    payload: {
      world,
      guide: {
        mandate: { version: 3 },
        resourceRules: { prose: "large".repeat(10000) },
        constructionStockChecks: [
          { building: "hall", targetLevel: 2, stockAffordable: false, costWhole: { iron: 200 } },
        ],
      },
      requestedRead: {
        schemaVersion: "owned-answer",
        records: [{ id: "offer", version: 2, signedBy: ["peer"], terms: { amount: 2 } }],
      },
    },
    coverage: { authorizedView: true },
  };
  const projected = projectPactObservation(input, { id: "specialists", version: "1" }),
    packed = packPactObservation(projected, 5000),
    environment = expandFactTables(packed.payload.environment) as Record<string, unknown>;
  for (const key of ["ambition", "buildings", "builders", "training", "nextUpgradeChecks", "upkeep", "charges"])
    expect(environment[key]).toEqual(world[key as keyof typeof world]);
  expect(environment.authority).toEqual(world.authority);
  expect(packed.payload.requestedRead).toEqual(input.payload.requestedRead);
  expect(packed.sourceRefs).toEqual(input.sourceRefs);
  expect(packed.environmentTime).toEqual(input.environmentTime);
  expect(packed.coverage).toMatchObject({ policy: "pact.specialist-view.v1", complete: false });
  expect(packed.coverage.omittedFields).toContain("resourceRules");
  expect(JSON.stringify(packed)).not.toContain("large".repeat(10));
  expect(() => packPactObservation(projected, 100)).toThrow("SPECIALIST_CONTEXT_INCOMPLETE");
  expect(input.schemaId).toBe("pact.observation.v1");
  expect(input.payload.world).toEqual(world);
});
