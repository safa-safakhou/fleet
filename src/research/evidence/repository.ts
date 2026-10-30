import type { PoolClient } from "pg";
import { transaction } from "../../db.js";
import { FleetError } from "../../domain.js";
import type { Store } from "../../store.js";
import { canonical, digest, type RunScope, ScopeSchema } from "../contracts.js";
import { type EventPage, type EventPageQuery, PageQuerySchema } from "./types.js";
export async function scopeForTurn(
  store: Store,
  turnId: string,
  db: Pick<PoolClient, "query"> = store.pool,
): Promise<RunScope> {
  const row = (
    await db.query(
      `SELECT t.id,t.agent_id,t.fence,tc.task_id,tc.fence task_fence,p.binding_id,p.participant_id
 FROM turns t LEFT JOIN platform_task_claims tc ON tc.turn_id=t.id LEFT JOIN platform_tasks p ON p.id=tc.task_id WHERE t.id=$1`,
      [turnId],
    )
  ).rows[0];
  if (!row) throw new FleetError("EVIDENCE_RUN_NOT_FOUND", true);
  return ScopeSchema.parse({
    runId: turnId,
    agentId: row.agent_id,
    bindingId: row.binding_id ?? `legacy:${row.agent_id}`,
    turnId,
    taskId: row.task_id ?? `legacy:${turnId}`,
    operationId: turnId,
    operationEpoch: String(row.task_fence ?? row.fence),
    manifestDigest: digest({ kind: "observed-compatibility", turnId }),
    ...(row.participant_id ? { participantId: row.participant_id } : {}),
  });
}
export class EvidenceRepository {
  constructor(readonly store: Store) {}
  async bind(scope: RunScope, db: PoolClient): Promise<void> {
    ScopeSchema.parse(scope);
    const turn = (await db.query("SELECT agent_id,cohort_id FROM turns WHERE id=$1", [scope.turnId])).rows[0];
    if (!turn || turn.agent_id !== scope.agentId) throw new FleetError("EVIDENCE_SCOPE_MISMATCH", true);
    const operation = (
      await db.query("SELECT scope FROM research_operations WHERE operation_id=$1", [scope.operationId])
    ).rows[0];
    const stable = (s: RunScope) => ({ ...s, turnId: "", operationEpoch: "" });
    const provenance = operation ? "research" : "compatibility";
    if (operation) {
      if (canonical(stable(operation.scope)) !== canonical(stable(scope)))
        throw new FleetError("EVIDENCE_SCOPE_MISMATCH", true);
      const claim = (
        await db.query(
          "SELECT 1 FROM platform_task_claims c JOIN platform_tasks t ON t.id=c.task_id WHERE c.turn_id=$1 AND c.task_id=$2 AND c.fence::text=$3 AND t.binding_id::text=$4",
          [scope.turnId, scope.taskId, scope.operationEpoch, scope.bindingId],
        )
      ).rowCount;
      if (!claim) throw new FleetError("EVIDENCE_SCOPE_MISMATCH", true);
    } else if (canonical(await scopeForTurn(this.store, scope.turnId, db)) !== canonical(scope))
      throw new FleetError("EVIDENCE_SCOPE_MISMATCH", true);
    const now = this.store.now();
    await db.query(
      "INSERT INTO research_runs(run_id,agent_id,cohort_id,binding_id,manifest_digest,provenance,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(run_id) DO NOTHING",
      [
        scope.runId,
        scope.agentId,
        turn.cohort_id,
        scope.bindingId,
        scope.manifestDigest,
        provenance,
        now,
        new Date(now.getTime() + 30 * 86400000),
      ],
    );
    const run = (await db.query("SELECT * FROM research_runs WHERE run_id=$1 FOR UPDATE", [scope.runId])).rows[0];
    if (
      run.agent_id !== scope.agentId ||
      run.cohort_id !== turn.cohort_id ||
      run.binding_id !== scope.bindingId ||
      run.manifest_digest !== scope.manifestDigest
    )
      throw new FleetError("EVIDENCE_SCOPE_MISMATCH", true);
    await db.query(
      "INSERT INTO research_evidence_scopes(run_id,operation_id,epoch,turn_id,scope) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
      [scope.runId, scope.operationId, scope.operationEpoch, scope.turnId, scope],
    );
    await this.assertScope(scope, db);
  }
  async assertScope(scope: RunScope, db: Pick<PoolClient, "query"> = this.store.pool) {
    const row = (
      await db.query("SELECT scope FROM research_evidence_scopes WHERE run_id=$1 AND operation_id=$2 AND epoch=$3", [
        scope.runId,
        scope.operationId,
        scope.operationEpoch,
      ])
    ).rows[0];
    if (!row || canonical(row.scope) !== canonical(scope)) throw new FleetError("EVIDENCE_SCOPE_MISMATCH", true);
  }
  async page(scope: RunScope, query: EventPageQuery, db?: PoolClient): Promise<EventPage> {
    if (!db) return transaction(this.store.pool, (c) => this.page(scope, query, c));
    await this.assertScope(scope, db);
    const q = PageQuerySchema.parse(query);
    const run = (await db.query("SELECT next_ordinal::text FROM research_runs WHERE run_id=$1", [scope.runId])).rows[0];
    const max = q.maximumOrdinal ?? run.next_ordinal;
    if (BigInt(max) > BigInt(run.next_ordinal)) throw new FleetError("EVIDENCE_CURSOR_INVALID", true);
    const args = [scope.runId, max, q.kind ?? null, q.streamId ?? null];
    const filter =
      "run_id=$1 AND ordinal<=$2::bigint AND ($3::text IS NULL OR event->>'kind'=$3) AND ($4::text IS NULL OR stream_id=$4)";
    const total = (await db.query(`SELECT count(*)::int n FROM research_events WHERE ${filter}`, args)).rows[0].n;
    const rows = (
      await db.query(
        `SELECT event FROM research_events WHERE ${filter} AND ordinal>$5::bigint ORDER BY ordinal LIMIT $6`,
        [...args, q.after ?? "0", q.limit + 1],
      )
    ).rows;
    const events = rows.slice(0, q.limit).map((r) => r.event),
      hasMore = rows.length > q.limit;
    return { events, total, hasMore, nextAfter: hasMore ? events.at(-1).ordinal : null, maximumOrdinal: max };
  }
}
