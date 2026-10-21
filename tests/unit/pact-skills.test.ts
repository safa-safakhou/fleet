import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import {
  createPactSkillSupport,
  supplyReserveConstraints,
  supplyRoutineCandidate,
} from "../../src/environments/pact-skills.js";
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
