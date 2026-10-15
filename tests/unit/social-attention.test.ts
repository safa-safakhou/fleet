import { expect, it } from "vitest";
import { intentFingerprint, reconcileContinuation } from "../../src/continuation.js";
import { type Data, object } from "../../src/domain.js";
import { compactEnvironment } from "../../src/games/pact/environment.js";
import { referencePreflight } from "../../src/games/pact/references.js";
import { applySocialAttention, deliveredSocialSummary, socialSignals } from "../../src/games/pact/social-attention.js";

const terms = {
  aToB: { resource: "iron", wholePerHour: 1 },
  bToA: null,
  aBond: null,
  bBond: null,
  durationHours: 6,
  noticeHours: 0,
};
const offer = {
  id: "offer",
  type: "SupplyOffer",
  version: 2,
  status: "open",
  kingdomA: "peer",
  kingdomB: "owner",
  counterpartyKingdomId: "peer",
  yourRole: "party_b",
  terms,
  youSend: null,
  youReceive: terms.aToB,
  signedBy: ["peer"],
  expiresGameTimeMs: 3600000,
  reason: "signature_decision",
};
it("reserves whole urgent terms ahead of large familiar-peer pages and reports actual delivery", () => {
  const section = {
    ownerKingdomId: "owner",
    asOfGameTimeMs: 60000,
    records: [offer, { ...offer, id: "second", terms: { ...terms, extra: "x".repeat(12000) } }],
    coverage: { complete: true },
  };
  const environment = {
    profile: { kingdomId: "owner" },
    socialAttention: section,
    contacts: Array.from({ length: 20 }, (_, n) => ({ kingdomId: `peer${n}`, history: "familiar ".repeat(500) })),
    publicDiscovery: { players: [{ kingdomId: "new-peer", handle: "new" }] },
  };
  const fitted = compactEnvironment(environment, 4200);
  expect(object(fitted.socialAttention).records).toEqual([offer]);
  expect(object(fitted.publicDiscovery).players).toHaveLength(1);
  expect(object(fitted.socialAttention).coverage).toMatchObject({
    complete: false,
    delivered: 1,
    omittedFromThisInput: 1,
  });
  expect(deliveredSocialSummary({ environment: fitted }).records).toEqual([
    expect.objectContaining({ id: "offer", version: 2, termsDelivered: true }),
  ]);
  expect(
    deliveredSocialSummary({
      environment: { socialAttention: { records: [{ ...offer, terms: { durationHours: 6 } }] } },
    }).records[0].termsDelivered,
  ).toBe(false);
  expect(() => compactEnvironment(environment, 100)).toThrow("CONTEXT_LIMIT");
});
it("grounds action references without granting authority, and requires real activation/delivery evidence", () => {
  const facts: Data = { world: { profile: { kingdomId: "owner" }, asOfGameTimeMs: 60000 }, guide: {} };
  applySocialAttention(facts, {
    ownerKingdomId: "owner",
    asOfGameTimeMs: 60000,
    records: [offer],
    socialDelegation: { mode: "manual", version: 1 },
  });
  expect(referencePreflight({ kind: "game.supply.sign", offerId: "offer", version: 2 }, facts)).toBeUndefined();
  expect(referencePreflight({ kind: "game.supply.sign", offerId: "offer", version: 1 }, facts)?.code).toBe(
    "OBSERVED_OFFER_VERSION_MISMATCH",
  );
  expect(socialSignals(facts)).toContainEqual({
    kind: "offer_activated",
    referenceId: "offer",
    value: false,
    asOfGameTimeMs: 60000,
  });
  facts.agreementSection = {
    asOfGameTimeMs: 120000,
    records: [
      {
        id: "contract",
        type: "SupplyContract",
        offerId: "offer",
        status: "expired",
        deliveries: [
          { resource: "iron", direction: "received", deliveredMarked: "1200" },
          { resource: "grain", direction: "received", deliveredMarked: null },
          { resource: "silver", direction: "received", deliveredMarked: "9007199254740993" },
        ],
      },
    ],
  };
  expect(socialSignals(facts)).toContainEqual({
    kind: "offer_activated",
    referenceId: "offer",
    value: true,
    asOfGameTimeMs: 120000,
  });
  expect(socialSignals(facts).filter((s) => s.kind === "supply_received_units")).toEqual([
    { kind: "supply_received_units", referenceId: "contract:iron", value: 1200, asOfGameTimeMs: 120000 },
  ]);
  expect(socialSignals(facts).filter((s) => s.kind === "offer_activated")).toEqual([
    { kind: "offer_activated", referenceId: "offer", value: true, asOfGameTimeMs: 120000 },
  ]);
  const state = {
    version: 1,
    goal: { id: "trade", title: "Consider trade" },
    steps: [],
    nextStepId: null,
    wait: {
      reason: "Await actual activation",
      until: { kind: "offer_activated", referenceId: "offer", operator: "equals" as const, value: true },
    },
    ownerIntentFingerprint: intentFingerprint(null),
    outcomes: [],
    proposalKeys: {},
  };
  expect(reconcileContinuation(state, socialSignals(facts), intentFingerprint(null)).wait).toBeNull();
  applySocialAttention(facts, { ownerKingdomId: "foreign", asOfGameTimeMs: 120000, records: [offer] });
  expect(referencePreflight({ kind: "game.supply.sign", offerId: "offer", version: 2 }, facts)?.code).toBe(
    "OBSERVED_REFERENCE_OWNER_MISMATCH",
  );
});
