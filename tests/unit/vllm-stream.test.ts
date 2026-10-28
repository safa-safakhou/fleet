import { afterEach, expect, it, vi } from "vitest";
import { FleetError } from "../../src/domain.js";
import { HttpModel } from "../../src/model.js";
import { parseCacheProfile } from "../../src/platform/cache-profile.js";
import { vllmCompletion } from "../../src/vllm-transport.js";
import { cacheProfileFixture } from "../fixtures/cache-profile.js";

afterEach(() => vi.restoreAllMocks());
const request = {
  model: { route: "openai-compatible" as const, provider: "vllm" as const, model: "nemotron-4b", thinking: false },
  messages: [],
  schema: { type: "object" },
  maxOutputTokens: 100,
  signal: AbortSignal.timeout(1000),
};
function stream(events: string, chunkBytes = 7) {
  const bytes = new TextEncoder().encode(events);
  return new Response(
    new ReadableStream({
      start(c) {
        for (let i = 0; i < bytes.length; i += chunkBytes) c.enqueue(bytes.slice(i, i + chunkBytes));
        c.close();
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
}
const event = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
it("returns complete final usage without waiting for transport cancellation acknowledgement", async () => {
  let release!: () => void;
  const cleanup = new Promise<void>((r) => {
    release = r;
  });
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(
        new TextEncoder().encode(
          event({ id: "complete-usage", choices: [{ index: 0, delta: { content: "{}" }, finish_reason: "stop" }] }) +
            event({ id: "complete-usage", choices: [], usage: { prompt_tokens: 12, completion_tokens: 5 } }) +
            "data: [DONE]\n\n",
        ),
      );
    },
    cancel() {
      return cleanup;
    },
  });
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(body, { headers: { "content-type": "text/event-stream" } }),
  );
  const call = vllmCompletion("http://synthetic.invalid/v1", {}, "fake", new AbortController().signal);
  try {
    const result = await Promise.race([
      call,
      new Promise<string>((r) => setTimeout(() => r("cleanup blocked usage"), 100)),
    ]);
    expect(result).toMatchObject({ data: { usage: { prompt_tokens: 12, completion_tokens: 5 } } });
  } finally {
    release();
    await call;
  }
});
it("observes cancellation while a response body is stalled and keeps its usage unknown", async () => {
  let streamController!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      streamController = c;
      c.enqueue(
        new TextEncoder().encode(
          event({ id: "stalled", choices: [{ index: 0, delta: { reasoning_content: "private" } }] }),
        ),
      );
    },
  });
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(body, { headers: { "content-type": "text/event-stream" } }),
  );
  const controller = new AbortController();
  const call = vllmCompletion("http://synthetic.invalid/v1", {}, "fake", controller.signal).catch((e) => e);
  await new Promise((r) => setTimeout(r, 0));
  controller.abort(new FleetError("MODEL_DEADLINE_EXCEEDED"));
  try {
    const result = await Promise.race([call, new Promise<string>((r) => setTimeout(() => r("abort ignored"), 100))]);
    expect(result).toMatchObject({ code: "MODEL_DEADLINE_EXCEEDED", notDispatched: false });
    expect(result).not.toHaveProperty("inputTokens");
    expect(JSON.stringify(result)).not.toContain("private");
  } finally {
    try {
      streamController.close();
    } catch {}
    await call;
  }
});
it("classifies a provider grammar rejection without leaking its message or inventing usage", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    stream(
      event({
        error: {
          message: 'Grammar error: Unimplemented keys: ["dependencies"] secret=never-log-this',
          type: "BadRequestError",
          code: 400,
        },
      }),
    ),
  );
  try {
    await new HttpModel({ "openai-compatible": "http://127.0.0.1:1/v1" }, "fake").decide(request);
    throw Error("EXPECTED_PROVIDER_REJECTION");
  } catch (error) {
    expect(error).toMatchObject({
      code: "MODEL_PROVIDER_ERROR",
      notDispatched: false,
      progress: {
        contentChars: 0,
        providerError: { category: "unsupported_schema_keyword", unsupportedKeys: ["dependencies"] },
      },
    });
    expect(JSON.stringify(error)).not.toContain("never-log-this");
    expect(error).not.toHaveProperty("inputTokens");
  }
});
it("settles final stream usage and reconstructs split JSON without losing request correlation", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    stream(
      event({
        id: "synthetic-request",
        choices: [{ index: 0, delta: { content: '{"kind":' }, finish_reason: null }],
      }) +
        event({
          id: "synthetic-request",
          choices: [{ index: 0, delta: { content: '"wait"}' }, finish_reason: "stop" }],
        }) +
        event({ id: "synthetic-request", choices: [], usage: { prompt_tokens: 12, completion_tokens: 5 } }) +
        "data: [DONE]\n\n",
    ),
  );
  const response = await new HttpModel({ "openai-compatible": "http://127.0.0.1:1/v1" }, "fake").decide(request);
  expect(response).toMatchObject({
    decision: { kind: "wait" },
    inputTokens: 12,
    outputTokens: 5,
    execution: { requestId: "synthetic-request", contentChars: 15, finishReason: "stop" },
  });
  expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toMatchObject({
    stream: true,
    stream_options: { include_usage: true },
  });
});
it("keeps interrupted usage unknown while exposing only bounded progress diagnostics", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    stream(
      event({
        id: "interrupted",
        choices: [{ index: 0, delta: { content: '{"a":1\n      \n      ' }, finish_reason: null }],
      }),
    ),
  );
  await expect(
    new HttpModel({ "openai-compatible": "http://127.0.0.1:1/v1" }, "fake").decide(request),
  ).rejects.toMatchObject({
    code: "MODEL_STREAM_INCOMPLETE",
    notDispatched: false,
    progress: { requestId: "interrupted", contentChars: 20, maxWhitespaceRun: 14 },
  });
});
it("retains known usage for a completed but truncated response", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    stream(
      event({ id: "short-output", choices: [{ index: 0, delta: { content: '{"a":' }, finish_reason: "length" }] }) +
        event({ id: "short-output", choices: [], usage: { prompt_tokens: 12, completion_tokens: 100 } }) +
        "data: [DONE]\n\n",
    ),
  );
  const response = await new HttpModel({ "openai-compatible": "http://127.0.0.1:1/v1" }, "fake").decide(request);
  expect(response).toMatchObject({ decisionError: "MODEL_OUTPUT_TRUNCATED", inputTokens: 12, outputTokens: 100 });
});
it("finishes on the protocol terminator without waiting for a kept-open connection", async () => {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
      c.enqueue(
        new TextEncoder().encode(
          event({
            id: "complete",
            choices: [{ index: 0, delta: { content: '{"kind":"wait"}' }, finish_reason: "stop" }],
          }) +
            event({ id: "complete", choices: [], usage: { prompt_tokens: 12, completion_tokens: 5 } }) +
            "data: [DONE]\n\n",
        ),
      );
    },
  });
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(body, { headers: { "content-type": "text/event-stream" } }),
  );
  const call = new HttpModel({ "openai-compatible": "http://127.0.0.1:1/v1" }, "fake").decide(request);
  const result = await Promise.race([
    call,
    new Promise<string>((r) => setTimeout(() => r("connection still open"), 40)),
  ]);
  try {
    expect(result).toMatchObject({ inputTokens: 12, outputTokens: 5 });
  } finally {
    try {
      controller.close();
    } catch {
      /* Already cancelled after a complete protocol response. */
    }
    await call;
  }
});
it("measures provider tokens without dispatching inference or dropping explicit thinking settings", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ count: 73, max_model_len: 16384 }));
  const model = new HttpModel({ "openai-compatible": "http://127.0.0.1:1/v1" }, "fake");
  expect(await model.estimateInputTokens(request)).toBe(73);
  expect(fetch.mock.calls[0][0]).toBe("http://127.0.0.1:1/tokenize");
  expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toMatchObject({
    model: "nemotron-4b",
    chat_template_kwargs: { enable_thinking: false },
    add_generation_prompt: true,
  });
});
it("refuses a prompt plus reserved output that exceeds the provider context before inference", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ count: 16300, max_model_len: 16384 }));
  await expect(
    new HttpModel({ "openai-compatible": "http://127.0.0.1:1/v1" }, "fake").estimateInputTokens(request),
  ).rejects.toMatchObject({ code: "PROVIDER_CONTEXT_CAPACITY", notDispatched: true });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toBe("http://127.0.0.1:1/tokenize");
});

