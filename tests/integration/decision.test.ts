import { afterEach, describe, expect, it } from "vitest";
import { DecisionSupport, type TrainingExample } from "../../src/decision.js";
import { Engine } from "../../src/engine.js";
import { pactAdapter } from "../../src/games/pact/adapter.js";
import { FakeGame, FakeModel, fixture, ready } from "../helpers.js";

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
});
async function setup(hybrid = true) {
  const f = await fixture();
  close = () => f.pool.end();
  const id = await ready(f.store, 1);
  if (hybrid)
    await f.pool.query('UPDATE cohorts SET model=model||\'{"decisionPolicy":"vw-focus-v1"}\'::jsonb WHERE id=$1', [id]);
  const model = new FakeModel();
  const calls: TrainingExample[][] = [];
  const support = new DecisionSupport(f.store, {
    predict: async (_features, choices, history) => {
      calls.push(history);
      return choices.map(() => 1 / choices.length);
    },
  });
  let levels = 2;
  const adapter = {
    ...pactAdapter,
    decisionObservation: () => ({
      features: { levels },
      metrics: { buildings: levels, contacts: 0, contracts: 0 },
      choices: ["development", "observe"] as ("development" | "observe")[],
    }),
  };
  const engine = new Engine(
    f.store,
    model,
    async (agentId) => {
      const claim = (
        await f.pool.query("SELECT * FROM turns WHERE agent_id=$1 ORDER BY started_at DESC LIMIT 1", [agentId])
      ).rows[0];
      return new FakeGame({ ...claim, agent: await f.store.agent(agentId) });
    },
    true,
    adapter,
    undefined,
    support,
  );
  return {
    ...f,
    id,
    model,
    calls,
    support,
    engine,
    grow: () => {
      levels += 2;
    },
  };
}
describe("decision policy persistence and execution", () => {
  it("reuses a persisted selection after controller restart without resampling", async () => {
    const f = await setup(),
      claim = await f.store.claim("test");
    if (!claim) throw Error("missing claim");
    const observation = {
      features: { levels: 2 },
      metrics: { buildings: 2, contacts: 0, contracts: 0 },
      choices: ["development", "observe"] as ("development" | "observe")[],
    };
    const original = await f.support.begin(claim, observation);
    const restarted = new DecisionSupport(f.store, {
      predict: async () => {
        throw Error("must not resample");
      },
    });
    expect(await restarted.begin(claim, observation)).toEqual(original);
    expect((await f.pool.query("SELECT * FROM decision_choices")).rowCount).toBe(1);
    await f.store.setState(f.id, "paused", true);
    await expect(restarted.begin(claim, observation)).rejects.toThrow("CLAIM_FENCED");
  });
  it("delivers one focus without extra LLM calls and learns once from the next turn", async () => {
    const f = await setup();
    const first = await f.engine.tick("test");
    expect(first).not.toBeNull();
    expect(f.calls).toEqual([[]]);
    expect(f.model.inputs).toHaveLength(1);
    expect(JSON.parse(f.model.inputs[0].messages[1].content).strategicFocus.policy).toBe("vw-focus-v1");
    expect((await f.pool.query("SELECT * FROM decision_choices")).rows[0].status).toBe("awaiting");
    f.grow();
    f.advance(15 * 60000);
    await f.engine.tick("test");
    expect(f.calls[1]).toHaveLength(1);
    expect(f.calls[1][0].reward).toBe(0.5);
    expect(f.calls[1][0].probability).toBe(0.5);
    expect((await f.pool.query("SELECT * FROM decision_choices WHERE turn_id=$1", [first?.id])).rows[0].status).toBe(
      "learned",
    );
    const summary = await f.support.summary(f.id);
    expect(summary.counts).toEqual({ learned: 1, awaiting: 1 });
    const encrypted = (
      await f.pool.query("SELECT detail_cipher,feedback_cipher FROM decision_choices WHERE turn_id=$1", [first?.id])
    ).rows[0];
    expect(encrypted.detail_cipher).not.toContain("buildings");
    expect(encrypted.feedback_cipher).not.toContain("reward");
    const newCohort = await ready(f.store, 1);
    await f.pool.query('UPDATE cohorts SET model=model||\'{"decisionPolicy":"vw-focus-v1"}\'::jsonb WHERE id=$1', [
      newCohort,
    ]);
    const isolatedClaim = await f.store.claim("test");
    expect(isolatedClaim?.cohortId).toBe(newCohort);
    if (!isolatedClaim) throw Error("missing claim");
    await f.engine.run(isolatedClaim);
    expect(f.calls.at(-1)).toEqual([]);
  });
  it("leaves LLM-only execution and learning state untouched", async () => {
    const f = await setup(false);
    await f.engine.tick("test");
    expect(f.calls).toHaveLength(0);
    expect(JSON.parse(f.model.inputs[0].messages[1].content).strategicFocus).toBeUndefined();
    expect((await f.pool.query("SELECT * FROM decision_choices")).rowCount).toBe(0);
  });
  it.each(["unknown", "pending", "expired", "rejected"])(
    "excludes %s outcomes instead of inventing a reward",
    async (reason) => {
      const f = await setup();
      const first = await f.engine.tick("test");
      if (reason === "unknown") await f.pool.query("UPDATE turns SET unknown_usage=true WHERE id=$1", [first?.id]);
      if (reason === "pending") await f.pool.query("UPDATE turns SET state='cancelled' WHERE id=$1", [first?.id]);
      if (reason === "rejected") await f.pool.query("UPDATE turns SET code='SLOT_BUSY' WHERE id=$1", [first?.id]);
      f.grow();
      f.advance(reason === "expired" ? 60 * 60000 : 15 * 60000);
      await f.engine.tick("test");
      expect(f.calls.at(-1)).toEqual([]);
      expect(
        (await f.pool.query("SELECT status FROM decision_choices WHERE turn_id=$1", [first?.id])).rows[0].status,
      ).toBe("censored");
    },
  );
  it("does not reserve inference or submit commands when the decision service fails", async () => {
    const f = await setup();
    const support = new DecisionSupport(f.store, {
      predict: async () => {
        throw Error("DECISION_MODEL_UNAVAILABLE");
      },
    });
    const claim = await f.store.claim("test");
    if (!claim) throw Error("missing claim");
    const game = new FakeGame(claim);
    const engine = new Engine(
      f.store,
      f.model,
      async () => game,
      true,
      {
        ...pactAdapter,
        decisionObservation: () => ({
          features: { x: 1 },
          metrics: { buildings: 0, contacts: 0, contracts: 0 },
          choices: ["observe"],
        }),
      },
      undefined,
      support,
    );
    await engine.run(claim);
    expect(f.model.inputs).toHaveLength(0);
    expect(game.submits).toHaveLength(0);
    expect(game.opened).toBe(0);
    expect((await f.pool.query("SELECT * FROM compute_ledger")).rowCount).toBe(0);
    expect((await f.pool.query("SELECT code FROM turns")).rows[0].code).toBe("DECISION_MODEL_UNAVAILABLE");
  });
  it("fences a late selection after the operator pauses and preserves its empty ledger", async () => {
    const f = await setup();
    const claim = await f.store.claim("test");
    if (!claim) throw Error("missing claim");
    const support = new DecisionSupport(f.store, {
      predict: async () => {
        await f.store.setState(f.id, "paused", true);
        return [1];
      },
    });
    await expect(
      support.begin(claim, {
        features: { x: 1 },
        metrics: { buildings: 0, contacts: 0, contracts: 0 },
        choices: ["observe"],
      }),
    ).rejects.toThrow("CLAIM_FENCED");
    expect((await f.pool.query("SELECT * FROM decision_choices")).rowCount).toBe(0);
  });
});
