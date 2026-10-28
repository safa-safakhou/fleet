import { afterEach, expect, it, vi } from "vitest";
import { RunWindow } from "../../src/run-window.js";
import { vllmCompletion } from "../../src/vllm-transport.js";
import { platformFixture } from "../platform-helpers.js";

let close: (() => Promise<void>) | undefined;
const directories: string[] = [];
afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  await close?.();
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});
it("refuses the final-window dispatch through the complete host path without unknown usage", async () => {
  const f = await platformFixture(1);
  close = () => f.pool.end();
  await f.enqueue();
  const claim = await f.claim();
  const dir = mkdtempSync(join(tmpdir(), "fleet-headroom-"));
  directories.push(dir);
  const file = join(dir, "window.json"),
    end = f.now().getTime() + 1500;
  writeFileSync(file, JSON.stringify({ status: "running", startsAt: end - 1800000, endsAt: end }));
  let calls = 0;
  const provider = new RunWindow(file, () => f.now().getTime()).model({
    tracksDispatch: true,
    async decide(request) {
      await request.onDispatch?.();
      calls++;
      return { decision: { kind: "wait" }, inputTokens: 1, outputTokens: 1 };
    },
  });
  await expect(f.host(provider).host.run(claim)).rejects.toThrow("RUN_WINDOW_MODEL_DRAINING");
  expect(calls).toBe(0);
  expect(f.board.executions).toBe(0);
  expect((await f.pool.query("SELECT status FROM compute_ledger")).rows).toEqual([{ status: "not_dispatched" }]);
  expect((await f.pool.query("SELECT 1 FROM model_capacity_leases")).rowCount).toBe(0);
});
it("defers a native call before allocation when its turn lacks generation headroom", async () => {
  const f = await platformFixture(1);
  close = () => f.pool.end();
  await f.enqueue();
  const claim = await f.claim();
  f.advance(30000);
  let invoked = false;
  const provider = {
    async decide() {
      invoked = true;
      return { decision: { kind: "wait" }, inputTokens: 1, outputTokens: 1 };
    },
  };
  await expect(f.host(provider).host.run(claim)).rejects.toMatchObject({
    code: "MODEL_ADMISSION_DEFERRED",
    notDispatched: true,
  });
  expect(invoked).toBe(false);
  expect((await f.pool.query("SELECT 1 FROM compute_ledger")).rowCount).toBe(0);
  expect((await f.pool.query("SELECT state,code,unknown_usage FROM turns")).rows).toEqual([
    { state: "finished", code: "MODEL_ADMISSION_DEFERRED", unknown_usage: false },
  ]);
  expect((await f.pool.query("SELECT state FROM platform_tasks")).rows).toEqual([{ state: "waiting" }]);
});
it("settles complete stream usage through the host while transport cleanup is still pending", async () => {
  const f = await platformFixture(1);
  close = () => f.pool.end();
  await f.enqueue();
  const claim = await f.claim();
  let release!: () => void;
  const cleanup = new Promise<void>((r) => {
    release = r;
  });
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(
              new TextEncoder().encode(
                'data: {"id":"complete","choices":[{"index":0,"delta":{"content":"{}"},"finish_reason":"stop"}]}\n\ndata: {"id":"complete","choices":[],"usage":{"prompt_tokens":12,"completion_tokens":5}}\n\ndata: [DONE]\n\n',
              ),
            );
          },
          cancel() {
            return cleanup;
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      ),
  );
  const provider = {
    tracksDispatch: true,
    async decide(r: Parameters<import("../../src/domain.js").ModelPort["decide"]>[0]) {
      await r.onDispatch?.();
      const response = await vllmCompletion("http://synthetic.invalid/completion", {}, "fake", r.signal);
      const usage = response.data.usage as { prompt_tokens: number; completion_tokens: number };
      return { decision: { kind: "wait" }, inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens };
    },
  };
  const run = f.host(provider).host.run(claim);
  try {
    await expect
      .poll(async () => (await f.pool.query("SELECT state FROM turns WHERE id=$1", [claim.turn.id])).rows[0].state, {
        timeout: 1000,
      })
      .toBe("finished");
    await run;
    f.advance(120001);
    await f.store.recoverExpired();
    expect((await f.pool.query("SELECT status,input_tokens::int,output_tokens::int FROM compute_ledger")).rows).toEqual(
      [{ status: "reported", input_tokens: 12, output_tokens: 5 }],
    );
    expect((await f.pool.query("SELECT 1 FROM agents WHERE state='needs_owner'")).rowCount).toBe(0);
  } finally {
    release();
    await run;
  }
});
it("cancels a streamed response through host, admission, capacity and window wrappers without losing uncertain accounting", async () => {
  const f = await platformFixture(1);
  close = () => f.pool.end();
  await f.enqueue();
  const claim = await f.claim();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  let aborted = false,
    calls = 0;
  vi.stubGlobal("fetch", async (_: string, input: RequestInit) => {
    calls++;
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'data: {"id":"synthetic","choices":[{"index":0,"delta":{"reasoning_content":"synthetic thought"}}]}\n\n',
          ),
        );
        input.signal!.addEventListener(
          "abort",
          () => {
            aborted = true;
            controller.error(input.signal!.reason);
          },
          { once: true },
        );
      },
    });
    return new Response(body, { headers: { "content-type": "text/event-stream" } });
  });
  const provider = new RunWindow().model({
    tracksDispatch: true,
    decide: async (request) => {
      await request.onDispatch?.();
      const completion = vllmCompletion(
        "http://synthetic.invalid/completion",
        { max_completion_tokens: 20 },
        "fake",
        request.signal,
      );
      const rejection = completion.catch((error) => error);
      await vi.advanceTimersByTimeAsync(90000);
      const error = await rejection;
      if (error instanceof Error) throw error;
      throw Error("UNEXPECTED_COMPLETION");
    },
  });
  await expect(f.host(provider).host.run(claim)).rejects.toThrow("MODEL_DEADLINE_EXCEEDED");
  expect(aborted).toBe(true);
  expect(calls).toBe(1);
  expect(f.board.executions).toBe(0);
  expect((await f.pool.query("SELECT status FROM compute_ledger")).rows).toEqual([{ status: "unknown" }]);
  expect((await f.pool.query("SELECT 1 FROM model_capacity_leases")).rowCount).toBe(0);
});
it("settles reported usage but fences a late final answer from an uncooperative provider", async () => {
  const f = await platformFixture(1);
  close = () => f.pool.end();
  await f.enqueue();
  const claim = await f.claim();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const provider = {
    tracksDispatch: true,
    decide: async (r: Parameters<import("../../src/domain.js").ModelPort["decide"]>[0]) => {
      await r.onDispatch?.();
      await vi.advanceTimersByTimeAsync(90000);
      expect(r.signal.aborted).toBe(true);
      expect((await f.pool.query("SELECT 1 FROM model_capacity_leases WHERE state='active'")).rowCount).toBe(1);
      return { decision: { kind: "wait" }, inputTokens: 11, outputTokens: 3 };
    },
  };
  let accepted = false;
  await expect(
    f
      .host(provider, async (ctx) => {
        await ctx.model.decide(ctx.claim, f.request(ctx.signal));
        accepted = true;
      })
      .host.run(claim),
  ).rejects.toThrow("MODEL_DEADLINE_EXCEEDED");
  expect(accepted).toBe(false);
  expect((await f.pool.query("SELECT status,input_tokens::int,output_tokens::int FROM compute_ledger")).rows).toEqual([
    { status: "reported", input_tokens: 11, output_tokens: 3 },
  ]);
  expect((await f.pool.query("SELECT code FROM turns WHERE id=$1", [claim.turn.id])).rows[0].code).toBe(
    "MODEL_DEADLINE_EXCEEDED",
  );
});

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
