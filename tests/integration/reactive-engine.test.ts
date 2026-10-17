import { Pool } from "pg";
import { afterEach, expect, it } from "vitest";
import { ReactiveEngine } from "../../src/engines/reactive/engine.js";
import { Bindings } from "../../src/platform/bindings.js";
import type { EnvironmentEvent, EventPage } from "../../src/platform/contracts.js";
import { EventIntake } from "../../src/platform/event-intake.js";
import { TaskStore } from "../../src/platform/tasks.js";
import { Store } from "../../src/store.js";
import { Vault } from "../../src/vault.js";
import { FakeModel, key, testUrl } from "../helpers.js";
import { platformFixture } from "../platform-helpers.js";

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
});
const policy = {
  enabled: true,
  categories: ["completion", "conversation", "raid"],
  quietCategories: ["conversation"],
  periodicReviewMinutes: 15,
};
async function setup() {
  const f = await platformFixture();
  cleanup = () => f.pool.end();
  await f.store.setState(f.group.id, "paused", true);
  await f.tasks.enroll(f.group.id, { id: "reactive-basic", version: "1" });
  f.board.adapter.capabilities.events = "poll";
  const original = f.board.adapter.connect;
  f.board.adapter.connect = async (b) => ({
    ...(await original(b)),
    events: async (cursor) => ({ events: [], nextCursor: cursor, resyncRequired: false }),
  });
  const intake = new EventIntake(f.tasks, f.bindings, f.environments);
  return { ...f, intake };
}
function event(
  id: string,
  category = "completion",
  groupRef = "development",
  deadline?: EnvironmentEvent["deadline"],
): EnvironmentEvent {
  return {
    id,
    type: "fixture.changed.v1",
    sourceRef: "source:" + id,
    observedAt: "2026-10-17T12:00:00.000Z",
    environmentTime: { clockId: "board.ply", value: "0" },
    ...(deadline ? { deadline } : {}),
    metadata: { category, groupRef },
  };
}
const page = (events: EnvironmentEvent[], cursor = "page:1", fromCursor: string | null = null): EventPage => ({
  events,
  nextCursor: cursor,
  resyncRequired: false,
  fromCursor,
});
it("groups two completions for one goal and keeps three conversations separate", async () => {
  const f = await setup();
  await f.intake.enroll(f.group.id, policy);
  await f.intake.ingest(
    f.group.bindings[0],
    page([
      event("a"),
      event("b"),
      ...Array.from({ length: 3 }, (_, i) => event("m" + i, "conversation", "conversation:" + i)),
    ]),
  );
  const tasks = (await f.pool.query("SELECT task_key FROM platform_tasks ORDER BY task_key")).rows;
  expect(tasks).toHaveLength(4);
  const goal = (await f.pool.query("SELECT id FROM platform_tasks WHERE task_key='event:completion:development'"))
    .rows[0];
  expect((await f.tasks.get(goal.id)).sourceCount).toBe(2);
});
it("does not infer on receipt without enrollment", async () => {
  const f = await setup();
  await expect(f.intake.ingest(f.group.bindings[0], page([event("a")]))).rejects.toThrow("EVENT_ENROLLMENT_REQUIRED");
  expect((await f.pool.query("SELECT * FROM platform_tasks")).rowCount).toBe(0);
  expect((await f.pool.query("SELECT * FROM compute_ledger")).rowCount).toBe(0);
});
it("deduplicates after restart and advances the cursor atomically with tasks", async () => {
  const f = await setup();
  await f.intake.enroll(f.group.id, policy);
  const b = f.group.bindings[0];
  expect((await f.intake.ingest(b, page([event("a")]))).inserted).toBe(1);
  const restarted = new EventIntake(f.tasks, f.bindings, f.environments);
  expect((await restarted.ingest(b, page([event("a")], "page:2", "page:1"))).inserted).toBe(0);
  await expect(
    restarted.ingest(b, page([event("b"), event("bad", "completion", "x".repeat(300))], "page:3", "page:2")),
  ).rejects.toThrow();
  expect(await restarted.cursor(b)).toBe("page:2");
  expect((await f.pool.query("SELECT count(*)::int n FROM platform_task_sources")).rows[0].n).toBe(1);
  await expect(restarted.ingest(b, page([event("late")], "older", null))).rejects.toThrow("STALE_EVENT_PAGE");
});
it("resyncs expired cursor without fabricated history", async () => {
  const f = await setup();
  await f.intake.enroll(f.group.id, policy);
  const b = f.group.bindings[0];
  let snapshots = 0;
  const connect = f.board.adapter.connect;
  f.board.adapter.connect = async (b) => {
    const s = await connect(b);
    return {
      ...s,
      observe: async (q) => {
        snapshots++;
        return s.observe(q);
      },
      events: async (cursor) => ({
        events: [],
        nextCursor: null,
        resyncRequired: true,
        resumeFrom: "fresh",
        fromCursor: cursor,
      }),
    };
  };
  await f.intake.poll(b);
  expect(snapshots).toBe(1);
  expect(await f.intake.cursor(b)).toBe("fresh");
  expect((await f.pool.query("SELECT * FROM environment_event_gaps")).rowCount).toBe(1);
  expect((await f.pool.query("SELECT * FROM environment_event_receipts")).rowCount).toBe(0);
  expect((await f.pool.query("SELECT task_key FROM platform_tasks")).rows).toEqual([{ task_key: "resync_review" }]);
});
it("marks missed battle lock before model dispatch", async () => {
  const f = await setup();
  await f.intake.enroll(f.group.id, policy);
  await f.intake.ingest(
    f.group.bindings[0],
    page([event("raid", "raid", "raid:1", { clockId: "board.ply", value: "0" })]),
  );
  await f.store.setState(f.group.id, "running", true);
  const c = await f.claim(),
    model = new FakeModel(),
    h = f.host(model);
  h.engines.register(new ReactiveEngine());
  await expect(h.host.run(c)).rejects.toThrow("DEADLINE_MISSED");
  expect(model.inputs).toHaveLength(0);
  expect((await f.tasks.get(c.taskId)).code).toBe("DEADLINE_MISSED");
});
it("coalesces a flood, applies quiet categories and uses the shared model allowance", async () => {
  const f = await setup();
  await f.intake.enroll(f.group.id, policy);
  const b = f.group.bindings[0];
  const flood = Array.from({ length: 100 }, (_, i) => event("a" + i));
  await f.intake.ingest(b, page(flood.slice(0, 50)));
  await f.intake.ingest(
    b,
    page(
      [
        ...flood.slice(50),
        {
          ...event("quiet", "conversation", "peer"),
          metadata: { category: "conversation", groupRef: "peer", quiet: true },
        },
      ].slice(0, 50),
      "page:2",
      "page:1",
    ),
  );
  await f.intake.ingest(
    b,
    page(
      [
        {
          ...event("quiet", "conversation", "peer"),
          metadata: { category: "conversation", groupRef: "peer", quiet: true },
        },
      ],
      "page:3",
      "page:2",
    ),
  );
  expect((await f.pool.query("SELECT * FROM platform_tasks")).rowCount).toBe(1);
  await f.store.setState(f.group.id, "running", true);
  const model = new FakeModel([{ kind: "wait", summary: "No action needed" }]),
    h = f.host(model);
  h.engines.register(new ReactiveEngine());
  const c = await f.claim();
  await h.host.run(c);
  expect(model.inputs).toHaveLength(1);
  expect((await f.tasks.get(c.taskId)).sourceCount).toBe(100);
  expect((await f.pool.query("SELECT calls FROM turns WHERE id=$1", [c.turn.id])).rows[0].calls).toBe(1);
});

