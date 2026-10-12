import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { type Data, FleetError } from "../../src/domain.js";
import { RemoteRejection } from "../../src/http.js";
import { FakeGame, FakeModel, fixture, ready } from "../helpers.js";
import { Engine } from "../pact-engine.js";

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
});
async function setup() {
  const f = await fixture();
  cleanup = () => f.pool.end();
  const id = await ready(f.store, 1),
    claim = await f.store.claim("test");
  if (!claim) throw Error("missing claim");
  return { ...f, id, claim, game: new FakeGame(claim) };
}
describe("observe decide commit", () => {
  it.each([200, 500])(
    "MCP denial status %s distinguishes a tool rejection from uncertain transport",
    async (status) => {
      const f = await setup();
      f.game.submit = async () => {
        throw new RemoteRejection("SLOT_BUSY", status);
      };
      const model = new FakeModel([
        {
          kind: "action",
          action: { kind: "game.building.queue", building: "farm", targetLevel: 2, slot: 1 },
          summary: "Queue farm",
        },
      ]);
      await new Engine(f.store, model, async () => f.game, true).run(f.claim);
      const t = (await f.store.publicState()).turns[0];
      expect(t.code).toBe(status === 200 ? "SLOT_BUSY" : "TRANSPORT_UNCERTAIN");
      expect(t.actions).toBe(0);
      expect(t.state).toBe(status === 200 ? "finished" : "pending");
      expect(Boolean(t.pending_command)).toBe(status === 500);
    },
  );
  it.each([400, 500])("owner denial status %s distinguishes rejection from uncertain submission", async (status) => {
    const f = await setup();
    f.game.submit = async () => {
      throw new FleetError("FORBIDDEN");
    };
    const model = new FakeModel([
      {
        kind: "action",
        action: { kind: "game.building.queue", building: "farm", targetLevel: 2, slot: 1 },
        summary: "Queue farm",
      },
    ]);
    await new Engine(f.store, model, async () => f.game, true, {
      prepare: async (_claim, action) => action,
      submit: async () => {
        throw new RemoteRejection("SLOT_BUSY", status);
      },
    }).run(f.claim);
    const t = (await f.store.publicState()).turns[0];
    expect(t.code).toBe(status === 400 ? "SLOT_BUSY" : "TRANSPORT_UNCERTAIN");
    expect(t.actions).toBe(0);
    expect(t.state).toBe(status === 400 ? "finished" : "pending");
    expect(Boolean(t.pending_command)).toBe(status === 500);
  });
  it("HTTP 5xx cannot trigger an owner fallback even with a permission-looking error code", async () => {
    const f = await setup();
    let ownerCalls = 0;
    f.game.submit = async () => {
      throw new RemoteRejection("FORBIDDEN", 503);
    };
    const model = new FakeModel([
      {
        kind: "action",
        action: { kind: "game.building.queue", building: "farm", targetLevel: 2, slot: 1 },
        summary: "Queue farm",
      },
    ]);
    await new Engine(f.store, model, async () => f.game, true, {
      prepare: async (_c, a) => a,
      submit: async () => {
        ownerCalls++;
        throw Error("must not execute");
      },
    }).run(f.claim);
    expect(ownerCalls).toBe(0);
    const t = (await f.store.publicState()).turns[0];
    expect(t.state).toBe("pending");
    expect(t.code).toBe("TRANSPORT_UNCERTAIN");
    expect(t.pending_command).toBeTruthy();
  });
  it("read schema lookup returns the actual read-only catalog schema without granting a write tool", async () => {
    const f = await setup();
    const model = new FakeModel([
      {
        kind: "read",
        tool: "fleet_read_schema",
        args: { name: "pact_council_thread_v1" },
        summary: "Inspect exact args",
      },
      { kind: "wait", summary: "Wait" },
    ]);
    await new Engine(f.store, model, async () => f.game, true).run(f.claim);
    expect(model.inputs[1].messages[1].content).toContain("inputSchema");
    expect(model.inputs[1].messages[1].content).toContain("kingdomId");
    expect(f.game.opened).toBe(0);
    f.advance(900000);
    const claim = await f.store.claim("next");
    if (!claim) throw Error("missing claim");
    const denied = new FakeModel([
      { kind: "read", tool: "fleet_read_schema", args: { name: "pact_game_action_v2" }, summary: "Invalid lookup" },
    ]);
    await new Engine(f.store, denied, async () => new FakeGame(claim), true).run(claim);
    expect((await f.store.publicState()).turns[0].code).toBe("INVALID_TOOL_ARGUMENTS");
  });
  it("large real-shaped candidates survive the next turn and permit a new exact action", async () => {
    const f = await setup();
    const support = {
      schemaVersion: "fixture",
      forecast: { text: "x".repeat(20000) },
      candidates: Array.from({ length: 20 }, (_, n) => ({
        id: `synthetic-${n}`,
        kind: "development",
        action: { kind: "game.building.queue", building: "farm", targetLevel: 2, slot: 1 },
        checks: { affordable: true, prerequisite: "met" },
        effects: { costMarkedUnits: { iron: "144000", silver: "72000" }, explanation: "x".repeat(500) },
      })),
    };
    const original = f.game.read.bind(f.game);
    f.game.tools = async () => [
      ...(await new FakeGame(f.claim).tools()),
      { name: "pact_decision_support_v2", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } },
    ];
    f.game.read = async (tool, args) => (tool === "pact_decision_support_v2" ? support : original(tool, args));
    const first = new FakeModel([
      {
        kind: "read",
        tool: "pact_decision_support_v2",
        args: {},
        summary: "Inspect exact choices",
        notes: "Continue evaluating the observed affordable Farm candidate",
      },
      { kind: "read", tool: "pact_agent_guide_v1", args: { topic: "diplomacy" }, summary: "Inspect rules" },
      { kind: "wait", summary: "Continue next scheduled turn" },
    ]);
    await new Engine(f.store, first, async () => f.game, true).run(f.claim);
    expect(JSON.parse(first.inputs[1].messages[1].content).turnBudget.decisionsRemaining).toBe(2);
    f.advance(900000);
    const claim = await f.store.claim("next");
    if (!claim) throw Error("missing claim");
    const model = new FakeModel(),
      game = new FakeGame(claim);
    model.decide = async (input) => {
      model.inputs.push(input);
      const context = JSON.parse(input.messages[1].content);
      const candidates = context.readResults.find((r: Data) => r.tool === "pact_decision_support_v2").result.candidates;
      expect(candidates[0]).toEqual(support.candidates[0]);
      expect(context.privateNotes).toContain("Farm candidate");
      expect(context.lastIntent).toBe("Continue next scheduled turn");
      return {
        decision:
          model.inputs.length === 1
            ? { kind: "action", action: candidates[0].action, summary: "Queue affordable Farm" }
            : { kind: "wait", summary: "Wait" },
        inputTokens: 500,
        outputTokens: 50,
      };
    };
    await new Engine(f.store, model, async () => game, true).run(claim);
    expect(game.submits).toHaveLength(1);
    expect(game.submits[0].action).toEqual(support.candidates[0].action);
    expect(model.inputs[1].messages[1].content).toContain("COMMITTED");
  });
  it("two isolated agents discover, introduce, accept and message with real fixture identifiers", async () => {
    const f = await fixture();
    cleanup = () => f.pool.end();
    const id = await ready(f.store, 2);
    await f.store.consent(id, true);
    const agents = (await f.pool.query("SELECT id,account_id,kingdom_id FROM agents ORDER BY ordinal")).rows;
    const requestId = randomUUID(),
      messageId = randomUUID();
    let requested = false,
      accepted = false,
      sent = false;
    const port = (claim: NonNullable<Awaited<ReturnType<typeof f.store.claim>>>) => {
      const game = new FakeGame(claim),
        original = game.read.bind(game);
      game.tools = async () => [
        ...(await new FakeGame(claim).tools()),
        { name: "pact_play_view_v1", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } },
      ];
      game.read = async (tool, args) =>
        tool === "pact_agent_guide_v1"
          ? {
              socialDelegation: { mode: "agent_decides" },
              contacts: accepted
                ? [
                    {
                      kingdomId:
                        agents[0].kingdom_id === claim.agent.kingdom_id ? agents[1].kingdom_id : agents[0].kingdom_id,
                    },
                  ]
                : [],
              contactRequests:
                requested && !accepted && claim.agent.kingdom_id === agents[1].kingdom_id
                  ? [{ requestId, senderKingdomId: agents[0].kingdom_id }]
                  : [],
            }
          : tool === "pact_play_view_v1"
            ? {
                world: { text: "x".repeat(20000) },
                parties: Object.fromEntries(
                  agents.map((a) => [a.kingdom_id, { character: { name: "Synthetic peer" } }]),
                ),
              }
            : tool === "pact_council_thread_v1"
              ? {
                  messages: sent
                    ? [
                        {
                          id: messageId,
                          senderKingdomId: agents[1].kingdom_id,
                          body: "Synthetic trial exchange",
                          sentGameTimeMs: "1791600000000",
                        },
                      ]
                    : [],
                }
              : original(tool, args);
      game.submit = async (commandId, action) => {
        if (action.kind === "game.contact.request") {
          expect(action.recipientKingdomId).toBe(agents[1].kingdom_id);
          requested = true;
        } else if (action.kind === "game.contact.answer") {
          expect(requested).toBe(true);
          expect(action.requestId).toBe(requestId);
          accepted = true;
        } else if (action.kind === "game.message.send") {
          if (!accepted) throw new FleetError("FORBIDDEN");
          sent = true;
        } else throw Error("unexpected action");
        game.submits.push({ commandId, action });
        return { commandId, code: "COMMITTED" };
      };
      return game;
    };
    const first = await f.store.claim("sender");
    if (!first) throw Error("missing claim");
    const sender = new FakeModel([
      { kind: "read", tool: "pact_play_view_v1", args: {}, summary: "Discover peers" },
      {
        kind: "action",
        action: {
          kind: "game.contact.request",
          recipientKingdomId: agents[1].kingdom_id,
          note: "Synthetic introduction",
        },
        summary: "Introduce",
      },
      { kind: "wait", summary: "Await decision" },
    ]);
    await new Engine(f.store, sender, async () => port(first), true).run(first);
    expect(sender.inputs[1].messages[1].content).toContain(agents[1].kingdom_id);
    f.advance(450000);
    const second = await f.store.claim("recipient");
    if (!second) throw Error("missing claim");
    const recipient = new FakeModel([
      { kind: "action", action: { kind: "game.contact.answer", requestId, accept: true }, summary: "Accept" },
      {
        kind: "action",
        action: {
          kind: "game.message.send",
          recipientKingdomId: agents[0].kingdom_id,
          body: "Synthetic trial exchange",
        },
        summary: "Reply",
      },
      { kind: "wait", summary: "Await negotiation" },
    ]);
    await new Engine(f.store, recipient, async () => port(second), true).run(second);
    expect(sent).toBe(true);
    expect(recipient.inputs[0].messages[1].content).toContain("agent_decides");
    expect((await f.store.publicState()).pairs).toHaveLength(1);
    expect((await f.pool.query("SELECT sum(actions)::int n FROM turns")).rows[0].n).toBe(3);
  });
  it("does not reuse expired read history in a new decision", async () => {
    const f = await setup(),
      peer = randomUUID();
    const first = new FakeModel([
      { kind: "read", tool: "pact_council_thread_v1", args: { kingdomId: peer }, summary: "Inspect" },
      { kind: "wait", summary: "Wait" },
    ]);
    await new Engine(f.store, first, async () => f.game, true).run(f.claim);
    await f.pool.query("UPDATE agents SET read_memory_updated_at=$2 WHERE id=$1", [
      f.claim.agentId,
      "2026-10-09T12:00:00Z",
    ]);
    f.advance(900000);
    const claim = await f.store.claim("next-worker");
    if (!claim) throw Error("missing scheduled claim");
    const second = new FakeModel();
    await new Engine(f.store, second, async () => new FakeGame(claim), true).run(claim);
    expect(second.inputs[0].messages[1].content).not.toContain("A synthetic trade proposal");
  });
  it("carries dated encrypted reads across scheduled turns without replaying a command", async () => {
    const f = await setup(),
      peer = randomUUID();
    const first = new FakeModel([
      { kind: "read", tool: "pact_council_thread_v1", args: { kingdomId: peer }, summary: "Inspect conversation" },
      { kind: "read", tool: "pact_agent_guide_v1", args: { topic: "diplomacy" }, summary: "Inspect rules" },
      { kind: "read", tool: "fleet_action_schema", args: { kind: "game.message.send" }, summary: "Inspect schema" },
    ]);
    await new Engine(f.store, first, async () => f.game, true).run(f.claim);
    const a = await f.store.agent(f.claim.agentId);
    expect(a.read_memory_cipher).toBeTruthy();
    expect(a.read_memory_cipher).not.toContain("synthetic trade proposal");
    f.advance(900000);
    const claim = await f.store.claim("next-worker");
    if (!claim) throw Error("missing scheduled claim");
    const game = new FakeGame(claim),
      second = new FakeModel([
        {
          kind: "action",
          action: { kind: "game.message.send", recipientKingdomId: peer, body: "Trial proposal" },
          summary: "Offer trial",
        },
        { kind: "wait", summary: "Await response" },
      ]);
    await new Engine(f.store, second, async () => game, true).run(claim);
    expect(second.inputs[0].messages[1].content).toContain("A synthetic trade proposal");
    expect(second.inputs[0].messages[1].content).toContain("2026-10-11T12:00:00.000Z");
    expect(second.inputs[0].messages[1].content).toContain("Historical facts may be stale");
    expect(game.submits).toHaveLength(1);
    await expect(f.store.rememberReads(f.claim, [])).rejects.toThrow("CLAIM_FENCED");
  });
  it("a large guide read stays explicitly partial and permits the next bounded decision", async () => {
    const f = await setup();
    const original = f.game.read.bind(f.game);
    f.game.read = async (tool, args) =>
      args.topic === "development"
        ? { rules: "A synthetic rule. ".repeat(10000), costs: Array.from({ length: 500 }, (_, level) => ({ level })) }
        : original(tool, args);
    const model = new FakeModel([
      { kind: "read", tool: "pact_agent_guide_v1", args: { topic: "development" }, summary: "Inspect rules" },
      { kind: "wait", summary: "Need a narrower observation before committing" },
    ]);
    await new Engine(f.store, model, async () => f.game, true).run(f.claim);
    expect(model.inputs).toHaveLength(2);
    const next = model.inputs[1].messages[1].content;
    expect(next).toContain("Incomplete observation");
    expect(Buffer.byteLength(next)).toBeLessThan(f.claim.cohort.budget?.inputByteLimit ?? 0);
    expect((await f.store.publicState()).turns[0].code).toBe("WAIT");
    expect(f.game.opened).toBe(0);
  });
  it("reads before a dependent action, then records a real fake-port receipt", async () => {
    const f = await setup(),
      peer = randomUUID(),
      model = new FakeModel([
        { kind: "read", tool: "pact_council_thread_v1", args: { kingdomId: peer }, summary: "Inspect actual terms" },
        {
          kind: "action",
          action: { kind: "game.message.send", recipientKingdomId: peer, body: "I can offer a short trial." },
          summary: "Sent a concrete proposal",
        },
        { kind: "wait", summary: "Wait for a response" },
      ]);
    await f.store.consent(f.id, true);
    const engine = new Engine(f.store, model, async () => f.game, true);
    await engine.run(f.claim);
    expect(model.inputs).toHaveLength(3);
    expect(model.inputs[1].messages[1].content).toContain("A synthetic trade proposal");
    expect(f.game.submits).toHaveLength(1);
    expect(f.game.opened).toBe(1);
    expect(f.game.closed).toBe(1);
    const s = await f.store.publicState();
    expect(s.turns[0].actions).toBe(1);
    expect(s.pairs).toHaveLength(1);
  });
  it("allows justified waiting without opening a lease", async () => {
    const f = await setup(),
      model = new FakeModel();
    await new Engine(f.store, model, async () => f.game, true).run(f.claim);
    expect(f.game.opened).toBe(0);
    expect((await f.store.publicState()).turns[0].code).toBe("WAIT");
  });
  it("pause during model work prevents subsequent gameplay", async () => {
    const f = await setup(),
      model = new FakeModel([
        {
          kind: "action",
          action: { kind: "game.message.send", recipientKingdomId: randomUUID(), body: "Should not send" },
          summary: "test",
        },
      ]);
    const original = model.decide.bind(model);
    model.decide = async (input) => {
      const r = await original(input);
      await f.store.setState(f.id, "paused", true);
      return r;
    };
    await new Engine(f.store, model, async () => f.game, true).run(f.claim);
    expect(f.game.submits).toHaveLength(0);
    expect((await f.store.publicState()).turns[0].state).toBe("cancelled");
  });
  it("an ambiguous commit persists exactly and recovery buys no new decision", async () => {
    const f = await setup(),
      action = { kind: "game.message.send", recipientKingdomId: randomUUID(), body: "A synthetic message" },
      model = new FakeModel([{ kind: "action", action, summary: "send" }]);
    f.game.failSubmit = true;
    const engine = new Engine(f.store, model, async () => f.game, true);
    await engine.run(f.claim);
    let s = await f.store.publicState();
    expect(s.turns[0].state).toBe("pending");
    const command = s.turns[0].pending_command;
    expect(command).toBe(f.game.submits[0].commandId);
    await engine.reconcile(f.claim.id);
    s = await f.store.publicState();
    expect(s.turns[0].pending_command).toBe(null);
    expect(model.inputs).toHaveLength(1);
    expect(f.game.submits).toHaveLength(1);
  });
  it("foreign account observations cannot be used", async () => {
    const f = await setup(),
      model = new FakeModel();
    f.game.profile = async () => ({ accountId: randomUUID() });
    await new Engine(f.store, model, async () => f.game, true).run(f.claim);
    expect(model.inputs).toHaveLength(0);
    expect((await f.store.publicState()).agents[0].state).toBe("needs_owner");
  });
  it("peer text cannot introduce shell or write-as-read capabilities", async () => {
    const f = await setup(),
      model = new FakeModel([{ kind: "read", tool: "shell", args: { command: "anything" }, summary: "injected" }]);
    await new Engine(f.store, model, async () => f.game, true).run(f.claim);
    expect(f.game.submits).toHaveLength(0);
    expect((await f.store.publicState()).turns[0].code).toBe("READ_TOOL_FORBIDDEN");
  });
  it("disabled live execution never calls the provider or game adapter", async () => {
    const f = await fixture();
    cleanup = () => f.pool.end();
    await ready(f.store, 1);
    const model = new FakeModel();
    let connects = 0;
    const e = new Engine(
      f.store,
      model,
      async () => {
        connects++;
        throw Error("not allowed");
      },
      false,
    );
    expect(await e.tick("disabled")).toBe(null);
    expect(model.inputs).toHaveLength(0);
    expect(connects).toBe(0);
  });
  it("invalid JSON structure is distinct from game outcome", async () => {
    const f = await setup(),
      model = new FakeModel([
        { kind: "action", summary: "claimed", action: { kind: "invented" }, credentials: "secret" },
      ]);
    await new Engine(f.store, model, async () => f.game, true).run(f.claim);
    expect(f.game.submits).toHaveLength(0);
    expect((await f.store.publicState()).turns[0].code).toBe("INVALID_DECISION");
  });
});
