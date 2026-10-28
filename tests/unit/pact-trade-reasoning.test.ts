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
    correctable: true,
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

it("groups equal observed per-resource rate caps without duplicating the full flow shape", () => {
  const contract = pactActionContracts(facts).find((c) => c.expectedOutcomeSchema);
  const offer = (object(contract?.payloadSchema).anyOf as Data[]).find(
    (s) => object(object(s.properties).kind).const === "game.supply.offer",
  );
  const out = object(object(object(object(offer).properties).terms).properties).aToB;
  expect((object(out).anyOf as Data[]).filter((s) => s.type === "object")).toHaveLength(1);
  const different = structuredClone(facts);
  object(object(object(different.world).balances).silver).capacityUnits = "180000";
  const check = new Ajv({ strict: false, validateFormats: false }).compile({
    anyOf: pactActionContracts(different).map((c) => c.payloadSchema),
  });
  for (const [resource, cap] of [
    ["iron", 600],
    ["silver", 300],
    ["grain", 600],
  ] as const) {
    expect(check({ ...action, terms: { ...terms, aToB: { resource, wholePerHour: cap } } })).toBe(true);
    expect(check({ ...action, terms: { ...terms, aToB: { resource, wholePerHour: cap + 1 } } })).toBe(false);
  }
});

const signatureCheck = (input: Data) =>
  new Ajv({ strict: false, validateFormats: false }).compile({
    anyOf: pactActionContracts(input, ["game.supply.offer", "game.supply.counter", "game.supply.sign"]).map((c) => ({
      type: "object",
      properties: { payload: c.payloadSchema, expectedOutcome: c.expectedOutcomeSchema },
      required: ["payload", "expectedOutcome"],
      additionalProperties: false,
    })),
  });

it.each([true, false])("binds an observed signature's effect to the actor's actual party (selfA=%s)", (selfA) => {
  const offer = {
    id: peer,
    kingdomA: selfA ? self : peer,
    kingdomB: selfA ? peer : self,
    version: 3,
    terms: { ...terms, bToA: null },
    status: "open",
    expiresGameTimeMs: "3600000",
    signedBy: [],
  };
  const input = {
    ...facts,
    world: { ...object(facts.world), asOfGameTimeMs: "0" },
    guide: { ...object(facts.guide), asOfGameTimeMs: "0", openSupplyOffers: [offer] },
  };
  const check = signatureCheck(input),
    payload = { kind: "game.supply.sign", offerId: peer, version: 3 };
  const correct = { trade: { youSend: selfA ? terms.aToB : null, youReceive: selfA ? null : terms.aToB } };
  expect(check({ payload, expectedOutcome: correct })).toBe(true);
  expect(
    check({
      payload,
      expectedOutcome: {
        trade: {
          youSend: correct.trade.youReceive,
          youReceive: correct.trade.youSend,
        },
      },
    }),
  ).toBe(false);
  expect(check({ payload: { ...payload, version: 2 }, expectedOutcome: correct })).toBe(false);
  expect(validatePactProposal(payload, input, correct).valid).toBe(true);
});

it("does not cross-bind the version or flows of two different observed offers", () => {
  const second = "33333333-3333-4333-8333-333333333333";
  const input = {
    ...facts,
    world: { ...object(facts.world), asOfGameTimeMs: "0" },
    guide: {
      ...object(facts.guide),
      asOfGameTimeMs: "0",
      openSupplyOffers: [
        {
          id: peer,
          kingdomA: self,
          kingdomB: peer,
          version: 2,
          terms,
          status: "open",
          expiresGameTimeMs: "3600000",
          signedBy: [],
        },
        {
          id: second,
          kingdomA: peer,
          kingdomB: self,
          version: 5,
          terms,
          status: "open",
          expiresGameTimeMs: "3600000",
          signedBy: [],
        },
      ],
    },
  };
  const check = signatureCheck(input);
  const first = { payload: { kind: "game.supply.sign", offerId: peer, version: 2 }, expectedOutcome };
  const other = {
    payload: { kind: "game.supply.sign", offerId: second, version: 5 },
    expectedOutcome: { trade: { youSend: terms.bToA, youReceive: terms.aToB } },
  };
  expect(check(first)).toBe(true);
  expect(check(other)).toBe(true);
  expect(check({ ...first, expectedOutcome: other.expectedOutcome })).toBe(false);
  expect(check({ ...other, payload: { ...other.payload, version: 2 } })).toBe(false);
});

it("keeps incomplete signatures conditional without widening the bound offer fallback", () => {
  const unknown = "33333333-3333-4333-8333-333333333333";
  const input = {
    ...facts,
    guide: {
      ...object(facts.guide),
      openSupplyOffers: [
        { id: peer, kingdomA: self, kingdomB: peer, version: 2, terms },
        { id: unknown, version: 1, terms },
      ],
    },
  };
  const check = signatureCheck(input);
  const known = { kind: "game.supply.sign", offerId: peer, version: 2 };
  const incomplete = { kind: "game.supply.sign", offerId: unknown, version: 1 };
  const reversed = { trade: { youSend: terms.bToA, youReceive: terms.aToB } };
  expect(check({ payload: known, expectedOutcome })).toBe(true);
  expect(check({ payload: known, expectedOutcome: reversed })).toBe(false);
  expect(check({ payload: incomplete, expectedOutcome: reversed })).toBe(true);
  expect(validatePactProposal(incomplete, input, reversed).code).toBe("PACT_TRADE_PARTY_UNKNOWN");
  expect(check({ payload: action, expectedOutcome })).toBe(true);
});

it("does not convert missing observed terms into fixed null flows", async () => {
  const { observedSignaturePerspective } = await import("../../src/games/pact/trade.js");
  const input = {
    ...facts,
    guide: { ...object(facts.guide), openSupplyOffers: [{ id: peer, kingdomA: self, kingdomB: peer, version: 1 }] },
  };
  expect(observedSignaturePerspective({ kind: "game.supply.sign", offerId: peer, version: 1 }, input)).toBeUndefined();
});
