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
    detail: { existingId: same.id, state: same.negotiationState },
    guidance:
      "Equivalent live terms with this peer already exist from your perspective (A/B ordering does not change them). Do not open, counter or sign another copy. Review the existing consent/status, wait for its peer, or choose a materially different useful proposal/partner. An active contract is a commitment, not uncommitted spare production.",
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
  if (kind === "game.supply.offer") {
    const seen = new Set<string>(),
      exclusions: Data[] = [];
    for (const r of records(facts)) {
      const key = perspective(r, facts);
      if (!key || seen.has(JSON.stringify(key))) continue;
      seen.add(JSON.stringify(key));
      const [peer, send, receive, bond, peerBond, duration, notice] = key;
      const flow = (v: unknown, amount: string) =>
        v === null ? null : { resource: (v as unknown[])[0], [amount]: (v as unknown[])[1] };
      const values = {
        aToB: flow(send, "wholePerHour"),
        bToA: flow(receive, "wholePerHour"),
        aBond: flow(bond, "wholeAmount"),
        bBond: flow(peerBond, "wholeAmount"),
        durationHours: duration,
        noticeHours: notice,
      };
      exclusions.push({
        not: {
          properties: {
            counterpartyKingdomId: { const: peer },
            terms: {
              properties: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, { const: v }])),
              required: Object.keys(values),
            },
          },
          required: ["counterpartyKingdomId", "terms"],
        },
      });
    }
    if (exclusions.length) shape.allOf = [...(Array.isArray(shape.allOf) ? shape.allOf : []), ...exclusions];
  }
  return shape;
}
export function negotiationBriefing(facts: Data): Data {
  const self = object(object(facts.world).profile).kingdomId;
  return {
    observedLive: records(facts).map((r) => ({
      id: r.id,
      version: r.version,
      state: r.negotiationState,
      alreadySignedByYou: Array.isArray(r.signedBy) ? r.signedBy.includes(self) : null,
    })),
    guidance:
      "Review current offers and active commitments before proposing. Same self-relative terms/peer are a duplicate even with swapped A/B; repeated own consent earns nothing. Use changed terms only for a distinct economic reason. Missing or stale records stay unknown; read before guessing.",
  };
}
