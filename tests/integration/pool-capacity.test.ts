import { afterEach, expect, it } from "vitest";
import { FleetError, type ModelPort } from "../../src/domain.js";
import { LegacyEngineBridge } from "../../src/engines/legacy/bridge.js";
import { pactAdapter } from "../../src/games/pact/adapter.js";
import { RouteCapacity } from "../../src/platform/admission.js";
import { TaskStore } from "../../src/platform/tasks.js";
import { FakeGame, fixture, ready } from "../helpers.js";
import { platformFixture } from "../platform-helpers.js";

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

it("backfills spare cache behind a large waiter without exceeding physical capacity", async () => {
  const f = await platformFixture(4);
  cleanup = () => f.pool.end();
  const group = await f.cohort(3);
  for (const binding of group.bindings) await f.enqueue(binding);
  const claims = [await f.claim(), await f.claim(), await f.claim()];
  const abort = new AbortController(),
    release = deferred();
  const route = new RouteCapacity(
    f.store,
    () => ({
      key: "backfill",
      capacity: 4,
      resource: { unit: "kv-cache-blocks.v1", capacity: 92, fingerprint: "a".repeat(64) },
    }),
    async (r) => ({ tokenUnits: 100, resourceUnits: Number(r.messages[0].content) }),
  );
  const seen: number[] = [];
  const run = (n: number, blocks: number) =>
    route
      .run(
        claims[n].turn,
        { ...f.request(abort.signal), messages: [{ role: "user", content: String(blocks) }] },
        async () => {
          seen.push(n);
          const sum = (
            await f.pool.query("SELECT sum(resource_units)::int n FROM model_capacity_leases WHERE state='active'")
          ).rows[0].n;
          expect(sum).toBeLessThanOrEqual(92);
          await release.promise;
        },
      )
      .catch((e) => {
        if (!abort.signal.aborted) throw e;
      });
  const runs = [run(0, 55)];
  try {
    await expect.poll(() => seen).toEqual([0]);
    runs.push(run(1, 54));
    await expect
      .poll(
        async () =>
          (await f.pool.query("SELECT count(*)::int n FROM model_capacity_leases WHERE state='queued'")).rows[0].n,
      )
      .toBe(1);
    runs.push(run(2, 32));
    await expect.poll(() => seen, { timeout: 1000 }).toEqual([0, 2]);
  } finally {
    abort.abort();
    release.resolve();
    await Promise.all(runs);
  }
});

it("lets unrelated work claim an execution slot while an inference turn waits, preserving the original turn", async () => {
  const f = await platformFixture(4);
  cleanup = () => f.pool.end();
  const tasks = new TaskStore(f.store, f.bindings, 2, f.environments);
  const group = await f.cohort(3);
  for (const binding of group.bindings) await f.enqueue(binding);
  const first = await tasks.claim("worker", f.now()),
    second = await tasks.claim("worker", f.now());
  if (!first || !second) throw Error("FIXTURE_CLAIMS_REQUIRED");
  const route = new RouteCapacity(f.store, () => ({ key: "worker-wait", capacity: 1 }), undefined, {
    workerCapacity: 2,
  });
  const abort = new AbortController(),
    release = deferred();
  let started = false,
    resumed = false;
  const active = route.run(first.turn, f.request(abort.signal), async () => {
    started = true;
    await release.promise;
  });
  const runs = [active];
  try {
    await expect.poll(() => started).toBe(true);
    runs.push(
      route
        .run(second.turn, f.request(abort.signal), async () => {
          resumed = true;
        })
        .catch((e) => {
          if (!abort.signal.aborted) throw e;
        }),
    );
    await expect
      .poll(
        async () =>
          (await f.pool.query("SELECT count(*)::int n FROM model_capacity_leases WHERE state='queued'")).rows[0].n,
      )
      .toBe(1);
    const third = await tasks.claim("worker-2", f.now());
    expect(third).not.toBeNull();
    expect(third?.turn.agentId).not.toBe(second.turn.agentId);
    expect(
      (await f.pool.query("SELECT state,fence,deadline_at FROM turns WHERE id=$1", [second.turn.id])).rows[0],
    ).toMatchObject({ state: "running", fence: String(second.turn.fence), deadline_at: second.turn.deadline });
    expect(await tasks.claim("worker-3", f.now())).toBeNull();
    release.resolve();
    await active;
    expect(resumed).toBe(false); // Provider is free, but the first turn still owns an execution slot.
    await f.store.finish(first.turn, "WAIT");
    await expect.poll(() => resumed).toBe(true);
    expect(
      (await f.pool.query("SELECT count(*)::int n FROM turns WHERE state='running' AND NOT worker_waiting")).rows[0].n,
    ).toBe(2);
  } finally {
    abort.abort();
    release.resolve();
    await Promise.all(runs);
  }
});

