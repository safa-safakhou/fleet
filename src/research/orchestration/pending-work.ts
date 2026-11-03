import { z } from "zod";
import type { Store } from "../../store.js";
import type { CapacityCandidate } from "./capacity.js";

const query = z.object({
  cohortIds: z.array(z.uuid()).max(1000),
  notBefore: z.number().int().nonnegative().safe(),
  limit: z.number().int().min(1).max(1000).default(256),
});
export type PendingCapacityWork = Omit<CapacityCandidate, "lastDispatchAt"> & {
  deliveryId: string;
  taskKey: string;
  participantId?: string;
};
/** Pending durable wakes only; native ownership, revision, fencing and admission remain authoritative. */
export async function pendingCapacityWork(
  store: Pick<Store, "pool">,
  raw: z.input<typeof query>,
): Promise<PendingCapacityWork[]> {
  const options = query.parse(raw);
  if (!options.cohortIds.length) return [];
  const rows = (
    await store.pool.query(
      `
 SELECT t.id task_id,t.binding_id,t.task_key,t.participant_id,t.deadline,w.id delivery_id,
 CASE WHEN t.state='waiting' THEN CASE WHEN t.participant_id IS NULL THEN
   (SELECT s.observed_at FROM platform_task_sources s WHERE s.task_id=t.id ORDER BY s.sequence OFFSET coalesce(k.revision,0) LIMIT 1)
 ELSE (SELECT min(d.observed_at) FROM specialist_deliveries d WHERE d.task_id=t.id AND d.status='pending') END
 ELSE t.due_at END eligible_at
 FROM platform_tasks t JOIN research_task_owners o ON o.task_id=t.id AND o.manifest_digest=t.research_manifest_digest
 JOIN environment_bindings b ON b.id=t.binding_id JOIN agents a ON a.id=b.agent_id JOIN cohorts c ON c.id=t.cohort_id
 JOIN LATERAL (
   SELECT x.id FROM research_task_outbox x
   LEFT JOIN platform_task_sources s ON t.participant_id IS NULL AND s.task_id=x.task_id AND x.dedupe_key=encode(sha256(convert_to(s.binding_id::text||':'||s.event_id,'UTF8')),'hex')
   LEFT JOIN specialist_deliveries d ON t.participant_id IS NOT NULL AND d.task_id=x.task_id AND d.status='pending' AND x.dedupe_key=research_specialist_wake_key(d.id)
   WHERE x.task_id=t.id AND x.kind='wake' AND x.delivered_at IS NULL
     AND (s.task_id IS NOT NULL OR d.task_id IS NOT NULL OR (x.dedupe_key='enrolled' AND t.state='ready' AND t.fence=0))
   ORDER BY s.sequence DESC NULLS LAST,x.created_at DESC,x.id LIMIT 1
 )w ON true
 LEFT JOIN LATERAL(SELECT revision FROM platform_task_claims k WHERE k.task_id=t.id ORDER BY k.created_at DESC,k.fence DESC LIMIT 1)k ON true
 WHERE t.cohort_id=ANY($1::uuid[]) AND c.state='running' AND a.state='ready' AND b.state='active'
   AND t.scheduler_owner='temporal' AND t.state IN('ready','waiting') AND o.phase IN('ready','waiting')
   AND (t.state='ready' OR t.revision>coalesce(k.revision,0))
   AND NOT EXISTS(SELECT 1 FROM research_task_executions e WHERE e.task_id=t.id AND e.phase<>'settled')
 ORDER BY t.due_at,t.id LIMIT $2`,
      [options.cohortIds, options.limit],
    )
  ).rows;
  return rows.map((row) => ({
    taskId: row.task_id,
    bindingId: row.binding_id,
    taskKey: row.task_key,
    deliveryId: row.delivery_id,
    eligibleAt: Math.max(options.notBefore, new Date(row.eligible_at).getTime()),
    event: row.task_key.startsWith("event:"),
    ...(row.participant_id ? { participantId: row.participant_id } : {}),
    ...(row.deadline ? { deadline: row.deadline } : {}),
  }));
}
