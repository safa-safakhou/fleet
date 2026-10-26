import { afterEach, expect, it } from "vitest";
import type { ModelPort } from "../../src/domain.js";
import { LegacyEngineBridge } from "../../src/engines/legacy/bridge.js";
import { pactAdapter } from "../../src/games/pact/adapter.js";
import { RouteCapacity } from "../../src/platform/admission.js";
import { FakeGame, fixture, ready } from "../helpers.js";
import { platformFixture } from "../platform-helpers.js";

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

it.each([
  { demand: 60, expected: 1 },
  { demand: 25, expected: 4 },
])("bounds concurrent token demand $demand independently of four slots", async ({ demand, expected }) => {
  const f = await platformFixture(4);
  cleanup = () => f.pool.end();
  const group = await f.cohort(4);
  for (const binding of group.bindings) await f.enqueue(binding);
  const claims = [];
  for (let n = 0; n < 4; n++) claims.push(await f.claim());
  const route = new RouteCapacity(
    f.store,
    () => ({ key: "weighted-fixture", capacity: 4, tokenCapacity: 100 }),
    async () => demand,
  );
  let active = 0,
    peak = 0,
    calls = 0;
  const releases: (() => void)[] = [];
  const runs = claims.map((c) =>
    route.run(c.turn, f.request(), async () => {
      active++;
      calls++;
      peak = Math.max(peak, active);
      await new Promise<void>((r) => releases.push(r));
      active--;
    }),
  );
  try {
    await expect.poll(() => calls).toBe(expected);
    expect(active).toBe(expected);
    for (let n = expected; n < 4; n++) {
      releases.shift()?.();
      await expect.poll(() => calls).toBe(n + 1);
    }
  } finally {
    for (const release of releases) release();
    await Promise.allSettled(runs);
  }
  expect(peak).toBe(expected);
  expect((await f.pool.query("SELECT count(*)::int n FROM model_capacity_leases")).rows[0].n).toBe(0);
});

it("refuses a context larger than the token pool before running or reserving inference", async () => {
  const f = await platformFixture(4);
  cleanup = () => f.pool.end();
  await f.enqueue();
  const claim = await f.claim();
  let ran = false;
  const route = new RouteCapacity(
    f.store,
    () => ({ key: "oversized", capacity: 4, tokenCapacity: 100 }),
    async () => 101,
  );
  await expect(
    route.run(claim.turn, f.request(), async () => {
      ran = true;
    }),
  ).rejects.toMatchObject({ code: "PROVIDER_CONTEXT_CAPACITY", notDispatched: true });
  expect(ran).toBe(false);
  expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n).toBe(0);
});
it("treats an existing active lease with unknown token demand conservatively", async () => {
  const f = await platformFixture(4);
  cleanup = () => f.pool.end();
  for (const binding of f.group.bindings) await f.enqueue(binding);
  const first = await f.claim(),
    second = await f.claim();
  const { randomUUID } = await import("node:crypto");
  const id = randomUUID();
  await f.pool.query("INSERT INTO model_capacity_routes(route_key,capacity,token_capacity) VALUES('old-demand',4,100)");
  await f.pool.query(
    "INSERT INTO model_capacity_leases(id,route_key,turn_id,state,expires_at) VALUES($1,'old-demand',$2,'active',$3)",
    [id, first.turn.id, first.turn.deadline],
  );
  const route = new RouteCapacity(
    f.store,
    () => ({ key: "old-demand", capacity: 4, tokenCapacity: 100 }),
    async () => 1,
  );
  let ran = false;
  const run = route.run(second.turn, f.request(), async () => {
    ran = true;
  });
  try {
    await expect
      .poll(
        async () =>
          (await f.pool.query("SELECT count(*)::int n FROM model_capacity_leases WHERE state='queued'")).rows[0].n,
      )
      .toBe(1);
    expect(ran).toBe(false);
  } finally {
    await f.pool.query("DELETE FROM model_capacity_leases WHERE id=$1", [id]);
    await run;
  }
  expect(ran).toBe(true);
});

