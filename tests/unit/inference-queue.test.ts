import { expect, it } from "vitest";
import { InferenceQueue } from "../../scripts/lib/inference-queue.js";

it("admits FIFO work up to capacity and removes cancelled queued work before dispatch", async () => {
  const q = new InferenceQueue(2);
  const order: number[] = [],
    releases: Array<() => void> = [];
  const work = (n: number, signal = new AbortController().signal) =>
    q.run(signal, async () => {
      order.push(n);
      await new Promise<void>((r) => releases.push(r));
      return n;
    });
  const a = work(1),
    b = work(2),
    controller = new AbortController(),
    c = work(3, controller.signal).catch((e) => e.message),
    d = work(4);
  expect(order).toEqual([1, 2]);
  controller.abort();
  releases[0]();
  await a;
  expect(await c).toBe("MODEL_QUEUE_CANCELLED");
  expect(order).toEqual([1, 2, 4]);
  releases[1]();
  releases[2]();
  await Promise.all([b, d]);
  expect(q.active).toBe(0);
});
