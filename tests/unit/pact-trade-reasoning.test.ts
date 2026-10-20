import { Ajv } from "ajv";
import { expect, it } from "vitest";
import { type Data, object } from "../../src/domain.js";
import { pactAdapter } from "../../src/games/pact/adapter.js";
import { pactActionContracts, validatePactProposal } from "../../src/games/pact/proposals.js";

const self = "11111111-1111-4111-8111-111111111111",
  peer = "22222222-2222-4222-8222-222222222222";
const rules = {
  schemaVersion: "pact.supply-terms.v1",
  durationHours: [1, 6, 24, 72],
  noticeHours: [0, 1, 6],
  maxBondFlowHours: 6,
  valueUnitsPerWhole: { iron: "4", silver: "8", grain: "1" },
  minOfferExpiryMinutes: 5,
  maxOfferExpiryMinutes: 60,
  outgoingRateLimit: "storage_capacity_whole_per_hour",
};
const facts: Data = {
  world: {
    profile: { kingdomId: self },
    balances: {
      grain: { ordinaryUnits: "35710", capacityUnits: "360000" },
      iron: { ordinaryUnits: "20600", capacityUnits: "360000" },
      silver: { ordinaryUnits: "10900", capacityUnits: "360000" },
    },
  },
  guide: { resourceRules: { markedPerWhole: 600 }, openSupplyOffers: [] },
  diplomacy: { contractRules: { aIsOfferCreator: true, termsValidation: rules } },
  discovery: { players: [{ kingdomId: peer }] },
};
const terms = {
  aToB: { resource: "grain", wholePerHour: 5 },
  bToA: { resource: "iron", wholePerHour: 6 },
  aBond: null,
  bBond: null,
  durationHours: 6,
  noticeHours: 1,
};
const action = { kind: "game.supply.offer", counterpartyKingdomId: peer, terms };
const expectedOutcome = { trade: { youSend: terms.aToB, youReceive: terms.bToA } };