it("reserves capacity for an older large waiter after four backfills", async () => {
  const f = await platformFixture(4);
  cleanup = () => f.pool.end();
  const group = await f.cohort(3);
  for (const binding of group.bindings) await f.enqueue(binding);
  const claims = [await f.claim(), await f.claim(), await f.claim()];
  const abort = new AbortController(),
    release = deferred(),
    order: string[] = [];
  const route = new RouteCapacity(
    f.store,
    () => ({ key: "fair-backfill", capacity: 4, tokenCapacity: 100 }),
    async (r) => Number(r.messages[0].content),
  );
  const run = (n: number, units: number, name: string, hold = false) =>
    route.run(
      claims[n].turn,
      { ...f.request(abort.signal), messages: [{ role: "user", content: String(units) }] },
      async () => {
        order.push(name);
        if (hold) await release.promise;
      },
    );
  const active = run(0, 60, "active", true);
  let large: Promise<unknown> | undefined, last: Promise<unknown> | undefined;
  try {
    await expect.poll(() => order).toEqual(["active"]);
    large = run(1, 60, "large").catch((e) => {
      if (!abort.signal.aborted) throw e;
    });
    await expect
      .poll(
        async () =>
          (await f.pool.query("SELECT count(*)::int n FROM model_capacity_leases WHERE state='queued'")).rows[0].n,
      )
      .toBe(1);
    for (let i = 0; i < 4; i++) await run(2, 30, `small-${i}`);
    last = run(2, 30, "last").catch((e) => {
      if (!abort.signal.aborted) throw e;
    });
    await expect
      .poll(
        async () =>
          (await f.pool.query("SELECT count(*)::int n FROM model_capacity_leases WHERE state='queued'")).rows[0].n,
      )
      .toBe(2);
    expect(order).toEqual(["active", "small-0", "small-1", "small-2", "small-3"]);
    release.resolve();
    await Promise.all([active, large, last]);
    expect(order.slice(-2)).toEqual(["large", "last"]);
  } finally {
    abort.abort();
    release.resolve();
    await Promise.allSettled([active, large, last]);
  }
});

it("bounds outstanding turns across workers even when additional execution slots are free", async () => {
  const f = await platformFixture(4);
  cleanup = () => f.pool.end();
  const tasks = new TaskStore(f.store, f.bindings, 2, f.environments),
    group = await f.cohort(4);
  for (const binding of [...group.bindings, ...f.group.bindings]) await f.enqueue(binding);
  const abort = new AbortController(),
    release = deferred(),
    route = new RouteCapacity(f.store, () => ({ key: "bounded-waiters", capacity: 1 }), undefined, {
      workerCapacity: 2,
    });
  const runs: Promise<unknown>[] = [];
  let started = false;
  try {
    const first = await tasks.claim("worker-1", f.now());
    if (!first) throw Error("NO_CLAIM");
    runs.push(
      route.run(first.turn, f.request(abort.signal), async () => {
        started = true;
        await release.promise;
      }),
    );
    await expect.poll(() => started).toBe(true);
    for (let i = 0; i < 3; i++) {
      const c = await tasks.claim(`worker-${i + 2}`, f.now());
      expect(c).not.toBeNull();
      runs.push(
        route
          .run(c!.turn, f.request(abort.signal), async () => {})
          .catch((e) => {
            if (!abort.signal.aborted) throw e;
          }),
      );
      await expect
        .poll(
          async () =>
            (await f.pool.query("SELECT count(*)::int n FROM turns WHERE state='running' AND worker_waiting")).rows[0]
              .n,
        )
        .toBe(i + 1);
    }
    expect(await tasks.claim("worker-5", f.now())).toBeNull();
    expect(await f.store.claim("legacy-worker", 2)).toBeNull();
  } finally {
    // End the synthetic parent claims before draining cancelled continuations.
    await f.store.setState(group.id, "paused", true);
    await f.store.setState(f.group.id, "paused", true);
    abort.abort();
    release.resolve();
    await Promise.allSettled(runs);
  }
});

