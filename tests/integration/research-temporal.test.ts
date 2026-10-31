import { randomUUID } from "node:crypto";
import { afterEach, expect, test } from "vitest";
import { compileManifest } from "../../src/research/manifests/compiler.js";
import { ManifestRepository } from "../../src/research/manifests/repository.js";
import { TemporalTaskOwner } from "../../src/research/orchestration/outbox.js";
import { assertOwnedFixture } from "../architecture-fixture.js";
import { capability, manifestInput } from "../fixtures/research/manifest.js";
import { platformFixture } from "../platform-helpers.js";

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});
async function deliverEventually(owner: TemporalTaskOwner, id: string) {
  for (let n = 0; n < 200; n++) {
    try {
      await owner.deliver(id);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 25));
    }
  }
  throw Error("DELIVERY_TIMEOUT");
}
async function setup() {
  await assertOwnedFixture(process.env.FLEET_TEST_DATABASE_URL ?? "", process.env.FLEET_ARCHITECTURE_NONCE ?? "");
  const f = await platformFixture();
  cleanup = () => f.pool.end();
  const task = await f.enqueue();
  await f.store.setState(f.group.id, "paused", false);
  const input = manifestInput();
  input.environment.bindingId = task.bindingId;
  input.profile = task.profile;
  const compiled = compileManifest(input, capability);
  await new ManifestRepository(f.pool).save(compiled.manifest);
  return { ...f, task, manifest: compiled.digest };
}
test("one_owner_across_delivery_failure retains native admission and immutable wake identity", async () => {
  const f = await setup();
  let down = true;
  const deliveries: string[] = [];
  let executions = 0;
  const owner = new TemporalTaskOwner(
    f.store,
    f.tasks,
    {
      send: async (ref) => {
        if (down) throw Error("fixture outage");
        deliveries.push(ref.deliveryId);
      },
    },
    async (claim) => {
      executions++;
      await f.store.finish(claim.turn, "WAIT");
    },
  );
  const anchor = (await f.store.agent(await f.bindings.agentFor(f.group.bindings[0]))).next_due_at;
  await owner.enroll(f.task.id, f.manifest);
  await owner.enroll(f.task.id, f.manifest);
  await f.store.setState(f.group.id, "running", true);
  expect(await f.tasks.claim("ordinary", f.now(), f.task.id)).toBeNull();
  const outbox = (await f.pool.query("SELECT id FROM research_task_outbox")).rows;
  expect(outbox).toHaveLength(1);
  await expect(owner.deliver(outbox[0].id)).rejects.toThrow("TEMPORAL_UNAVAILABLE");
  down = false;
  await owner.deliver(outbox[0].id);
  await owner.deliver(outbox[0].id);
  expect(deliveries).toEqual([outbox[0].id]);
  const ref = await owner.reference(outbox[0].id);
  await Promise.all([owner.execute(ref), owner.execute(ref)]);
  expect(executions).toBe(1);
  expect(
    (await f.pool.query("SELECT count(*)::int n FROM platform_task_claims WHERE task_id=$1", [f.task.id])).rows[0].n,
  ).toBe(1);
  expect((await owner.inspect(ref)).phase).toBe("completed");
  await owner.execute(ref);
  expect(executions).toBe(1);
  // Original cadence anchor is consumed only by the native admitted turn, never by redelivery.
  expect((await f.store.agent(await f.bindings.agentFor(f.group.bindings[0]))).next_due_at).toBeDefined();
  expect(anchor).toBeDefined();
});
test("consumed enrollment and replacement activity after ambiguity are refused", async () => {
  const f = await setup(),
    owner = new TemporalTaskOwner(f.store, f.tasks, { send: async () => {} }, async () => {
      throw Error("ambiguous provider failure");
    });
  await owner.enroll(f.task.id, f.manifest);
  await f.store.setState(f.group.id, "running", true);
  const ref = await owner.reference((await f.pool.query("SELECT id FROM research_task_outbox")).rows[0].id);
  await owner.execute(ref);
  expect((await owner.inspect(ref)).phase).toBe("awaiting_reconciliation");
  await owner.execute({ ...ref, deliveryId: randomUUID() }).catch(() => {});
  expect(
    (await f.pool.query("SELECT count(*)::int n FROM platform_task_claims WHERE task_id=$1", [f.task.id])).rows[0].n,
  ).toBe(1);
  await expect(owner.enroll(f.task.id, "0".repeat(64))).rejects.toThrow();
});