it("refuses a restarted or changed provider before inference dispatch", async () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(Response.json({ ...cacheProfileFixture, instanceId: "restarted-provider" }));
  let dispatched = false;
  const model = new HttpModel(
    { "openai-compatible": "http://127.0.0.1:18535/v1" },
    "fake",
    undefined,
    parseCacheProfile(cacheProfileFixture),
  );
  await expect(
    model.decide({
      ...request,
      onDispatch: async () => {
        dispatched = true;
      },
    }),
  ).rejects.toMatchObject({ code: "PROVIDER_CACHE_PROFILE_MISMATCH", notDispatched: true });
  expect(dispatched).toBe(false);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toBe("http://127.0.0.1:18535/fleet/cache-profile");
});
it("checks a matching live cache identity before dispatch and retains final usage", async () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(Response.json(cacheProfileFixture))
    .mockResolvedValueOnce(
      Response.json({
        choices: [{ message: { content: '{"kind":"wait"}' }, finish_reason: "stop" }],
        usage: { prompt_tokens: 12, completion_tokens: 5 },
      }),
    );
  let dispatched = 0;
  const model = new HttpModel(
    { "openai-compatible": "http://127.0.0.1:18535/v1" },
    "fake",
    undefined,
    parseCacheProfile(cacheProfileFixture),
  );
  expect(
    await model.decide({
      ...request,
      onDispatch: async () => {
        dispatched++;
      },
    }),
  ).toMatchObject({ inputTokens: 12, outputTokens: 5 });
  expect(dispatched).toBe(1);
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("cannot bypass a configured cache identity by omitting the provider marker", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({
      choices: [{ message: { content: '{"kind":"wait"}' }, finish_reason: "stop" }],
      usage: { prompt_tokens: 12, completion_tokens: 5 },
    }),
  );
  let dispatched = false;
  const model = new HttpModel(
    { "openai-compatible": "http://127.0.0.1:18535/v1" },
    "fake",
    undefined,
    parseCacheProfile(cacheProfileFixture),
  );
  await expect(
    model.decide({
      ...request,
      model: { route: "openai-compatible", model: "nemotron-4b" },
      onDispatch: async () => {
        dispatched = true;
      },
    }),
  ).rejects.toMatchObject({ code: "PROVIDER_CACHE_PROFILE_MISMATCH", notDispatched: true });
  expect(dispatched).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
});
it.each(["reasoning", "reasoning_content"])(
  "passes thinking/output settings and counts %s deltas without retaining their text",
  async (field) => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      stream(
        event({
          id: "thinking",
          choices: [{ index: 0, delta: { [field]: "PRIVATE_REASONING" }, finish_reason: null }],
        }) +
          event({
            id: "thinking",
            choices: [{ index: 0, delta: { content: '{"kind":"wait"}' }, finish_reason: "stop" }],
          }) +
          event({ id: "thinking", choices: [], usage: { prompt_tokens: 12, completion_tokens: 100 } }) +
          "data: [DONE]\n\n",
      ),
    );
    const r = await new HttpModel({ "openai-compatible": "http://127.0.0.1:1/v1" }, "fake").decide({
      ...request,
      model: { ...request.model, thinking: true },
      maxOutputTokens: 8192,
    });
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toMatchObject({
      chat_template_kwargs: { enable_thinking: true },
      max_completion_tokens: 8192,
    });
    expect(r).toMatchObject({ decision: { kind: "wait" }, outputTokens: 100, execution: { reasoningChars: 17 } });
    expect(JSON.stringify(r)).not.toContain("PRIVATE_REASONING");
  },
);
it("accepts a bounded 8192-token thinking stream whose protocol overhead exceeds one megabyte", async () => {
  const part = event({
    id: "long-think",
    object: "chat.completion.chunk",
    created: 1,
    model: "nemotron-4b",
    choices: [{ index: 0, delta: { reasoning: "x" }, finish_reason: null, logprobs: null, stop_reason: null }],
  });
  const wire =
    part.repeat(6000) +
    event({ id: "long-think", choices: [{ index: 0, delta: { content: '{"kind":"wait"}' }, finish_reason: "stop" }] }) +
    event({ id: "long-think", choices: [], usage: { prompt_tokens: 12, completion_tokens: 6007 } }) +
    "data: [DONE]\n\n";
  expect(Buffer.byteLength(wire)).toBeGreaterThan(1000000);
  vi.spyOn(globalThis, "fetch").mockResolvedValue(stream(wire, 4096));
  const r = await new HttpModel({ "openai-compatible": "http://127.0.0.1:1/v1" }, "fake").decide({
    ...request,
    model: { ...request.model, thinking: true },
    maxOutputTokens: 8192,
    signal: AbortSignal.timeout(30000),
  });
  expect(r).toMatchObject({ decision: { kind: "wait" }, outputTokens: 6007, execution: { reasoningChars: 6000 } });
});
it.each([true, false])(
  "retains per-frame and cumulative decoded-content bounds for larger allowances (%s)",
  async (single) => {
    const chunk = (value: string) =>
      event({ id: "oversized", choices: [{ index: 0, delta: { reasoning: value }, finish_reason: null }] });
    const wire = single ? chunk("x".repeat(1000001)) : chunk("x".repeat(300000)).repeat(4);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(stream(wire, 4096));
    await expect(
      new HttpModel({ "openai-compatible": "http://127.0.0.1:1/v1" }, "fake").decide({
        ...request,
        maxOutputTokens: 8192,
        signal: AbortSignal.timeout(30000),
      }),
    ).rejects.toMatchObject({ code: "RESPONSE_TOO_LARGE" });
  },
);
