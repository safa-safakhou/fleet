import { afterEach, expect, it, vi } from "vitest";
import { ProposalRejection } from "../../src/domain.js";
import { McpGame } from "../../src/games/pact/mcp.js";

afterEach(() => vi.unstubAllGlobals());
it.each(["EXPIRED", "STALE_VERSION", "FORBIDDEN", "TRANSPORT_UNCERTAIN"])(
  "only exposes known read-only quote changes as correctable: %s",
  async (code) => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (_url: unknown, init: RequestInit = {}) => {
      const body = JSON.parse(String(init.body ?? "{}"));
      if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
      const names = ["pact_action_effects_quote_v1", "pact_action_effects_execute_v1"];
      if (body.method === "tools/list")
        return Response.json({ result: { tools: names.map((name) => ({ name, inputSchema: { type: "object" } })) } });
      if (body.method === "initialize") return Response.json({ result: {} });
      calls.push(body.params.name);
      return Response.json({ result: { isError: true, structuredContent: { error: { code } } } });
    });
    const game = new McpGame("https://fixture.example", "synthetic");
    await game.init();
    const error = await game.effects({}).catch((e: unknown) => e);
    expect(error).toHaveProperty("code", code);
    expect(error instanceof ProposalRejection).toBe(["EXPIRED", "STALE_VERSION"].includes(code));
    if (error instanceof ProposalRejection) expect(error.notDispatched).toBe(true);
    const executeError = await game.submitGuarded({}, {}).catch((e: unknown) => e);
    expect(executeError instanceof ProposalRejection).toBe(false);
    expect(calls).toEqual(["pact_action_effects_quote_v1", "pact_action_effects_execute_v1"]);
  },
);
it("requires a server-confirmed independent session when used for concurrent consumers", async () => {
  const requests: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", async (_url: unknown, init: RequestInit = {}) => {
    const body = JSON.parse(String(init.body ?? "{}"));
    requests.push(body);
    if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
    return Response.json(
      {
        result:
          body.method === "initialize"
            ? {
                _meta: { "pact/session-scope": "connection" },
                capabilities: { experimental: { "pact/connection-sessions": true } },
              }
            : { tools: [] },
      },
      { headers: { "Mcp-Session-Id": "isolated-fixture" } },
    );
  });
  const game = new McpGame("https://fixture.example", "synthetic", true);
  await game.init();
  expect(requests[0]).toMatchObject({ params: { _meta: { "pact/session-scope": "connection" } } });
});
it("refuses unsupported session isolation before reading or executing gameplay", async () => {
  let requests = 0;
  vi.stubGlobal("fetch", async () => {
    requests++;
    return Response.json({ result: {} });
  });
  await expect(new McpGame("https://fixture.example", "synthetic", true).init()).rejects.toThrow(
    "SESSION_ISOLATION_UNSUPPORTED",
  );
  expect(requests).toBe(1);
});
