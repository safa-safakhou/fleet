import { expect, it } from "vitest";
import { expandFactTables } from "../../src/fact-table.js";
import { projectPactObservation } from "../../src/games/pact/negotiation-state.js";
import { pactNamedObservationSemantics } from "../../src/games/pact/observation-semantics.js";
import { packPactObservation } from "../../src/games/pact/packing.js";

it("explicitly distinguishes accepted contacts, pending introductions and rejected duplicate requests only in the new policy", () => {
  const facts = {
    world: { balances: {}, authority: { allowedActions: [], resources: {} } },
    guide: { contacts: [{ kingdomId: "peer" }], contactRequests: [] },
  };
  const legacy = pactNamedObservationSemantics(facts),
    next = pactNamedObservationSemantics(facts, { social: true });
  expect(legacy).not.toContain("ALREADY_CONTACT");
  expect(next).toContain("accepted relationships");
  expect(next).toContain("ALREADY_CONTACT");
  expect(next).toContain("rejected");
  expect(next).toContain("not trade consent");
  expect(next).toContain("socialAttention");
  expect(next).toContain("incoming");
  expect(next).toContain("decline");
  expect(next).toContain("Outgoing");
  expect(next).toContain("delegation");
  const original = {
      schemaId: "pact.observation.v1",
      revision: "r",
      observedAt: "2026-10-23T00:00:00Z",
      environmentTime: { clockId: "pact.game-time-ms", value: "0" },
      sourceRefs: ["native"],
      payload: facts,
      coverage: { authorizedView: true },
    },
    before = structuredClone(original);
  const projected = projectPactObservation(original, { id: "specialists", version: "4" });
  expect(projected.schemaId).toBe("pact.observation.specialists.v4");
  const packed = packPactObservation(projected, 5000);
  expect(packed.coverage.policy).toBe("pact.specialist-view.v4");
  expect((expandFactTables(packed.payload.environment) as typeof facts.guide).contacts).toEqual(facts.guide.contacts);
  expect(original).toEqual(before);
});

it("retains one whole current supply offer before optional history and attention records", () => {
  const offer = {
    id: "offer",
    type: "SupplyOffer",
    status: "open",
    version: 2,
    terms: { ordinaryUnits: "600", rateWholePerHour: 2 },
    sourceRefs: ["native:offer"],
  };
  const observation = {
      schemaId: "pact.observation.specialists.v4",
      revision: "r",
      observedAt: "2026-10-23T00:00:00Z",
      environmentTime: { clockId: "pact.game-time-ms", value: "0" },
      sourceRefs: ["native"],
      payload: {
        world: { authority: { allowedActions: [], resources: {} } },
        guide: { openSupplyOffers: [offer] },
        socialAttention: {
          records: [{ id: "optional", type: "Other", text: "x".repeat(10000) }, offer],
          coverage: { complete: true },
        },
      },
      coverage: { authorizedView: true },
    },
    before = structuredClone(observation);
  const packed = packPactObservation(observation, 3000),
    environment = packed.payload.environment as Record<string, unknown>;
  expect((environment.socialAttention as { records: unknown[] }).records).toEqual([offer]);
  expect(packed.coverage.pages).toMatchObject({ socialAttention: { observed: 2, delivered: 1, omitted: 1 } });
  expect(observation).toEqual(before);
});
