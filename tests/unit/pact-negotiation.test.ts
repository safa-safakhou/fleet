import { Ajv } from "ajv";
import { expect, it } from "vitest";
import type { Data } from "../../src/domain.js";
import { observedActionSchema } from "../../src/games/pact/choices.js";
import { negotiationBriefing, negotiationPreflight } from "../../src/games/pact/negotiation.js";
import { validatePactProposal } from "../../src/games/pact/proposals.js";
import { decisionProbe } from "../scoped-probe.js";

const self = "11111111-1111-4111-8111-111111111111",
  peer = "22222222-2222-4222-8222-222222222222",
  other = "33333333-3333-4333-8333-333333333333",
  id = "44444444-4444-4444-8444-444444444444";
const send = { resource: "iron", wholePerHour: 4 },
  receive = { resource: "silver", wholePerHour: 8 };
const terms = { aToB: send, bToA: receive, aBond: null, bBond: null, durationHours: 24, noticeHours: 6 };
const reversed = { ...terms, aToB: receive, bToA: send };
function facts(): Data {
  return {
    world: { profile: { kingdomId: self }, asOfGameTimeMs: 1000 },
    guide: { asOfGameTimeMs: 1000, openSupplyOffers: [], activeSupplyContracts: [] },
    discovery: { players: [{ kingdomId: peer }, { kingdomId: other }] },
  };
}
const offer = {
  id,
  kingdomA: peer,
  kingdomB: self,
  counterpartyKingdomId: peer,
  terms: reversed,
  version: 2,
  status: "open",
  signedBy: [],
  expiresGameTimeMs: "2000",
};
const propose = { kind: "game.supply.offer", counterpartyKingdomId: peer, terms };
const sign = { kind: "game.supply.sign", offerId: id, version: 2 };
const active = {
  id,
  counterpartyKingdomId: peer,
  terms: reversed,
  youSend: send,
  youReceive: receive,
  endGameTimeMs: "2000",
};
it("delivers exact first-consent arguments and actual self-relative flows instead of describing an open offer as secured supply", () => {
  const f = facts();
  (f.guide as Data).openSupplyOffers = [offer];
  expect(negotiationBriefing(f)?.observedLive).toEqual([
    expect.objectContaining({
      id,
      version: 2,
      state: "open",
      youSend: send,
      youReceive: receive,
      consentAction: { kind: "game.supply.sign", offerId: id, version: 2 },
      resourceDelivery: "not_established_by_offer",
    }),
  ]);
  expect(negotiationPreflight(propose, f)?.detail).toEqual(
    expect.objectContaining({
      existingId: id,
      version: 2,
      state: "open",
      consentAction: { kind: "game.supply.sign", offerId: id, version: 2 },
    }),
  );
  (f.guide as Data).openSupplyOffers = [{ ...offer, signedBy: [self] }];
  expect(((negotiationBriefing(f)?.observedLive ?? []) as Data[])[0].consentAction).toBeNull();
  (f.guide as Data).openSupplyOffers = [];
  (f.guide as Data).activeSupplyContracts = [active];
  expect(((negotiationBriefing(f)?.observedLive ?? []) as Data[])[0]).toEqual(
    expect.objectContaining({
      state: "active",
      consentAction: null,
      resourceDelivery: "requires_settlement_evidence",
    }),
  );
});
const outcome = { trade: { youSend: send, youReceive: receive } };
it.each([
  [true, false],
  [false, false],
  [true, true],
  [false, true],
])(
  "keeps the exact counterparty and peer consent in the protected negotiation brief, selfA=%s peerSigned=%s",
  (selfA, peerSigned) => {
    const f = facts();
    (f.guide as Data).openSupplyOffers = [
      {
        ...offer,
        kingdomA: selfA ? self : peer,
        kingdomB: selfA ? peer : self,
        signedBy: peerSigned ? [peer] : [],
      },
    ];
    expect(((negotiationBriefing(f)?.observedLive ?? []) as Data[])[0]).toMatchObject({
      id,
      counterpartyKingdomId: peer,
      peerSignedSameVersion: peerSigned,
      alreadySignedByYou: false,
      consentAction: sign,
    });
  },
);
it("leaves peer consent unknown when the supplied records omit signatures", () => {
  const f = facts();
  (f.guide as Data).activeSupplyContracts = [active];
  expect(((negotiationBriefing(f)?.observedLive ?? []) as Data[])[0]).toMatchObject({
    counterpartyKingdomId: peer,
    peerSignedSameVersion: null,
  });
});
it("withholds consent suggestions when the current self or a valid offer version is unknown", () => {
  for (const change of ["self", "version"] as const) {
    const f = facts();
    (f.guide as Data).openSupplyOffers = [{ ...offer, version: change === "version" ? 0 : 2 }];
    if (change === "self") (f.world as Data).profile = {};
    expect(((negotiationBriefing(f)?.observedLive ?? []) as Data[])[0].consentAction).toBeNull();
  }
});
const valid = (a: Data, f: Data) =>
  validatePactProposal(
    a,
    f,
    ["game.supply.offer", "game.supply.counter", "game.supply.sign"].includes(String(a.kind))
      ? a.kind === "game.supply.offer"
        ? { trade: { youSend: (a.terms as Data).aToB, youReceive: (a.terms as Data).bToA } }
        : outcome
      : undefined,
  );
