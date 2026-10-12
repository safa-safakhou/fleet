import { type Data, object } from "../../domain.js";

const rows = (v: unknown): Data[] => (Array.isArray(v) ? v.map(object) : []);
// Evaluate only dependencies supplied by PACT's owned projection. No game rule,
// economy, cancellation authority or private peer state is inferred here.
export function constructionRecovery(world: Data, proposed?: Data): Data {
  const levels = new Map(rows(world.buildings).map((b) => [String(b.kind), Number(b.level)]));
  const checks = rows(world.nextUpgradeChecks);
  const jobs = rows(world.builders).filter((b) => ["active", "waiting"].includes(String(b.state)));
  if (proposed) {
    const check = checks.find((c) => c.kind === proposed.building && c.targetLevel === proposed.targetLevel);
    if (!check)
      return { status: "unknown", guidance: "Refresh owned world data; prerequisite projection unavailable." };
    jobs.push({ ...check, slot: proposed.slot, state: "waiting", instructionId: "proposed" });
  }
  const remaining = [...jobs];
  const completed: string[] = [];
  for (let pass = 0; pass <= jobs.length; pass++) {
    let progressed = false;
    for (const job of [...remaining]) {
      const missing = rows(job.missingBuildings);
      const known = job.state === "active" || job.prerequisiteCheck === "ready" || missing.length > 0;
      if (!known) continue;
      if (job.state !== "active" && missing.some((b) => (levels.get(String(b.kind)) ?? 0) < Number(b.level))) continue;
      levels.set(String(job.kind), Math.max(levels.get(String(job.kind)) ?? 0, Number(job.targetLevel)));
      completed.push(String(job.instructionId));
      remaining.splice(remaining.indexOf(job), 1);
      progressed = true;
    }
    if (!progressed) break;
  }
  const waiting = remaining.filter((b) => b.state === "waiting");
  // Slots may each contain one active and one waiting instruction. Completing an
  // unrelated active job does not free its still-blocked waiting position.
  const slots = new Set(rows(world.builders).map((b) => b.slot));
  const full = slots.size > 0 && [...slots].every((slot) => waiting.some((b) => b.slot === slot));
  const explained = waiting.every((b) => rows(b.missingBuildings).length > 0);
  const status = !waiting.length ? "progress_possible" : full && explained ? "owner_required" : "waiting_or_unknown";
  return {
    status,
    coverage:
      "Prerequisite reachability from the owned snapshot only. Stock, reservations, current authority and future server admission may still delay otherwise reachable work. No completion or permission is promised.",
    basedOnGameTimeMs: world.asOfGameTimeMs,
    reachableInstructions: completed,
    blockedInstructions: waiting.map((b) => ({
      instructionId: b.instructionId,
      slot: b.slot,
      building: b.kind,
      targetLevel: b.targetLevel,
      missingBuildings: rows(b.missingBuildings).filter((m) => (levels.get(String(m.kind)) ?? 0) < Number(m.level)),
      dependencies: jobs
        .filter((j) =>
          rows(b.missingBuildings).some((m) => m.kind === j.kind && Number(j.targetLevel) >= Number(m.level)),
        )
        .map((j) => j.instructionId),
    })),
    ownerOptions:
      status === "owner_required"
        ? waiting
            .filter((b) => b.instructionId !== "proposed" && typeof b.instructionId === "string")
            .map((b) => ({
              action: { kind: "game.building.cancel", instructionId: b.instructionId },
              route: "human_only",
              guidance:
                "The actual owner can cancel this waiting instruction to free a queue position. Re-read after cancellation, then build the missing prerequisite before re-queueing. Review which target to retain; Fleet submits no cancellation.",
            }))
        : [],
    guidance:
      status === "owner_required"
        ? "All waiting positions are occupied and queued work cannot satisfy their prerequisites, even after active jobs finish. Owner recovery is required for construction; other authorized gameplay remains possible."
        : "Active or ready queued work can progress, or an unused waiting position may permit a prerequisite. Unknown checks require a fresh owned read; waiting alone does not prove deadlock.",
  };
}