it("preserves timed reviews and waits for a new source without spinning", async () => {
  const f = await setup();
  await f.intake.enroll(f.group.id, policy);
  const b = f.group.bindings[0];
  await f.intake.review(b);
  f.advance(15 * 60000);
  await f.intake.review(b);
  expect((await f.pool.query("SELECT * FROM platform_tasks WHERE task_key='periodic_review'")).rowCount).toBe(1);
  await f.intake.ingest(b, page([event("a")]));
  await f.store.setState(f.group.id, "running", true);
  const model = new FakeModel([{ kind: "wait", summary: "Wait for changed evidence", untilNextEvent: true }]),
    h = f.host(model);
  h.engines.register(new ReactiveEngine());
  const c = await f.claim();
  await h.host.run(c);
  expect((await f.tasks.get(c.taskId)).state).toBe("waiting");
  expect(model.inputs).toHaveLength(1);
});
it("rejects a feed capability mismatch before dispatch", async () => {
  const f = await setup();
  f.board.adapter.capabilities.events = "none";
  await f.intake.enroll(f.group.id, policy);
  await expect(f.intake.poll(f.group.bindings[0])).rejects.toThrow("UNSUPPORTED_CAPABILITY");
  expect((await f.pool.query("SELECT * FROM compute_ledger")).rowCount).toBe(0);
});

