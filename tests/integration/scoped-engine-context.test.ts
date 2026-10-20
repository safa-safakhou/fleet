import { randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { builtinArchitectures } from "../../src/app/builtins.js";
import { createScopedServices, scopedOperationFor } from "../../src/app/host-services.js";
import { FleetError } from "../../src/domain.js";
import type { ScopedServices } from "../../src/platform/engine-context.js";
import { FakeModel } from "../helpers.js";
import { platformFixture } from "../platform-helpers.js";

let end: (() => Promise<void>) | undefined;
afterEach(async () => {
  await end?.();
});
async function setup() {
  const f = await platformFixture();
  end = () => f.pool.end();
  await f.store.consent(f.group.id, true);
  await f.enqueue();
  return f;
}
const definition = () => ({
  ...builtinArchitectures().resolve({ id: "reactive-basic", version: "1" }),
  manifest: {
    ...builtinArchitectures().resolve({ id: "reactive-basic", version: "1" }).manifest,
    ref: { id: "fixture-loop", version: "1" },
    stateCodecs: [{ id: "fixture", version: "v1" }],
  },
});
it("cannot substitute another binding or claim and exposes no concrete host state", async () => {
  const f = await setup(),
    claim = await f.claim();
  let captured: ScopedServices | undefined;
  const h = f.host(new FakeModel(), async (ctx) => {
    captured = await createScopedServices(ctx.claim, definition(), undefined, {
      context: ctx,
      store: f.store,
      tasks: f.tasks,
      bindings: f.bindings,
      model: h.admission,
      commands: h.commands,
    });
    expect(Object.keys(captured)).not.toContain("claim");
    expect(Object.keys(captured)).not.toContain("store");
    const foreignRequest = { messages: [], schema: { type: "object" }, maxOutputTokens: 2000, claim: ctx.claim };
    await expect(captured.model.decide(foreignRequest)).rejects.toThrow("MODEL_REQUEST_NOT_ADMITTED");
    const op = scopedOperationFor(captured);
    expect(op).toMatchObject({ id: claim.turn.id, binding: { id: claim.bindingId }, task: { id: claim.taskId } });
    expect(Object.hasOwn(op, "turn")).toBe(false);
    await expect(
      captured.actions.submit({
        commandId: randomUUID(),
        bindingId: f.group.bindings[1].id,
        schemaId: "board.move.v1",
        payload: { to: "a4" },
      }),
    ).rejects.toThrow("BINDING_MISMATCH");
    await captured.state.accept({ codec: "fixture.v1", expectedVersion: 0, value: { memo: "own memory" } });
    expect(await captured.state.load("fixture.v1")).toEqual({ version: 1, value: { memo: "own memory" } });
    await expect(captured.actions.resolve(randomUUID())).rejects.toThrow("COMMAND_SCOPE_MISMATCH");
  });
  await h.host.run(claim);
  expect(f.board.executions).toBe(0);
  if (!captured) throw Error("scope");
  await expect(captured.observe({})).rejects.toThrow();
  await expect(
    captured.state.accept({ codec: "fixture.v1", expectedVersion: 1, value: { memo: "late" } }),
  ).rejects.toThrow();
});
it("fences a cancelled operation before any port can dispatch or save state", async () => {
  const f = await setup(),
    claim = await f.claim();
  const h = f.host(new FakeModel(), async (ctx) => {
    const services = await createScopedServices(ctx.claim, definition(), undefined, {
      context: ctx,
      store: f.store,
      tasks: f.tasks,
      bindings: f.bindings,
      model: h.admission,
      commands: h.commands,
    });
    await f.tasks.cancel(ctx.claim);
    await expect(
      services.model.decide({ messages: [], schema: { type: "object" }, maxOutputTokens: 2000 }),
    ).rejects.toThrow();
    await expect(services.state.accept({ codec: "fixture.v1", expectedVersion: 0, value: {} })).rejects.toThrow();
  });
  await h.host.run(claim);
  expect((await f.pool.query("SELECT * FROM compute_ledger")).rowCount).toBe(0);
});
it("persists independent allocation dispatch facts before provider entry", async () => {
  const f = await setup(),
    claim = await f.claim();
  let received = false;
  const h = f.host(
    {
      tracksDispatch: true,
      decide: async (request) => {
        const before = (await f.pool.query("SELECT dispatch_state,tracked FROM architecture_allocations")).rows;
        expect(before).toEqual([{ dispatch_state: "prepared", tracked: true }]);
        await request.onDispatch?.();
        expect((await f.pool.query("SELECT dispatch_state FROM architecture_allocations")).rows[0].dispatch_state).toBe(
          "dispatched",
        );
        received = true;
        return { decision: { kind: "wait", summary: "factual wait" }, inputTokens: 10, outputTokens: 5 };
      },
    },
    async (ctx) => {
      const s = await createScopedServices(ctx.claim, definition(), undefined, {
        context: ctx,
        store: f.store,
        tasks: f.tasks,
        bindings: f.bindings,
        model: h.admission,
        commands: h.commands,
      });
      const result = await s.model.decide({ messages: [], schema: { type: "object" }, maxOutputTokens: 2000 });
      expect(result.allocationId).toMatch(/^[a-f0-9-]{36}$/);
    },
  );
  await h.host.run(claim);
  expect(received).toBe(true);
  expect((await f.pool.query("SELECT dispatch_state FROM architecture_allocations")).rows[0].dispatch_state).toBe(
    "settled",
  );
  expect((await f.pool.query("SELECT mode,mode_version FROM architecture_operations")).rows).toEqual([
    { mode: "serial", mode_version: 1 },
  ]);
});
it("recovers per-allocation facts without refunding a dispatched sibling or old unknown", async () => {
  const f = await setup(),
    claim = await f.claim(),
    h = f.host(new FakeModel());
  await createScopedServices(claim, definition(), undefined, {
    context: {
      claim,
      binding: await f.bindings.get(claim.bindingId),
      task: await f.tasks.get(claim.taskId),
      observation: await (await f.board.adapter.connect(await f.bindings.get(claim.bindingId))).observe({}),
      model: h.admission,
      commands: h.commands,
      observe: async () => {
        throw Error("unused");
      },
      eventRefs: [],
      signal: new AbortController().signal,
    },
    store: f.store,
    tasks: f.tasks,
    bindings: f.bindings,
    model: h.admission,
    commands: h.commands,
  });
  const first = await f.store.reserveCall(claim.turn),
    second = await f.store.reserveCall(claim.turn);
  await f.pool.query(
    "UPDATE architecture_allocations SET tracked=true,dispatch_state=CASE WHEN allocation_id=$1 THEN 'prepared' ELSE 'dispatched' END WHERE turn_id=$2",
    [first, claim.turn.id],
  );
  await f.store.phase(claim.turn, "model_reserved_tracked");
  f.advance(121000);
  await f.store.recoverExpired();
  await f.tasks.recover();
  expect(
    (await f.pool.query("SELECT id,status,tokens::text FROM compute_ledger ORDER BY id")).rows.sort((a, b) =>
      a.id.localeCompare(b.id),
    ),
  ).toEqual(
    [
      { id: first, status: "not_dispatched", tokens: "40000" },
      { id: second, status: "unknown", tokens: "40000" },
    ].sort((a, b) => a.id.localeCompare(b.id)),
  );
  await f.store.recoverExpired();
  expect((await f.pool.query("SELECT status FROM compute_ledger WHERE id=$1", [second])).rows[0].status).toBe(
    "unknown",
  );
});
it("keeps state and retained evidence private to the bound actor and consent", async () => {
  const f = await setup();
  let first: string | undefined;
  const one = f.host(new FakeModel(), async (ctx) => {
    const s = await createScopedServices(ctx.claim, definition(), undefined, {
      context: ctx,
      store: f.store,
      tasks: f.tasks,
      bindings: f.bindings,
      model: one.admission,
      commands: one.commands,
    });
    first = (
      await s.evidence.capture({ kind: "receipt", detail: { summary: "private" }, sourceRefs: ["fixture:owned"] })
    ).id;
    expect((await s.evidence.retained([first])).map((e) => e.id)).toEqual([first]);
  });
  await one.host.run(await f.claim());
  await f.enqueue(f.group.bindings[1], "other", "other:source");
  const two = f.host(new FakeModel(), async (ctx) => {
    const s = await createScopedServices(ctx.claim, definition(), undefined, {
      context: ctx,
      store: f.store,
      tasks: f.tasks,
      bindings: f.bindings,
      model: two.admission,
      commands: two.commands,
    });
    expect(await s.state.load("fixture.v1")).toBeNull();
    expect(await s.evidence.retained(first ? [first] : [])).toEqual([]);
  });
  await two.host.run(await f.claim());
});

it("settles a modern prepared allocation when cancellation happens before invocation", async () => {
  const f = await setup(),
    claim = await f.claim();
  let id = "";
  const h = f.host(new FakeModel(), async (ctx) => {
    await createScopedServices(ctx.claim, definition(), undefined, {
      context: ctx,
      store: f.store,
      tasks: f.tasks,
      bindings: f.bindings,
      model: h.admission,
      commands: h.commands,
    });
    id = await f.store.reserveCall(ctx.claim.turn);
    await f.tasks.cancel(ctx.claim);
  });
  await h.host.run(claim);
  expect((await f.pool.query("SELECT status FROM compute_ledger WHERE id=$1", [id])).rows[0].status).toBe(
    "not_dispatched",
  );
});

it.each([
  [true, true, 2, "sibling-reasoning"],
  [true, false, 2, "serial"],
  [false, true, 2, "serial"],
  [true, true, 1, "serial"],
] as const)(
  "intersects declared sibling mode with environment and provider: %s %s %s",
  async (environment, provider, capacity, want) => {
    const f = await platformFixture(capacity);
    end = () => f.pool.end();
    f.board.adapter.capabilities.parallelReasoning = environment;
    await f.enqueue();
    const claim = await f.claim(),
      h = f.host(new FakeModel(), async (ctx) => {
        const d = definition();
        d.manifest.executionModes = ["serial", "sibling-reasoning"];
        const bound = { ...ctx, model: h.admission.guarded(async () => {}, provider) };
        await createScopedServices(bound.claim, d, undefined, {
          context: bound,
          store: f.store,
          tasks: f.tasks,
          bindings: f.bindings,
          model: h.admission,
          commands: h.commands,
        });
        expect(
          (await f.pool.query("SELECT mode FROM architecture_operations WHERE turn_id=$1", [claim.turn.id])).rows[0]
            .mode,
        ).toBe(want);
      });
    await h.host.run(claim);
  },
);

it("retains unknown spend when the legacy raw-provider bridge dispatches before crashing", async () => {
  const f = await setup(),
    claim = await f.claim();
  let allocation = "";
  const provider = {
    tracksDispatch: true,
    decide: async (request: Parameters<import("../../src/domain.js").ModelPort["decide"]>[0]) => {
      await request.onDispatch?.();
      throw new FleetError("TRANSPORT_UNCERTAIN");
    },
  };
  const h = f.host(new FakeModel(), async (ctx) => {
    await createScopedServices(ctx.claim, definition(), undefined, {
      context: ctx,
      store: f.store,
      tasks: f.tasks,
      bindings: f.bindings,
      model: h.admission,
      commands: h.commands,
    });
    allocation = await f.store.reserveCall(ctx.claim.turn);
    await f.route.wrap(provider, () => ctx.claim.turn).decide(f.request(ctx.signal));
  });
  await expect(h.host.run(claim)).rejects.toThrow("TRANSPORT_UNCERTAIN");
  expect((await f.pool.query("SELECT status FROM compute_ledger WHERE id=$1", [allocation])).rows[0].status).toBe(
    "unknown",
  );
});
