import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { pactAdapter } from "../../src/games/pact/adapter.js";
import { referencePreflight, referenceReadPreflight } from "../../src/games/pact/references.js";
import { RemoteRejection } from "../../src/http.js";

const owner = randomUUID(),
  peer = randomUUID(),
  requestId = randomUUID(),
  offerId = randomUUID();
const request = {
  id: requestId,
  direction: "incoming",
  status: "pending",
  kingdomId: peer,
  expiresGameTimeMs: "60000",
  reference: { type: "ContactRequest", ownerKingdomId: owner, delegationVersion: 2 },
};
const facts = {
  world: { profile: { kingdomId: owner }, asOfGameTimeMs: 1000 },
  guide: {
    contactRequests: [request],
    socialDelegation: { mode: "all", version: 2 },
    openSupplyOffers: [
      { id: offerId, version: 3, status: "open", expiresGameTimeMs: "60000", reference: { type: "SupplyOffer" } },
    ],
  },
};
it("refuses outgoing, absent, expired, wrong-role and stale request references but preserves a valid incoming answer", () => {
  const action = { kind: "game.contact.answer", requestId, accept: true };
  expect(referencePreflight(action, facts)).toBeUndefined();
  expect(referencePreflight({ ...action, requestId: peer }, facts)?.code).toBe("OBSERVED_REQUEST_NOT_FOUND");
  for (const [change, code] of [
    [{ direction: "outgoing" }, "OBSERVED_REQUEST_NOT_ANSWERABLE"],
    [{ status: "accepted" }, "OBSERVED_REQUEST_NOT_ANSWERABLE"],
    [{ expiresGameTimeMs: "999" }, "OBSERVED_REQUEST_EXPIRED"],
    [{ reference: { type: "Unit" } }, "OBSERVED_REFERENCE_TYPE_MISMATCH"],
    [{ reference: { type: "ContactRequest", delegationVersion: 1 } }, "OBSERVED_REFERENCE_STALE"],
  ] as const)
    expect(
      referencePreflight(action, { ...facts, guide: { ...facts.guide, contactRequests: [{ ...request, ...change }] } })
        ?.code,
    ).toBe(code);
});
it("checks current offer versions and roles independently of UUID syntax", () => {
  expect(referencePreflight({ kind: "game.supply.sign", offerId, version: 3 }, facts)).toBeUndefined();
  for (const key of ["version", "expectedVersion"])
    expect(referencePreflight({ kind: "game.supply.sign", offerId, [key]: 2 }, facts)?.code).toBe(
      "OBSERVED_OFFER_VERSION_MISMATCH",
    );
  expect(referencePreflight({ kind: "game.supply.sign", offerId: requestId, version: 3 }, facts)?.code).toBe(
    "OBSERVED_OFFER_NOT_FOUND",
  );
});
it("uses fresh certified ordinary Spearmen and refuses guard, locked, unavailable, duplicate and stale units", () => {
  const ids = [randomUUID(), randomUUID()],
    base = {
      type: "Unit",
      ownerKingdomId: owner,
      hostKingdomId: owner,
      placement: "home",
      unitType: "spearman",
      homeGuard: false,
      battleLocked: false,
      scoutEligible: true,
      asOfGameTimeMs: 1000,
    };
  const units = ids.map((id) => ({ ...base, id }));
  const current = {
    ...facts,
    world: {
      ...facts.world,
      unitReferences: { schemaVersion: "pact.references.v1", units, hasMore: false, scoutTroopsRequired: 2 },
    },
  };
  const action = { kind: "game.scout.start", targetKingdomId: peer, unitIds: ids };
  expect(referencePreflight(action, current)).toBeUndefined();
  for (const change of [
    { homeGuard: true },
    { battleLocked: true },
    { placement: "scouting" },
    { asOfGameTimeMs: 0 },
    { unitType: "archer" },
    { ownerKingdomId: peer },
  ])
    expect(
      referencePreflight(action, {
        ...current,
        world: {
          ...current.world,
          unitReferences: { ...current.world.unitReferences, units: [{ ...units[0], ...change }, units[1]] },
        },
      })?.code,
    ).toBe("OBSERVED_UNIT_NOT_ELIGIBLE");
  expect(referencePreflight({ ...action, unitIds: [ids[0], ids[0]] }, current)?.code).toBe(
    "OBSERVED_UNIT_NOT_ELIGIBLE",
  );
});
it("separates ordinary placeholder/absent receipt lookups from actual transport uncertainty", () => {
  expect(
    referenceReadPreflight("pact_receipt_read_v1", { commandId: "00000000-0000-0000-0000-000000000000" })?.code,
  ).toBe("RECEIPT_NOT_FOUND");
  expect(
    pactAdapter.readRejection?.(new RemoteRejection("RECEIPT_NOT_FOUND", 200), "pact_receipt_read_v1", {
      commandId: requestId,
    })?.submitted,
  ).toBe(false);
  expect(
    pactAdapter.readRejection?.(new RemoteRejection("RECEIPT_NOT_FOUND", 502), "pact_receipt_read_v1", {}),
  ).toBeUndefined();
});
