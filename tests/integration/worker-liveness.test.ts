import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { afterEach, expect, it } from "vitest";
import { fixture, key, ready, testUrl } from "../helpers.js";

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
function worker(url = testUrl) {
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
      FLEET_MIN_FREE_BYTES: String(Number.MAX_SAFE_INTEGER),
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
