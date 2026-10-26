import { afterEach, expect, it, vi } from "vitest";
import { CredentialBroker } from "../../src/games/pact/credentials.js";
import { fixture, ready } from "../helpers.js";

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  vi.unstubAllGlobals();
  await close?.();
});
async function setup() {
  const f = await fixture();
  close = () => f.pool.end();
  const id = await ready(f.store, 1);
  const agent = (await f.store.publicState()).agents[0];
  const broker = new CredentialBroker(f.store, "https://fixture.example", "http://localhost", true);
  await broker.save(
    agent.id,
    { accessToken: "old-access", refreshToken: "old-refresh", clientId: "client", expiresAt: 0 },
    "ready",
  );
  return { ...f, id, agent, broker };
}
function network(accountId: string) {
  let attempts = 0,
    proof: string | undefined,
    supported = true;
  vi.stubGlobal("fetch", async (input: unknown, init: RequestInit = {}) => {
    const path = new URL(String(input)).pathname,
      body = init.body ? JSON.parse(String(init.body)) : {};
    if (path.includes(".well-known"))
      return Response.json({ refresh_recovery_supported: supported ? "pact.refresh-recovery.v1" : undefined });
    if (path === "/oauth/token") {
      attempts++;
      expect(body.refresh_token).toBe("old-refresh");
      expect(body.recovery_proof).toMatch(/^[A-Za-z0-9_-]{43}$/);
      if (proof) expect(body.recovery_proof).toBe(proof);
      proof = body.recovery_proof;
      if (attempts === 1) throw new TypeError("lost acknowledgment after rotation");
      return Response.json({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 600 });
    }
    if (body.method === "initialize")
      return Response.json({ result: { _meta: { "pact/session-scope": "connection" } } });
    if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
    if (body.method === "tools/list")
      return Response.json({
        result: {
          tools: [{ name: "pact_profile_v1", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } }],
        },
      });
    if (body.method === "tools/call") return Response.json({ result: { structuredContent: { id: accountId } } });
    return Response.json({ result: {} });
  });
  return {
    attempts: () => attempts,
    proof: () => proof,
    downgrade: () => {
      supported = false;
    },
  };
}
it("recovers a lost rotation acknowledgment after broker restart with the exact proof and account", async () => {
  const f = await setup(),
    net = network(f.agent.account_id ?? "");
  await expect(f.broker.game(f.agent.id)).rejects.toThrow("AUTH_TEMPORARY");
  const pending = await f.broker.load(f.agent.id);
  expect(pending.refreshAttempt?.proof).toBe(net.proof());
  expect((await f.store.agent(f.agent.id)).credential_state).toBe("refreshing");
  const replacement = new CredentialBroker(f.store, "https://fixture.example", "http://localhost", true);
  await replacement.recover();
  expect(net.attempts()).toBe(2);
  expect(await replacement.load(f.agent.id)).toMatchObject({ accessToken: "new-access", refreshToken: "new-refresh" });
  expect((await replacement.load(f.agent.id)).refreshAttempt).toBeUndefined();
  expect(await f.store.agent(f.agent.id)).toMatchObject({
    account_id: f.agent.account_id,
    kingdom_id: f.agent.kingdom_id,
    credential_state: "ready",
  });
  expect((await f.store.cohort(f.id)).state).toBe("running");
  expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n).toBe(0);
});
it("never replays a recovery against a server that no longer supports its proof", async () => {
  const f = await setup(),
    net = network(f.agent.account_id ?? "");
  await expect(f.broker.game(f.agent.id)).rejects.toThrow("AUTH_TEMPORARY");
  net.downgrade();
  await f.broker.recover();
  expect(net.attempts()).toBe(1);
  expect((await f.store.agent(f.agent.id)).credential_state).toBe("needs_reconnect");
});
it("expires a proof-bound attempt without replay or erased credentials", async () => {
  const f = await setup(),
    net = network(f.agent.account_id ?? "");
  await expect(f.broker.game(f.agent.id)).rejects.toThrow("AUTH_TEMPORARY");
  f.advance(8 * 60000 + 1);
  await f.broker.recover();
  expect(net.attempts()).toBe(1);
  expect((await f.store.agent(f.agent.id)).credential_state).toBe("needs_reconnect");
  expect((await f.broker.load(f.agent.id)).refreshToken).toBe("old-refresh");
});
it("recovery does not overwrite a newer grant or touch a pre-existing paused cohort", async () => {
  const f = await setup(),
    net = network(f.agent.account_id ?? "");
  await expect(f.broker.game(f.agent.id)).rejects.toThrow("AUTH_TEMPORARY");
  await f.store.setState(f.id, "paused", true);
  await f.broker.recover();
  expect(net.attempts()).toBe(1);
  await f.broker.save(
    f.agent.id,
    { accessToken: "newer", refreshToken: "newer-refresh", clientId: "new-client", expiresAt: 9999999999999 },
    "ready",
  );
  await f.broker.recover();
  expect((await f.broker.load(f.agent.id)).accessToken).toBe("newer");
  expect((await f.store.cohort(f.id)).state).toBe("paused");
});

