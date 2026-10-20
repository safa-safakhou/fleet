import type { Pool } from "pg";

/** Retained unknown history is admissible only after the supported audited review. */
export async function unresolvedLocalWork(pool: Pool): Promise<number> {
  const result = await pool.query(`
    SELECT
      (SELECT count(*)::int FROM turns WHERE state IN('running','pending','needs_owner') OR pending_command IS NOT NULL)
      + (SELECT count(*)::int FROM compute_ledger l WHERE l.status='reserved' OR (l.status='unknown' AND NOT EXISTS (
        SELECT 1 FROM audit_events a JOIN turns t ON t.id=l.turn_id
        WHERE a.kind='turn.reviewed' AND a.cohort_id=l.cohort_id AND t.state='cancelled'
          AND a.detail->>'turnId'=l.turn_id::text AND a.detail->>'allocationRetained'='true'
          AND a.detail->>'replayed'='false' AND a.created_at>=l.created_at
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(a.detail->'usage') u
            WHERE u->>'status'='unknown'
              AND u->>'calls'=(SELECT count(*)::text FROM compute_ledger x WHERE x.turn_id=l.turn_id AND x.status='unknown')
              AND u->>'allocated_tokens'=(SELECT sum(tokens)::text FROM compute_ledger x WHERE x.turn_id=l.turn_id AND x.status='unknown')
          )
      ))) n
  `);
  return result.rows[0].n;
}

interface VerifiedTurn {
  state: string;
  code: string | null;
  actions: number;
  pending_command: string | null;
}
/** Confirmed progress never erases a later failure from a verification result. */
export function turnVerificationFailure(
  turn: VerifiedTurn,
  compute: { status: string }[],
  resolutions?: { code: string | null }[],
): string | undefined {
  if (
    turn.state !== "finished" ||
    !compute.length ||
    compute.some((row) => row.status !== "reported") ||
    turn.pending_command
  )
    return "TURN_NOT_OPERATIVE";
  if (!turn.code || !["WAIT", "READ", "COMMITTED", "ALREADY_COMMITTED"].includes(turn.code))
    return turn.code ?? "TURN_NOT_OPERATIVE";
  if (!["WAIT", "READ"].includes(turn.code) && turn.actions === 0) return "TURN_NOT_OPERATIVE";
  if (resolutions) {
    const refused = resolutions.find((r) => !r.code || !["COMMITTED", "ALREADY_COMMITTED"].includes(r.code));
    if (refused) return refused.code ?? "COMMAND_OUTCOME_UNRESOLVED";
    if (resolutions.length !== turn.actions) return "COMMAND_COUNT_MISMATCH";
  }
  return undefined;
}
