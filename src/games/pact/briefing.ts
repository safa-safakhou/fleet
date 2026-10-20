import { type Data, object } from "../../domain.js";
import { observedHall, observedPeerIds } from "./choices.js";
import { queuedConstructionProgress } from "./construction-progress.js";
import { tradeBriefing } from "./trade.js";

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
  const queuedProgress = queuedConstructionProgress(facts);
  const trade = tradeBriefing(facts);
  const allowed = Array.isArray(authority.allowedActions)
    ? authority.allowedActions
    : object(guide.mandate).allowedActions;
  const options = rows(world.nextUpgradeChecks).map((check) => {
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
  });
  const prerequisiteWork = options
    .filter((o) => rows(o.missingBuildings).length)
    .map((target) => {
      const readySteps: Data[] = [],
        activeSteps: Data[] = [],
        unresolvedSteps: Data[] = [];
      for (const missing of rows(target.missingBuildings)) {
        const step = { building: missing.kind, targetLevel: missing.level };
        if (typeof missing.kind !== "string" || !Number.isSafeInteger(missing.level) || Number(missing.level) < 1)
          continue;
        const active = builders.some(
          (b) =>
            b.kind === missing.kind &&
            b.state === "active" &&
            Number.isSafeInteger(b.targetLevel) &&
            Number(b.targetLevel) >= Number(missing.level),
        );
        const next = options.find((o) => o.building === missing.kind && o.targetLevel === missing.level);
        if (active) activeSteps.push(step);
        else if (
          next?.prerequisiteCheck === "ready" &&
          next.stockAffordable === true &&
          next.busy === false &&
          availableQueueSlots.length &&
          Array.isArray(allowed) &&
          allowed.includes("building.queue")
        )
          readySteps.push(step);
        else unresolvedSteps.push(step);
      }
      return {
        target: {
          building: target.building,
          targetLevel: target.targetLevel,
          alreadyQueued: occupied.has(target.building),
        },
        readySteps,
        activeSteps,
        unresolvedSteps,
      };
    });
  return {
    ...(trade ? { trade } : {}),
    ownerIntent: { status: objective ? "provided" : "absent", objective: objective || null },
    execution: {
      objectiveIsStandingGuidance: Boolean(objective),
      lease: "managed_by_host",
      guidance:
        "A provided owner objective is already standing guidance. Choose its lawful steps yourself; the owner need not name each delegated action. Fleet opens the write lease, assigns command IDs and reconciles receipts. Emit a bare supported game action; do not represent run.open as a game action. Shapes and stock checks are not permission grants; the server rechecks current mandate, stock and prerequisites.",
      allowedActions: Array.isArray(allowed) ? allowed : [],
      humanOnly: "Explicit human-only actions still require their existing owner approval.",
    },
    ...(facts.discovery || Array.isArray(guide.contacts)
      ? {
          interactions: {
            selfKingdomId: object(world.profile).kingdomId,
            observedPeerIds: observedPeerIds(facts),
            observedContactIds: rows(guide.contacts).map((p) => p.kingdomId),
            guidance:
              "Self is never a peer. Introduce with contact.request; message.send needs accepted contact. Resource trade=supply.offer(counterpartyKingdomId, exact terms); garrison.offer lends troops. Unsigned reserves nothing; both sign returned ID/version to activate. Missing pages unknown: use scoped reads.",
          },
        }
      : {}),
    ...(object(facts.development).hallUnlocks
      ? {
          training: {
            currentHall: observedHall(facts),
            hallUnlocks: object(facts.development).hallUnlocks,
            guidance:
              "Check Hall unlock, queue, ordinary stock, capacity and mandate. Founding construction allowance cannot pay training.",
          },
        }
      : {}),
    construction: {
      ...(queuedProgress.length
        ? {
            completedBuildings: world.buildings,
            queuedProgress,
            goalReconciliation:
              "When expectedOutcome requests actionKind and basis, match the actual payload.kind and the fresh goal.currentState maps; do not describe a signature as a building order. The owner goal states desired outcomes; its old descriptions of missing work are not current state. Reconcile them with completedBuildings and queuedProgress. prerequisiteCheck=ready means BUILDING prerequisites met, not affordable or completed. A queued target needs no duplicate order. Troop training is never a building prerequisite and cannot supply construction stock. For stock_shortage, conserve scarce target resources and consider permitted resource acquisition: an affordable production upgrade if queue space exists, an introduction to discuss supply, or a lawful supply offer. Peer stock/acceptance is unknown; offers do not deliver resources until signed and settled. Ordinary stock alone can fund trade, not construction allowance. A concrete production wait is valid if no useful feasible step; name the actual blocker. Do not substitute unrelated spending for goal progress. Unknown checks need a scoped read. shortfallWholeCeil is whole units needed to cover the exact marked shortfall, not a new cost or authority grant.",
          }
        : {}),
      ...(Array.isArray(world.raids)
        ? {
            queueScope:
              "Raids and training cannot free builder waiting positions. Construction completion or owner cancellation can.",
          }
        : {}),
      availableQueueSlots,
      options,
      ...(prerequisiteWork.length ? { prerequisiteWork } : {}),
      coverage:
        "Observed candidates, no prescribed strategy or promised admission. A blocked Hall cannot satisfy its own missing prerequisites. With queue space, consider a ready affordable prerequisite or other useful permitted work. Waiting remains valid for a concrete current dependency, stock, risk or owner constraint; do not infer global inability from one blocked target. Unknown facts need a scoped read.",
    },
  };
}
