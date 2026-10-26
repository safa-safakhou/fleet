import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CredentialBroker } from "../../src/games/pact/credentials.js";
import { fixture } from "../helpers.js";

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  vi.unstubAllGlobals();
  await cleanup?.();
});
async function setup() {
  const f = await fixture();
  cleanup = () => f.pool.end();
  const { id } = await f.store.create({
    name: "Enrollment fixtures",
    count: 2,
    intervalMinutes: 15,
    seed: "fixture",
    strategies: ["guardian", "merchant"],
  });
  const agents = (await f.store.publicState()).agents;
  return {
    ...f,
    id,
    agents,
    broker: new CredentialBroker(f.store, "https://fixture.example", "http://127.0.0.1:8820", true),
  };
}
const mandate = {
  allowedActions: ["world.read", "message.send.contact"],
  resourceLimits: { iron: "600", silver: "600", grain: "600" },
  reserveFloors: { grain: "0" },
  troopLimit: 0,
  sessionLimit: 1,
};
function mockGame() {
  const account = randomUUID(),
    kingdom = randomUUID(),
    entries: Record<string, unknown>[] = [],
    grants: Record<string, unknown>[] = [];
  let failRegistration = false,
    failSocial = false;
  let delegation = { mode: "manual", allowedKingdomIds: [] as string[], version: 0 };
  const socialCommands: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init: RequestInit = {}) => {
      const path = new URL(String(input)).pathname,
        body = init.body ? JSON.parse(String(init.body)) : {};
      if (path === "/.well-known/oauth-authorization-server") return Response.json({});
      if (path === "/v1/play/join") {
        entries.push(body);
        return Response.json(
          { accountId: account, kingdomId: kingdom, csrfToken: "fixture-csrf" },
          { headers: { "set-cookie": "fixture_owner=synthetic; HttpOnly" } },
        );
      }
      if (path === "/v1/mandate") return Response.json({ version: 1 });
      if (path === "/v1/social/commands") {
        expect(init.headers).toMatchObject({ cookie: "fixture_owner=synthetic", "x-csrf-token": "fixture-csrf" });
        socialCommands.push(body);
        if (failSocial) throw Error("uncertain social command");
        expect(body.schemaVersion).toBe("pact.social-command.v2");
        expect(body.action.expectedVersion).toBe(delegation.version);
        delegation = {
          mode: body.action.mode,
          allowedKingdomIds: body.action.allowedKingdomIds,
          version: delegation.version + 1,
        };
        return Response.json({
          receipt: { commandId: body.commandId, code: "COMMITTED" },
          result: { version: delegation.version },
        });
      }
      if (path === "/oauth/register") {
        if (failRegistration) {
          failRegistration = false;
          throw Error("uncertain registration");
        }
        return Response.json({ client_id: "fixture-client" });
      }
      if (path === "/oauth/authorize") return Response.json({ code: "fixture-code" });
      if (path === "/oauth/token") {
        grants.push(body);
        return Response.json({ access_token: "fixture-access", refresh_token: "fixture-refresh", expires_in: 3600 });
      }
      if (path === "/mcp") {
        if (init.method === "DELETE") return new Response(null, { status: 204 });
        if (body.method === "initialize")
          return Response.json({ result: { _meta: { "pact/session-scope": "connection" } } });
        if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
        const result =
          body.method === "tools/list"
            ? {
                tools: [
                  { name: "pact_profile_v1", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } },
                  { name: "pact_world_read_v1", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } },
                  { name: "pact_agent_guide_v1", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } },
                ],
              }
            : body.method === "tools/call"
              ? {
                  structuredContent:
                    body.params.name === "pact_profile_v1"
                      ? { id: account }
                      : body.params.name === "pact_agent_guide_v1"
                        ? { socialDelegation: delegation }
                        : { profile: { kingdomId: kingdom } },
                }
              : {};
        return Response.json(
          { jsonrpc: "2.0", id: body.id, result },
          { headers: { "Mcp-Session-Id": "fixture-session" } },
        );
      }
      throw Error("unexpected fixture path");
    }),
  );
  return {
    account,
    kingdom,
    entries,
    grants,
    socialCommands,
    failSocial: () => {
      failSocial = true;
    },
    failOnce: () => {
      failRegistration = true;
    },
  };
}
describe("account enrollment", () => {
  it("explicit owner preparation enrolls a draft while runtime execution stays disabled", async () => {
    const f = await setup();
    mockGame();
    const broker = new CredentialBroker(f.store, "https://fixture.example", "http://127.0.0.1:8820", false, {
      allowSyntheticEnrollment: true,
    });
    const id = f.agents[0].id;
    await broker.provision(id, { ...mandate, socialDelegation: { mode: "agent_decides", allowedKingdomIds: [] } });
    expect((await f.store.agent(id)).credential_state).toBe("ready");
    await expect(broker.game(id)).rejects.toThrow("LIVE_EXECUTION_DISABLED");
    expect((await f.store.cohort(f.id)).state).toBe("draft");
    expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n).toBe(0);
    expect((await f.pool.query("SELECT count(*)::int n FROM turns")).rows[0].n).toBe(0);
    await f.store.setState(f.id, "stopped", true);
    await expect(broker.provision(id, mandate)).rejects.toThrow("COHORT_NOT_EDITABLE");
  });
  it("disabled runtime does not implicitly authorize owner enrollment", async () => {
    const f = await setup();
    const remote = vi.fn();
    vi.stubGlobal("fetch", remote);
    const broker = new CredentialBroker(f.store, "https://fixture.example", "http://127.0.0.1:8820", false);
    await expect(broker.provision(f.agents[0].id, mandate)).rejects.toThrow("LIVE_EXECUTION_DISABLED");
    expect(remote).not.toHaveBeenCalled();
  });
  it("social setup refreshes an expired grant before authenticated readback", async () => {
    const f = await setup(),
      game = mockGame(),
      id = f.agents[0].id;
    await f.broker.provision(id, mandate);
    f.advance(3600001);
    await f.broker.configureSocial(id, { mode: "agent_decides" });
    expect(game.grants.at(-1)?.grant_type).toBe("refresh_token");
    expect(game.socialCommands).toHaveLength(1);
    expect((await f.store.agent(id)).credential_state).toBe("ready");
  });
  it("explicit synthetic social setup commits and reads back without starting inference", async () => {
    const f = await setup(),
      game = mockGame(),
      id = f.agents[0].id;
    await f.broker.provision(id, { ...mandate, socialDelegation: { mode: "agent_decides", allowedKingdomIds: [] } });
    expect(game.socialCommands).toHaveLength(1);
    await f.broker.configureSocial(id, { mode: "agent_decides", allowedKingdomIds: [] });
    expect(game.socialCommands).toHaveLength(1);
    expect((await f.broker.load(id)).socialPending).toBeUndefined();
    expect((await f.store.cohort(f.id)).state).toBe("draft");
    expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n).toBe(0);
  });
  it("uncertain social configuration keeps the exact pending decision and never blindly replays", async () => {
    const f = await setup(),
      game = mockGame(),
      id = f.agents[0].id;
    await f.broker.provision(id, mandate);
    game.failSocial();
    await expect(f.broker.configureSocial(id, { mode: "agent_decides" })).rejects.toThrow();
    const pending = (await f.broker.load(id)).socialPending;
    expect(pending?.commandId).toBeTruthy();
    await expect(f.broker.configureSocial(id, { mode: "agent_decides" })).rejects.toThrow("SOCIAL_DECISION_PENDING");
    expect((await f.broker.load(id)).socialPending).toEqual(pending);
    expect(game.socialCommands).toHaveLength(1);
  });
  it("social setup rejects real attachments and terminal cohorts", async () => {
    const f = await setup();
    mockGame();
    const id = f.agents[0].id;
    await f.broker.provision(id, mandate);
    const secret = await f.broker.load(id);
    await f.broker.save(id, { ...secret, synthetic: false }, "ready");
    await expect(f.broker.configureSocial(id, { mode: "agent_decides" })).rejects.toThrow("SYNTHETIC_OWNER_REQUIRED");
    await f.broker.save(id, secret, "ready");
    await f.store.setState(f.id, "stopped", true);
    await expect(f.broker.configureSocial(id, { mode: "agent_decides" })).rejects.toThrow("COHORT_NOT_EDITABLE");
  });
  it("fresh synthetic enrollment binds one encrypted account without inference or scheduling", async () => {
    const f = await setup(),
      game = mockGame(),
      id = f.agents[0].id;
    await f.broker.provision(id, mandate);
    const a = await f.store.agent(id);
    expect(a.account_id).toBe(game.account);
    expect(a.kingdom_id).toBe(game.kingdom);
    expect(a.credential_state).toBe("ready");
    expect(game.entries).toHaveLength(1);
    expect(game.socialCommands).toHaveLength(0);
    expect(a.secret_cipher).not.toContain("fixture-access");
    expect((await f.store.cohort(f.id)).state).toBe("draft");
    expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n).toBe(0);
  });
  it("interrupted enrollment uses the original entry key and existing identity on recovery", async () => {
    const f = await setup(),
      game = mockGame(),
      id = f.agents[0].id;
    game.failOnce();
    await expect(f.broker.provision(id, mandate)).rejects.toThrow("PROVISIONING_UNCERTAIN");
    const bound = (await f.store.agent(id)).account_id;
    await f.broker.provision(id, mandate);
    expect(game.entries).toHaveLength(2);
    expect(game.entries[0].entryKey).toBe(game.entries[1].entryKey);
    expect(game.entries[1].existingOnly).toBe(true);
    expect((await f.store.agent(id)).account_id).toBe(bound);
  });
  it("one game account cannot attach to two fleet agents", async () => {
    const f = await setup();
    mockGame();
    await f.broker.provision(f.agents[0].id, mandate);
    await expect(f.broker.provision(f.agents[1].id, mandate)).rejects.toThrow("PROVISIONING_UNCERTAIN");
    expect((await f.store.agent(f.agents[1].id)).account_id).toBe(null);
    expect((await f.store.agent(f.agents[0].id)).credential_state).toBe("ready");
  });
  it("same-account OAuth reconnect retains a synthetic owner's binding", async () => {
    const f = await setup(),
      game = mockGame(),
      id = f.agents[0].id;
    await f.broker.provision(id, mandate);
    const before = await f.broker.load(id);
    const originalFetch = fetch;
    vi.stubGlobal("fetch", async (input: unknown, init: RequestInit = {}) =>
      new URL(String(input)).pathname === "/oauth/register"
        ? Response.json({ client_id: "new-client" })
        : originalFetch(input as RequestInfo, init),
    );
    const started = await f.broker.oauthStart(id, "operator");
    const state = new URL(started.url).searchParams.get("state");
    if (!state) throw Error("missing OAuth state");
    await f.broker.oauthFinish(state, "code", "operator");
    const after = await f.broker.load(id);
    expect(after.entryKey).toBe(before.entryKey);
    expect(after.synthetic).toBe(true);
    expect((await f.store.agent(id)).account_id).toBe(game.account);
    expect(after.clientId).toBe("new-client");
  });
});