test("real Temporal workflow replays a frozen history without rerunning native effects", async () => {
  const { TestWorkflowEnvironment } = await import("@temporalio/testing"),
    { Worker } = await import("@temporalio/worker"),
    { resolve } = await import("node:path"),
    { writeFile, readFile } = await import("node:fs/promises"),
    { TemporalClient } = await import("../../src/research/orchestration/client.js"),
    { taskActivities } = await import("../../src/research/orchestration/activities.js"),
    { taskQueue, deployment } = await import("../../src/research/orchestration/types.js");
  const f = await setup(),
    env = await TestWorkflowEnvironment.createLocal({
      server: {
        executable: { type: "existing-path", path: resolve(".tmp/research-temporal-cli/temporal") },
        ip: "127.0.0.1",
        ui: false,
        startupTimeout: "20 seconds",
      },
      client: { identity: "fleet-synthetic-client" },
    });
  let effects = 0;
  const owner = new TemporalTaskOwner(f.store, f.tasks, new TemporalClient(env.client), async (claim) => {
    effects++;
    await f.store.finish(claim.turn, "WAIT");
  });
  const workflowsPath = resolve("src/research/orchestration/workflow.ts"),
    worker = await Worker.create({
      connection: env.nativeConnection,
      identity: "fleet-synthetic-worker",
      taskQueue: taskQueue(f.manifest),
      workflowsPath,
      activities: taskActivities(owner),
      workerDeploymentOptions: {
        version: deployment(f.manifest),
        useWorkerVersioning: true,
        defaultVersioningBehavior: "PINNED",
      },
    });
  try {
    await owner.enroll(f.task.id, f.manifest);
    await f.store.setState(f.group.id, "running", true);
    const id = (await f.pool.query("SELECT id FROM research_task_outbox")).rows[0].id;
    await worker.runUntil(async () => {
      await deliverEventually(owner, id);
      const handle = env.client.workflow.getHandle(`fleet-task/${f.task.id}`);
      await handle.result();
      const history = await handle.fetchHistory();
      const { historyToJSON } = await import("@temporalio/common/lib/proto-utils");
      await writeFile(".superpowers/sdd/2026-10-30-pact-research-03-runtime/r1-history.json", historyToJSON(history));
      expect(effects).toBe(1);
      await owner.deliver(id);
      expect(effects).toBe(1);
      expect(JSON.stringify(history)).not.toContain("Observe and decide.");
    });
    const frozen = JSON.parse(await readFile("tests/fixtures/research/temporal-history.json", "utf8"));
    await Worker.runReplayHistory({ workflowsPath }, frozen);
    expect(effects).toBe(1);
  } finally {
    await env.teardown();
  }
}, 120000);