it("performs a fresh read then a single exact action through shared receipts", async () => {
  const f = await setup();
  await f.intake.enroll(f.group.id, policy);
  await f.intake.ingest(f.group.bindings[0], page([event("a")]));
  await f.store.setState(f.group.id, "running", true);
  const model = new FakeModel([
      { kind: "read", query: {}, summary: "Check current facts" },
      { kind: "action", schemaId: "board.move.v1", payload: { to: "a4" }, summary: "Move" },
    ]),
    h = f.host(model);
  h.engines.register(new ReactiveEngine());
  const c = await f.claim();
  await h.host.run(c);
  expect(model.inputs).toHaveLength(2);
  expect(f.board.executions).toBe(1);
  expect((await f.pool.query("SELECT state FROM platform_commands")).rows).toEqual([{ state: "confirmed" }]);
});
it("uses current snapshots after out-of-order events and discloses omitted input", async () => {
  const f = await setup();
  await f.intake.enroll(f.group.id, policy);
  await f.intake.ingest(
    f.group.bindings[0],
    page([{ ...event("new"), environmentTime: { clockId: "board.ply", value: "99" } }, event("older")]),
  );
  const connect = f.board.adapter.connect;
  f.board.adapter.connect = async (b) => {
    const s = await connect(b);
    return {
      ...s,
      observe: async (q) => ({
        ...(await s.observe(q)),
        revision: "100",
        payload: { current: "CURRENT STATE", huge: "x".repeat(30000) },
      }),
    };
  };
  await f.store.setState(f.group.id, "running", true);
  const model = new FakeModel([{ kind: "wait", summary: "Wait" }]),
    h = f.host(model);
  h.engines.register(new ReactiveEngine());
  const c = await f.claim();
  await h.host.run(c);
  expect(model.inputs).toHaveLength(1);
  const text = JSON.stringify(model.inputs[0]);
  expect(text).toContain("CURRENT STATE");
  expect(text).toContain("budgetOmittedKeys");
  expect(text).toContain("100");
});

it("clears unused wake enrollment when selecting another engine", async () => {
  const f = await setup();
  await f.intake.enroll(f.group.id, policy);
  await f.tasks.enroll(f.group.id, { id: "legacy-loop", version: "1" });
  await expect(f.intake.ingest(f.group.bindings[0], page([event("a")]))).rejects.toThrow("EVENT_ENROLLMENT_REQUIRED");
});

it("reuses the transaction connection when the pool has one slot", async () => {
  const f = await setup();
  await f.intake.enroll(f.group.id, policy);
  const pool = new Pool({ connectionString: testUrl, max: 1, connectionTimeoutMillis: 250 }),
    store = new Store(pool, new Vault(key), f.now),
    bindings = new Bindings(store, f.bindings.selected),
    tasks = new TaskStore(store, bindings),
    intake = new EventIntake(tasks, bindings, f.environments);
  try {
    expect((await intake.ingest(f.group.bindings[0], page([event("single-slot")]))).inserted).toBe(1);
  } finally {
    await pool.end();
  }
});
