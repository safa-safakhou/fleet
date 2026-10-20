import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { PoolClient } from "pg";
import pg from "pg";
export function connect(url: string) {
  const pool = new pg.Pool({
    connectionString: url,
    max: 8,
    connectionTimeoutMillis: 5000,
    statement_timeout: 20000,
    lock_timeout: 5000,
    idle_in_transaction_session_timeout: 30000,
  });
  pool.on("error", () => console.error("fleet database connection unavailable"));
  return pool;
}
export type Pool = pg.Pool;
export async function transaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const result = await work(c);
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
export async function migrate(pool: Pool) {
  await transaction(pool, async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(19281461)");
    await c.query(await readFile(resolve("migrations/001_fleet.sql"), "utf8"));
    await c.query(await readFile(resolve("migrations/002_observability.sql"), "utf8"));
    await c.query(await readFile(resolve("migrations/003_command_resolutions.sql"), "utf8"));
    await c.query(await readFile(resolve("migrations/004_decision_feedback.sql"), "utf8"));
    await c.query(await readFile(resolve("migrations/005_decision_policy.sql"), "utf8"));
    await c.query(await readFile(resolve("migrations/006_cognition.sql"), "utf8"));
    await c.query(await readFile(resolve("migrations/007_cognitive_grounding.sql"), "utf8"));
    await c.query(await readFile(resolve("migrations/008_comparisons.sql"), "utf8"));
    await c.query(await readFile(resolve("migrations/009_five_minute_schedule.sql"), "utf8"));
    await c.query(await readFile(resolve("migrations/010_account_guidance.sql"), "utf8"));
    await c.query(await readFile(resolve("migrations/011_continuation.sql"), "utf8"));
    await c.query(await readFile(resolve("migrations/012_recovery.sql"), "utf8"));
    await c.query(await readFile(resolve("migrations/013_environment_bindings.sql"), "utf8"));
    await c.query(await readFile(resolve("migrations/014_platform_host.sql"), "utf8"));
    await c.query(await readFile(resolve("migrations/015_event_wake.sql"), "utf8"));
    await c.query(await readFile(resolve("migrations/016_continuity.sql"), "utf8"));
    await c.query(await readFile(resolve("migrations/017_specialist_continuity.sql"), "utf8"));
    await c.query(await readFile(resolve("migrations/018_sibling_model_leases.sql"), "utf8"));
    await c.query(await readFile(resolve("migrations/019_profile_comparisons.sql"), "utf8"));
    await c.query(await readFile(resolve("migrations/020_architecture_launch.sql"), "utf8"));
  });
}
