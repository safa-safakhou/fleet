import type { DecisionObservation } from "../../decision.js";
import { type Data, FleetError, object } from "../../domain.js";

export function decisionObservation(facts: Data): DecisionObservation {
  const world = object(facts.world),
    guide = object(facts.guide);
  // Missing authoritative measurements must never become false zero feedback.
  if (!Array.isArray(world.buildings) || !Array.isArray(world.contracts) || !Array.isArray(guide.contacts))
    throw new FleetError("DECISION_OBSERVATION_INCOMPLETE");
  const buildings = world.buildings.map(object);
  if (buildings.some((b) => !Number.isSafeInteger(b.level) || Number(b.level) < 0))
    throw new FleetError("DECISION_OBSERVATION_INCOMPLETE");
  const levelSum = buildings.reduce((n, b) => n + Number(b.level), 0);
  const list = (v: unknown) => (Array.isArray(v) ? v.map(object) : []);
  const clip = (n: number) => Math.min(100, Math.max(0, n));
  const features: Record<string, number> = {
    building_levels: clip(levelSum / 10),
    contacts: clip(guide.contacts.length / 5),
    contracts: clip(world.contracts.length / 5),
    hungry: object(world.upkeep).hungry === true ? 1 : 0,
    threats: clip(list(world.threats).length),
    busy_builders: clip(
      list(world.builders).filter((b) => b.instructionId !== null && b.instructionId !== undefined).length,
    ),
    pending_contacts: clip(list(guide.contactRequests).length),
    offers: clip(list(guide.openSupplyOffers).length),
  };
  for (const [resource, raw] of Object.entries(object(world.balances))) {
    if (!["wood", "stone", "iron", "food", "gold"].includes(resource)) continue;
    const balance = object(raw);
    // Features may be approximate; authoritative resource arithmetic stays on
    // the game server. Use a bounded utilization fraction, never floating stock.
    const ordinary = balance.ordinaryUnits,
      capacity = balance.capacityUnits;
    if (
      typeof ordinary === "string" &&
      /^\d+$/.test(ordinary) &&
      typeof capacity === "string" &&
      /^\d+$/.test(capacity) &&
      BigInt(capacity) > 0n
    )
      features[`stock_${resource}`] = clip(Number((BigInt(ordinary) * 100n) / BigInt(capacity))) / 100;
  }
  return {
    features,
    metrics: { buildings: levelSum, contacts: guide.contacts.length, contracts: world.contracts.length },
    choices: ["development", "trade", "relationships", "resilience", "observe"],
  };
}
