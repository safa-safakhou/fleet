import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { Cognition } from "../../src/cognition.js";
import { Comparisons } from "../../src/comparisons.js";
import { Engine as CoreEngine } from "../../src/engine.js";
import { pactAdapter } from "../../src/games/pact/adapter.js";
import { budget, FakeGame, FakeModel, fixture, ready } from "../helpers.js";
import { Engine } from "../pact-engine.js";

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
});
it("applies neutral account guidance while preserving consumed identities, settings, ledgers and original schedule", async () => {
  const f = await fixture();
  cleanup = () => f.pool.end();
  const id = await ready(f.store, 1),
    model = new FakeModel();
  const first = await f.store.claim("before");
  if (!first) throw Error("missing claim");
  await new Engine(f.store, model, async () => new FakeGame(first), true).run(first);
  await expect(
    f.store.guidance(id, "account_autonomy", "Founder explicitly requested independent account-agent behavior"),
  ).rejects.toThrow("COHORT_NOT_EDITABLE");
  await f.store.setState(id, "paused", true);
  const before = await f.store.cohort(id),
    agent = await f.store.agent(first.agentId);
  const ledger = (await f.pool.query("SELECT * FROM compute_ledger ORDER BY id")).rows;
  const turns = (await f.pool.query("SELECT * FROM turns ORDER BY id")).rows;
  await f.store.guidance(id, "account_autonomy", "Founder explicitly requested independent account-agent behavior");
  const after = await f.store.cohort(id);
  expect(after.owner_guidance).toBe("account_autonomy");
  expect(after.model).toEqual(before.model);
  expect(after.budget).toEqual(before.budget);
  expect(after.anchor_at).toEqual(before.anchor_at);
  expect(await f.store.agent(first.agentId)).toEqual(agent);
  expect((await f.pool.query("SELECT * FROM compute_ledger ORDER BY id")).rows).toEqual(ledger);
  expect((await f.pool.query("SELECT * FROM turns ORDER BY id")).rows).toEqual(turns);
  f.advance(900000);
  await f.store.setState(id, "running", true);
  const next = await f.store.claim("after");
  if (!next) throw Error("missing next claim");
  const game = new FakeGame(next);
  const original = game.read.bind(game);
  game.read = async (tool, args) => {
    const result = await original(tool, args);
    if (tool === "pact_world_read_v1") result.ambition = "Owner's independent objective";
    return result;
  };
  await new Engine(f.store, model, async () => game, true).run(next);
  const context = JSON.parse(model.inputs.at(-1)!.messages[1].content);
  expect(context.ownerValues.mode).toBe("account_autonomy");
  expect(context.ownerValues.accountObjective).toBe("Owner's independent objective");
  expect(context.ownerValues.profile).toBeUndefined();
  expect(context.ownerValues.riskTolerance).toBeUndefined();
  expect((await f.store.agent(first.agentId)).strategy).toEqual(agent.strategy);
  expect((await f.store.cohort(id)).anchor_at).toEqual(before.anchor_at);
});
it("reports changed guidance alongside the original comparison template", async () => {
  const f = await fixture();
  cleanup = () => f.pool.end();
  const comparisons = new Comparisons(f.store),
    saved = await comparisons.create({
      requestId: randomUUID(),
      template: {
        version: 1,
        name: "Guidance comparison",
        countPerArm: 1,
        intervalMinutes: 5,
        seed: "fixture",
        strategies: ["guardian"],
        model: { route: "ollama", model: "fixture" },
        budget,
      },
    });
  await f.store.guidance(
    saved.cohortIds[0],
    "account_autonomy",
    "Founder selected neutral autonomous account guidance",
  );
  const report = await comparisons.inspect(saved.id);
  expect(report.matchesTemplate).toBe(false);
  expect(report.arms[0].ownerGuidance).toBe("account_autonomy");
  expect(report.template.strategies).toEqual(["guardian"]);
});

it.each([false, true])("updates current account intent across actual turns with cognition=%s", async (cognitive) => {
  const f = await fixture();
  cleanup = () => f.pool.end();
  const id = await ready(f.store, 1);
  await f.pool.query("UPDATE cohorts SET owner_guidance='account_autonomy',observation_consent=true WHERE id=$1", [id]);
  if (cognitive)
    await f.pool.query('UPDATE cohorts SET model=model||\'{"cognition":"llm-centered-v1"}\'::jsonb WHERE id=$1', [id]);
  const model = new FakeModel(),
    support = new Cognition(f.store),
    query = vi.spyOn(support, "context");
  let objective = "First owner priority";
  for (let n = 0; n < 2; n++) {
    const claim = await f.store.claim("intent");
    if (!claim) throw Error("missing claim");
    const game = new FakeGame(claim),
      original = game.read.bind(game);
    game.read = async (tool, args) => {
      const result = await original(tool, args);
      if (tool === "pact_world_read_v1") result.ambition = objective;
      return result;
    };
    await new CoreEngine(f.store, model, async () => game, true, pactAdapter, undefined, undefined, support).run(claim);
    const context = JSON.parse(model.inputs.at(-1)!.messages[1].content);
    expect(context.ownerValues.accountObjective).toBe(objective);
    expect(context.environment.ambition).toBe(objective);
    if (cognitive) expect(query.mock.calls.at(-1)?.[3]).toBe(objective);
    objective = "Changed owner priority";
    f.advance(900000);
  }
});
