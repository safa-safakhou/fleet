import { type Data, object } from "../../domain.js";

const rows = (v: unknown): Data[] => (Array.isArray(v) ? v.map(object) : []);
const atom = (v: unknown, amount: string) => (v === null ? null : [object(v).resource, object(v)[amount]]);
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function now(facts: Data): number | undefined {
  const world = object(facts.world),
    guide = object(facts.guide),
    time = Number(world.asOfGameTimeMs);
  if (!Number.isSafeInteger(time) || time < 0 || world.asOfGameTimeMs === undefined) return;
  if (guide.asOfGameTimeMs !== undefined && String(guide.asOfGameTimeMs) !== String(world.asOfGameTimeMs)) return;
  return time;
}
function live(record: Data, facts: Data, active: boolean) {
  const time = now(facts),
    end = record[active ? "endGameTimeMs" : "expiresGameTimeMs"];
  return (
    time !== undefined &&
    record.expired !== true &&
    (record.status === undefined || record.status === (active ? "active" : "open")) &&
    typeof end !== "undefined" &&
    Number.isSafeInteger(Number(end)) &&
    Number(end) > time
  );
}
function termsKey(peer: unknown, raw: unknown, partyA: boolean) {
  const t = object(raw);
  if (typeof peer !== "string" || !Object.keys(t).length) return;
  return [
    peer,
    atom(partyA ? t.aToB : t.bToA, "wholePerHour"),
    atom(partyA ? t.bToA : t.aToB, "wholePerHour"),
    atom(partyA ? t.aBond : t.bBond, "wholeAmount"),
    atom(partyA ? t.bBond : t.aBond, "wholeAmount"),
    t.durationHours,
    t.noticeHours,
  ];
}
function perspective(record: Data, facts: Data) {
  const self = object(object(facts.world).profile).kingdomId,
    t = object(record.terms);
  if (typeof self !== "string") return;
  if (record.kingdomA === self) return termsKey(record.kingdomB, t, true);
  if (record.kingdomB === self) return termsKey(record.kingdomA, t, false);
  // Active owned projections expose self-relative flows, but do not expose A/B.
  if (!("youSend" in record) || !("youReceive" in record)) return;
  const matches = [true, false].filter(
    (a) =>
      equal(atom(record.youSend, "wholePerHour"), atom(a ? t.aToB : t.bToA, "wholePerHour")) &&
      equal(atom(record.youReceive, "wholePerHour"), atom(a ? t.bToA : t.aToB, "wholePerHour")),
  );
  const keys = matches.map((a) => termsKey(record.counterpartyKingdomId, t, a));
  if (keys.length === 1 || (keys.length === 2 && equal(keys[0], keys[1]))) return keys[0];
}
function records(facts: Data): Data[] {
  const guide = object(facts.guide);
  return [
    ...rows(guide.openSupplyOffers)
      .filter((r) => live(r, facts, false))
      .map((r) => ({ ...r, negotiationState: "open" })),
    ...rows(guide.activeSupplyContracts)
      .filter((r) => live(r, facts, true))
      .map((r) => ({ ...r, negotiationState: "active" })),
  ];
}
function consentAction(record: Data, facts: Data): Data | null {
  const self = object(object(facts.world).profile).kingdomId;
  if (
    typeof self !== "string" ||
    record.negotiationState !== "open" ||
    typeof record.id !== "string" ||
    !Number.isSafeInteger(record.version) ||
    Number(record.version) < 1 ||
    !Array.isArray(record.signedBy) ||
    record.signedBy.includes(self)
  )
    return null;
  const key = perspective(record, facts);
  if (key && records(facts).some((r) => r.negotiationState === "active" && equal(key, perspective(r, facts))))
    return null;
  return { kind: "game.supply.sign", offerId: record.id, version: record.version };
}
/** Known observed duplication only. Missing/stale pages never establish absence or authority. */
export function negotiationPreflight(action: Data, facts: Data): Data | undefined {
  if (!["game.supply.offer", "game.supply.counter", "game.supply.sign"].includes(String(action.kind))) return;
  const self = object(object(facts.world).profile).kingdomId;
  const offers = rows(object(facts.guide).openSupplyOffers),
    offer = offers.find((o) => o.id === action.offerId);
  if (
    action.kind === "game.supply.sign" &&
    offer &&
    live(offer, facts, false) &&
    action.version === offer.version &&
    Array.isArray(offer.signedBy) &&
    offer.signedBy.includes(self)
  )
    return {
      code: "PACT_ALREADY_SIGNED",
      guidance:
        "You already signed this observed offer/version. Signing again adds no consent or resources. Await the peer, read current status, or choose different useful work; never cancel or replay uncertain actions.",
    };
  let key: unknown;
  if (action.kind === "game.supply.offer") key = termsKey(action.counterpartyKingdomId, action.terms, true);
  else if (offer)
    key = perspective({ ...offer, ...(action.kind === "game.supply.counter" ? { terms: action.terms } : {}) }, facts);
  if (!key) return;
  const same = records(facts).find(
    (r) =>
      (action.kind !== "game.supply.sign" || r.negotiationState !== "open" || r.id !== action.offerId) &&
      equal(key, perspective(r, facts)),
  );
  if (!same) return;
  return {
    code: "PACT_DUPLICATE_NEGOTIATION",
    detail: {
      existingId: same.id,
      version: same.version,
      state: same.negotiationState,
      consentAction: consentAction(same, facts),
    },
    guidance:
      "Duplicate; no command submitted. Review detail.existingId/version/state and consentAction; sign existing terms only if useful/permitted. Do not create a copy.",
  };
}
/** Generation excludes known repeats; preflight remains the independent final local check. */
export function constrainNegotiationSchema(shape: Data, kind: string, facts: Data): Data | undefined {
  if (kind === "game.supply.sign") {
    const p = object(shape.properties),
      field = object(p.offerId);
    if (Array.isArray(field.enum)) {
      const ids = field.enum.filter((id) => {
        const offer = rows(object(facts.guide).openSupplyOffers).find((o) => o.id === id);
        return offer && !negotiationPreflight({ kind, offerId: id, version: offer.version }, facts);
      });
      if (!ids.length) return;
      p.offerId = { ...field, enum: ids };
    }
  }
  // Economic equivalence is semantic validation, not malformed JSON. Keep a
  // well-shaped offer available so the engine can deliver precise factual
  // rejection guidance instead of the broker's generic schema-output retry.

  return shape;
}
export function negotiationBriefing(facts: Data): Data | undefined {
  if (!records(facts).length) return;
  const self = object(object(facts.world).profile).kingdomId;
  return {
    observedLive: records(facts).map((r) => ({
      id: r.id,
      version: r.version,
      state: r.negotiationState,
      alreadySignedByYou: Array.isArray(r.signedBy) ? r.signedBy.includes(self) : null,
      youSend: r.kingdomA === self ? object(r.terms).aToB : r.kingdomB === self ? object(r.terms).bToA : r.youSend,
      youReceive:
        r.kingdomA === self ? object(r.terms).bToA : r.kingdomB === self ? object(r.terms).aToB : r.youReceive,
      consentAction: consentAction(r, facts),
      resourceDelivery: r.negotiationState === "open" ? "not_established_by_offer" : "requires_settlement_evidence",
    })),
    guidance:
      "Offer creates terms, sign consents to an existing ID/version, counter changes its terms. consentAction is a possible shape, not permission or advice to accept: evaluate both flows/risks first. Open offer != secured supply. Both consent before activation; actual settlements establish delivery. Same terms/peer is a duplicate even with swapped A/B. Missing/stale records unknown.",
  };
}