it("requires an accurate structured trade perspective rather than trusting a reversed income summary", () => {
  expect(validatePactProposal(action, facts, expectedOutcome)).toMatchObject({ valid: true });
  expect(validatePactProposal(action, facts, { trade: { youSend: terms.bToA, youReceive: terms.aToB } })).toMatchObject(
    {
      valid: false,
      code: "PACT_TRADE_PERSPECTIVE_MISMATCH",
      detail: { trade: { youSend: terms.aToB, youReceive: terms.bToA } },
    },
  );
  expect(validatePactProposal(action, facts, {})).toMatchObject({
    valid: false,
    code: "PACT_TRADE_PERSPECTIVE_REQUIRED",
  });
});
it("rejects the retained excessive-bond offer before submission and explains the exact flow-relative bounds", () => {
  const bad = {
    ...action,
    terms: {
      ...terms,
      aToB: { resource: "iron", wholePerHour: 3000 },
      bToA: { resource: "silver", wholePerHour: 2000 },
      aBond: { resource: "grain", wholeAmount: 500000 },
      bBond: { resource: "grain", wholeAmount: 500000 },
      durationHours: 24,
    },
    expiryMinutes: 8,
  };
  const check = validatePactProposal(bad, facts, { trade: { youSend: bad.terms.aToB, youReceive: bad.terms.bToA } });
  expect(check).toMatchObject({
    valid: false,
    code: "PACT_SUPPLY_BOND_EXCEEDS_FLOW",
    detail: {
      issues: expect.arrayContaining(["PACT_SUPPLY_BOND_EXCEEDS_FLOW", "PACT_SUPPLY_RATE_TOO_HIGH"]),
      maxBondWhole: { a: { grain: "72000" }, b: { grain: "96000" } },
    },
  });
});
it("keeps legal null and exact-bound bonds, rejects one unit over, orphan bonds and notice longer than duration", () => {
  for (const aBond of [null, { resource: "grain", wholeAmount: 30 }])
    expect(validatePactProposal({ ...action, terms: { ...terms, aBond } }, facts, expectedOutcome).valid).toBe(true);
  expect(
    validatePactProposal(
      { ...action, terms: { ...terms, aBond: { resource: "grain", wholeAmount: 31 } } },
      facts,
      expectedOutcome,
    ).code,
  ).toBe("PACT_SUPPLY_BOND_EXCEEDS_FLOW");
  expect(
    validatePactProposal(
      { ...action, terms: { ...terms, aToB: null, aBond: { resource: "grain", wholeAmount: 1 } } },
      facts,
      {},
    ).code,
  ).toBe("PACT_SUPPLY_BOND_WITHOUT_FLOW");
  expect(
    validatePactProposal({ ...action, terms: { ...terms, durationHours: 1, noticeHours: 6 } }, facts, expectedOutcome)
      .code,
  ).toBe("PACT_SUPPLY_DURATION_OR_NOTICE");
  expect(validatePactProposal({ ...action, expiryMinutes: 1 }, facts, expectedOutcome).code).toBe(
    "INVALID_TOOL_ARGUMENTS",
  );
  expect(pactAdapter.preflight?.({ ...action, expiryMinutes: 1 }, facts)?.code).toBe("PACT_SUPPLY_EXPIRY");
});
it("counteroffers retain original party directions, including when this actor is party B", () => {
  const f = {
    ...facts,
    guide: { ...object(facts.guide), openSupplyOffers: [{ id: peer, kingdomA: peer, kingdomB: self, version: 1 }] },
  };
  const counter = { kind: "game.supply.counter", offerId: peer, expectedVersion: 1, terms };
  expect(validatePactProposal(counter, f, { trade: { youSend: terms.bToA, youReceive: terms.aToB } }).valid).toBe(true);
  expect(validatePactProposal(counter, f, expectedOutcome).code).toBe("PACT_TRADE_PERSPECTIVE_MISMATCH");
});
it("generation labels direction and caps only the observed creator's outgoing rate using published storage rules", () => {
  const contracts = pactActionContracts(facts),
    schema = { anyOf: contracts.map((c) => c.payloadSchema) },
    check = new Ajv({ strict: false, validateFormats: false }).compile(schema);
  expect(check(action)).toBe(true);
  expect(check({ ...action, terms: { ...terms, aToB: { resource: "iron", wholePerHour: 601 } } })).toBe(false);
  expect(check({ ...action, terms: { ...terms, aToB: { resource: "iron", wholePerHour: 600 } } })).toBe(true);
  const trade = contracts.find((c) => c.expectedOutcomeSchema);
  expect(trade).toBeDefined();
  expect(JSON.stringify(trade)).toContain("YOU SEND");
  expect(JSON.stringify(trade)).toContain("YOU RECEIVE");
});
it("keeps missing/older rule coverage explicit instead of guessing a bond formula or a peer storage capacity", () => {
  const f = { ...facts, diplomacy: {} };
  expect(validatePactProposal(action, f, expectedOutcome).valid).toBe(true);
  expect(
    validatePactProposal(
      { ...action, terms: { ...terms, aBond: { resource: "grain", wholeAmount: 1 } } },
      f,
      expectedOutcome,
    ).code,
  ).toBe("PACT_SUPPLY_RULES_REQUIRED");
  expect(
    validatePactProposal({ ...action, terms: { ...terms, bToA: { resource: "iron", wholePerHour: 1000 } } }, facts, {
      trade: { youSend: terms.aToB, youReceive: { resource: "iron", wholePerHour: 1000 } },
    }).valid,
  ).toBe(true);
  const brief = object(pactAdapter.compactFacts?.(facts).agentBriefing);
  expect(object(brief.trade).offerDirections).toEqual({
    aToB: "youSend",
    bToA: "youReceive",
    aBond: "yourBond",
    bBond: "peerBond",
  });
});

it("uses a scoped diplomacy refresh to recover missing numeric bond rules", () => {
  const f: Data = { ...facts, diplomacy: {} };
  const bonded = { ...action, terms: { ...terms, aBond: { resource: "grain", wholeAmount: 1 } } };
  expect(validatePactProposal(bonded, f, expectedOutcome).code).toBe("PACT_SUPPLY_RULES_REQUIRED");
  pactAdapter.applyRead?.(
    f,
    "pact_agent_guide_v1",
    { topic: "diplomacy" },
    { contractRules: { aIsOfferCreator: true, termsValidation: rules } },
    self,
  );
  expect(validatePactProposal(bonded, f, expectedOutcome).valid).toBe(true);
});
