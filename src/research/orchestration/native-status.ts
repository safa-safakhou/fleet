import { z } from "zod";
import type { Store } from "../../store.js";
export interface NativeCommand {
  commandId: string;
  turnId: string;
  cohortId: string;
  state: string;
  code: string | null;
  origins: string[];
  projectionConflict: boolean;
}
type Projection = {
  command_id: string;
  turn_id: string;
  cohort_id: string;
  state: string;
  code: string | null;
  origin: "platform" | "legacy" | "pending";
};
/** One read-only census across native execution paths; no receipt or uncertainty is resolved here. */
export async function nativeCommands(
  store: Pick<Store, "pool">,
  cohortIds: readonly string[],
): Promise<NativeCommand[]> {
  const scope = z.array(z.uuid()).max(1000).parse(cohortIds);
  if (!scope.length) return [];
  const rows = (
    await store.pool.query(
      `SELECT p.command_id,p.turn_id,t.cohort_id,p.state,coalesce(p.outcome->>'code',p.outcome->'receipt'->>'code') code,'platform' origin FROM platform_commands p JOIN turns t ON t.id=p.turn_id WHERE t.cohort_id=ANY($1::uuid[])
 UNION ALL SELECT r.command_id,r.turn_id,r.cohort_id,CASE WHEN r.code IN('COMMITTED','ALREADY_COMMITTED') THEN 'confirmed' ELSE 'rejected' END state,r.code,'legacy' origin FROM command_resolutions r WHERE r.cohort_id=ANY($1::uuid[])
 UNION ALL SELECT t.pending_command,t.id,t.cohort_id,'pending',NULL,'pending' FROM turns t WHERE t.cohort_id=ANY($1::uuid[]) AND t.pending_command IS NOT NULL`,
      [scope],
    )
  ).rows as Projection[];
  const groups = new Map<string, Projection[]>();
  for (const row of rows) groups.set(row.command_id, [...(groups.get(row.command_id) ?? []), row]);
  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, values]) => {
      const ordered = values.sort(
          (a, b) =>
            ["platform", "legacy", "pending"].indexOf(a.origin) - ["platform", "legacy", "pending"].indexOf(b.origin),
        ),
        first = ordered[0],
        settled = ordered.filter((x) => x.origin !== "pending"),
        codes = new Set(
          settled.filter((x) => x.code).map((x) => (x.code === "ALREADY_COMMITTED" ? "COMMITTED" : x.code)),
        );
      return {
        commandId: id,
        turnId: first.turn_id,
        cohortId: first.cohort_id,
        state: first.state,
        code: ordered.find((x) => x.origin === "legacy")?.code ?? first.code,
        origins: [...new Set(ordered.map((x) => x.origin))],
        projectionConflict:
          new Set(values.map((x) => x.turn_id)).size > 1 ||
          new Set(values.map((x) => x.cohort_id)).size > 1 ||
          new Set(settled.map((x) => x.state)).size > 1 ||
          codes.size > 1 ||
          (values.some((x) => x.origin === "pending") &&
            settled.some((x) => ["confirmed", "rejected"].includes(x.state))),
      };
    });
}
