import { randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { pactAdapter } from "../../src/games/pact/adapter.js";
import { SyntheticOwner } from "../../src/games/pact/owner.js";
import { RemoteRejection } from "../../src/http.js";
import { Observability } from "../../src/observability.js";
import { FakeGame, FakeModel, fixture, ready, tools } from "../helpers.js";
import { Engine } from "../pact-engine.js";

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
});
async function setup() {
  const f = await fixture();
  cleanup = () => f.pool.end();
  const id = await ready(f.store, 1),
    claim = await f.store.claim("attention-test");
  if (!claim) throw Error("NO_CLAIM");
  return { ...f, id, claim, game: new FakeGame(claim) };
}
const building = { kind: "game.building.queue", building: "farm", targetLevel: 2, slot: 1 };
it.each(["committed", "uncertain", "stopped"])(
  "retries one definitive tick rejection with the exact command, preserving %s",
  async (result) => {
    const f = await setup(),
      submitted: { id: string; action: unknown }[] = [];
    f.claim.cohort.budget!.maxCallsPerTurn = 1;
    const model = new FakeModel([{ kind: "action", action: building, summary: "Queue farm" }]);
    const engine = new Engine(f.store, model, async () => f.game, true);
    f.game.submit = async (id, action) => {
      submitted.push({ id, action });
      if (submitted.length === 1) {
        if (result === "stopped") engine.stop();
        throw new RemoteRejection("TICK_PENDING", 200);
      }
      if (result === "uncertain") throw new RemoteRejection("TICK_PENDING", 503);
      return { commandId: id, code: "COMMITTED" };
    };
    await engine.run(f.claim);
    const turn = (await f.store.publicState()).turns[0];
    expect(submitted).toHaveLength(result === "stopped" ? 1 : 2);
    if (submitted.length === 2) expect(submitted[1]).toEqual(submitted[0]);
    expect(model.inputs).toHaveLength(1);
    if (result === "committed") {
      expect(turn.actions).toBe(1);
      expect(turn.pending_command).toBeNull();
    } else if (result === "uncertain") {
      expect(turn.state).toBe("pending");
      expect(turn.pending_command).toBe(submitted[0].id);
      expect((await f.pool.query("SELECT * FROM command_resolutions")).rowCount).toBe(0);
    } else {
      expect(turn.actions).toBe(0);
      expect(turn.pending_command).toBeNull();
    }
  },
);
it.each(["INVALID_LEVEL", "TICK_PENDING", "BUILDING_BUSY", "REQUEST_EXISTS", "CONTACT_QUEUE_FULL"])(
  "explicit %s denial remains scheduled and archives the exact command",
  async (code) => {
    const f = await setup();
    let submissions = 0;
    f.game.submit = async () => {
      submissions++;
      throw new RemoteRejection(code, 200);
    };
    const model = new FakeModel([{ kind: "action", action: building, summary: "Attempt building" }]);
    await new Engine(f.store, model, async () => f.game, true).run(f.claim);
    const turn = (await f.store.publicState()).turns[0];
    expect(submissions).toBe(code === "TICK_PENDING" ? 2 : 1);
    expect(turn.state).toBe("finished");
    expect(turn.pending_command).toBeNull();
    expect(turn.actions).toBe(0);
    expect((await f.store.agent(f.claim.agentId)).state).toBe("ready");
    const archive = (await f.pool.query("SELECT * FROM command_resolutions")).rows[0];
    expect(archive.code).toBe(code);
    expect(archive.source).toBe("explicit_rejection");
    expect(archive.action_cipher).not.toContain("farm");
    expect(f.store.vault.decrypt(archive.action_cipher, `command-resolution:${archive.command_id}`)).toEqual(building);
    f.advance(900000);
    expect(await f.store.claim("next-turn")).not.toBeNull();
  },
);
it.each(["INVALID_LEVEL", "TICK_PENDING"])(
  "a 5xx carrying %s remains uncertain and cannot be reviewed as that rejection",
  async (code) => {
    const f = await setup();
    f.game.submit = async () => {
      throw new RemoteRejection(code, 503);
    };
    const e = new Engine(
      f.store,
      new FakeModel([{ kind: "action", action: building, summary: "Attempt" }]),
      async () => f.game,
      true,
    );
    await e.run(f.claim);
    const t = (await f.store.publicState()).turns[0];
    expect(t.state).toBe("pending");
    expect(t.code).toBe("TRANSPORT_UNCERTAIN");
    expect((await f.pool.query("SELECT pending_action FROM turns WHERE id=$1", [t.id])).rows[0].pending_action).toEqual(
      building,
    );
    await f.store.setState(f.id, "paused", true);
    await expect(
      e.reviewRejected(t.id, t.pending_command, code, "Review fixture rejected command after inspection"),
    ).rejects.toThrow("REJECTION_REVIEW_UNSUPPORTED");
    expect((await f.pool.query("SELECT count(*)::int n FROM command_resolutions")).rows[0].n).toBe(0);
  },
);
it("preflight defers stale building levels and human-only Court moves without creating a command or buying extra calls", async () => {
  const f = await setup(),
    old = f.game.read.bind(f.game);
  f.game.read = async (name, args) =>
    name === "pact_world_read_v1"
      ? { profile: { kingdomId: f.claim.agent.kingdom_id }, buildings: [{ kind: "farm", level: 2 }] }
      : old(name, args);
  const model = new FakeModel([
    { kind: "action", action: building, summary: "Old target" },
    { kind: "action", action: { kind: "court.join", courtId: randomUUID() }, summary: "Join Court" },
    { kind: "wait", summary: "Wait for owner" },
  ]);
  await new Engine(f.store, model, async () => f.game, true).run(f.claim);
  expect(f.game.submits).toHaveLength(0);
  expect(f.game.opened).toBe(0);
  expect(model.inputs).toHaveLength(3);
  expect(model.inputs[1].messages[1].content).toContain("OBSERVED_BUILDING_LEVEL_MISMATCH");
  expect(model.inputs[2].messages[1].content).toContain("HUMAN_DECISION_REQUIRED");
  const context = JSON.parse(model.inputs[0].messages[1].content);
  expect(context.gameActionKinds).not.toContain("court.join");
  expect(context.gameActionKinds).toContain("game.contact.answer");
  expect((await f.store.publicState()).turns[0].pending_command).toBeNull();
});
it("a no-policy fallback refusal is an explicit denial, without an owner submission", async () => {
  const f = await setup();
  f.game.submit = async () => {
    throw new RemoteRejection("FORBIDDEN", 200);
  };
  let ownerCalls = 0;
  const owner = new SyntheticOwner(f.store, {
    ownerRequest: async () => {
      ownerCalls++;
      throw Error("UNEXPECTED_OWNER_CALL");
    },
  });
  await new Engine(
    f.store,
    new FakeModel([{ kind: "action", action: building, summary: "Attempt" }]),
    async () => f.game,
    true,
    owner,
  ).run(f.claim);
  expect(ownerCalls).toBe(0);
  const t = (await f.store.publicState()).turns[0];
  expect(t.code).toBe("FORBIDDEN");
  expect(t.state).toBe("finished");
  expect(t.pending_command).toBeNull();
});
it("explicit review checks identity and missing receipt, archives rejection without replay, and separately resumes the same agent", async () => {
  const f = await setup(),
    command = randomUUID();
  await f.store.pending(f.claim, command, building);
  await f.store.finish(f.claim, "INVALID_LEVEL");
  await f.store.setState(f.id, "paused", true);
  await f.store.consent(f.id, true);
  f.game.receipt = async () => {
    throw new RemoteRejection("RECEIPT_NOT_FOUND", 200);
  };
  const model = new FakeModel(),
    e = new Engine(f.store, model, async () => f.game, true);
  await e.reviewRejected(
    f.claim.id,
    command,
    "INVALID_LEVEL",
    "Founder reviewed original rejection and current authenticated state; do not replay.",
  );
  expect(model.inputs).toHaveLength(0);
  expect(f.game.submits).toHaveLength(0);
  expect((await f.store.agent(f.claim.agentId)).state).toBe("needs_owner");
  const history = await new Observability(f.store).history(f.id);
  expect(history.turns[0].resolutions[0]).toMatchObject({
    commandId: command,
    code: "INVALID_LEVEL",
    source: "operator_review",
    action: building,
  });
  expect(history.turns[0].actions).toBe(0);
  await f.store.agentState(f.claim.agentId, "ready", true);
  await f.store.setState(f.id, "running", true);
  expect((await f.store.agent(f.claim.agentId)).account_id).toBe(f.claim.agent.account_id);
  await f.store.consent(f.id, false);
  expect((await new Observability(f.store).history(f.id)).turns[0].resolutions[0].action).toBeNull();
  expect((await f.pool.query("SELECT count(*)::int n FROM command_resolutions")).rows[0].n).toBe(1);
});
it("review refuses existing receipts, transport failures, terminal populations and unknown provider usage", async () => {
  const f = await setup(),
    command = randomUUID();
  await f.store.pending(f.claim, command, building);
  await f.store.finish(f.claim, "INVALID_LEVEL");
  await f.store.setState(f.id, "paused", true);
  const e = new Engine(f.store, new FakeModel(), async () => f.game, true),
    note = "Review fixture after authenticated inspection";
  await expect(e.reviewRejected(f.claim.id, command, "INVALID_LEVEL", note)).rejects.toThrow(
    "RECEIPT_EXISTS_RECONCILE_REQUIRED",
  );
  f.game.receipt = async () => {
    throw new RemoteRejection("RECEIPT_NOT_FOUND", 503);
  };
  await expect(e.reviewRejected(f.claim.id, command, "INVALID_LEVEL", note)).rejects.toThrow("RECEIPT_NOT_FOUND");
  f.game.receipt = async () => {
    throw new RemoteRejection("RECEIPT_NOT_FOUND", 200);
  };
  await f.pool.query(
    "INSERT INTO compute_ledger(id,cohort_id,turn_id,period,tokens,created_at,status) VALUES($1,$2,$3,'lifetime',40000,$4,'unknown')",
    [randomUUID(), f.id, f.claim.id, f.now()],
  );
  await expect(e.reviewRejected(f.claim.id, command, "INVALID_LEVEL", note)).rejects.toThrow("USAGE_REVIEW_REQUIRED");
  await f.store.setState(f.id, "stopped", true);
  await expect(e.reviewRejected(f.claim.id, command, "INVALID_LEVEL", note)).rejects.toThrow("PAUSED_REVIEW_REQUIRED");
  expect((await f.store.publicState()).turns[0].pending_command).toBe(command);
});
it("starting context provides observed public IDs, rules and contact schemas without forced communication or extra model decisions", async () => {
  const f = await setup(),
    peer = randomUUID(),
    old = f.game.read.bind(f.game);
  f.game.tools = async () => [
    ...tools,
    { name: "pact_play_view_v1", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } },
  ];
  f.game.read = async (name, args) =>
    name === "pact_play_view_v1"
      ? { parties: { [peer]: { character: { name: "Fixture peer" } } }, observedAt: f.now().toISOString() }
      : name === "pact_agent_guide_v1" && args.topic === "diplomacy"
        ? {
            firstContact: "Cold introductions cost no Silver",
            contractRules: { unsignedOffer: "Nonbinding; both parties sign" },
          }
        : old(name, args);
  const model = new FakeModel();
  await new Engine(f.store, model, async () => f.game, true).run(f.claim);
  expect(model.inputs).toHaveLength(1);
  expect(model.inputs[0].messages[1].content).toContain(peer);
  expect(model.inputs[0].messages[1].content).toContain("Cold introductions cost no Silver");
  expect(model.inputs[0].messages[1].content).toContain("game.contact.request");
  expect(f.game.submits).toHaveLength(0);
  expect(
    pactAdapter.preflight?.(
      { ...building, targetLevel: 3 },
      { world: { buildings: [{ kind: "farm", level: 2 }], builders: [{ kind: "farm", state: "active" }] } },
    )?.code,
  ).toBe("OBSERVED_BUILDING_BUSY");
});
