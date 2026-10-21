import { afterEach, expect, it } from "vitest";
import { migrate } from "../../src/db.js";
import { executionFixture } from "../fixtures/skills/execution.js";

let f: Awaited<ReturnType<typeof executionFixture>>;
afterEach(async () => {
  await f?.close();
});
it("preserves populated skill checkpoints, work, identity and allocation rows through repeated fresh migrations", async () => {
  f = await executionFixture();
  await f.runner().start(f.scope, f.input());
  const tables = [
    "cohorts",
    "agents",
    "turns",
    "compute_ledger",
    "environment_bindings",
    "specialist_states",
    "specialist_updates",
    "skill_versions",
    "skill_adoptions",
    "skill_evaluations",
    "skill_invocations",
    "skill_checkpoints",
    "skill_work_reservations",
    "specialist_intents",
    "platform_commands",
    "specialist_action_results",
  ];
  const snapshot = async () => {
    const result: Record<string, unknown> = {};
    for (const table of tables)
      result[table] = (await f.pool.query(`SELECT to_jsonb(t) row FROM ${table} t ORDER BY to_jsonb(t)::text`)).rows;
    return result;
  };
  const before = await snapshot();
  await migrate(f.pool);
  await migrate(f.pool);
  expect(await snapshot()).toEqual(before);
  expect(f.board.executions).toBe(1);
  expect((await f.runner().start(f.scope, { ...f.input(), triggerId: "migration-restart" })).state).toBe("completed");
  expect(f.board.executions).toBe(1);
});
