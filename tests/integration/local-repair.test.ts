import { afterEach, describe, expect, it } from "vitest";
import type { ModelPort } from "../../src/domain.js";
import { pactAdapter } from "../../src/games/pact/adapter.js";
import { FakeGame, FakeModel, fixture, ready } from "../helpers.js";
import { Engine } from "../pact-engine.js";

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});
async function setup() {
  const f = await fixture();
  cleanup = () => f.pool.end();
  const id = await ready(f.store, 1);
  await f.store.consent(id, true);
  const claim = await f.store.claim("repair");
  if (!claim) throw Error("claim");
  return { ...f, id, claim, game: new FakeGame(claim) };
}
describe("bounded local replan and accounting", () => {
  it("accounts malformed completed output and corrects it inside the original decision budget", async () => {
    const f = await setup();
    let calls = 0;
    const model: ModelPort = {
      decide: async () => {
        calls++;
        return calls === 1
          ? { decision: null, decisionError: "MODEL_OUTPUT_TRUNCATED", inputTokens: 10, outputTokens: 20 }
          : { decision: { kind: "wait", summary: "Recovered" }, inputTokens: 30, outputTokens: 5 };
      },
    };
    await new Engine(f.store, model, async () => f.game, true).run(f.claim);
    const s = await f.store.publicState();
    expect(s.turns[0]).toMatchObject({ state: "finished", code: "WAIT", calls: 2, actions: 0, unknown_usage: false });
    expect(s.usage[0]).toMatchObject({
      calls: 2,
      unknown_calls: 0,
      input_tokens: "40",
      output_tokens: "25",
      allocated_tokens: "80000",
    });
    expect(f.game.opened).toBe(0);
    expect((await f.store.agent(f.claim.agentId)).state).toBe("ready");
  });
  it("persists exact shape feedback across scheduled turns without acquiring a lease or pending command", async () => {
    const f = await setup();
    f.claim.cohort.budget!.maxCallsPerTurn = 1;
    await f.pool.query("UPDATE cohorts SET budget=jsonb_set(budget,'{maxCallsPerTurn}','1') WHERE id=$1", [f.id]);
    const model = new FakeModel([
      {
        kind: "action",
        action: { kind: "game.building.queue", building: "farm", targetLevel: 2 },
        summary: "Missing slot",
      },
    ]);
    await new Engine(f.store, model, async () => f.game, true).run(f.claim);
    const first = (await f.store.publicState()).turns[0];
    expect(first.code).toBe("INVALID_GAME_ACTION");
    expect(first.pending_command).toBeNull();
    expect(f.game.opened).toBe(0);
    expect((await f.store.agent(f.claim.agentId)).decision_feedback_cipher).toBeTruthy();
    f.advance(900000);
    const next = await f.store.claim("again");
    if (!next) throw Error("next");
    const corrected = new FakeModel([{ kind: "wait", summary: "Replan" }]);
    await new Engine(f.store, corrected, async () => new FakeGame(next), true).run(next);
    expect(corrected.inputs[0].messages[1].content).toContain("INVALID_GAME_ACTION");
    expect((await f.store.agent(next.agentId)).account_id).toBe(f.claim.agent.account_id);
    expect((await f.store.agent(next.agentId)).decision_feedback_cipher).toBeNull();
  });
  it("never treats malformed output with missing usage as harmless or automatically reviews it", async () => {
    const f = await setup();
    const model: ModelPort = {
      decide: async () => ({
        decision: null,
        decisionError: "INVALID_MODEL_OUTPUT",
        inputTokens: null,
        outputTokens: null,
      }),
    };
    await new Engine(f.store, model, async () => f.game, true).run(f.claim);
    const s = await f.store.publicState();
    expect(s.turns[0]).toMatchObject({ state: "needs_owner", code: "USAGE_UNKNOWN", calls: 1, unknown_usage: true });
    expect(s.usage[0].unknown_calls).toBe(1);
    expect(f.game.opened).toBe(0);
  });
  it("refuses invented mandate versions instead of rewriting authority", () => {
    const action = { kind: "game.contact.request", mandateVersion: 9007199254740991 };
    expect(pactAdapter.preflight?.(action, { guide: { mandate: { version: 2 } } })?.code).toBe(
      "OBSERVED_MANDATE_VERSION_MISMATCH",
    );
    expect(action.mandateVersion).toBe(9007199254740991);
  });
});
