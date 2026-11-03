import { expect, test } from "vitest";
import { RouteCapacity } from "../../src/platform/admission.js";
import { platformFixture } from "../platform-helpers.js";

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};
test("an opted-in prefill wave holds a later arrival until the current wave settles", async () => {
  const f = await platformFixture(2),
    release = deferred(),
    stop = new AbortController();
  let first: Promise<unknown> | undefined, second: Promise<unknown> | undefined;
  try {
    await f.enqueue(f.group.bindings[0], "first", "first");
    const a = await f.claim();
    await f.enqueue(f.group.bindings[1], "second", "second");
    const b = await f.claim();
    const route = new RouteCapacity(f.store, () => ({ key: "wave-fixture", capacity: 2, waveWindowMs: 250 }));
    let started = false,
      backfilled = false;
    first = route.run(a.turn, f.request(stop.signal), async () => {
      started = true;
      await release.promise;
    });
    await expect.poll(() => started).toBe(true);
    f.advance(500);
    second = route.run(b.turn, f.request(stop.signal), async () => {
      backfilled = true;
      await release.promise;
    });
    await expect
      .poll(
        async () =>
          (await f.pool.query("SELECT count(*)::int n FROM model_capacity_leases WHERE turn_id=$1", [b.turn.id]))
            .rows[0].n,
      )
      .toBe(1);
    await new Promise((r) => setTimeout(r, 100));
    expect(backfilled).toBe(false);
    expect(
      (await f.pool.query("SELECT state FROM model_capacity_leases WHERE turn_id=$1", [b.turn.id])).rows[0].state,
    ).toBe("queued");
    release.resolve();
    await expect.poll(() => backfilled).toBe(true);
    await Promise.all([first, second]);
    expect(backfilled).toBe(true);
    expect((await f.pool.query("SELECT 1 FROM model_capacity_leases")).rowCount).toBe(0);
  } finally {
    stop.abort();
    release.resolve();
    await Promise.allSettled([first, second]);
    await f.pool.end();
  }
});
