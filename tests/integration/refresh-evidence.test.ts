import { afterEach, expect, it, vi } from "vitest";
import { Engine } from "../../src/engine.js";
import { pactAdapter } from "../../src/games/pact/adapter.js";
import { CredentialBroker } from "../../src/games/pact/credentials.js";
import { FakeModel, fixture, ready } from "../helpers.js";

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  vi.unstubAllGlobals();
  await close?.();
});
const old = {
  accessToken: "synthetic-old-access",
  refreshToken: "synthetic-old-refresh",
  clientId: "fixture-client",
  expiresAt: 0,
};
const tokens = {
  access_token: "synthetic-rotated-access",
  refresh_token: "synthetic-rotated-refresh",
  expires_in: 3600,
};
const refusal = () =>
  new TypeError("fetch failed", { cause: Object.assign(new Error("fixture refusal"), { code: "ECONNREFUSED" }) });
async function setup() {
  const f = await fixture();
  close = () => f.pool.end();
  const id = await ready(f.store, 1),
    claim = await f.store.claim("refresh");
  if (!claim) throw Error("claim");
  const broker = new CredentialBroker(f.store, "https://fixture.example", "http://127.0.0.1:8820", true);
  await broker.save(claim.agentId, old, "ready");
  return { ...f, id, claim, broker };
}
function mock(accountId: string, token: () => Promise<Response>) {
  let calls = 0;
  const request = vi.fn(async (input: unknown, init: RequestInit = {}) => {
    const path = new URL(String(input)).pathname,
      body = init.body ? JSON.parse(String(init.body)) : {};
    if (path === "/oauth/token") {
      calls++;
      expect(body).toMatchObject({
        grant_type: "refresh_token",
        client_id: old.clientId,
        refresh_token: old.refreshToken,
      });
      return token();
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
  vi.stubGlobal("fetch", request);
  return { request, calls: () => calls };
}
it("retries one locally confirmed refusal and saves one rotated grant with identity/accounting intact", async () => {
  const f = await setup();
  let n = 0;
  const network = mock(String(f.claim.agent.account_id), async () => {
    if (n++ === 0) throw refusal();
    return Response.json(tokens);
  });
  const before = await f.store.cohort(f.id),
    game = await f.broker.game(f.claim.agentId);
  await game.close();
  expect(network.calls()).toBe(2);
  expect(await f.broker.load(f.claim.agentId)).toMatchObject({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    clientId: old.clientId,
  });
  expect(await f.store.cohort(f.id)).toEqual(before);
  expect((await f.store.agent(f.claim.agentId)).account_id).toBe(f.claim.agent.account_id);
  expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n).toBe(0);
});
it("two confirmed nonexecutions remain scheduled with old credentials and no provider allocation", async () => {
  const f = await setup(),
    network = mock(String(f.claim.agent.account_id), async () => {
      throw refusal();
    }),
    model = new FakeModel();
  await new Engine(f.store, model, (id) => f.broker.game(id), true, pactAdapter).run(f.claim);
  expect(network.calls()).toBe(2);
  expect(model.inputs).toEqual([]);
  expect(await f.broker.load(f.claim.agentId)).toEqual(old);
  expect(await f.store.agent(f.claim.agentId)).toMatchObject({
    state: "ready",
    credential_state: "ready",
    reason: "AUTH_TEMPORARY",
  });
  expect((await f.store.publicState()).turns[0]).toMatchObject({
    code: "AUTH_TEMPORARY",
    state: "finished",
    pending_command: null,
    calls: 0,
  });
  expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n).toBe(0);
  f.advance(900000);
  expect(await f.store.claim("original-next-slot")).not.toBeNull();
});
for (const mode of ["gateway", "lost_ack", "revoked"])
  it(`quarantines ${mode} without retry, binding change or unknown-usage refund`, async () => {
    const f = await setup();
    await f.store.reserveCall(f.claim);
    await f.pool.query("UPDATE compute_ledger SET status='unknown' WHERE turn_id=$1", [f.claim.id]);
    const ledger = (await f.pool.query("SELECT * FROM compute_ledger")).rows;
    const network = mock(String(f.claim.agent.account_id), async () => {
      if (mode === "lost_ack") throw new TypeError("fetch failed", { cause: { code: "ECONNRESET" } });
      return Response.json(
        mode === "revoked" ? { error: "INVALID_GRANT" } : { error: { code: "TRANSPORT_UNCERTAIN" } },
        { status: mode === "revoked" ? 400 : 502 },
      );
    });
    await expect(f.broker.game(f.claim.agentId)).rejects.toThrow("AUTH_REQUIRED");
    await expect(f.broker.game(f.claim.agentId)).rejects.toThrow("AUTH_REQUIRED");
    expect(network.calls()).toBe(1);
    expect(await f.broker.load(f.claim.agentId)).toEqual(old);
    expect(await f.store.agent(f.claim.agentId)).toMatchObject({
      account_id: f.claim.agent.account_id,
      kingdom_id: f.claim.agent.kingdom_id,
      state: "needs_owner",
      credential_state: "needs_reconnect",
      reason: mode === "revoked" ? "REFRESH_REJECTED" : "REFRESH_UNCERTAIN",
    });
    expect((await f.pool.query("SELECT * FROM compute_ledger")).rows).toEqual(ledger);
    const audit = JSON.stringify(
      (await f.pool.query("SELECT detail FROM audit_events WHERE kind='credential.refresh'")).rows,
    );
    expect(audit).not.toContain(old.refreshToken);
    expect(audit).not.toContain(old.accessToken);
  });
it("single-flights concurrent brokers and queues a second connection without refreshing twice", async () => {
  const f = await setup();
  let release: (() => void) | undefined, entered: (() => void) | undefined;
  const started = new Promise<void>((r) => {
      entered = r;
    }),
    gate = new Promise<void>((r) => {
      release = r;
    });
  const network = mock(String(f.claim.agent.account_id), async () => {
    entered?.();
    await gate;
    return Response.json(tokens);
  });
  const first = f.broker.game(f.claim.agentId);
  await started;
  await f.pool.query(
    "INSERT INTO oauth_attempts(state,agent_id,operator_session,secret_cipher,expires_at) VALUES($1,$2,$3,$4,$5)",
    [
      "callback-while-refreshing",
      f.claim.agentId,
      "operator",
      f.store.vault.encrypt(
        {
          clientId: "fixture",
          verifier: "fixture",
          redirect: "http://fixture/callback",
          agentFence: (await f.store.agent(f.claim.agentId)).fence,
        },
        "oauth:callback-while-refreshing",
      ),
      new Date(f.now().getTime() + 60000),
    ],
  );
  await expect(f.broker.oauthFinish("callback-while-refreshing", "code", "operator")).rejects.toThrow("AUTH_BUSY");
  expect(
    (await f.pool.query("SELECT phase FROM oauth_attempts WHERE state='callback-while-refreshing'")).rows[0].phase,
  ).toBe("pending");
  const second = new CredentialBroker(f.store, "https://fixture.example", "http://127.0.0.1:8820", true);
  const queued = second.game(f.claim.agentId);
  release?.();
  await (await first).close();
  await (await queued).close();
  expect(network.calls()).toBe(1);
});
for (const mode of ["pause", "newer_grant"])
  it(`fences ${mode} during rotation and never overwrites a newer grant`, async () => {
    const f = await setup();
    const newer = {
      ...old,
      accessToken: "synthetic-newer-access",
      refreshToken: "synthetic-newer-refresh",
      expiresAt: f.now().getTime() + 3600000,
    };
    const network = mock(String(f.claim.agent.account_id), async () => {
      await f.store.setState(f.id, "paused", true);
      if (mode === "newer_grant") await f.broker.save(f.claim.agentId, newer, "ready");
      return Response.json(tokens);
    });
    await expect(f.broker.game(f.claim.agentId)).rejects.toThrow("AUTH_REQUIRED");
    expect(network.calls()).toBe(1);
    expect((await f.store.cohort(f.id)).state).toBe("paused");
    if (mode === "newer_grant") {
      expect(await f.broker.load(f.claim.agentId)).toEqual(newer);
      expect((await f.store.agent(f.claim.agentId)).credential_state).toBe("ready");
    } else {
      expect(await f.broker.load(f.claim.agentId)).toEqual(old);
      expect(await f.store.agent(f.claim.agentId)).toMatchObject({
        credential_state: "needs_reconnect",
        reason: "REFRESH_FENCED_ROTATION",
      });
    }
  });
it("a stale fence stops even a confirmed-safe retry without quarantining unrotated credentials", async () => {
  const f = await setup();
  const network = mock(String(f.claim.agent.account_id), async () => {
    await f.store.setState(f.id, "paused", true);
    throw refusal();
  });
  await expect(f.broker.game(f.claim.agentId)).rejects.toThrow("CLAIM_FENCED");
  expect(network.calls()).toBe(1);
  expect(await f.broker.load(f.claim.agentId)).toEqual(old);
  expect((await f.store.agent(f.claim.agentId)).credential_state).toBe("ready");
  expect((await f.store.cohort(f.id)).state).toBe("paused");
});

for (const mode of ["legacy", "stale"])
  it(`refuses a ${mode} OAuth callback before exchange without overwriting credentials`, async () => {
    const f = await setup();
    await f.store.setState(f.id, "paused", true);
    const current = await f.store.agent(f.claim.agentId);
    await f.pool.query(
      "INSERT INTO oauth_attempts(state,agent_id,operator_session,secret_cipher,expires_at) VALUES($1,$2,$3,$4,$5)",
      [
        "callback-fixture",
        f.claim.agentId,
        "operator",
        f.store.vault.encrypt(
          {
            clientId: "new-client",
            verifier: "fixture",
            redirect: "http://fixture/callback",
            ...(mode === "stale" ? { agentFence: (BigInt(current.fence) - 1n).toString() } : {}),
          },
          "oauth:callback-fixture",
        ),
        new Date(f.now().getTime() + 60000),
      ],
    );
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    await expect(f.broker.oauthFinish("callback-fixture", "fixture-code", "operator")).rejects.toThrow(
      "OAUTH_RECONNECT_REQUIRED",
    );
    expect(request).not.toHaveBeenCalled();
    expect(await f.broker.load(f.claim.agentId)).toEqual(old);
    expect((await f.pool.query("SELECT phase FROM oauth_attempts WHERE state='callback-fixture'")).rows[0].phase).toBe(
      "uncertain",
    );
    expect((await f.store.agent(f.claim.agentId)).account_id).toBe(current.account_id);
  });
