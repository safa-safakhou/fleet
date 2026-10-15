import { randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { Engine } from "../../src/engine.js";
import { pactAdapter } from "../../src/games/pact/adapter.js";
import { budget, continuousBudget, FakeGame, FakeModel, fixture, ready } from "../helpers.js";

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
});
async function setup(count = 1) {
  const f = await fixture();
  close = () => f.pool.end();
  const id = await ready(f.store, count);
  return { ...f, id };
}
it("isolates one unknown allocation while 49 other agents make progress", async () => {
  const f = await setup(50);
  await f.store.setState(f.id, "paused", true);
  await f.store.configure(f.id, { model: { route: "codex-cli", model: "fixture" }, budget: continuousBudget });
  await f.store.setState(f.id, "running", true);
  const first = await f.store.claim("crashed");
  if (!first) throw Error("claim");
  await f.store.reserveCall(first);
  await f.store.finish(first, "CODEX_TIMEOUT");
  const seen = new Set<string>();
  for (let i = 0; i < 49; i++) {
    f.advance(18000);
    const claim = await f.store.claim("healthy");
    if (!claim) throw Error("unrelated agent blocked");
    seen.add(claim.agentId);
    await f.store.finish(claim, "WAIT");
  }
  expect(seen.size).toBe(49);
  expect(seen.has(first.agentId)).toBe(false);
  expect((await f.store.cohort(f.id)).state).toBe("running");
  expect((await f.pool.query("SELECT status,tokens::text FROM compute_ledger")).rows).toEqual([
    { status: "unknown", tokens: "40000" },
  ]);
  expect(
    (await f.pool.query("SELECT status,phase FROM recovery_operations WHERE turn_id=$1", [first.id])).rows[0],
  ).toMatchObject({ status: "owner", phase: "usage_uncertain" });
});
it("reaps pre-inference expiry without an unknown bill and preserves owner pause", async () => {
  const f = await setup();
  const claim = await f.store.claim("dead");
  if (!claim) throw Error("claim");
  await f.store.setState(f.id, "paused", true);
  f.advance(121000);
  await f.store.recoverExpired();
  expect((await f.store.cohort(f.id)).state).toBe("paused");
  expect((await f.pool.query("SELECT state,unknown_usage FROM turns WHERE id=$1", [claim.id])).rows[0]).toEqual({
    state: "finished",
    unknown_usage: false,
  });
  expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n).toBe(0);
});
it("does not let a full earliest cohort starve another cohort", async () => {
  const f = await setup(2);
  await f.pool.query("UPDATE cohorts SET budget=jsonb_set(budget,'{concurrency}','1') WHERE id=$1", [f.id]);
  const other = await ready(f.store, 1);
  const first = await f.store.claim("one", 3);
  if (!first) throw Error("claim");
  f.advance(18000);
  await f.pool.query("UPDATE agents SET next_due_at=$2 WHERE cohort_id=$1 AND ordinal=1", [
    f.id,
    new Date(f.now().getTime() - 1000),
  ]);
  await f.pool.query("UPDATE agents SET next_due_at=$2 WHERE cohort_id=$1", [other, f.now()]);
  const second = await f.store.claim("two", 3);
  expect(second?.cohortId).toBe(other);
});
it("reconciles an original receipt without replay and restores eligibility", async () => {
  const f = await setup();
  const claim = await f.store.claim("one");
  if (!claim) throw Error("claim");
  const id = randomUUID();
  await f.store.pending(claim, id, { kind: "fixture.action" });
  await f.store.finish(claim, "TRANSPORT_UNCERTAIN");
  const game = new FakeGame(claim);
  game.receiptValue = { commandId: id, code: "COMMITTED" };
  const engine = new Engine(f.store, new FakeModel(), async () => game, true, pactAdapter);
  const task = await f.store.recoveryCandidate("reconciler");
  expect(task?.turn_id).toBeUndefined();
  f.advance(5001);
  expect((await f.store.recoveryCandidate("reconciler"))?.turn_id).toBe(claim.id);
  await engine.reconcile(claim.id);
  expect(game.submits).toEqual([]);
  expect((await f.store.agent(claim.agentId)).state).toBe("ready");
  expect(
    (await f.pool.query("SELECT pending_command FROM turns WHERE id=$1", [claim.id])).rows[0].pending_command,
  ).toBeNull();
});
it("resolved game receipt cannot erase unknown usage or an explicit agent pause", async () => {
  const f = await setup();
  const claim = await f.store.claim("one");
  if (!claim) throw Error("claim");
  const allocation = await f.store.reserveCall(claim);
  const id = randomUUID();
  await f.store.pending(claim, id, { kind: "fixture" });
  await f.store.finish(claim, "TRANSPORT_UNCERTAIN");
  await f.store.receipt(claim, { commandId: id, code: "COMMITTED" }, "receipt", {}, true);
  expect((await f.store.agent(claim.agentId)).state).toBe("needs_owner");
  await f.store.recordUsage(allocation, 123, 45);
  expect((await f.pool.query("SELECT status FROM compute_ledger WHERE id=$1", [allocation])).rows[0].status).toBe(
    "unknown",
  );
  expect(
    (await f.pool.query("SELECT input_tokens::int i FROM usage_observations WHERE allocation_id=$1", [allocation]))
      .rows[0].i,
  ).toBe(123);
  await f.store.agentState(claim.agentId, "paused", true);
  await f.store.reviewTurn(claim.id);
  expect((await f.store.agent(claim.agentId)).state).toBe("paused");
});
it("does not infer recovery authorization for historical blocked turns", async () => {
  const f = await setup();
  const claim = await f.store.claim("one");
  if (!claim) throw Error("claim");
  await f.store.reserveCall(claim);
  await f.store.finish(claim, "CODEX_TIMEOUT");
  await f.pool.query("DELETE FROM recovery_operations WHERE turn_id=$1", [claim.id]);
  await expect(f.store.reviewTurn(claim.id)).rejects.toThrow("PAUSED_REVIEW_REQUIRED");
  await f.store.recoverExpired();
  expect((await f.store.agent(claim.agentId)).state).toBe("needs_owner");
});
it("database statements and lock waits have explicit production bounds", async () => {
  const f = await setup();
  expect((await f.pool.query("SHOW statement_timeout")).rows[0].statement_timeout).toBe("20s");
  expect((await f.pool.query("SHOW lock_timeout")).rows[0].lock_timeout).toBe("5s");
});

