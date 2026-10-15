import { createHash, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import pg from "pg";
import { expect, it } from "vitest";
import { Cognition } from "../../src/cognition.js";
import { Continuation } from "../../src/continuation.js";
import { connect, migrate } from "../../src/db.js";
import { Store } from "../../src/store.js";
import { Vault } from "../../src/vault.js";
import { key, ready, testUrl } from "../helpers.js";

it("rehearses additive migration, idempotence and old-column read compatibility with exact history/uncertainty preservation", async () => {
  const target = new URL(testUrl);
  if (!["127.0.0.1", "localhost"].includes(target.hostname) || target.pathname !== "/fleet_test")
    throw Error("ISOLATED_TEST_DATABASE_REQUIRED");
  const admin = connect(testUrl),
    schema = `release_${randomUUID().replaceAll("-", "")}`;
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const pool = new pg.Pool({ connectionString: testUrl, options: `-c search_path=${schema}`, max: 5 });
  try {
    const old = (await readdir("migrations")).filter((n) => /^0(0[1-9]|10)_.*\.sql$/.test(n)).sort();
    expect(old).toHaveLength(10);
    for (const file of old) await pool.query(await readFile(`migrations/${file}`, "utf8"));
    let now = new Date("2026-10-11T12:00:00Z");
    const vault = new Vault(key),
      store = new Store(pool, vault, () => now),
      cohort = await ready(store, 3),
      claim = await store.claim("old-source");
    if (!claim) throw Error("claim");
    await new Cognition(store).capture(claim, "observation", "preserved-source", {
      summary: "Synthetic retained source",
      importance: 2,
      evidenceRefs: [],
    });
    const allocation = await store.reserveCall(claim);
    await store.recordUsage(allocation, null, null);
    const commandId = randomUUID();
    await store.pending(claim, commandId, { kind: "game.building.queue", building: "farm", targetLevel: 2, slot: 1 });
    await store.finish(claim, "TRANSPORT_UNCERTAIN");
    const secret = vault.encrypt({ syntheticCredential: "fixture-only", fence: claim.fence }, `oauth:fixture`);
    await pool.query(
      "INSERT INTO oauth_attempts(state,agent_id,operator_session,secret_cipher,expires_at,phase) VALUES('fixture',$1,'fixture',$2,$3,'uncertain')",
      [claim.agentId, secret, new Date(now.getTime() + 60000)],
    );
    await pool.query("UPDATE agents SET notes='Retained historical note',secret_cipher=$2 WHERE id=$1", [
      claim.agentId,
      secret,
    ]);
    const tables = (
      await pool.query("SELECT tablename FROM pg_tables WHERE schemaname=current_schema() ORDER BY tablename")
    ).rows.map((r) => String(r.tablename));
    const snapshot = async () => {
      const hashes: Record<string, string> = {};
      for (const table of tables) {
        if (!/^[a-z_]+$/.test(table)) throw Error("UNSAFE_TABLE");
        const rows = (await pool.query(`SELECT to_jsonb(t)::text row FROM "${table}" t ORDER BY to_jsonb(t)::text`))
          .rows;
        hashes[table] = createHash("sha256").update(JSON.stringify(rows)).digest("hex");
      }
      return hashes;
    };
    const before = await snapshot();
    await migrate(pool);
    await migrate(pool);
    expect(await snapshot()).toEqual(before);
    expect((await pool.query("SELECT count(*)::int n FROM decision_states")).rows[0].n).toBe(0);
    expect(
      (await pool.query("SELECT status,tokens::text FROM compute_ledger WHERE id=$1", [allocation])).rows[0],
    ).toEqual({ status: "unknown", tokens: "40000" });
    expect(
      (await pool.query("SELECT pending_command FROM turns WHERE id=$1", [claim.id])).rows[0].pending_command,
    ).toBe(commandId);
    now = new Date(now.getTime() + 900000);
    const next = await store.claim("new-source", 2);
    if (!next) throw Error("next claim");
    await new Continuation(store).apply(
      next,
      0,
      {
        expectedVersion: 0,
        goal: { id: "preserved", title: "Synthetic continuation" },
        steps: [],
        nextStepId: null,
        wait: null,
      },
      [],
      "fixture",
    );
    await store.setState(cohort, "paused", false);
    await expect(store.active(next)).rejects.toThrow("CLAIM_FENCED");
    const afterNew = await snapshot();
    // Old source reads its existing columns; rollback keeps additive tables/data, never restores an older database.
    await pool.query("SELECT id,account_id,kingdom_id,next_due_at,secret_cipher,notes FROM agents");
    for (const file of old) await pool.query(await readFile(`migrations/${file}`, "utf8"));
    expect(await snapshot()).toEqual(afterNew);
    expect((await new Continuation(new Store(pool, vault, () => now)).load(next.agentId)).goal?.id).toBe("preserved");
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  }
});
