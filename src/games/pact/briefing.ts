import { type Data, object } from "../../domain.js";

const rows = (value: unknown): Data[] => (Array.isArray(value) ? value.map(object) : []);
/** Clarify the controller handoff using only current owner-authorized observations. */
export function pactAgentBriefing(facts: Data): Data {
  const world = object(facts.world),
    guide = object(facts.guide),
    authority = object(world.authority);
  const objective = typeof world.ambition === "string" ? world.ambition.trim() : "";
  const builders = rows(world.builders);
  const occupied = new Set(builders.filter((b) => b.state === "active" || b.state === "waiting").map((b) => b.kind));
  const slots = [...new Set(builders.map((b) => b.slot))].filter(
    (slot): slot is number => Number.isSafeInteger(slot) && Number(slot) > 0,
  );
  const availableQueueSlots = slots
    .filter((slot) => {
      const positions = builders.filter((b) => b.slot === slot);
      return (
        positions.every((b) => b.state === null || b.state === "active") &&
        !positions.some((b) => b.state === "waiting")
      );
    })
    .sort((a, b) => a - b);
  const stock = rows(guide.constructionStockChecks);
  const allowed = Array.isArray(authority.allowedActions)
    ? authority.allowedActions
    : object(guide.mandate).allowedActions;
  return {
    ownerIntent: { status: objective ? "provided" : "absent", objective: objective || null },
    execution: {
      objectiveIsStandingGuidance: Boolean(objective),
      lease: "managed_by_host",
      guidance:
        "A provided owner objective is already standing guidance. Choose its lawful steps yourself; the owner need not name each delegated action. Fleet opens the write lease, assigns command IDs and reconciles receipts. Emit a bare supported game action; do not represent run.open as a game action. Shapes and stock checks are not permission grants; the server rechecks current mandate, stock and prerequisites.",
      allowedActions: Array.isArray(allowed) ? allowed : [],
      humanOnly: "Explicit human-only actions still require their existing owner approval.",
    },
    construction: {
      availableQueueSlots,
      options: rows(world.nextUpgradeChecks).map((check) => {
        const quote = stock.find((q) => q.building === check.kind && q.targetLevel === check.targetLevel);
        return {
          building: check.kind,
          targetLevel: check.targetLevel,
          prerequisiteCheck: check.prerequisiteCheck ?? "unknown",
          missingBuildings: check.missingBuildings,
          stockAffordable: typeof quote?.stockAffordable === "boolean" ? quote.stockAffordable : null,
          costWhole: quote?.costWhole,
          busy: occupied.has(check.kind) ? true : typeof quote?.busy === "boolean" ? quote.busy : null,
        };
      }),
      coverage:
        "Observed candidates, no prescribed strategy or promised admission. A blocked Hall cannot satisfy its own missing prerequisites. With queue space, consider a ready affordable prerequisite or other useful permitted work. Waiting remains valid for a concrete current dependency, stock, risk or owner constraint; do not infer global inability from one blocked target. Unknown facts need a scoped read.",
    },
  };
}