it("maintenance holds preserve owner intent, drain naturally and expire without resuming a manual pause", async () => {
  const f = await setup();
  const hold = await f.store.beginMaintenance(f.id, "Synthetic release maintenance");
  expect(await f.store.claim("held")).toBeNull();
  expect((await f.store.cohort(f.id)).state).toBe("running");
  await f.store.setState(f.id, "paused", true);
  f.advance(301000);
  await f.store.recoverExpired();
  expect((await f.store.cohort(f.id)).state).toBe("paused");
  expect(
    (await f.pool.query("SELECT released_at FROM maintenance_holds WHERE id=$1", [hold.id])).rows[0].released_at,
  ).not.toBeNull();
});
it("a finite shared Codex allowance gates new paid work while unreviewed consumption is unbounded", async () => {
  const f = await setup(2);
  await f.store.setState(f.id, "paused", true);
  await f.store.configure(f.id, {
    model: { route: "codex-cli", model: "fixture" },
    budget: { ...budget, concurrency: 1, executionAccountingAccepted: true },
  });
  await f.store.setState(f.id, "running", true);
  const first = await f.store.claim("one");
  if (!first) throw Error("claim");
  await f.store.reserveCall(first);
  await f.store.finish(first, "CODEX_TIMEOUT");
  f.advance(450000);
  const second = await f.store.claim("two");
  if (!second) throw Error("unrelated claim");
  await expect(f.store.reserveCall(second)).rejects.toThrow("USAGE_EXPOSURE_GATE");
  expect((await f.store.cohort(f.id)).state).toBe("running");
  expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n).toBe(1);
});

it("recovers a tracked reservation before dispatch without inventing usage or discarding its allocation", async () => {
  const f = await setup();
  const claim = await f.store.claim("dead");
  if (!claim) throw Error("claim");
  await f.store.phase(claim, "model_preparing_tracked");
  const id = await f.store.reserveCall(claim);
  await f.store.phase(claim, "model_reserved_tracked");
  f.advance(121000);
  await f.store.recoverExpired();
  expect(
    (await f.pool.query("SELECT status,tokens::text,input_tokens FROM compute_ledger WHERE id=$1", [id])).rows[0],
  ).toEqual({ status: "not_dispatched", tokens: "40000", input_tokens: null });
  expect((await f.store.agent(claim.agentId)).state).toBe("ready");
  expect((await f.store.publicState()).turns[0].unknown_usage).toBe(false);
});

it("resuming owner intent does not require reconnecting an unrelated account first", async () => {
  const f = await setup(2);
  const agents = (await f.store.publicState()).agents;
  await f.store.setState(f.id, "paused", true);
  await f.pool.query("UPDATE agents SET credential_state='needs_reconnect',state='needs_owner' WHERE id=$1", [
    agents[1].id,
  ]);
  await f.store.setState(f.id, "running", true);
  expect((await f.store.claim("healthy"))?.agentId).toBe(agents[0].id);
  expect((await f.store.agent(agents[1].id)).state).toBe("needs_owner");
});

it("archives a tracked command interrupted before dispatch without inventing a game receipt or replay", async () => {
  const f = await setup();
  const claim = await f.store.claim("dead");
  if (!claim) throw Error("claim");
  const command = randomUUID();
  await f.store.pending(claim, command, { kind: "fixture.action" }, true);
  f.advance(121000);
  await f.store.recoverExpired();
  const resolution = (
    await f.pool.query("SELECT command_id,code,source FROM command_resolutions WHERE command_id=$1", [command])
  ).rows[0];
  expect(resolution).toEqual({ command_id: command, code: "COMMAND_NOT_DISPATCHED", source: "not_dispatched" });
  expect((await f.pool.query("SELECT state,pending_command FROM turns WHERE id=$1", [claim.id])).rows[0]).toEqual({
    state: "finished",
    pending_command: null,
  });
  await expect(f.store.phase(claim, "command_dispatched")).rejects.toThrow("CLAIM_FENCED");
});
