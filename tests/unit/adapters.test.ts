import { afterEach, describe, expect, it, vi } from "vitest";
import { ModelConfig } from "../../src/domain.js";
import { McpGame } from "../../src/games/pact/mcp.js";
import { endpoint, jsonRequest } from "../../src/http.js";
import { HttpModel } from "../../src/model.js";

afterEach(() => vi.unstubAllGlobals());
describe("bounded model adapters", () => {
  it("Ollama requests bounded output and unload, with separately reported usage", async () => {
    const fetcher = vi.fn(async (_url: unknown, _init: RequestInit) =>
      Response.json({
        message: { content: JSON.stringify({ kind: "wait", summary: "wait" }) },
        prompt_eval_count: 123,
        eval_count: 12,
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    const r = await new HttpModel({ ollama: "http://127.0.0.1:11434" }, undefined).decide({
      model: { route: "ollama", model: "selected" },
      messages: [{ role: "user", content: "synthetic facts" }],
      schema: { type: "object" },
      maxOutputTokens: 500,
      signal: AbortSignal.timeout(1000),
    });
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(body.keep_alive).toBe(0);
    expect(body.options.num_predict).toBe(500);
    expect(r.inputTokens).toBe(123);
    expect(r.outputTokens).toBe(12);
  });
  it("API adapter sends credentials only in the authorization header", async () => {
    const fetcher = vi.fn(async (_url: unknown, _init: RequestInit) =>
      Response.json({
        choices: [{ message: { content: '{"kind":"wait","summary":"wait"}' } }],
        usage: { prompt_tokens: 111, completion_tokens: 22 },
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    const r = await new HttpModel({ "openai-compatible": "https://fixture.example/v1" }, "synthetic_key").decide({
      model: { route: "openai-compatible", model: "selected" },
      messages: [{ role: "user", content: "facts" }],
      schema: {},
      maxOutputTokens: 100,
      signal: AbortSignal.timeout(1000),
    });
    expect(String(fetcher.mock.calls[0]?.[1]?.body)).not.toContain("synthetic_key");
    expect(r.inputTokens).toBe(111);
  });
  it("malformed JSON fails without masquerading as a game action", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, _init: RequestInit) => Response.json({ message: { content: "not json" } })),
    );
    await expect(
      new HttpModel({ ollama: "http://fixture" }, undefined).decide({
        model: { route: "ollama", model: "fixture" },
        messages: [],
        schema: {},
        maxOutputTokens: 10,
        signal: AbortSignal.timeout(1000),
      }),
    ).rejects.toThrow("INVALID_DECISION");
  });
  it("missing provider setup invokes no network call", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(
      new HttpModel({}, undefined).decide({
        model: { route: "ollama", model: "fixture" },
        messages: [],
        schema: {},
        maxOutputTokens: 10,
        signal: AbortSignal.timeout(1000),
      }),
    ).rejects.toThrow("MODEL_ENDPOINT_REQUIRED");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
describe("transport boundaries", () => {
  it("rejects credentials embedded in configured endpoints", () => {
    expect(() => endpoint("https://password:secret@example.com")).toThrow();
    expect(() => endpoint("http://remote.example")).toThrow();
  });
  it("bounded errors do not expose arbitrary provider text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, _init: RequestInit) =>
        Response.json({ error: { message: "secret text", code: "unsafe secret" } }, { status: 500 }),
      ),
    );
    await expect(jsonRequest("https://fixture.example")).rejects.toThrow("TRANSPORT_UNCERTAIN");
  });
  it("rejects oversized streamed responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("x".repeat(1000001))),
    );
    await expect(jsonRequest("https://fixture.example")).rejects.toThrow("RESPONSE_TOO_LARGE");
  });
  it("MCP handles initialized 202 and retains the account-bound session", async () => {
    const requests: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init: RequestInit) => {
        const b = init.body ? JSON.parse(String(init.body)) : {};
        requests.push(b);
        if (b.method === "notifications/initialized") return new Response(null, { status: 202 });
        if (init.method === "DELETE") return new Response(null, { status: 204 });
        const result =
          b.method === "initialize"
            ? {}
            : b.method === "tools/list"
              ? {
                  tools: [
                    { name: "pact_profile_v1", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } },
                  ],
                }
              : { structuredContent: { id: "fixture-account" } };
        return Response.json(
          { jsonrpc: "2.0", id: b.id, result },
          { headers: { "Mcp-Session-Id": "fixture-session" } },
        );
      }),
    );
    const game = new McpGame("https://fixture.example", "synthetic_token");
    await game.init();
    expect((await game.profile()).accountId).toBe("fixture-account");
    await expect(game.read("shell", {})).rejects.toThrow("READ_TOOL_FORBIDDEN");
    await game.close();
    expect(requests.some((r) => r.method === "notifications/initialized")).toBe(true);
  });
  it("preserves explicit MCP tool-error provenance without inventing a command receipt", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init: RequestInit) => {
        const b = init.body ? JSON.parse(String(init.body)) : {};
        if (b.method === "notifications/initialized") return new Response(null, { status: 202 });
        if (init.method === "DELETE") return new Response(null, { status: 204 });
        const result =
          b.method === "tools/list"
            ? {
                tools: [
                  { name: "pact_profile_v1", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } },
                ],
              }
            : b.method === "tools/call"
              ? { isError: true, structuredContent: { error: { code: "SLOT_BUSY" } } }
              : {};
        return Response.json({ jsonrpc: "2.0", id: b.id, result });
      }),
    );
    const game = new McpGame("https://fixture.example", "synthetic_token");
    await game.init();
    await expect(game.profile()).rejects.toMatchObject({ code: "SLOT_BUSY", status: 200 });
    await game.close();
  });
});

it("sends an explicit Ollama thinking choice without changing defaults or allowing it on other routes", async () => {
  const bodies: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return Response.json({
        message: { content: '{"kind":"wait","summary":"fixture"}' },
        prompt_eval_count: 10,
        eval_count: 5,
      });
    }),
  );
  const provider = new HttpModel({ ollama: "http://127.0.0.1:11434" }, undefined);
  for (const thinking of [undefined, false, true])
    await provider.decide({
      model: { route: "ollama", model: "fixture", ...(thinking === undefined ? {} : { thinking }) },
      messages: [],
      schema: {},
      maxOutputTokens: 100,
      signal: AbortSignal.timeout(1000),
    });
  expect(Object.hasOwn(bodies[0], "think")).toBe(false);
  expect(bodies[1].think).toBe(false);
  expect(bodies[2].think).toBe(true);
  expect(ModelConfig.safeParse({ route: "codex-cli", model: "fixture", thinking: false }).success).toBe(false);
  expect(ModelConfig.safeParse({ route: "ollama", model: "fixture", thinking: false }).success).toBe(true);
});
