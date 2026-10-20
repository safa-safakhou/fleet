import { type Data, object } from "../../domain.js";

const rows = (value: unknown): Data[] => (Array.isArray(value) ? value.map(object) : []);
const units = (value: unknown): bigint | undefined =>
  typeof value === "string" && /^\d+$/.test(value) ? BigInt(value) : undefined;

/** Current queued milestones, not a parser for owner prose or a command planner. */
export function queuedConstructionProgress(facts: Data): Data[] {
  const world = object(facts.world),
    guide = object(facts.guide),
    scale = object(guide.resourceRules).markedPerWhole;
  const markedPerWhole = Number.isSafeInteger(scale) && Number(scale) > 0 ? BigInt(Number(scale)) : undefined;
  const observationTimes = [world.asOfGameTimeMs, world.constructionObservedAtGameTimeMs, guide.asOfGameTimeMs].filter(
    (time) => time !== undefined,
  );
  const sameObservation = observationTimes.every((time) => time === observationTimes[0]);
  return rows(world.builders)
    .filter(
      (b) =>
        ["active", "waiting"].includes(String(b.state)) &&
        typeof b.kind === "string" &&
        Number.isSafeInteger(b.targetLevel) &&
        Number(b.targetLevel) > 0,
    )
    .map((b) => {
      const check = rows(world.nextUpgradeChecks).find((c) => c.kind === b.kind && c.targetLevel === b.targetLevel);
      const quote = (sameObservation ? rows(guide.constructionStockChecks) : []).find(
        (q) => q.building === b.kind && q.targetLevel === b.targetLevel,
      );
      const prerequisiteCheck = b.prerequisiteCheck ?? check?.prerequisiteCheck ?? "unknown";
      const missingBuildings = b.missingBuildings ?? check?.missingBuildings ?? null;
      const active = b.state === "active";
      const stockAffordable = !active && typeof quote?.stockAffordable === "boolean" ? quote.stockAffordable : null;
      const stockGaps = active
        ? []
        : !quote || !Object.keys(object(quote.costWhole)).length
          ? null
          : Object.entries(object(quote.costWhole)).map(([resource, costWhole]) => {
              const balance = object(object(world.balances)[resource]),
                ordinary = units(balance.ordinaryUnits),
                allowance = units(balance.foundingAllowanceUnits),
                cost = units(costWhole);
              if (ordinary === undefined || allowance === undefined || cost === undefined || !markedPerWhole)
                return { resource, costWhole, shortfallUnits: null };
              // Locked bonds are separate stock and cannot pay construction.
              const available = ordinary + allowance;
              const shortfall = cost * markedPerWhole > available ? cost * markedPerWhole - available : 0n;
              return {
                resource,
                costWhole,
                availableConstructionUnits: String(available),
                shortfallUnits: String(shortfall),
                shortfallWholeCeil: String((shortfall + markedPerWhole - 1n) / markedPerWhole),
              };
            });
      return {
        building: b.kind,
        targetLevel: b.targetLevel,
        instructionId: b.instructionId,
        slot: b.slot,
        state: b.state,
        prerequisiteCheck,
        missingBuildings,
        phase: active
          ? "active"
          : rows(missingBuildings).length || !["ready", "unknown"].includes(String(prerequisiteCheck))
            ? "building_prerequisites"
            : prerequisiteCheck === "ready" && stockAffordable === false
              ? "stock_shortage"
              : "queue_or_admission_check",
        stockAffordable,
        stockGaps,
      };
    });
}
