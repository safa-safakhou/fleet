import { lstat, readFile } from "node:fs/promises";
import type { Pool } from "../../db.js";
import type { Vault } from "../../vault.js";
/** Read-only prerequisite checks; readiness does not confer execution authority. */
export async function packageReadiness(
  pool: Pool,
  vault: Vault,
  proofFile: string | undefined,
  requireVector: boolean,
) {
  const reasons: string[] = [];
  try {
    const schema = (
      await pool.query(`SELECT to_regclass('public.research_qualifications')::text name,
 to_regprocedure('research_bind_existing_scope(jsonb)') IS NOT NULL AND
 to_regprocedure('research_scope_snapshot(jsonb,boolean)') IS NOT NULL AND
 to_regprocedure('research_verify_materialization(jsonb,uuid,text,text,timestamptz)') IS NOT NULL AND
 to_regprocedure('research_verify_postgres_artifact(jsonb,uuid,text,jsonb,timestamptz)') IS NOT NULL AND
 to_regprocedure('research_capture_dispatch(jsonb,jsonb,jsonb,jsonb,text,bigint,timestamptz,jsonb,jsonb,jsonb)') IS NOT NULL AND
 to_regprocedure('research_capture_resolved(jsonb,jsonb,jsonb,jsonb,jsonb,boolean,timestamptz,jsonb,text)') IS NOT NULL AND
 to_regprocedure('research_parent_run(uuid)') IS NOT NULL AND
 to_regprocedure('research_acknowledge_copy(uuid,text)') IS NOT NULL AND
 to_regprocedure('research_append_event(jsonb,jsonb)') IS NOT NULL AND
 to_regprocedure('research_capture_policy(jsonb)') IS NOT NULL AND
 to_regprocedure('research_acknowledge_copies(jsonb)') IS NOT NULL AND
 to_regprocedure('research_model_capture_policy(jsonb,uuid,uuid[])') IS NOT NULL AND
 to_regprocedure('research_capture_write(jsonb,jsonb,jsonb,jsonb,text,bigint,timestamptz,jsonb,jsonb)') IS NOT NULL recording`)
    ).rows[0];
    if (!schema?.name || !schema.recording) reasons.push("RESEARCH_SCHEMA_UNAVAILABLE");
    if (
      requireVector &&
      (await pool.query("SELECT extversion FROM pg_extension WHERE extname='vector'")).rows[0]?.extversion !== "0.8.7"
    )
      reasons.push("PGVECTOR_UNAVAILABLE");
  } catch {
    reasons.push("DATABASE_UNAVAILABLE");
  }
  try {
    if (!proofFile) throw Error();
    const st = await lstat(proofFile);
    if (!st.isFile() || st.isSymbolicLink() || (st.mode & 0o077) !== 0 || st.size > 65536) throw Error();
    const proof = JSON.parse(await readFile(proofFile, "utf8"));
    if (
      vault.decrypt<{ schemaVersion: string }>(proof.ciphertext, "fleet.research.package-key/v1").schemaVersion !==
      "fleet.package-key/v1"
    )
      throw Error();
  } catch {
    reasons.push("ARTIFACT_KEY_UNAVAILABLE");
  }
  return { schemaVersion: "fleet.package-readiness/v1", ready: reasons.length === 0, executionEnabled: false, reasons };
}
