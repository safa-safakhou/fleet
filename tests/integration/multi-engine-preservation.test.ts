import { randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { migrate } from "../../src/db.js";
import { CommandExecutor } from "../../src/platform/execution.js";
import { TaskStore } from "../../src/platform/tasks.js";
import { FakeModel, ready } from "../helpers.js";
import { platformFixture } from "../platform-helpers.js";

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
});
it("preserves legacy identities/settings/history, pending IDs and full unknown allocations beside generic tasks across migration/restart", async () => {
  const f = await platformFixture();
  cleanup = () => f.pool.end();
  const legacy = await ready(f.store, 1);
  const oldClaim = await f.store.claim("legacy-fixture", 4);
  if (!oldClaim) throw Error("claim");
  const allocation = await f.store.reserveCall(oldClaim);
  await f.store.recordUsage(allocation, null, null);
  await f.store.finish(oldClaim, "USAGE_UNKNOWN");
  await f.enqueue();
  const c = await f.claim(),
    h = f.host(new FakeModel()),
    id = randomUUID(),
    connect = f.board.adapter.connect;
  f.board.adapter.connect = async (binding) => {
    const session = await connect(binding);
    return {
      ...session,
      execute: async (intent) => {
        await session.execute(intent);
        throw Error("TRANSPORT_UNCERTAIN");
      },
    };
  };
  expect(
    (
      await h.commands.submit(c, {
        commandId: id,
        bindingId: c.bindingId,
        schemaId: "board.move.v1",
        payload: { to: "a4" },
      })
    ).status,
  ).toBe("unknown");
  await f.tasks.finish(c, "TRANSPORT_UNCERTAIN");
  const identities = async () =>
    (await f.pool.query("SELECT id,account_id,kingdom_id,secret_cipher,ordinal,strategy FROM agents ORDER BY id")).rows;
  const config = async () => (await f.pool.query("SELECT * FROM cohorts ORDER BY id")).rows;
  const unknown = async () => (await f.pool.query("SELECT * FROM compute_ledger WHERE id=$1", [allocation])).rows;
  const history = async () => (await f.pool.query("SELECT * FROM turns WHERE id=$1", [oldClaim.id])).rows;
  const pending = async () => (await f.pool.query("SELECT pending_command FROM turns WHERE id=$1", [c.turn.id])).rows;
  const before = {
    identities: await identities(),
    config: await config(),
    unknown: await unknown(),
    history: await history(),
    pending: await pending(),
  };
  const legacyRows = async () => {
    const tables = (
      await f.pool.query(
        "SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='cohort_id' ORDER BY table_name",
      )
    ).rows;
    const snapshot: Record<string, unknown> = {};
    for (const { table_name } of tables) {
      if (!/^[a-z_]+$/.test(table_name)) throw Error("INVALID_FIXTURE_TABLE");
      const rows = (
        await f.pool.query(
          `SELECT to_jsonb(t) AS row FROM "${table_name}" t WHERE cohort_id=$1 ORDER BY to_jsonb(t)::text`,
          [legacy],
        )
      ).rows;
      if (rows.length) snapshot[table_name] = rows;
    }
    return snapshot;
  };
  const allSeededLegacyRows = await legacyRows();
  await migrate(f.pool);
  await migrate(f.pool);
  const tasks = new TaskStore(f.store, f.bindings, 4);
  await tasks.recover();
  expect(await legacyRows()).toEqual(allSeededLegacyRows);
  const preservation = {
    identitiesUnchanged: JSON.stringify(await identities()) === JSON.stringify(before.identities),
    pendingIdsUnchanged: JSON.stringify(await pending()) === JSON.stringify(before.pending),
    unknownHistoryUnchanged:
      JSON.stringify(await unknown()) === JSON.stringify(before.unknown) &&
      JSON.stringify(await history()) === JSON.stringify(before.history),
  };
  expect(preservation).toEqual({ identitiesUnchanged: true, pendingIdsUnchanged: true, unknownHistoryUnchanged: true });
  expect(await config()).toEqual(before.config);
  expect(before.unknown[0]).toMatchObject({ status: "unknown", tokens: "40000" });
  expect((await f.store.cohort(legacy)).id).toBe(legacy);
  const restarted = new CommandExecutor(f.store, tasks, f.bindings, f.environments);
  expect(await restarted.reconcile(c.turn.id, id)).toMatchObject({ commandId: id, status: "confirmed" });
  expect(await restarted.reconcile(c.turn.id, id)).toMatchObject({ commandId: id, status: "confirmed" });
  expect(f.board.executions).toBe(1);
  expect((await f.pool.query("SELECT command_id FROM command_resolutions WHERE turn_id=$1", [c.turn.id])).rows).toEqual(
    [{ command_id: id }],
  );
  expect(await unknown()).toEqual(before.unknown);
  expect(await history()).toEqual(before.history);
  expect(await identities()).toEqual(before.identities);
  expect(await legacyRows()).toEqual(allSeededLegacyRows);
});
