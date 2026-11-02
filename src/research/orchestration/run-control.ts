import { isAbsolute } from "node:path";

/** The absolute end remains authoritative even when activation was delayed. */
export function runClockFailure(input: { now: number; endsAt: number; activatedAt: number | null; hasTurn: boolean }) {
  if (input.now >= input.endsAt) return "ONE_HOUR_COMPLETE";
  if (input.activatedAt !== null && input.now - input.activatedAt > 60000 && !input.hasTurn)
    return "NO_INITIAL_NATIVE_TURN";
  return undefined;
}

type CensusDatabase = { query(sql: string, values: string[]): Promise<{ rows: Record<string, any>[] }> };
export async function readRunCensus(db: CensusDatabase, cohortId: string) {
  const [turns, ledger, commands, evidence] = await Promise.all([
    db.query("SELECT state,code,unknown_usage FROM turns WHERE cohort_id=$1", [cohortId]),
    db.query("SELECT status FROM compute_ledger WHERE cohort_id=$1", [cohortId]),
    db.query("SELECT count(*)::int n FROM platform_commands c JOIN turns t ON t.id=c.turn_id WHERE t.cohort_id=$1", [
      cohortId,
    ]),
    db.query("SELECT 1 FROM research_runs WHERE cohort_id=$1 AND capture_failed LIMIT 1", [cohortId]),
  ]);
  return {
    turns: turns.rows,
    ledger: ledger.rows,
    commands: commands.rows[0].n as number,
    evidenceFailed: evidence.rows.length > 0,
  };
}

/** Explicit local endpoint: operator HOME/config must never select another daemon. */
export function localDockerCommand(executable: string, endpoint: string, args: string[]) {
  if (!isAbsolute(executable) || !/^unix:\/\/\/[^\s]+$/.test(endpoint)) throw Error("LOCAL_DOCKER_REQUIRED");
  return { file: executable, args: ["--host", endpoint, ...args] };
}
