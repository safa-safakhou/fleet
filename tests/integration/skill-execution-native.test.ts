import { afterEach, expect, it } from "vitest";
import { executionFixture } from "../fixtures/skills/execution.js";

let f: Awaited<ReturnType<typeof executionFixture>>;
afterEach(async () => {
  await f?.close();
});
it("submits a known goal through actual shared claims and the canonical native journal with no model call", async () => {
  f = await executionFixture();
  const inv = await f.runner().start(f.scope, f.input());
  expect(inv.state).toBe("completed");
  expect(f.board.executions).toBe(1);
  expect((await f.pool.query("SELECT * FROM platform_commands")).rowCount).toBe(1);
  expect((await f.pool.query("SELECT * FROM compute_ledger")).rowCount).toBe(0);
  expect((await f.runner().start(f.scope, { ...f.input(), triggerId: "another-event" })).id).toBe(inv.id);
  expect(f.board.executions).toBe(1);
});
it.each(["reads", "actions", "steps", "wallTimeMs"])("stops before mutation on exhausted %s", async (kind) => {
  f = await executionFixture({
    reads: kind === "reads" ? 1 : 4,
    actions: kind === "actions" ? 0 : 1,
    messages: 0,
    steps: kind === "steps" ? 2 : 12,
    wallTimeMs: kind === "wallTimeMs" ? 1 : 60000,
  });
  if (kind === "wallTimeMs")
    f.ports.fault = async (point) => {
      if (point === "after_reservation") f.advance(2);
    };
  const result = await f.runner().start(f.scope, f.input());
  expect(result.state).toBe("reason");
  expect(f.board.executions).toBe(0);
  expect((await f.pool.query("SELECT * FROM platform_commands")).rowCount).toBe(0);
});
it("rechecks the same goal after quoting and refuses stale facts", async () => {
  f = await executionFixture();
  f.setAfterQuote(() => {
    f.goal.revision = "goal:changed";
  });
  const result = await f.runner().start(f.scope, f.input());
  expect(result).toMatchObject({ state: "reason", reason: "SKILL_GOAL_CHANGED" });
  expect(f.board.executions).toBe(0);
});
it("rejects an old observed position before dispatch even with elapsed work allowance remaining", async () => {
  f = await executionFixture({ reads: 4, actions: 1, messages: 0, steps: 12, wallTimeMs: 3600000 });
  f.ports.fault = async (point, _inv, cp) => {
    if (point === "after_finish" && cp?.nodeId === "read") f.advance(60001);
  };
  expect(await f.runner().start(f.scope, f.input())).toMatchObject({ state: "reason", reason: "STALE_RECIPE_FACTS" });
  expect(f.board.executions).toBe(0);
});
