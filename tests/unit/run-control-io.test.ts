import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { independentHeartbeat, serializedFinalization } from "../../scripts/lib/run-control-io.js";

it("keeps liveness separate from slow telemetry while retaining the last control-loop time", async () => {
  vi.useFakeTimers();
  try {
    const seen: number[] = [];
    let control = 12;
    const beat = independentHeartbeat(async () => {
      seen.push(control);
    }, 100);
    await beat.ready;
    await vi.advanceTimersByTimeAsync(300);
    expect(seen).toEqual([12, 12, 12, 12]);
    control = 25;
    await vi.advanceTimersByTimeAsync(100);
    expect(seen.at(-1)).toBe(25);
    await beat.stop();
    await vi.advanceTimersByTimeAsync(300);
    expect(seen).toHaveLength(5);
  } finally {
    vi.useRealTimers();
  }
});

it("exposes heartbeat storage failure without overlapping writes", async () => {
  const beat = independentHeartbeat(async () => {
    throw Error("disk failed");
  }, 10);
  await beat.ready;
  expect(() => beat.check()).toThrow("disk failed");
  await beat.stop();
});

it("serializes competing finalizers and allows the second caller to see completion", async () => {
  const dir = await mkdtemp(join(tmpdir(), "fleet-finalize-"));
  try {
    let running = 0,
      max = 0,
      work = 0,
      completed = false;
    const finalize = () =>
      serializedFinalization(join(dir, "lock"), async () => {
        running++;
        max = Math.max(max, running);
        if (!completed) {
          work++;
          await new Promise((r) => setTimeout(r, 25));
          completed = true;
        }
        running--;
        return completed;
      });
    expect(await Promise.all([finalize(), finalize()])).toEqual([true, true]);
    expect(max).toBe(1);
    expect(work).toBe(1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
