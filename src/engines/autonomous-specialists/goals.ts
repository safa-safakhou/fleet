import { FleetError } from "../../domain.js";
import type { SpecialistCharter, SpecialistGoal } from "../../platform/engine-context.js";
export function reviseGoals(
  previous: SpecialistGoal[],
  updates: SpecialistGoal[],
  charter: SpecialistCharter,
): SpecialistGoal[] {
  if (new Set(updates.map((g) => g.id)).size !== updates.length) throw new FleetError("DUPLICATE_GOAL");
  const goals = new Map(previous.map((g) => [g.id, g]));
  for (const goal of updates) {
    const old = goals.get(goal.id);
    if (old && ["completed", "abandoned"].includes(old.status) && JSON.stringify(old) !== JSON.stringify(goal))
      throw new FleetError("TERMINAL_GOAL");
    goals.set(goal.id, goal);
  }
  if ([...goals.values()].filter((g) => g.status === "active").length > charter.maxActiveGoals)
    throw new FleetError("ACTIVE_GOAL_LIMIT");
  if (goals.size > 128) throw new FleetError("GOAL_HISTORY_LIMIT");
  for (const goal of goals.values()) {
    const seen = new Set([goal.id]);
    let parent = goal.parentId;
    while (parent) {
      if (seen.has(parent)) throw new FleetError("GOAL_CYCLE");
      seen.add(parent);
      const target = goals.get(parent);
      if (!target) throw new FleetError("UNKNOWN_PARENT_GOAL");
      parent = target.parentId;
    }
  }
  return [...goals.values()];
}
