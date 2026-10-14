import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { PoolClient } from "pg";
import pg from "pg";
export const connect = (url: string) => new pg.Pool({ connectionString: url, max: 5, connectionTimeoutMillis: 5000 });
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
  });
}
