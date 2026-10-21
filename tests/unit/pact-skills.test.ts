import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import {
  createPactSkillSupport,
  supplyReserveConstraints,
  supplyRoutineCandidate,
} from "../../src/environments/pact-skills.js";
import type { PrimitiveContext } from "../../src/modules/skills/v1/primitives.js";
import { qualifyRecipe, runTrustedCases } from "../../src/modules/skills/v1/qualification.js";
import { type SkillVersion, skillContentDigest } from "../../src/modules/skills/v1/schema.js";

it("qualifies only the exact owned template against real guard counterexamples", async () => {
  const body = supplyRoutineCandidate(randomUUID(), "observed-episode"),
    skill: SkillVersion = {
      ref: { id: randomUUID(), version: 1, digest: skillContentDigest(body) },
      body,
      status: "candidate",
      author: "diplomacy",
      published: false,
      createdAt: new Date().toISOString(),
      outcomeSupport: "unproven",
    },
    s = createPactSkillSupport(),
    cases = s.cases(skill);
  expect(cases).toBeDefined();
  const evidence = await runTrustedCases(skill, s.registry, s.policy, cases!, body.evidence.sourceIds);
  expect(evidence.cases.map((c) => [c.id, c.passed, c.error])).toEqual(
    s.policy.requiredCases.map((id) => [id, true, null]),
  );
  expect(qualifyRecipe(skill, s.registry, s.policy, evidence).mode).toBe("guarded");
  const altered = structuredClone(skill);
  altered.body.procedure.nodes.reverse();
  expect(s.cases(altered)).toBeUndefined();
  altered.body.procedure.nodes = skill.body.procedure.nodes;
  altered.body.inputs = { type: "object", properties: {}, additionalProperties: false };
  expect(s.cases(altered)).toBeUndefined();
});
it("derives reserve floors from full own exposure and actual immediate debits", () => {
  const inputs = {
    offerId: randomUUID(),
    version: 1,
    counterpartyKingdomId: randomUUID(),
    termsJson: JSON.stringify({
      aToB: { resource: "iron", wholePerHour: 1 },
      bToA: { resource: "silver", wholePerHour: 2 },
      aBond: null,
      bBond: null,
      durationHours: 1,
      noticeHours: 0,
    }),
    minimumIron: "500",
    minimumSilver: "200",
    minimumGrain: "0",
    assessmentDeadlineGameTimeMs: "7200000",
  };
  const effects = {
    supported: true,
    coverage: { complete: true, omitted: [] },
    actionKey: "game.supply.sign",
    claims: [
      { kind: "authority", schemaId: "pact.authority.v1", key: "iron", units: "1000" },
      { kind: "resource", schemaId: "pact.stock.v1", key: "iron:ordinary", units: "100" },
    ],
  } as never;
  expect(supplyReserveConstraints(inputs, effects)).toEqual({ iron: "1400", silver: "200", grain: "0" });
});
it("does not accept delivery rows from a future clock as fulfilled evidence", async () => {
  const owner = randomUUID(),
    peer = randomUUID(),
    offer = randomUUID(),
    terms = {
      aToB: { resource: "iron", wholePerHour: 1 },
      bToA: { resource: "silver", wholePerHour: 2 },
      aBond: null,
      bBond: null,
      durationHours: 1,
      noticeHours: 0,
    };
  const inputs = {
    offerId: offer,
    version: 1,
    counterpartyKingdomId: peer,
    termsJson: JSON.stringify(terms),
    minimumIron: "0",
    minimumSilver: "0",
    minimumGrain: "0",
    assessmentDeadlineGameTimeMs: "7200000",
  };
  const payload = {
    requestedRead: {
      schemaVersion: "pact.observation-section.v1",
      section: "agreements",
      ownerKingdomId: owner,
      asOfGameTimeMs: 0,
      records: [
        {
          id: randomUUID(),
          type: "SupplyContract",
          ownerKingdomId: owner,
          kingdomA: peer,
          kingdomB: owner,
          counterpartyKingdomId: peer,
          offerId: offer,
          offerVersion: 1,
          terms,
          status: "expired",
          startGameTimeMs: "60000",
          endGameTimeMs: "3660000",
          deliveries: [
            {
              resource: "iron",
              direction: "received",
              installments: 60,
              dueMarked: "600",
              deliveredMarked: "600",
              overflowMarked: "0",
              failedInstallments: 0,
              lastGameTimeMs: "3600000",
            },
            {
              resource: "silver",
              direction: "sent",
              installments: 60,
              dueMarked: "1200",
              deliveredMarked: "1200",
              overflowMarked: "0",
              failedInstallments: 0,
              lastGameTimeMs: "3600000",
            },
          ],
        },
      ],
    },
  };
  const c = {
    inputs,
    values: {},
    goal: {},
    signal: new AbortController().signal,
    observe: async () => payload,
    submit: async () => ({}),
    request: async () => ({}),
    resolve: async () => ({}),
  } satisfies PrimitiveContext;
  const result = await createPactSkillSupport().registry.invoke(
    { id: "pact.existing-supply.delivery", version: "1" },
    "await",
    {},
    c,
  );
  expect(result.value?.fulfilled).toBe(false);
  expect(result.returnToReasoning).toBe("DELIVERY_TIME_INCONSISTENT");
  payload.requestedRead.records[0].status = "active";
  payload.requestedRead.records[0].deliveries = [];
  const pending = await createPactSkillSupport().registry.invoke(
    { id: "pact.existing-supply.delivery", version: "1" },
    "await",
    {},
    c,
  );
  expect(pending).toMatchObject({ wait: true, value: { fulfilled: false, reason: "DELIVERY_NOT_STARTED" } });
});
