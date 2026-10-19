import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { FleetError } from "../../src/domain.js";
import { Observability } from "../../src/observability.js";
import { CommandExecutor } from "../../src/platform/execution.js";
import { TaskStore } from "../../src/platform/tasks.js";
import { FakeModel } from "../helpers.js";
import { platformFixture } from "../platform-helpers.js";

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  vi.restoreAllMocks();
  await cleanup?.();
});
async function setup() {
  const f = await platformFixture();
  cleanup = () => f.pool.end();
  await f.enqueue();
  return f;
}
it("recovers a crash before reserve without fabricating usage", async () => {
  const f = await setup(),
    c = await f.claim();
  f.advance(121000);
  await f.store.recoverExpired();
  const tasks = new TaskStore(f.store, f.bindings, 4);
  await tasks.recover();
  expect((await tasks.get(c.taskId)).state).toBe("ready");
  expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n).toBe(0);
  expect((await tasks.claim("replacement", f.now()))?.turn.id).not.toBe(c.turn.id);
  await expect(tasks.check(c)).rejects.toThrow("TASK_FENCED");
});
it("retains unknown allocations across restart after reserve", async () => {
  const f = await setup(),
    c = await f.claim();
  await f.store.reserveCall(c.turn);
  await f.store.phase(c.turn, "model_reserved");
  f.advance(121000);
  await f.store.recoverExpired();
  const tasks = new TaskStore(f.store, f.bindings, 4);
  await tasks.recover();
  expect((await tasks.get(c.taskId)).state).toBe("blocked");
  expect((await f.pool.query("SELECT status,tokens::text FROM compute_ledger")).rows).toEqual([
    { status: "unknown", tokens: "40000" },
  ]);
  expect(await tasks.claim("replacement", f.now())).toBeNull();
});
it("retains a tracked not-dispatched allocation without making it unknown", async () => {
  const f = await setup(),
    c = await f.claim();
  await f.store.reserveCall(c.turn);
  await f.store.phase(c.turn, "model_reserved_tracked");
  f.advance(121000);
  await f.store.recoverExpired();
  await f.tasks.recover();
  expect((await f.pool.query("SELECT status,tokens::text FROM compute_ledger")).rows).toEqual([
    { status: "not_dispatched", tokens: "40000" },
  ]);
  expect((await f.tasks.get(c.taskId)).state).toBe("ready");
});
it("settles a prepared but undispatched command without submitting it", async () => {
  const f = await setup(),
    c = await f.claim(),
    h = f.host(new FakeModel()),
    id = randomUUID();
  await h.commands.prepare(c, {
    commandId: id,
    bindingId: c.bindingId,
    schemaId: "board.move.v1",
    payload: { to: "a4" },
  });
  f.advance(121000);
  await f.store.recoverExpired();
  await f.tasks.recover();
  expect(f.board.executions).toBe(0);
  expect(await h.commands.reconcile(c.turn.id)).toMatchObject({
    commandId: id,
    status: "rejected",
    code: "COMMAND_NOT_DISPATCHED",
    sourceRefs: [],
  });
  expect(
    (await f.pool.query("SELECT pending_command FROM turns WHERE id=$1", [c.turn.id])).rows[0].pending_command,
  ).toBeNull();
  expect((await f.pool.query("SELECT command_id,source FROM command_resolutions")).rows).toEqual([
    { command_id: id, source: "not_dispatched" },
  ]);
});
it("reconciles the original command after server commit but lost response", async () => {
  const f = await setup(),
    c = await f.claim(),
    h = f.host(new FakeModel()),
    id = randomUUID(),
    originalConnect = f.board.adapter.connect;
  f.board.adapter.connect = async (binding) => {
    const session = await originalConnect(binding);
    return {
      ...session,
      execute: async (intent) => {
        await session.execute(intent);
        throw Error("TRANSPORT_UNCERTAIN");
      },
    };
  };
  const outcome = await h.commands.submit(c, {
    commandId: id,
    bindingId: c.bindingId,
    schemaId: "board.move.v1",
    payload: { to: "a4" },
  });
  expect(outcome.status).toBe("unknown");
  await f.tasks.finish(c, "TRANSPORT_UNCERTAIN");
  expect(
    (await f.pool.query("SELECT pending_command FROM turns WHERE id=$1", [c.turn.id])).rows[0].pending_command,
  ).toBe(id);
  const restarted = new CommandExecutor(f.store, new TaskStore(f.store, f.bindings, 4), f.bindings, f.environments);
  expect(await restarted.reconcile(c.turn.id)).toMatchObject({ commandId: id, status: "confirmed" });
  await f.tasks.recover();
  expect(f.board.executions).toBe(1);
  expect((await f.pool.query("SELECT command_id FROM command_resolutions")).rows).toEqual([{ command_id: id }]);
  expect((await f.tasks.get(c.taskId)).state).toBe("completed");
});
it("does not repeat a completed task after acknowledgement loss", async () => {
  const f = await setup(),
    c = await f.claim(),
    model = new FakeModel(),
    h = f.host(model);
  await h.host.run(c);
  const restarted = new TaskStore(f.store, f.bindings, 4);
  await restarted.recover();
  expect(await restarted.claim("replacement", f.now())).toBeNull();
  expect(model.inputs).toHaveLength(1);
});
it("keeps known non-dispatch failures and output usage distinct", async () => {
  const f = await setup(),
    c = await f.claim(),
    h = f.host({
      tracksDispatch: true,
      decide: async () => {
        throw new FleetError("MODEL_ENDPOINT_REQUIRED", true);
      },
    });
  await expect(h.host.run(c)).rejects.toThrow("MODEL_ENDPOINT_REQUIRED");
  expect((await f.pool.query("SELECT status,tokens::text FROM compute_ledger")).rows).toEqual([
    { status: "not_dispatched", tokens: "40000" },
  ]);
  expect((await f.tasks.get(c.taskId)).state).toBe("waiting");
});