it("refreshes once when a locally unexpired access token is rejected during profile initialization", async () => {
  const f = await setup();
  await f.broker.save(
    f.agent.id,
    {
      accessToken: "old-access",
      refreshToken: "old-refresh",
      clientId: "client",
      expiresAt: f.now().getTime() + 3600000,
    },
    "ready",
  );
  let refreshes = 0;
  vi.stubGlobal("fetch", async (input: unknown, init: RequestInit = {}) => {
    const path = new URL(String(input)).pathname,
      body = init.body ? JSON.parse(String(init.body)) : {};
    if (path.includes(".well-known")) return Response.json({});
    if (path === "/oauth/token") {
      refreshes++;
      return Response.json({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600 });
    }
    if (body.method === "initialize")
      return Response.json({ result: { _meta: { "pact/session-scope": "connection" } } });
    if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
    if (body.method === "tools/list")
      return Response.json({
        result: {
          tools: [{ name: "pact_profile_v1", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } }],
        },
      });
    if (body.method === "tools/call") {
      if (new Headers(init.headers).get("authorization") === "Bearer old-access")
        return Response.json({ error: { code: "AUTH_REQUIRED" } }, { status: 401 });
      return Response.json({ result: { structuredContent: { id: f.agent.account_id } } });
    }
    return Response.json({ result: {} });
  });
  const game = await f.broker.game(f.agent.id);
  expect((await game.profile()).accountId).toBe(f.agent.account_id);
  expect(refreshes).toBe(1);
  expect((await f.broker.load(f.agent.id)).refreshToken).toBe("new-refresh");
  await game.close();
});

it("queues concurrent connections for the same account without losing a normal turn to AUTH_BUSY", async () => {
  const f = await setup();
  await f.broker.save(f.agent.id, { accessToken: "access", expiresAt: f.now().getTime() + 600000 }, "ready");
  let entered!: () => void, release!: () => void;
  const inInitialize = new Promise<void>((ok) => {
    entered = ok;
  });
  const hold = new Promise<void>((ok) => {
    release = ok;
  });
  let initialized = 0;
  vi.stubGlobal("fetch", async (_input: unknown, init: RequestInit = {}) => {
    const body = JSON.parse(String(init.body ?? "{}"));
    if (body.method === "initialize") {
      initialized++;
      if (initialized === 1) {
        entered();
        await hold;
      }
      return Response.json(
        {
          result: {
            _meta: { "pact/session-scope": "connection" },
            capabilities: { experimental: { "pact/connection-sessions": true } },
          },
        },
        { headers: { "Mcp-Session-Id": "fixture-" + initialized } },
      );
    }
    if (body.method === "initialize")
      return Response.json({ result: { _meta: { "pact/session-scope": "connection" } } });
    if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
    if (body.method === "tools/list")
      return Response.json({
        result: {
          tools: [{ name: "pact_profile_v1", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } }],
        },
      });
    return Response.json({ result: { structuredContent: { id: f.agent.account_id } } });
  });
  const first = f.broker.game(f.agent.id);
  await inInitialize;
  const results = Promise.allSettled([first, f.broker.game(f.agent.id)]);
  const timer = setTimeout(release, 250);
  try {
    expect((await results).map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
  } finally {
    clearTimeout(timer);
    release();
  }
});

it("keeps an existing MCP session usable after another consumer rotates its account token", async () => {
  const f = await setup();
  await f.broker.save(
    f.agent.id,
    {
      accessToken: "old-access",
      refreshToken: "old-refresh",
      clientId: "client",
      expiresAt: f.now().getTime() + 120000,
    },
    "ready",
  );
  let currentToken = "old-access",
    sessions = 0;
  const sessionIds: string[] = [];
  vi.stubGlobal("fetch", async (input: unknown, init: RequestInit = {}) => {
    const path = new URL(String(input)).pathname,
      body = JSON.parse(String(init.body ?? "{}")),
      headers = new Headers(init.headers);
    if (path.includes(".well-known")) return Response.json({});
    if (path === "/oauth/token") {
      currentToken = "new-access";
      return Response.json({ access_token: currentToken, refresh_token: "new-refresh", expires_in: 900 });
    }
    if (headers.get("authorization") !== `Bearer ${currentToken}`)
      return Response.json({ error: { code: "FORBIDDEN" } }, { status: 401 });
    if (body.method === "initialize")
      return Response.json(
        { result: { _meta: { "pact/session-scope": "connection" } } },
        { headers: { "Mcp-Session-Id": `session-${++sessions}` } },
      );
    if (init.method === "DELETE") {
      sessionIds.push(headers.get("Mcp-Session-Id")!);
      return new Response(null, { status: 204 });
    }
    if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
    if (body.method === "tools/list")
      return Response.json({
        result: {
          tools: [{ name: "pact_profile_v1", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } }],
        },
      });
    sessionIds.push(headers.get("Mcp-Session-Id")!);
    return Response.json({ result: { structuredContent: { id: f.agent.account_id } } });
  });
  const original = await f.broker.game(f.agent.id);
  f.advance(61000);
  const other = await f.broker.game(f.agent.id);
  expect((await original.profile()).accountId).toBe(f.agent.account_id);
  await original.close();
  await other.close();
  expect(sessions).toBe(2);
  expect(sessionIds.at(-2)).toBe("session-1");
  expect((await f.broker.load(f.agent.id)).accessToken).toBe("new-access");
  expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n).toBe(0);
});
