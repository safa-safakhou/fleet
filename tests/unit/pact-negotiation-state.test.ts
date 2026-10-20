import { expect, it } from "vitest";
import { type Data, object } from "../../src/domain.js";
import {
  fitNegotiationState,
  negotiationState,
  projectPactObservation,
} from "../../src/games/pact/negotiation-state.js";
import { packPactObservation } from "../../src/games/pact/packing.js";
import type { Observation } from "../../src/platform/contracts.js";

const terms = {
  aToB: { resource: "iron", wholePerHour: 2 },
  bToA: { resource: "silver", wholePerHour: 1 },
  aBond: { resource: "iron", wholeAmount: 3 },
  bBond: null,
  durationHours: 1,
  noticeHours: 0,
};
const offer = {
  id: "one",
  kingdomA: "self",
  kingdomB: "peer",
  version: 2,
  terms,
  signedBy: ["self"],
  expiresGameTimeMs: "2000",
  status: "open",
};
function facts(): Data {
  return {
    world: { profile: { kingdomId: "self" }, asOfGameTimeMs: 1000, stock: { iron: "1234" } },
    guide: { asOfGameTimeMs: 1000, openSupplyOffers: [offer], agreementCoverage: { hasMore: false } },
    sourceRefs: ["read:one"],
  };
}
const offers = (s: Data) => s.offers as Data[];
it("second_offer_cannot_change_first_peer", () => {
  const f = facts();
  object(f.guide).openSupplyOffers = [offer, { ...offer, id: "two", kingdomB: "other", signedBy: ["other"] }];
  const s = negotiationState(f);
  expect(offers(s)[0]).toMatchObject({ peerId: "peer", peerConsent: false, selfConsent: true, version: 2 });
  expect(offers(s)[1]).toMatchObject({ peerId: "other", peerConsent: true });
});
it("missing_signatures_are_unknown", () => {
  const f = facts();
  object(f.guide).openSupplyOffers = [{ ...offer, signedBy: undefined }];
  expect(offers(negotiationState(f))[0]).toMatchObject({ selfConsent: null, peerConsent: null });
});
it("counter_invalidates_both_signatures", () => {
  const f = facts();
  object(f.guide).openSupplyOffers = [{ ...offer, version: 3, signedBy: [] }];
  expect(offers(negotiationState(f))[0]).toMatchObject({ version: 3, selfConsent: false, peerConsent: false });
});
it("first_signature_is_not_income", () => {
  expect(offers(negotiationState(facts()))[0]).toMatchObject({ deliveryEstablished: false });
});
it("closure_requires_installment_evidence", () => {
  const f = facts();
  object(f.guide).activeSupplyContracts = [{ ...offer, id: "contract", status: "expired", endGameTimeMs: "900" }];
  expect((negotiationState(f).contracts as Data[])[0]).toMatchObject({ closure: "unknown", deliveries: null });
});
it.each([true, false])("whole_terms_survive_serialization selfA=%s", (selfA) => {
  const f = facts();
  object(f.guide).openSupplyOffers = [selfA ? offer : { ...offer, kingdomA: "peer", kingdomB: "self" }];
  const s = JSON.parse(JSON.stringify(negotiationState(f)));
  expect(s.offers[0].terms).toEqual(terms);
  expect(s.offers[0].youSend).toEqual(selfA ? terms.aToB : terms.bToA);
  expect(s.units).toMatchObject({ stock: "internal", flow: "whole/hour", bond: "whole" });
});
it("fresh_read_invalidates_old_wait", () => {
  const a = negotiationState(facts());
  const f = facts();
  object(f.world).asOfGameTimeMs = 3000;
  object(f.guide).asOfGameTimeMs = 3000;
  expect(offers(negotiationState(f))[0]).toMatchObject({ live: false });
  expect(negotiationState(f).revision).not.toEqual(a.revision);
});
it("expired_offer_cannot_inherit_new_consent", () => {
  const f = facts();
  object(f.guide).openSupplyOffers = [
    { ...offer, expiresGameTimeMs: "500" },
    { ...offer, id: "two", signedBy: ["self", "peer"] },
  ];
  expect(offers(negotiationState(f))[0]).toMatchObject({ live: false, peerConsent: false });
});
it("narrow pages and oversized records report coverage instead of dangling consent", () => {
  const f = facts();
  object(f.guide).agreementCoverage = { hasMore: true };
  const s = negotiationState(f);
  expect(object(s.coverage).complete).toBe(false);
  const fit = fitNegotiationState(s, 1400);
  expect(Buffer.byteLength(JSON.stringify(fit))).toBeLessThanOrEqual(1400);
  expect(object(fit.coverage).complete).toBe(false);
  for (const o of offers(fit.state)) expect(o.terms).toEqual(terms);
});
it("schema inspection is not a current read and foreign records cannot infer perspective", () => {
  const f = facts();
  f.requestedRead = { schema: {} };
  f.requestedReadTool = "schema";
  object(f.guide).openSupplyOffers = [{ ...offer, kingdomA: "foreign", kingdomB: "other" }];
  expect(offers(negotiationState(f))).toEqual([]);
  expect(object(negotiationState(f).coverage).omitted).toContain("foreign:one");
});

