import { type Data, object } from "../../domain.js";
export function cognitiveObservation(facts: Data) {
  const world = object(facts.world),
    guide = object(facts.guide);
  const list = (value: unknown) => (Array.isArray(value) ? value.map(object) : []);
  const peers = [...list(guide.contacts), ...list(guide.contactRequests), ...list(object(facts.discovery).players)]
    .flatMap((p) => [p.kingdomId, p.senderKingdomId, p.recipientKingdomId])
    .filter((id): id is string => typeof id === "string" && id !== object(world.profile).kingdomId);
  return {
    peers: [...new Set(peers)],
    detail: {
      asOfGameTimeMs: world.asOfGameTimeMs,
      buildings: world.buildings,
      builders: world.builders,
      balances: Object.fromEntries(
        Object.entries(object(world.balances)).map(([r, v]) => [
          r,
          { ordinaryUnits: object(v).ordinaryUnits, lockedUnits: object(v).lockedUnits },
        ]),
      ),
      contracts: list(world.contracts).map((c) => ({
        id: c.id,
        counterpartyKingdomId: c.counterpartyKingdomId,
        endsGameTimeMs: c.endsGameTimeMs,
      })),
      contacts: list(guide.contacts).map((c) => ({ kingdomId: c.kingdomId })),
      coverage:
        "Authenticated owned observation at the recorded game time. Peer motives, future delivery and omitted military details are unknown. Re-read current state before a commitment.",
    },
  };
}
