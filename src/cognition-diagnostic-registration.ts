import type { Pool } from "./db.js";
/** Independent append-only authorization registry; never reopens qualification grants. */
export async function registerDiagnostic(pool: Pool, approval: { id: string; authorizationRef: string }, path: string) {
  await pool.query(
    "CREATE TABLE IF NOT EXISTS cognition_diagnostic_runs(id uuid PRIMARY KEY,authorization_ref text UNIQUE NOT NULL,approval jsonb NOT NULL,journal_path text UNIQUE NOT NULL,created_at timestamptz NOT NULL DEFAULT now())",
  );
  await pool.query(
    "INSERT INTO cognition_diagnostic_runs(id,authorization_ref,approval,journal_path) VALUES($1,$2,$3,$4)",
    [approval.id, approval.authorizationRef, approval, path],
  );
}
