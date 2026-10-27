import type { PoolClient } from "pg";

/** Caller holds advisory lock 19281462. Waiting turns keep their leases and deadlines. */
export async function canClaimWorker(db: PoolClient, capacity: number) {
  const row = (
    await db.query(
      "SELECT count(*)::int total,count(*) FILTER (WHERE NOT worker_waiting)::int executing FROM turns WHERE state='running'",
    )
  ).rows[0];
  return row.executing < capacity && row.total < capacity * 2;
}
