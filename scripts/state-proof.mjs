// Only aggregate hashes/counts leave this process. Database bodies remain private.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import pg from "pg";

const [mode, path] = process.argv.slice(2);
if (!["capture", "verify"].includes(mode) || !path) throw Error("EXPLICIT_PROOF_MODE_PATH_REQUIRED");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const tables = ["cohorts", "agents", "turns", "compute_ledger", "communications", "owner_decisions", "audit_events"];
try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const proof = {};
    for (const table of tables) {
      const { rows } = await client.query(
        `SELECT * FROM ${table} ORDER BY ${table === "owner_decisions" ? "command_id" : "id"}`,
      );
      if (table === "cohorts" && rows.some((r) => !["finished", "stopped"].includes(r.state)))
        throw Error("TERMINAL_COHORTS_REQUIRED");
      if (table === "turns" && rows.some((r) => r.state === "running")) throw Error("QUIESCENT_TURNS_REQUIRED");
      proof[table] = { count: rows.length, sha256: createHash("sha256").update(JSON.stringify(rows)).digest("hex") };
    }
    await client.query("COMMIT");
    if (mode === "capture") await writeFile(path, `${JSON.stringify(proof)}\n`, { mode: 0o600 });
    else if (JSON.stringify(proof) !== JSON.stringify(JSON.parse(await readFile(path, "utf8"))))
      throw Error("MIGRATION_STATE_CHANGED");
    console.log(
      JSON.stringify({
        stateVerified: true,
        counts: Object.fromEntries(Object.entries(proof).map(([k, v]) => [k, v.count])),
      }),
    );
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
