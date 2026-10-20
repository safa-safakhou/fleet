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
  const idleBuilder = availableQueueSlots.some((slot) =>
    builders.filter((b) => b.slot === slot).every((b) => b.state === null),
  );
  const options = rows(world.nextUpgradeChecks).map((check) => {
    const quote = stock.find((q) => q.building === check.kind && q.targetLevel === check.targetLevel);
    const busy = occupied.has(check.kind) ? true : typeof quote?.busy === "boolean" ? quote.busy : null;
    const startStatus =
      Array.isArray(allowed) && !allowed.includes("building.queue")
        ? "not_delegated"
        : busy === true
          ? "active_or_queued"
          : rows(check.missingBuildings).length
            ? "building_prerequisites"
            : quote?.stockAffordable === false
              ? "stock_shortage"
              : check.prerequisiteCheck !== "ready" ||
                  quote?.stockAffordable !== true ||
                  busy !== false ||
                  !Array.isArray(allowed) ||
                  !Array.isArray(world.builders)
                ? "unknown"
                : !idleBuilder
                  ? "no_idle_builder"
                  : "ready";
    return {
      building: check.kind,
      targetLevel: check.targetLevel,
      prerequisiteCheck: check.prerequisiteCheck ?? "unknown",
      missingBuildings: check.missingBuildings,
      stockAffordable: typeof quote?.stockAffordable === "boolean" ? quote.stockAffordable : null,
      costWhole: quote?.costWhole,
      busy,
      startStatus,
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
    ownerIntent: { status: objective ? "provided" : "absent", objective: objective || null },
    execution: {
      objectiveIsStandingGuidance: Boolean(objective),
      lease: "managed_by_host",
      guidance:
        "Owner intent is standing guidance: choose a useful subgoal and lawful step yourself. Fleet manages leases, command IDs and receipts. Put bare game arguments inside your profile's action/payload envelope. Shapes/checks are not grants; the server rechecks authority and admission.",
      allowedActions: Array.isArray(allowed) ? allowed : [],
      humanOnly: "Explicit human-only actions still require their existing owner approval.",
    },
    ...(trade ? { trade } : {}),
    ...(facts.discovery || facts.socialAttention || Array.isArray(guide.contacts)
      ? {
          interactions: {
            selfKingdomId: object(world.profile).kingdomId,
            observedPeerIds: observedPeerIds(facts),
            observedContactIds: rows(guide.contacts).map((p) => p.kingdomId),
            guidance:
              "Self is not a peer. contact.request introduces; message.send needs accepted contact. Review socialAttention.records too: deduplicated empty contactRequests/openSupplyOffers do not mean an empty inbox. Accept, counter, decline or defer on merits; no required interaction count. Missing pages are unknown.",
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
      productionBuildings: object(facts.development).productionBuildings,
      effect: object(facts.development).constructionEffect,
      completedBuildings: world.buildings,
      ...(queuedProgress.length
        ? {
            queuedProgress,
            goalReconciliation:
              "Current completedBuildings/queuedProgress override old notes and missing-work descriptions. stock_shortage needs resources, not another order or troop training. Conserve the target's scarce stock or explain a different chosen priority; unrelated spending does not acquire resources. A production wait is valid: name the actual constraint. expectedOutcome.actionKind/basis must match payload.kind/currentState. shortfallWholeCeil rounds the marked gap, not a new cost/grant.",
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
        "startStatus=ready is an observed immediate-start candidate, not guaranteed admission. Queue space can exist behind an active builder. prerequisiteCheck=ready means building prerequisites only, not affordability/completion. Queueing Hall with missing Farm/Barracks does not build those prerequisites: consider a ready prerequisite with space. No duplicate queued kind. Choose work for your actual objective or a concrete dependency/stock/risk wait; unknown facts need a scoped read.",
    },
  };
}
