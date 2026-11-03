import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { FleetError } from "../../src/domain.js";
import { terminalControl } from "../../src/vllm-terminal.js";
import { vllmCompletion } from "../../src/vllm-transport.js";

afterEach(() => vi.restoreAllMocks());
const packet = (x: unknown) => `data: ${JSON.stringify(x)}\n\n`;
function receipt(client: string) {
  const value = {
    clientRequestId: client,
    finishReason: "abort",
    instanceId: "synthetic-instance",
    nativeRequestId: "native-exact",
    schemaVersion: "fleet.vllm-terminal.v1",
    usage: { completion_tokens: 3, prompt_tokens: 17, total_tokens: 20 },
  };
  return { ...value, sha256: createHash("sha256").update(JSON.stringify(value)).digest("hex") };
}
it("requests an exact native abort and drains authoritative usage without accepting the partial answer", async () => {
  const stop = new AbortController();
  let client = "";
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  const evidence: unknown[] = [];
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    const path = String(url);
    if (path.endsWith("/chat/completions")) {
      client = JSON.parse(String(init?.body)).request_id;
      return new Response(
        new ReadableStream({
          start(c) {
            stream = c;
            c.enqueue(
              new TextEncoder().encode(
                packet({ id: "native-exact", choices: [{ index: 0, delta: { content: '{"type":"WAIT"} ' } }] }),
              ),
            );
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      );
    }
    if (path.endsWith("/abort")) {
      expect(init?.method).toBe("POST");
      expect(path).toContain(client);
      stream.enqueue(
        new TextEncoder().encode(
          packet({ id: "native-exact", choices: [{ index: 0, delta: {}, finish_reason: "abort" }] }) +
            packet({
              id: "native-exact",
              choices: [],
              usage: { prompt_tokens: 17, completion_tokens: 3, total_tokens: 20 },
            }) +
            "data: [DONE]\n\n",
        ),
      );
      stream.close();
      return Response.json({
        instanceId: "synthetic-instance",
        clientRequestId: client,
        nativeRequestId: "native-exact",
      });
    }
    return Response.json(receipt(client));
  });
  const call = vllmCompletion(
    "http://synthetic.invalid/v1/chat/completions",
    { max_completion_tokens: 100 },
    "fake",
    stop.signal,
    async (e) => {
      evidence.push(e);
    },
    undefined,
    { instanceId: "synthetic-instance" },
  );
  await vi.waitFor(() => expect(client).not.toBe(""));
  stop.abort(new FleetError("MODEL_DEADLINE_EXCEEDED"));
  const result = await call;
  expect(result.data).toMatchObject({
    usage: { prompt_tokens: 17, completion_tokens: 3 },
    choices: [{ finish_reason: "abort" }],
  });
  expect(result).toHaveProperty("cancelledCode", "MODEL_DEADLINE_EXCEEDED");
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(evidence.some((e) => JSON.stringify(e).includes("fleetTerminalControl"))).toBe(true);
});
it("keeps usage unknown when terminal accounting is unavailable and bounds the drain", async () => {
  const stop = new AbortController();
  let started = false;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    if (String(url).endsWith("/chat/completions")) {
      started = true;
      return new Response(new ReadableStream({ start() {} }), { headers: { "content-type": "text/event-stream" } });
    }
    return Response.json({ error: "unavailable" }, { status: 503 });
  });
  const begun = performance.now();
  const call = vllmCompletion(
    "http://synthetic.invalid/v1/chat/completions",
    {},
    "fake",
    stop.signal,
    undefined,
    undefined,
    { instanceId: "synthetic-instance" },
  ).catch((e) => e);
  await vi.waitFor(() => expect(started).toBe(true));
  stop.abort(new FleetError("HOST_STOPPED"));
  const result = await call;
  expect(result).toMatchObject({ code: "HOST_STOPPED" });
  expect(result).not.toHaveProperty("inputTokens");
  expect(performance.now() - begun).toBeLessThan(1800);
});
it("recovers only a durable native final receipt after a dropped response, with no executable answer", async () => {
  let client = "";
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    if (String(url).endsWith("/chat/completions")) {
      client = JSON.parse(String(init?.body)).request_id;
      return new Response(
        new ReadableStream({
          start(c) {
            c.error(new Error("synthetic socket lost"));
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      );
    }
    return Response.json(receipt(client));
  });
  const result = await vllmCompletion(
    "http://synthetic.invalid/v1/chat/completions",
    {},
    "fake",
    new AbortController().signal,
    undefined,
    undefined,
    { instanceId: "synthetic-instance" },
  );
  expect(result.data).toMatchObject({
    usage: { prompt_tokens: 17, completion_tokens: 3 },
    choices: [{ message: { content: "" } }],
  });
  expect(result).toHaveProperty("accountingOnly", true);
});

it("rejects cross-instance, cross-request, mutated and partial terminal receipts", async () => {
  const client = "f7941166-3f61-4011-9061-ddb1f1ebbd16";
  for (const bad of [
    { ...receipt(client), instanceId: "other" },
    { ...receipt(client), clientRequestId: "11111111-1111-4111-8111-111111111111" },
    { ...receipt(client), sha256: "0".repeat(64) },
    { ...receipt(client), usage: { prompt_tokens: 17 } },
  ]) {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(bad));
    await expect(
      terminalControl(
        "http://synthetic.invalid/v1/chat/completions",
        "fake",
        client,
        "terminal",
        "synthetic-instance",
        AbortSignal.timeout(1000),
      ),
    ).rejects.toThrow();
  }
});
it("an aborted native response retains usage and can never provide an executable decision", async () => {
  const { HttpModel } = await import("../../src/model.js");
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({
      choices: [{ message: { content: '{"type":"WAIT"}' }, finish_reason: "abort" }],
      usage: { prompt_tokens: 17, completion_tokens: 3 },
    }),
  );
  const result = await new HttpModel({ "openai-compatible": "http://synthetic.invalid/v1" }, "fake").decide({
    model: { route: "openai-compatible", provider: "vllm", model: "fixture" },
    messages: [],
    schema: { type: "object" },
    maxOutputTokens: 100,
    signal: AbortSignal.timeout(1000),
  });
  expect(result).toMatchObject({ inputTokens: 17, outputTokens: 3, decision: null, decisionError: "MODEL_ABORTED" });
});
