import { afterEach, expect, it, vi } from "vitest";
import { HttpModel } from "../../src/model.js";

afterEach(() => vi.unstubAllGlobals());
it("sends the explicit R8 9b false choice with the original caps and counts known usage", async () => {
  let body: Record<string, unknown> = {};
  vi.stubGlobal("fetch", async (_url: unknown, init: RequestInit) => {
    body = JSON.parse(String(init.body));
    return Response.json({
      message: { content: JSON.stringify({ decision: { kind: "wait", summary: "Own review only" } }) },
      done: true,
      done_reason: "stop",
      prompt_eval_count: 42,
      eval_count: 16,
    });
  });
  const result = await new HttpModel({ ollama: "http://provider.invalid" }, undefined).decide({
    model: { route: "ollama", model: "qwen3.5:9b", thinking: false },
    messages: [],
    schema: {},
    maxOutputTokens: 2000,
    signal: AbortSignal.timeout(1000),
  });
  expect(body).toMatchObject({
    model: "qwen3.5:9b",
    think: false,
    keep_alive: 0,
    stream: false,
    options: { num_predict: 2000, num_ctx: 32768 },
  });
  expect(result).toMatchObject({ inputTokens: 42, outputTokens: 16, decision: { decision: { kind: "wait" } } });
});