it("returns the exact original receipt when an already settled command is repeated", async () => {
  const f = await setup(),
    c = await f.claim(),
    h = f.host(new FakeModel()),
    a = { commandId: randomUUID(), bindingId: c.bindingId, schemaId: "board.move.v1", payload: { to: "a4" } },
    b = { ...a, commandId: randomUUID(), payload: { to: "a5" } };
  await h.commands.submit(c, a);
  await h.commands.submit(c, b);
  expect(await h.commands.submit(c, a)).toMatchObject({ commandId: a.commandId, status: "confirmed" });
  expect(await h.commands.submit(c, b)).toMatchObject({ commandId: b.commandId, status: "confirmed" });
  expect(f.board.executions).toBe(2);
});

it("settles a proven local non-dispatch rejection without stranding a pending command", async () => {
  const f = await setup(),
    c = await f.claim(),
    h = f.host(new FakeModel()),
    id = randomUUID(),
    connect = f.board.adapter.connect;
  f.board.adapter.connect = async (binding) => {
    const session = await connect(binding);
    return {
      ...session,
      execute: async () => {
        throw new FleetError("INVALID_ACTION_INTENT", true);
      },
    };
  };
  expect(
    await h.commands.submit(c, {
      commandId: id,
      bindingId: c.bindingId,
      schemaId: "board.move.v1",
      payload: { to: "a4" },
    }),
  ).toMatchObject({ status: "rejected", code: "INVALID_ACTION_INTENT" });
  expect(
    (await f.pool.query("SELECT pending_command FROM turns WHERE id=$1", [c.turn.id])).rows[0].pending_command,
  ).toBeNull();
  expect(f.board.executions).toBe(0);
});

it("preserves the compatibility controller's existing owner-recovery result", async () => {
  const f = await setup(),
    c = await f.claim(),
    h = f.host(new FakeModel(), async (ctx) => {
      await f.store.finish(ctx.claim.turn, "AUTH_REQUIRED");
    });
  await h.host.run(c);
  expect((await f.pool.query("SELECT state,code FROM turns WHERE id=$1", [c.turn.id])).rows[0]).toEqual({
    state: "needs_owner",
    code: "AUTH_REQUIRED",
  });
  expect((await f.tasks.get(c.taskId)).state).toBe("blocked");
});

it("records proved non-dispatch when telemetry fails before provider invocation", async () => {
  const f = await setup(),
    c = await f.claim(),
    model = new FakeModel(),
    h = f.host(model);
  vi.spyOn(Observability.prototype, "recordDebug").mockRejectedValueOnce(new Error("OBSERVABILITY_UNAVAILABLE"));
  await expect(h.host.run(c)).rejects.toThrow("OBSERVABILITY_UNAVAILABLE");
  expect(model.inputs).toHaveLength(0);
  expect((await f.pool.query("SELECT status,tokens::text FROM compute_ledger")).rows).toEqual([
    { status: "not_dispatched", tokens: "40000" },
  ]);
});
