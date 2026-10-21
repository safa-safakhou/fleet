import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { Bindings } from "../../src/platform/bindings.js";
import { TaskStore } from "../../src/platform/tasks.js";
import { budget, fixture } from "../helpers.js";

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
});
async function setup() {
  const f = await fixture();
  cleanup = () => f.pool.end();
  const world = async () => {
    const ref = { id: "board", version: "1", instanceId: randomUUID() },
      bindings = new Bindings(f.store, ref),
      tasks = new TaskStore(f.store, bindings, 1);
    const group = await f.store.create({
      name: "Native scoped scheduler",
      count: 1,
      intervalMinutes: 15,
      seed: "native-offline",
      strategies: ["merchant"],
    });
    await f.store.configure(group.id, {
      model: { route: "ollama", model: "authored-fake" },
      budget: { ...budget, concurrency: 1 },
    });
    await tasks.enroll(group.id, { id: "reactive-basic", version: "1" }, true);
    const agent = (await f.pool.query("SELECT id FROM agents WHERE cohort_id=$1", [group.id])).rows[0];
    const binding = await bindings.bind(agent.id, {
      environment: ref,
      accountRef: agent.id,
      actorRef: agent.id,
      entityRef: agent.id,
    });
    await f.pool.query("UPDATE agents SET state='ready',credential_state='ready' WHERE id=$1", [agent.id]);
    await f.store.setState(group.id, "running", true);
    return { tasks, group, binding };
  };
  return { ...f, world };
}
it("native timed seeding is scoped to its selected world and deduplicates repeated polls", async () => {
  const f = await setup(),
    a = await f.world(),
    b = await f.world();
  await expect(a.tasks.seedScheduled()).resolves.toBeUndefined();
  expect((await f.pool.query("SELECT binding_id FROM platform_tasks")).rows).toEqual([{ binding_id: a.binding.id }]);
  await b.tasks.seedScheduled();
  await a.tasks.seedScheduled();
  await b.tasks.seedScheduled();
  expect((await f.pool.query("SELECT count(*)::int n FROM platform_tasks")).rows[0].n).toBe(2);
  expect((await f.pool.query("SELECT count(*)::int n FROM turns")).rows[0].n).toBe(0);
});
it("a rejected native admission guard creates no turn or allocation and retains ready work", async () => {
  const f = await setup(),
    a = await f.world(),
    guard = vi.fn(async () => {
      throw Error("BEFORE_NATIVE_TURN");
    });
  await expect(a.tasks.claim("native-offline", f.now(), undefined, guard)).rejects.toThrow("BEFORE_NATIVE_TURN");
  expect(guard).toHaveBeenCalledOnce();
  expect((await f.pool.query("SELECT count(*)::int n FROM turns")).rows[0].n).toBe(0);
  expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n).toBe(0);
  expect((await f.pool.query("SELECT state FROM platform_tasks")).rows).toEqual([{ state: "ready" }]);
  const claim = await a.tasks.claim("native-offline", f.now());
  expect(claim?.bindingId).toBe(a.binding.id);
  if (claim) await a.tasks.finish(claim, "WAIT");
});
it("two native worlds retain one shared turn lane before any provider admission", async () => {
  const f = await setup(),
    a = await f.world(),
    b = await f.world();
  const one = await a.tasks.claim("native-a", f.now());
  expect(one).not.toBeNull();
  const guard = vi.fn(async () => {});
  expect(await b.tasks.claim("native-b", f.now(), undefined, guard)).toBeNull();
  expect(guard).not.toHaveBeenCalled();
  if (one) await a.tasks.finish(one, "WAIT");
  const two = await b.tasks.claim("native-b", f.now(), undefined, guard);
  expect(two?.bindingId).toBe(b.binding.id);
  expect(guard).toHaveBeenCalledOnce();
  if (two) await b.tasks.finish(two, "WAIT");
});