it("trusted v2 projection preserves the original packet and protected record after packing", () => {
  const original: Observation = {
    schemaId: "pact.observation.v1",
    revision: "1000",
    observedAt: "2026-10-20T00:00:00Z",
    environmentTime: { clockId: "pact.game-time-ms", value: "1000" },
    sourceRefs: ["read:one"],
    payload: facts(),
    coverage: { authorizedView: true },
  };
  const before = JSON.stringify(original),
    v1 = packPactObservation(original, 8000);
  const projected = projectPactObservation(original, { id: "negotiation", version: "1" });
  expect(JSON.stringify(original)).toBe(before);
  expect(v1.payload.negotiation).toBeUndefined();
  expect(() => projectPactObservation(original, { id: "negotiation", version: "2" })).toThrow(
    "UNSUPPORTED_OBSERVATION_POLICY",
  );
  const packed = packPactObservation(projected, 8000);
  expect((object(packed.payload.negotiation).offers as Data[])[0]).toMatchObject({
    id: "one",
    peerId: "peer",
    terms,
    peerConsent: false,
  });
  expect(Buffer.byteLength(JSON.stringify(packed))).toBeLessThanOrEqual(8000);
});

it("one delivered installment cannot establish whole-contract closure", () => {
  const f = facts();
  object(f.world).asOfGameTimeMs = 3600000;
  object(f.guide).asOfGameTimeMs = 3600000;
  object(f.guide).activeSupplyContracts = [
    {
      ...offer,
      type: "SupplyContract",
      id: "partial",
      status: "expired",
      startGameTimeMs: "0",
      endGameTimeMs: "3600000",
      deliveries: [
        {
          direction: "sent",
          resource: "iron",
          dueMarked: "100",
          deliveredMarked: "100",
          failedInstallments: 0,
          installments: 1,
        },
        {
          direction: "received",
          resource: "silver",
          dueMarked: "50",
          deliveredMarked: "50",
          failedInstallments: 0,
          installments: 1,
        },
      ],
    },
  ];
  expect((negotiationState(f).contracts as Data[])[0].closure).toBe("unknown");
});

it("oversized duplicated authority is explicitly unavailable while whole offer survives", () => {
  const f = facts();
  object(f.world).authority = {
    resources: {
      iron: { reservations: Array.from({ length: 100 }, (_, i) => ({ id: `reservation${i}`, units: "1000" })) },
    },
  };
  const fitted = fitNegotiationState(negotiationState(f), 3000);
  expect(fitted.state.offers[0]).toMatchObject({ id: "one", terms });
  expect(fitted.state.constraints).toBeNull();
  expect(fitted.coverage.omitted).toContain("constraints_unavailable; read current scoped authority/stock");
});