it("removes a queued call as soon as the model-start window drains", async () => {
  const f = await platformFixture(2);
  cleanup = () => f.pool.end();
  for (const binding of f.group.bindings) await f.enqueue(binding);
  const first = await f.claim(),
    second = await f.claim(),
    release = deferred();
  let draining = false,
    started = false,
    dispatched = false;
  const route = new RouteCapacity(f.store, () => ({ key: "draining-waiters", capacity: 1 }), undefined, {
    workerCapacity: 2,
    assertWaiting: () => {
      if (draining) throw new FleetError("RUN_WINDOW_MODEL_DRAINING", true);
    },
  });
  const active = route.run(first.turn, f.request(), async () => {
    started = true;
    await release.promise;
  });
  try {
    await expect.poll(() => started).toBe(true);
    const queued = route
      .run(second.turn, f.request(), async () => {
        dispatched = true;
      })
      .catch((e) => e);
    await expect
      .poll(
        async () =>
          (await f.pool.query("SELECT count(*)::int n FROM model_capacity_leases WHERE state='queued'")).rows[0].n,
      )
      .toBe(1);
    draining = true;
    expect(await queued).toMatchObject({ code: "RUN_WINDOW_MODEL_DRAINING", notDispatched: true });
    expect(dispatched).toBe(false);
    expect(
      (await f.pool.query("SELECT worker_waiting FROM turns WHERE id=$1", [second.turn.id])).rows[0].worker_waiting,
    ).toBe(false);
  } finally {
    release.resolve();
    await active;
  }
});

it.each(["MODEL_DEADLINE_EXCEEDED", "TURN_DEADLINE_EXCEEDED", "DEADLINE_MISSED", "HOST_STOPPED"])(
  "preserves %s while queued and never dispatches cancelled work",
  async (code) => {
    const f = await platformFixture(2);
    cleanup = () => f.pool.end();
    const group = await f.cohort(2);
    for (const binding of group.bindings) await f.enqueue(binding);
    const first = await f.claim(),
      second = await f.claim();
    const route = new RouteCapacity(f.store, () => ({ key: "cancel-fixture", capacity: 1 }), undefined, {
      workerCapacity: 2,
    });
    let release!: () => void,
      admitted = false,
      invoked = false;
    const running = route.run(first.turn, f.request(), async () => {
      admitted = true;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    try {
      await expect.poll(() => admitted).toBe(true);
      const controller = new AbortController();
      const queued = route
        .run(second.turn, { ...f.request(), signal: controller.signal }, async () => {
          invoked = true;
        })
        .catch((error: unknown) => error);
      await expect
        .poll(
          async () =>
            (await f.pool.query("SELECT count(*)::int n FROM model_capacity_leases WHERE state='queued'")).rows[0].n,
        )
        .toBe(1);
      controller.abort(new FleetError(code));
      expect(await queued).toMatchObject({ code, notDispatched: true });
      expect(invoked).toBe(false);
      expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n).toBe(0);
    } finally {
      release?.();
      await running;
    }
    expect((await f.pool.query("SELECT count(*)::int n FROM model_capacity_leases")).rows[0].n).toBe(0);
  },
);

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
