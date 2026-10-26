import { afterEach, expect, it, vi } from "vitest";
import { RunWindow } from "../../src/run-window.js";
import { vllmCompletion } from "../../src/vllm-transport.js";
import { platformFixture } from "../platform-helpers.js";

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  vi.unstubAllGlobals();
  await close?.();
});
it("cancels a streamed response through host, admission, capacity and window wrappers without losing uncertain accounting", async () => {
  const f = await platformFixture(1);
  close = () => f.pool.end();
  await f.enqueue();
  const claim = await f.claim();
  claim.turn.deadline = new Date(f.now().getTime() + 1400);
  await f.pool.query("UPDATE turns SET deadline_at=$2 WHERE id=$1", [claim.turn.id, claim.turn.deadline]);
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
      await vllmCompletion(
        "http://synthetic.invalid/completion",
        { max_completion_tokens: 20 },
        "fake",
        request.signal,
      );
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
  claim.turn.deadline = new Date(f.now().getTime() + 1100);
  await f.pool.query("UPDATE turns SET deadline_at=$2 WHERE id=$1", [claim.turn.id, claim.turn.deadline]);
  const provider = {
    tracksDispatch: true,
    decide: async (r: Parameters<import("../../src/domain.js").ModelPort["decide"]>[0]) => {
      await r.onDispatch?.();
      await new Promise<void>((resolve) => r.signal.addEventListener("abort", () => resolve(), { once: true }));
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
