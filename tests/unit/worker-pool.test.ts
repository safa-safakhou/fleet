import { expect, it } from "vitest";
import { WorkerPool } from "../../src/platform/worker-pool.js";

it("runs independent jobs concurrently but refuses work beyond capacity", async () => {
  const pool = new WorkerPool(2);
  const release = deferred();
  let started = 0;
  const job = async () => {
    started++;
    await release.promise;
  };
  const a = pool.run(job),
    b = pool.run(job);
  expect(started).toBe(2);
  expect(pool.hasCapacity).toBe(false);
  await expect(pool.run(job)).rejects.toThrow("WORKER_POOL_FULL");
  expect(started).toBe(2);
  release.resolve();
  await Promise.all([a, b]);
  expect(pool.hasCapacity).toBe(true);
});

it("releases failed jobs and drains accepted work after closing admission", async () => {
  const pool = new WorkerPool(1);
  await expect(
    pool.run(async () => {
      throw Error("synthetic failure");
    }),
  ).rejects.toThrow("synthetic failure");
  expect(pool.hasCapacity).toBe(true);
  const release = deferred();
  const job = pool.run(() => release.promise);
  pool.close();
  let drained = false;
  const drain = pool.drain().then(() => {
    drained = true;
  });
  await Promise.resolve();
  expect(drained).toBe(false);
  await expect(pool.run(async () => {})).rejects.toThrow("WORKER_POOL_CLOSED");
  release.resolve();
  await Promise.all([job, drain]);
  expect(drained).toBe(true);
  expect(pool.hasCapacity).toBe(false);
});

it.each([0, -1, 1.5, 17, NaN])("rejects invalid worker capacity %s", (capacity) => {
  expect(() => new WorkerPool(capacity)).toThrow("INVALID_WORKER_CAPACITY");
});
it("bounds suspended continuations and drains them after closing", async () => {
  const pool = new WorkerPool(2, 2),
    release = deferred();
  const jobs = Array.from({ length: 4 }, () => pool.run(() => release.promise));
  await expect(pool.run(async () => {})).rejects.toThrow("WORKER_POOL_FULL");
  pool.close();
  release.resolve();
  await pool.drain();
  await Promise.all(jobs);
  expect(pool.hasCapacity).toBe(false);
});
it.each([-1, 1.5, 3, NaN])("rejects invalid waiting allowance %s", (n) => {
  expect(() => new WorkerPool(2, n)).toThrow("INVALID_WORKER_CAPACITY");
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it("fills free worker slots with legacy work when the platform lane is idle", async () => {
  const { DispatchScheduler } = await import("../../src/platform/scheduling.js");
  const pool = new WorkerPool(4),
    scheduler = new DispatchScheduler();
  const release = deferred();
  let started = 0;
  const jobs: Promise<void>[] = [];
  try {
    await scheduler.dispatch({
      platform: async () => false,
      legacy: async () => {
        if (!pool.hasCapacity) return false;
        jobs.push(
          pool.run(async () => {
            started++;
            await release.promise;
          }),
        );
        return true;
      },
      hasCapacity: () => pool.hasCapacity,
    });
    expect(started).toBe(4);
  } finally {
    pool.close();
    release.resolve();
    await Promise.all(jobs);
  }
});
it("rechecks admission between lanes so a failure cannot fill more worker slots", async () => {
  const { DispatchScheduler } = await import("../../src/platform/scheduling.js");
  const scheduler = new DispatchScheduler();
  let open = true;
  const seen: string[] = [];
  await scheduler.dispatch({
    hasCapacity: () => open,
    platform: async () => {
      seen.push("platform");
      open = false;
      return true;
    },
    legacy: async () => {
      seen.push("legacy");
      return true;
    },
  });
  expect(seen).toEqual(["platform"]);
});