const generated = (kind: string, action: Data, f: Data) => {
  const s = observedActionSchema(kind, f);
  return s ? new Ajv({ strict: false }).compile(s)(action) : false;
};
it("blocks economically identical pending offers with reversed A/B, while retaining changed terms and partners", () => {
  const f = facts();
  (f.guide as Data).openSupplyOffers = [offer];
  expect(valid(propose, f).code).toBe("PACT_DUPLICATE_NEGOTIATION");
  // A valid wire shape reaches the factual proposal guard, with precise feedback.
  expect(generated("game.supply.offer", propose, f)).toBe(true);
  expect(valid({ ...propose, counterpartyKingdomId: other }, f).valid).toBe(true);
  expect(generated("game.supply.offer", { ...propose, counterpartyKingdomId: other }, f)).toBe(true);
  expect(valid({ ...propose, terms: { ...terms, durationHours: 6 } }, f).valid).toBe(true);
});
it("blocks duplicate active commitments and signing a second equivalent offer", () => {
  const f = facts();
  (f.guide as Data).activeSupplyContracts = [active];
  (f.guide as Data).openSupplyOffers = [offer];
  expect(valid(propose, f).code).toBe("PACT_DUPLICATE_NEGOTIATION");
  expect(valid(sign, f).code).toBe("PACT_DUPLICATE_NEGOTIATION");
  expect(generated("game.supply.sign", sign, f)).toBe(false);
  const changed = { ...propose, terms: { ...terms, aToB: { ...send, wholePerHour: 5 } } };
  expect(valid(changed, f).valid).toBe(true);
});
it("excludes an already signed current version without hiding first consent or a new counteroffer version", () => {
  const f = facts();
  (f.guide as Data).openSupplyOffers = [{ ...offer, signedBy: [self] }];
  expect(valid(sign, f).code).toBe("PACT_ALREADY_SIGNED");
  expect(generated("game.supply.sign", sign, f)).toBe(false);
  (f.guide as Data).openSupplyOffers = [{ ...offer, version: 3, signedBy: [peer] }];
  expect(valid({ ...sign, version: 3 }, f).valid).toBe(true);
  expect(generated("game.supply.sign", { ...sign, version: 3 }, f)).toBe(true);
});
it("does not infer live duplicates from expired records or a stale view, and compares bonds from self perspective", () => {
  const f = facts();
  (f.guide as Data).openSupplyOffers = [{ ...offer, expired: true }];
  (f.guide as Data).activeSupplyContracts = [{ ...active, endGameTimeMs: "999" }];
  expect(valid(propose, f).valid).toBe(true);
  (f.guide as Data).openSupplyOffers = [offer];
  (f.guide as Data).asOfGameTimeMs = 999;
  expect(valid(propose, f).valid).toBe(true);
  (f.guide as Data).asOfGameTimeMs = 1000;
  const bonded = { ...propose, terms: { ...terms, aBond: { resource: "iron", wholeAmount: 1 } } };
  // A materially changed bond is not the observed unbonded agreement. Missing canonical bond rules still fail separately.
  expect(valid(bonded, f).code).not.toBe("PACT_DUPLICATE_NEGOTIATION");
});
it("delivers a factual duplicate correction to the engine instead of consuming a generic schema retry", async () => {
  const { ReactiveEngine } = await import("../../src/engines/reactive/engine.js");
  const { reactiveProbe } = await import("../reactive-probe-context.js");
  const { pactActionContracts } = await import("../../src/games/pact/proposals.js");
  const f = facts();
  (f.guide as Data).openSupplyOffers = [offer];
  let calls = 0;
  const submitted: Data[] = [];
  const ctx = reactiveProbe(async (_claim, input) => {
    calls++;
    const payload = calls === 1 ? propose : { ...propose, counterpartyKingdomId: other };
    const decision = {
      kind: "action",
      schemaId: "pact.action.v1",
      payload,
      expectedOutcome: outcome,
      summary: "Propose a distinct economic agreement",
    };
    expect(new Ajv({ strict: false, validateFormats: false }).compile(input.schema)(decision)).toBe(true);
    if (calls === 2)
      expect(JSON.parse(input.messages[1].content).previousProposal.code).toBe("PACT_DUPLICATE_NEGOTIATION");
    return { decision, inputTokens: 1, outputTokens: 1 };
  });
  ctx.observation.payload = f;
  ctx.schemas = { observations: ["pact.observation.v1"], actions: ["pact.action.v1"] };
  ctx.actionContracts = async () => pactActionContracts(f);
  ctx.validateProposal = async (p) => validatePactProposal(p.intent.payload, f, p.expectedOutcome);
  ctx.commands = {
    submit: async (_c: unknown, intent: Data) => {
      submitted.push(intent);
      return { status: "confirmed", code: "COMMITTED" };
    },
  } as never;
  await new ReactiveEngine().run(decisionProbe(ctx));
  expect(calls).toBe(2);
  expect(submitted).toHaveLength(1);
});