it.each([1, 2, 4])("shares %s inference slots across four independent tasks", async (capacity) => {
  const f = await platformFixture(capacity);
  cleanup = () => f.pool.end();
  const group = await f.cohort(4);
  for (const binding of group.bindings) await f.enqueue(binding);
  const claims = [];
  for (let i = 0; i < 4; i++) claims.push(await f.claim());
  let active = 0,
    peak = 0,
    calls = 0;
  const releases: Array<() => void> = [];
  const model: ModelPort = {
    decide: async () => {
      calls++;
      active++;
      peak = Math.max(peak, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active--;
      return { decision: { kind: "wait" }, inputTokens: 5, outputTokens: 2 };
    },
  };
  const h = f.host(model);
  const runs = claims.map((c) => h.host.run(c));
  try {
    await expect.poll(() => calls).toBe(capacity);
    expect(active).toBe(capacity);
    for (let started = capacity; started < 4; started++) {
      releases.shift()?.();
      await expect.poll(() => calls).toBe(started + 1);
    }
  } finally {
    for (const release of releases) release();
    await Promise.allSettled(runs);
  }
  expect(peak).toBe(capacity);
  expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger WHERE status='reported'")).rows[0].n).toBe(4);
  expect((await f.pool.query("SELECT count(*)::int n FROM model_capacity_leases")).rows[0].n).toBe(0);
});

it("stops every concurrent legacy inference instead of only the latest", async () => {
  const f = await fixture();
  cleanup = () => f.pool.end();
  await ready(f.store, 2);
  await f.pool.query("UPDATE agents SET next_due_at=$1", [f.now()]);
  const claims = await Promise.all([f.store.claim("one", 2), f.store.claim("two", 2)]);
  if (claims.some((c) => !c)) throw Error("missing claims");
  const signals: AbortSignal[] = [];
  const release = deferred();
  const model: ModelPort = {
    decide: async (input) => {
      signals.push(input.signal);
      await release.promise;
      return { decision: { kind: "wait", summary: "Wait" }, inputTokens: 5, outputTokens: 2 };
    },
  };
  const engine = new LegacyEngineBridge(
    f.store,
    model,
    async (id) => {
      const claim = claims.find((c) => c?.agentId === id);
      if (!claim) throw Error("missing claim");
      return new FakeGame(claim);
    },
    true,
    pactAdapter,
  );
  const runs = claims.map((c) => {
    if (!c) throw Error("missing claim");
    return engine.run(c);
  });
  try {
    await expect.poll(() => signals.length).toBe(2);
    engine.stop();
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  } finally {
    release.resolve();
    await Promise.allSettled(runs);
  }
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it.each([
  { units: 10, expected: 4 },
  { units: 16, expected: 3 },
  { units: 19, expected: 2 },
])(
  "shares physical cache blocks for $units-block requests independently of four slots",
  async ({ units, expected }) => {
    const f = await platformFixture(4);
    cleanup = () => f.pool.end();
    const group = await f.cohort(4);
    for (const binding of group.bindings) await f.enqueue(binding);
    const claims = [];
    for (let n = 0; n < 4; n++) claims.push(await f.claim());
    const route = new RouteCapacity(
      f.store,
      () => ({
        key: "physical-fixture",
        capacity: 4,
        resource: { unit: "kv-cache-blocks.v1", capacity: 55, fingerprint: "a".repeat(64) },
      }),
      async () => ({ tokenUnits: 9760, resourceUnits: units }),
    );
    let calls = 0,
      active = 0,
      peak = 0;
    const releases: (() => void)[] = [];
    const runs = claims.map((c) =>
      route.run(c.turn, f.request(), async () => {
        calls++;
        active++;
        peak = Math.max(peak, active);
        await new Promise<void>((r) => releases.push(r));
        active--;
      }),
    );
    try {
      await expect.poll(() => calls).toBe(expected);
      expect(active).toBe(expected);
      const rows = (
        await f.pool.query("SELECT resource_units,token_units FROM model_capacity_leases WHERE state='active'")
      ).rows;
      expect(rows).toHaveLength(expected);
      expect(rows.every((x) => Number(x.resource_units) === units && Number(x.token_units) === 9760)).toBe(true);
      for (let n = expected; n < 4; n++) {
        releases.shift()?.();
        await expect.poll(() => calls).toBe(n + 1);
      }
    } finally {
      for (const release of releases) release();
      await Promise.allSettled(runs);
    }
    expect(peak).toBe(expected);
    expect((await f.pool.query("SELECT count(*)::int n FROM model_capacity_leases")).rows[0].n).toBe(0);
  },
);
it("pins resource topology and refuses oversized or missing demand before invocation", async () => {
  const f = await platformFixture(4);
  cleanup = () => f.pool.end();
  await f.enqueue();
  const claim = await f.claim();
  const policy = {
    key: "resource-pins",
    capacity: 4,
    resource: { unit: "kv-cache-blocks.v1", capacity: 55, fingerprint: "a".repeat(64) },
  };
  let calls = 0;
  const good = new RouteCapacity(
    f.store,
    () => policy,
    async () => ({ tokenUnits: 9760, resourceUnits: 16 }),
  );
  await good.run(claim.turn, f.request(), async () => {
    calls++;
  });
  const changed = new RouteCapacity(
    f.store,
    () => ({ ...policy, resource: { ...policy.resource, fingerprint: "b".repeat(64) } }),
    async () => ({ tokenUnits: 9760, resourceUnits: 16 }),
  );
  await expect(
    changed.run(claim.turn, f.request(), async () => {
      calls++;
    }),
  ).rejects.toMatchObject({ code: "PROVIDER_CAPACITY_MISMATCH", notDispatched: true });
  for (const demand of [56, NaN, 0]) {
    const bad = new RouteCapacity(
      f.store,
      () => policy,
      async () => ({ tokenUnits: 9760, resourceUnits: demand }),
    );
    await expect(
      bad.run(claim.turn, f.request(), async () => {
        calls++;
      }),
    ).rejects.toMatchObject({ code: "PROVIDER_RESOURCE_CAPACITY", notDispatched: true });
  }
  expect(calls).toBe(1);
});
it("retains full unknown usage when physical capacity is released", async () => {
  const f = await platformFixture(4);
  cleanup = () => f.pool.end();
  await f.enqueue();
  const claim = await f.claim();
  const allocation = await f.store.reserveCall(claim.turn);
  const route = new RouteCapacity(
    f.store,
    () => ({
      key: "resource-uncertainty",
      capacity: 4,
      resource: { unit: "kv-cache-blocks.v1", capacity: 55, fingerprint: "a".repeat(64) },
    }),
    async () => ({ tokenUnits: 9760, resourceUnits: 16 }),
  );
  await route.run(claim.turn, f.request(), async () => {
    await f.store.recordUsage(allocation, null, null);
  });
  const ledger = (
    await f.pool.query("SELECT status,tokens,input_tokens,output_tokens FROM compute_ledger WHERE id=$1", [allocation])
  ).rows[0];
  expect(ledger).toMatchObject({ status: "unknown", input_tokens: null, output_tokens: null });
  expect(Number(ledger.tokens)).toBe(claim.turn.cohort.budget?.perCallTokenLimit);
  expect((await f.pool.query("SELECT count(*)::int n FROM model_capacity_leases")).rows[0].n).toBe(0);
});
it("queues behind unknown old resource demand and cancels without invoking", async () => {
  const f = await platformFixture(4);
  cleanup = () => f.pool.end();
  for (const b of f.group.bindings) await f.enqueue(b);
  const first = await f.claim(),
    second = await f.claim();
  const { randomUUID } = await import("node:crypto");
  const id = randomUUID();
  await f.pool.query(
    "INSERT INTO model_capacity_routes(route_key,capacity,resource_unit,resource_capacity,resource_fingerprint) VALUES('unknown-resource',4,'kv-cache-blocks.v1',55,$1)",
    ["a".repeat(64)],
  );
  await f.pool.query(
    "INSERT INTO model_capacity_leases(id,route_key,turn_id,state,expires_at) VALUES($1,'unknown-resource',$2,'active',$3)",
    [id, first.turn.id, first.turn.deadline],
  );
  const route = new RouteCapacity(
    f.store,
    () => ({
      key: "unknown-resource",
      capacity: 4,
      resource: { unit: "kv-cache-blocks.v1", capacity: 55, fingerprint: "a".repeat(64) },
    }),
    async () => ({ tokenUnits: 9760, resourceUnits: 1 }),
  );
  let ran = false;
  const controller = new AbortController();
  const pending = route.run(second.turn, f.request(controller.signal), async () => {
    ran = true;
  });
  const rejected = expect(pending).rejects.toMatchObject({ notDispatched: true });
  await expect
    .poll(
      async () =>
        (await f.pool.query("SELECT count(*)::int n FROM model_capacity_leases WHERE state='queued'")).rows[0].n,
    )
    .toBe(1);
  expect(ran).toBe(false);
  controller.abort();
  await rejected;
  expect((await f.pool.query("SELECT count(*)::int n FROM model_capacity_leases WHERE state='queued'")).rows[0].n).toBe(
    0,
  );
  await f.pool.query("DELETE FROM model_capacity_leases WHERE id=$1", [id]);
});
