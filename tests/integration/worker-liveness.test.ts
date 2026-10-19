import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { afterEach, expect, it } from "vitest";
import { PactBindings } from "../../src/environments/pact.js";
import { Bindings } from "../../src/platform/bindings.js";
import { TaskStore } from "../../src/platform/tasks.js";
import { continuousBudget, fixture, key, ready, testUrl } from "../helpers.js";

let child: ChildProcess | undefined, close: (() => Promise<void>) | undefined;
afterEach(async () => {
  if (child && child.exitCode === null) {
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    await exited;
  }
  await close?.();
  close = undefined;
  child = undefined;
}, 20000);
function worker(url = testUrl, minFreeBytes = String(Number.MAX_SAFE_INTEGER)) {
  return spawn(process.execPath, ["--import", "tsx", "src/worker.ts"], {
    cwd: process.cwd(),
    env: {
      PATH: process.env.PATH,
      DATABASE_URL: url,
      FLEET_OPERATOR_SECRET: "synthetic-worker-fixture-secret-000000",
      FLEET_VAULT_KEY: key,
      FLEET_LIVE_ENABLED: "1",
      FLEET_ALLOW_HTTP: "1",
      FLEET_GAME_BASE_URL: "http://127.0.0.1:9",
      FLEET_STATE_PATH: "/tmp",
      FLEET_MIN_FREE_BYTES: minFreeBytes,
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
}
it("keeps low-disk readiness explicit while independently reaping an expired pre-model operation", async () => {
  const f = await fixture();
  close = () => f.pool.end();
  await ready(f.store, 1);
  const claim = await f.store.claim("dead");
  if (!claim) throw Error("claim");
  child = worker();
  await expect
    .poll(
      async () =>
        Boolean(
          (await f.pool.query("SELECT 1 FROM worker_health WHERE reason='LOW_DISK' AND NOT dispatch_ready")).rowCount,
        ),
      { timeout: 10000, interval: 100 },
    )
    .toBe(true);
  expect((await f.pool.query("SELECT state,unknown_usage FROM turns WHERE id=$1", [claim.id])).rows[0]).toEqual({
    state: "finished",
    unknown_usage: false,
  });
  expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n).toBe(0);
  expect(child.exitCode).toBeNull();
}, 15000);
it("survives database connection loss instead of terminating its supervision loop", async () => {
  const target = new URL(testUrl);
  target.port = "1";
  child = worker(target.toString());
  let messages = "";
  child.stderr?.on("data", (b) => {
    messages += String(b);
  });
  await expect.poll(() => messages, { timeout: 10000, interval: 100 }).toContain("fleet supervision deferred");
  expect(child.exitCode).toBeNull();
}, 15000);

it("admits an explicitly enrolled compatibility task through the actual worker and retains its auth gate", async () => {
  const f = await fixture();
  close = () => f.pool.end();
  const id = await ready(f.store, 1);
  await f.store.setState(id, "paused", true);
  await f.store.configure(id, { model: { route: "ollama", model: "fake-model" }, budget: continuousBudget });
  const bindings = new Bindings(f.store, { id: "pact", version: "1", instanceId: "http://127.0.0.1:9" }),
    tasks = new TaskStore(f.store, bindings, 1);
  await tasks.enroll(id, { id: "legacy-loop", version: "1" });
  const agent = (await f.pool.query("SELECT id FROM agents WHERE cohort_id=$1", [id])).rows[0];
  const binding = await new PactBindings(f.store, bindings).attach(agent.id);
  await f.store.setState(id, "running", true);
  await tasks.upsertFromEvent(
    binding,
    {
      id: "synthetic:manual",
      type: "manual",
      sourceRef: "synthetic:manual",
      observedAt: f.now().toISOString(),
      environmentTime: { clockId: "utc", value: f.now().toISOString() },
      metadata: {},
    },
    "manual",
  );
  child = worker(testUrl, "0");
  await expect
    .poll(
      async () =>
        (await f.pool.query("SELECT state FROM platform_tasks WHERE binding_id=$1", [binding.id])).rows[0]?.state,
      { timeout: 10000, interval: 100 },
    )
    .toBe("blocked");
  expect((await f.pool.query("SELECT state,code,calls FROM turns WHERE agent_id=$1", [agent.id])).rows).toEqual([
    { state: "needs_owner", code: "AUTH_REQUIRED", calls: 0 },
  ]);
  expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n).toBe(0);
}, 15000);
