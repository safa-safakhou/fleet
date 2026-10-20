import { afterEach, expect, it, vi } from "vitest";
import { McpGame } from "../../src/games/pact/mcp.js";

afterEach(() => vi.unstubAllGlobals());
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
