import { utf8Prefix } from "../../cognition.js";
import { type Data, object } from "../../domain.js";
export function cognitiveObservation(facts: Data) {
  const world = object(facts.world),
    guide = object(facts.guide);
  const list = (value: unknown) => (Array.isArray(value) ? value.map(object) : []);
  const observedList = (value: unknown, format: (entry: Data) => string) =>
    Array.isArray(value) ? list(value).map(format).join(", ") || "none" : "unknown";
  const peers = [...list(guide.contacts), ...list(guide.contactRequests), ...list(object(facts.discovery).players)]
    .flatMap((p) => [p.kingdomId, p.senderKingdomId, p.recipientKingdomId])
    .filter((id): id is string => typeof id === "string" && id !== object(world.profile).kingdomId);
  return {
    peers: [...new Set(peers)],
    detail: {
      summary: utf8Prefix(
        [
          `Observed buildings: ${observedList(world.buildings, (b) => `${String(b.kind)} level ${String(b.level)}`)}.`,
          `Builder slots: ${observedList(world.builders, (b) => `${String(b.slot)} ${String(b.state)} ${String(b.kind ?? "")} target ${String(b.targetLevel ?? "unknown")}`)}.`,
          `Ordinary resource units: ${
            Object.entries(object(world.balances))
              .map(([resource, value]) => `${resource} ${String(object(value).ordinaryUnits)}`)
              .join(", ") || "unknown"
          }.`,
          `Observed contacts: ${Array.isArray(guide.contacts) ? guide.contacts.length : "unknown"}; contracts: ${Array.isArray(world.contracts) ? world.contracts.length : "unknown"}.`,
        ].join(" "),
        900,
      ),
      asOfGameTimeMs: world.asOfGameTimeMs,
      peerFacts: [
        ...list(guide.contacts).map((c) => ({ peerId: c.kingdomId, kind: "contact" })),
        ...list(world.contracts).map((c) => ({
          peerId: c.counterpartyKingdomId,
          kind: "agreement",
          agreementId: c.id,
        })),
      ].filter((f) => typeof f.peerId === "string"),
      buildings: world.buildings,
      builders: world.builders,
      balances: Object.fromEntries(
        Object.entries(object(world.balances)).map(([r, v]) => [
          r,
          { ordinaryUnits: object(v).ordinaryUnits, lockedUnits: object(v).lockedUnits },
        ]),
      ),
      contracts: Array.isArray(world.contracts)
        ? list(world.contracts).map((c) => ({
            id: c.id,
            counterpartyKingdomId: c.counterpartyKingdomId,
            endsGameTimeMs: c.endsGameTimeMs,
          }))
        : undefined,
      contacts: Array.isArray(guide.contacts)
        ? list(guide.contacts).map((c) => ({ kingdomId: c.kingdomId }))
        : undefined,
      coverage:
        "Authenticated owned observation at the recorded game time. Peer motives, future delivery and omitted military details are unknown. Re-read current state before a commitment.",
    },
  };
}