test("restart and continue-as-new preserve unresolved execution and repeated wake IDs", async () => {
  const { TestWorkflowEnvironment } = await import("@temporalio/testing"),
    { Worker } = await import("@temporalio/worker"),
    { resolve } = await import("node:path"),
    { TemporalClient } = await import("../../src/research/orchestration/client.js"),
    { taskActivities } = await import("../../src/research/orchestration/activities.js"),
    { taskQueue, deployment } = await import("../../src/research/orchestration/types.js");
  const f = await setup(),
    env = await TestWorkflowEnvironment.createLocal({
      server: {
        executable: { type: "existing-path", path: resolve(".tmp/research-temporal-cli/temporal") },
        ip: "127.0.0.1",
        ui: false,
        startupTimeout: "20 seconds",
      },
      client: { identity: "fleet-synthetic-client" },
    });
  let calls = 0;
  const client = new TemporalClient(env.client),
    owner = new TemporalTaskOwner(f.store, f.tasks, client, async () => {
      calls++;
      throw Error("synthetic lost reply");
    });
  const options = {
    connection: env.nativeConnection,
    identity: "fleet-synthetic-worker",
    taskQueue: taskQueue(f.manifest),
    workflowsPath: resolve("src/research/orchestration/workflow.ts"),
    activities: taskActivities(owner),
    workerDeploymentOptions: {
      version: deployment(f.manifest),
      useWorkerVersioning: true as const,
      defaultVersioningBehavior: "PINNED" as const,
    },
  };
  async function waitUntil(check: () => Promise<boolean>) {
    for (let i = 0; i < 500; i++) {
      if (await check()) return;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw Error("WORKFLOW_PROGRESS_TIMEOUT");
  }
  try {
    await owner.enroll(f.task.id, f.manifest);
    await f.store.setState(f.group.id, "running", true);
    const first = (await f.pool.query("SELECT id FROM research_task_outbox")).rows[0].id,
      ref = await owner.reference(first),
      handle = env.client.workflow.getHandle(`fleet-task/${f.task.id}`);
    const one = await Worker.create(options);
    await one.runUntil(async () => {
      await deliverEventually(owner, first);
      await waitUntil(async () => (await owner.inspect(ref)).phase === "awaiting_reconciliation");
    });
    const oldRun = (await handle.describe()).runId;
    const two = await Worker.create(options);
    await two.runUntil(async () => {
      for (let n = 0; n < 128; n++) {
        const id = randomUUID();
        await f.pool.query(
          "INSERT INTO research_task_outbox(id,task_id,kind,dedupe_key,created_at) VALUES($1::uuid,$2,'wake',$1::uuid::text,$3)",
          [id, f.task.id, f.now()],
        );
        await owner.deliver(id);
      }
      await waitUntil(async () => (await handle.describe()).runId !== oldRun);
      await client.send(ref);
      await new Promise((r) => setTimeout(r, 100));
      expect(calls).toBe(1);
      expect((await owner.inspect(ref)).phase).toBe("awaiting_reconciliation");
      expect((await f.pool.query("SELECT count(*)::int n FROM research_task_executions")).rows[0].n).toBe(1);
    });
  } finally {
    await env.teardown();
  }
}, 120000);

test("future sources on an explicitly owned logical route never fall back to the platform scheduler", async () => {
  const f = await setup(),
    owner = new TemporalTaskOwner(f.store, f.tasks, { send: async () => {} }, async (claim) => {
      await f.store.finish(claim.turn, "WAIT");
    });
  await owner.enroll(f.task.id, f.manifest);
  await f.store.setState(f.group.id, "running", true);
  const ref = await owner.reference((await f.pool.query("SELECT id FROM research_task_outbox")).rows[0].id);
  await owner.execute(ref);
  f.advance(16 * 60000);
  const next = await f.enqueue(f.group.bindings[0], "work", "source:next");
  expect(next.id).not.toBe(f.task.id);
  expect(
    (await f.pool.query("SELECT scheduler_owner FROM platform_tasks WHERE id=$1", [next.id])).rows[0].scheduler_owner,
  ).toBe("temporal");
  expect(await f.tasks.claim("ordinary", f.now(), next.id)).toBeNull();
  expect(
    (await f.pool.query("SELECT count(*)::int n FROM research_task_outbox WHERE task_id=$1", [next.id])).rows[0].n,
  ).toBe(1);
});

test("completion before a lost delivery acknowledgement never creates another execution", async () => {
  const f = await setup();
  let executions = 0,
    sends = 0;
  let owner: TemporalTaskOwner;
  owner = new TemporalTaskOwner(
    f.store,
    f.tasks,
    {
      send: async (ref) => {
        sends++;
        await owner.execute(ref);
        throw Error("synthetic ack lost");
      },
    },
    async (claim) => {
      executions++;
      await f.store.finish(claim.turn, "WAIT");
    },
  );
  const agent = await f.bindings.agentFor(f.group.bindings[0]),
    before = (await f.store.agent(agent)).next_due_at;
  await owner.enroll(f.task.id, f.manifest);
  expect((await f.store.agent(agent)).next_due_at).toEqual(before);
  await f.store.setState(f.group.id, "running", true);
  const id = (await f.pool.query("SELECT id FROM research_task_outbox")).rows[0].id;
  await expect(owner.deliver(id)).rejects.toThrow("TEMPORAL_UNAVAILABLE");
  const anchor = (await f.store.agent(agent)).next_due_at;
  await owner.deliver(id);
  expect(executions).toBe(1);
  expect(sends).toBe(1);
  expect((await f.store.agent(agent)).next_due_at).toEqual(anchor);
});

test("closed execution grant cannot consume a native turn through Temporal", async () => {
  const f = await setup();
  let runs = 0;
  const owner = new TemporalTaskOwner(
    f.store,
    f.tasks,
    { send: async () => {} },
    async () => {
      runs++;
    },
    () => false,
  );
  await owner.enroll(f.task.id, f.manifest);
  await f.store.setState(f.group.id, "running", true);
  const ref = await owner.reference((await f.pool.query("SELECT id FROM research_task_outbox")).rows[0].id);
  await owner.execute(ref);
  expect(runs).toBe(0);
  expect((await f.pool.query("SELECT count(*)::int n FROM turns")).rows[0].n).toBe(0);
});
