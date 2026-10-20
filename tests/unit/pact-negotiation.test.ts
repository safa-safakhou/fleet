import { Ajv } from "ajv";
import { expect, it } from "vitest";
import type { Data } from "../../src/domain.js";
import { observedActionSchema } from "../../src/games/pact/choices.js";
import { validatePactProposal } from "../../src/games/pact/proposals.js";

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
const outcome = { trade: { youSend: send, youReceive: receive } };
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
  expect(generated("game.supply.offer", propose, f)).toBe(false);
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
