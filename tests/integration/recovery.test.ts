import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CredentialBroker } from "../../src/games/pact/credentials.js";
import { SyntheticOwner } from "../../src/games/pact/owner.js";
import { FakeGame, FakeModel, fixture, ready } from "../helpers.js";
import { Engine } from "../pact-engine.js";

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  vi.unstubAllGlobals();
  await cleanup?.();
});
async function setup() {
  const f = await fixture();
  cleanup = () => f.pool.end();
  const id = await ready(f.store, 1);
  const claim = await f.store.claim("recovery");
  if (!claim) throw Error("missing claim");
  return {
    ...f,
    id,
    claim,
    game: new FakeGame(claim),
    broker: new CredentialBroker(f.store, "https://fixture.example", "http://127.0.0.1:8820", true),
  };
}
describe("explicit recovery and owner boundaries", () => {
  it("unresolved social setup prevents resuming and preserves the pending configuration", async () => {
    const f = await setup();
    await f.store.setState(f.id, "paused", true);
    const pending = {
      commandId: randomUUID(),
      action: { kind: "contact.delegation", mode: "agent_decides", expectedVersion: 0, allowedKingdomIds: [] },
    };
    await f.broker.save(f.claim.agentId, { socialPending: pending }, "ready");
    await expect(f.store.setState(f.id, "running", true)).rejects.toThrow("SOCIAL_DECISION_PENDING");
    expect((await f.store.cohort(f.id)).state).toBe("paused");
    expect((await f.broker.load(f.claim.agentId)).socialPending).toEqual(pending);
  });
  it("operator review resolves non-command failures without resetting usage or resuming", async () => {
    const f = await setup();
    await f.store.reserveCall(f.claim);
    await f.store.finish(f.claim, "INVALID_DECISION");
    await expect(f.store.reviewTurn(f.claim.id)).rejects.toThrow("PAUSED_REVIEW_REQUIRED");
    await f.store.setState(f.id, "paused", true);
    const ledger = (await f.pool.query("SELECT * FROM compute_ledger")).rows;
    await f.store.reviewTurn(f.claim.id);
    expect((await f.pool.query("SELECT * FROM compute_ledger")).rows).toEqual(ledger);
    expect((await f.store.cohort(f.id)).state).toBe("paused");
    expect((await f.store.publicState()).turns[0].state).toBe("cancelled");
    expect((await f.store.agent(f.claim.agentId)).state).toBe("ready");
    expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n).toBe(1);
  });
  it("operator review cannot discard an unresolved exact command", async () => {
    const f = await setup(),
      command = randomUUID();
    await f.store.pending(f.claim, command, { kind: "fixture" });
    await f.store.finish(f.claim, "TRANSPORT_UNCERTAIN");
    await expect(f.store.reviewTurn(f.claim.id)).rejects.toThrow("RECOVERY_REQUIRED");
    expect((await f.store.publicState()).turns[0].pending_command).toBe(command);
  });
  it("a missing receipt preserves the exact command and never replans", async () => {
    const f = await setup(),
      model = new FakeModel([
        {
          kind: "action",
          summary: "send",
          action: { kind: "game.message.send", recipientKingdomId: randomUUID(), body: "fixture" },
        },
      ]);
    f.game.failSubmit = true;
    const e = new Engine(f.store, model, async () => f.game, true);
    await e.run(f.claim);
    const pending = (await f.store.publicState()).turns[0].pending_command;
    f.game.receiptValue = { commandId: pending, code: "RECEIPT_NOT_FOUND" };
    await e.reconcile(f.claim.id);
    expect((await f.store.publicState()).turns[0].pending_command).toBe(pending);
    expect(model.inputs).toHaveLength(1);
    f.game.receiptValue = { commandId: pending, code: "COMMITTED" };
    await e.reconcile(f.claim.id);
    expect((await f.store.publicState()).turns[0].actions).toBe(1);
    await expect(e.reconcile(f.claim.id)).rejects.toThrow("NO_PENDING_COMMAND");
  });
  it("uncertain refresh is not replayed or replaced with a new identity", async () => {
    const f = await setup(),
      account = f.claim.agent.account_id;
    await f.broker.save(
      f.claim.agentId,
      { accessToken: "synthetic_old", refreshToken: "synthetic_refresh", clientId: "fixture", expiresAt: 0 },
      "ready",
    );
    const fetcher = vi.fn(async () => {
      throw Error("uncertain transport");
    });
    vi.stubGlobal("fetch", fetcher);
    await expect(f.broker.game(f.claim.agentId)).rejects.toThrow("AUTH_REQUIRED");
    await expect(f.broker.game(f.claim.agentId)).rejects.toThrow("AUTH_REQUIRED");
    expect(fetcher).toHaveBeenCalledTimes(1);
    const a = await f.store.agent(f.claim.agentId);
    expect(a.account_id).toBe(account);
    expect(a.credential_state).toBe("needs_reconnect");
    expect(a.state).toBe("needs_owner");
  });
  it("OAuth callback nonce is operator-bound and consumed before an uncertain exchange", async () => {
    const f = await setup();
    await f.store.pool.query(
      "INSERT INTO oauth_attempts(state,agent_id,operator_session,secret_cipher,expires_at) VALUES($1,$2,$3,$4,$5)",
      [
        "fixture-state",
        f.claim.agentId,
        "operator-one",
        f.store.vault.encrypt(
          { clientId: "fixture", verifier: "fixture", redirect: "http://fixture/callback" },
          "oauth:fixture-state",
        ),
        new Date(f.now().getTime() + 1000),
      ],
    );
    const fetcher = vi.fn(async () => {
      throw Error("uncertain exchange");
    });
    vi.stubGlobal("fetch", fetcher);
    await expect(f.broker.oauthFinish("fixture-state", "fixture-code", "other-operator")).rejects.toThrow(
      "OAUTH_STATE_INVALID",
    );
    expect(fetcher).not.toHaveBeenCalled();
    await expect(f.broker.oauthFinish("fixture-state", "fixture-code", "operator-one")).rejects.toThrow(
      "OAUTH_RECONNECT_REQUIRED",
    );
    await expect(f.broker.oauthFinish("fixture-state", "fixture-code", "operator-one")).rejects.toThrow(
      "OAUTH_STATE_INVALID",
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("personal attached grants cannot use the synthetic owner bridge", async () => {
    const f = await setup();
    await f.broker.save(f.claim.agentId, { synthetic: false, accountId: f.claim.agent.account_id ?? "" }, "ready");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(f.broker.ownerRequest(f.claim.agentId, "command", {})).rejects.toThrow("SYNTHETIC_OWNER_REQUIRED");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("synthetic owner approval keeps immutable exact commands and a lifetime quota", async () => {
    const f = await setup(),
      action = { kind: "game.message.send", recipientKingdomId: randomUUID(), body: "fixture" };
    await f.store.pool.query("UPDATE cohorts SET synthetic_owner_policy=$2 WHERE id=$1", [
      f.id,
      { allowedKinds: [action.kind], maxCommands: 1 },
    ]);
    let sent = 0;
    const owner = new SyntheticOwner(f.store, {
      ownerRequest: async (_id, _route, body) => {
        sent++;
        return { commandId: body.commandId, code: "COMMITTED" };
      },
    });
    const id = randomUUID();
    expect((await owner.submit(f.claim, id, action)).code).toBe("COMMITTED");
    await expect(owner.submit(f.claim, id, { ...action, body: "changed" })).rejects.toThrow("OWNER_DECISION_CONFLICT");
    await expect(owner.submit(f.claim, randomUUID(), action)).rejects.toThrow("OWNER_BUDGET_EXHAUSTED");
    expect(sent).toBe(1);
  });
  it("no exception policy never performs an owner call", async () => {
    const f = await setup(),
      request = vi.fn();
    const owner = new SyntheticOwner(f.store, { ownerRequest: request });
    await expect(
      owner.submit(f.claim, randomUUID(), {
        kind: "game.message.send",
        recipientKingdomId: randomUUID(),
        body: "fixture",
      }),
    ).rejects.toThrow("OWNER_APPROVAL_REQUIRED");
    expect(request).not.toHaveBeenCalled();
  });
  it("rotating social observations reach the model and dashboard without forced messages", async () => {
    const f = await setup(),
      peer = randomUUID(),
      original = f.game.read.bind(f.game);
    f.game.read = async (tool, args) =>
      tool === "pact_agent_guide_v1" ? { contacts: [{ kingdomId: peer }] } : original(tool, args);
    await f.store.consent(f.id, true);
    const model = new FakeModel();
    await new Engine(f.store, model, async () => f.game, true).run(f.claim);
    expect(model.inputs[0].messages[1].content).toContain("A synthetic trade proposal");
    expect((await f.store.publicState()).pairs).toHaveLength(1);
    expect(f.game.submits).toHaveLength(0);
  });
  it("process shutdown aborts a pending provider call and retains its reservation", async () => {
    const f = await setup();
    let entered: () => void = () => {};
    const signalReady = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const model = {
      decide: async (input: Parameters<FakeModel["decide"]>[0]) => {
        entered();
        return new Promise<Awaited<ReturnType<FakeModel["decide"]>>>((_resolve, reject) =>
          input.signal.addEventListener("abort", () => reject(Error("TRANSPORT_UNCERTAIN")), { once: true }),
        );
      },
    };
    const engine = new Engine(f.store, model, async () => f.game, true);
    const running = engine.run(f.claim);
    await signalReady;
    engine.stop();
    await running;
    expect(f.game.submits).toHaveLength(0);
    const ledger = (await f.pool.query("SELECT status,tokens FROM compute_ledger")).rows[0];
    expect(ledger.status).toBe("unknown");
    expect(Number(ledger.tokens)).toBe(40000);
    expect(await engine.tick("stopped")).toBe(null);
  });
});
