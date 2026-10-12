import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { Communications } from "../../src/communications.js";
import { type HistoryCursor, Observability } from "../../src/observability.js";
import { FakeGame, FakeModel, fixture, ready } from "../helpers.js";
import { Engine } from "../pact-engine.js";

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
});
async function setup() {
  const f = await fixture();
  cleanup = () => f.pool.end();
  const id = await ready(f.store, 1);
  const claim = await f.store.claim("observation-fixture");
  if (!claim) throw Error("missing claim");
  return { ...f, id, claim, observation: new Observability(f.store) };
}
describe("operator observability", () => {
  it("captures ordered reads, model summaries and exact action outcomes without extra inference", async () => {
    const f = await setup();
    await f.store.consent(f.id, true);
    const game = new FakeGame(f.claim),
      model = new FakeModel([
        {
          kind: "read",
          tool: "fleet_action_schema",
          args: { kind: "game.building.queue" },
          summary: "Inspect build requirements",
        },
        {
          kind: "action",
          action: { kind: "game.building.queue", building: "farm", targetLevel: 2, slot: 1 },
          summary: "Synthetic private construction intent",
          notes: "Synthetic continuation note",
        },
        { kind: "wait", summary: "Wait for construction" },
      ]);
    await new Engine(f.store, model, async () => game, true).run(f.claim);
    const view = await f.observation.inspect(f.claim.agentId);
    expect(model.inputs).toHaveLength(3);
    expect(game.submits).toHaveLength(1);
    expect(view.usage.executions).toBe(3);
    expect(view.notes).toBe("Synthetic continuation note");
    const events = view.turns[0].events;
    expect(events.map((e) => Number(e.sequence))).toEqual(events.map((e) => Number(e.sequence)).sort((a, b) => a - b));
    expect(events.filter((e) => e.stage === "thinking")).toHaveLength(3);
    const receipt = events.find((e) => e.stage === "result");
    expect(receipt?.detail).toMatchObject({
      commandId: game.submits[0].commandId,
      code: "COMMITTED",
      action: { kind: "game.building.queue", building: "farm" },
      committed: true,
    });
    expect(view.agent.committed_actions).toBe(1);
    const stored = (await f.pool.query("SELECT detail_cipher FROM turn_events")).rows;
    expect(JSON.stringify(stored)).not.toContain("Synthetic private construction intent");
    expect(JSON.stringify(view)).not.toContain("secret_cipher");
  });
  it("reports current model work and separates in-flight reservations from unknown usage", async () => {
    const f = await setup();
    await f.observation.record(f.claim, "thinking", "Waiting for the model decision");
    const one = await f.store.reserveCall(f.claim);
    await f.store.reserveCall(f.claim);
    let state = await f.store.publicState();
    expect(state.usage[0].reserved_calls).toBe(2);
    expect(state.usage[0].unknown_calls).toBe(0);
    expect(state.agents[0].current_stage).toBe("thinking");
    await f.store.recordUsage(one, null, null);
    state = await f.store.publicState();
    expect(state.usage[0].reserved_calls).toBe(1);
    expect(state.usage[0].unknown_calls).toBe(1);
  });
  it("redacts credential-like fields while preserving usage counters and revokes retained details", async () => {
    const f = await setup();
    await f.store.consent(f.id, true);
    await f.observation.record(f.claim, "deciding", "Model selected the next step", {
      inputTokens: 123,
      outputTokens: 45,
      nested: {
        accessToken: "synthetic-private-token",
        approvalToken: "synthetic-approval-token",
        password: "synthetic-password",
      },
      summary: "Synthetic private plan",
    });
    await f.pool.query("UPDATE agents SET notes=$2 WHERE id=$1", [f.claim.agentId, "Synthetic private note"]);
    let view = await f.observation.inspect(f.claim.agentId);
    expect(view.turns[0].events[0].detail).toMatchObject({
      inputTokens: 123,
      outputTokens: 45,
      nested: { accessToken: "[redacted]", approvalToken: "[redacted]", password: "[redacted]" },
    });
    expect(JSON.stringify(view)).not.toContain("synthetic-private-token");
    await f.store.consent(f.id, false);
    view = await f.observation.inspect(f.claim.agentId);
    expect(view.notes).toBe(null);
    expect(view.turns[0].events.every((e) => e.detail === null)).toBe(true);
    expect((await f.pool.query("SELECT detail_cipher FROM turn_events")).rows[0].detail_cipher).toBe(null);
    await f.store.consent(f.id, true);
    expect((await f.observation.inspect(f.claim.agentId)).turns[0].events[0].detail).toBe(null);
  });
  it("serializes consent revocation with a pending observation write", async () => {
    const f = await setup();
    await f.store.consent(f.id, true);
    const client = await f.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE cohorts SET observation_consent=false WHERE id=$1", [f.id]);
      const pending = f.observation.record(f.claim, "thinking", "Waiting for the model decision", {
        summary: "Must not survive revoked consent",
      });
      await client.query("COMMIT");
      await pending;
      expect((await f.pool.query("SELECT detail_cipher FROM turn_events")).rows[0].detail_cipher).toBe(null);
    } finally {
      client.release();
    }
  });
  it("paginates complete history with tied timestamps and keeps lifetime totals independent of the latest 100", async () => {
    const f = await fixture();
    cleanup = () => f.pool.end();
    const id = await ready(f.store, 1);
    const agent = (await f.store.publicState()).agents[0];
    await f.pool.query(
      `INSERT INTO turns(id,agent_id,cohort_id,generation,fence,worker,state,due_at,started_at,deadline_at,finished_at,code)
      SELECT gen_random_uuid(),$1,$2,0,0,'legacy-fixture','finished',$3::timestamptz,$3::timestamptz,$3::timestamptz+interval '2 minutes',$3::timestamptz+interval '1 second','READ' FROM generate_series(1,110)`,
      [agent.id, id, f.now()],
    );
    const observation = new Observability(f.store),
      seen = new Set<string>();
    let cursor: HistoryCursor | null = {};
    while (cursor) {
      const page = await observation.history(id, agent.id, cursor);
      for (const turn of page.turns) {
        expect(seen.has(turn.id)).toBe(false);
        seen.add(turn.id);
        expect(turn.events).toEqual([]);
      }
      cursor = page.next;
    }
    expect(seen.size).toBe(110);
    const state = await f.store.publicState();
    expect(state.turns).toHaveLength(100);
    expect(state.cohortStats[0].turns).toBe(110);
    expect(state.agents[0].total_turns).toBe(110);
    const other = await ready(f.store, 1),
      foreign = (await f.store.publicState()).agents.find((a) => a.cohort_id === other);
    await expect(observation.history(id, foreign?.id)).rejects.toThrow("AGENT_COHORT_MISMATCH");
    await expect(observation.history(id, agent.id, { beforeAt: f.now().toISOString() })).rejects.toThrow(
      "INVALID_CURSOR",
    );
  });
  it("removes old detailed steps while preserving turns, accounts and usage", async () => {
    const f = await setup();
    await f.store.consent(f.id, true);
    await f.observation.record(f.claim, "observing", "Reading current game state");
    const before = await f.store.agent(f.claim.agentId);
    f.advance(31 * 86400000);
    await new Communications(f.store).prune();
    expect((await f.pool.query("SELECT count(*)::int n FROM turn_events")).rows[0].n).toBe(0);
    expect((await f.store.agent(f.claim.agentId)).account_id).toBe(before.account_id);
    expect((await f.store.publicState()).turns).toHaveLength(1);
    await expect(f.observation.inspect(randomUUID())).rejects.toThrow("NOT_FOUND");
  });
  it("exposes an existing pending action only with observation consent and never modifies or replays it", async () => {
    const f = await setup(),
      commandId = randomUUID(),
      action = { kind: "game.building.queue", building: "farm", targetLevel: 2, slot: 1 };
    await f.store.pending(f.claim, commandId, action);
    await f.store.finish(f.claim, "TRANSPORT_UNCERTAIN");
    let view = await f.observation.inspect(f.claim.agentId);
    expect(view.turns[0].pending_command).toBe(commandId);
    expect(view.turns[0].pending_action).toBe(null);
    await f.store.consent(f.id, true);
    view = await f.observation.inspect(f.claim.agentId);
    expect(view.turns[0].pending_action).toEqual(action);
    expect(
      (await f.pool.query("SELECT pending_command,pending_action FROM turns WHERE id=$1", [f.claim.id])).rows[0],
    ).toEqual({ pending_command: commandId, pending_action: action });
    expect(view.usage.executions).toBe(0);
  });
});
