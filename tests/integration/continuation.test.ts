import { randomUUID } from "node:crypto";
import { Ajv } from "ajv";
import { afterEach, expect, it } from "vitest";
import { Continuation } from "../../src/continuation.js";
import type { Data, ModelPort } from "../../src/domain.js";
import { Engine } from "../../src/engine.js";
import { pactAdapter } from "../../src/games/pact/adapter.js";
import { FakeGame, FakeModel, fixture, ready } from "../helpers.js";

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
});
for (const memory of [false, true])
  it(`structured Farm wait survives restart then yields to actual completion (${memory ? "cognition" : "LLM-only"})`, async () => {
    const f = await fixture();
    close = () => f.pool.end();
    const cohort = await ready(f.store, 1);
    if (memory)
      await f.pool.query(`UPDATE cohorts SET model=model||'{"cognition":"llm-centered-v1"}'::jsonb WHERE id=$1`, [
        cohort,
      ]);
    const claim = await f.store.claim("plan");
    if (!claim) throw Error("claim");
    await f.pool.query("UPDATE agents SET notes='Legacy authored prose retained as history' WHERE id=$1", [
      claim.agentId,
    ]);
    let level = 2,
      step = 0;
    const game = (c: typeof claim) => {
      if (!c) throw Error("claim");
      const g = new FakeGame(c),
        read = g.read.bind(g);
      g.read = async (t, a) =>
        t === "pact_world_read_v1"
          ? {
              profile: { kingdomId: c.agent.kingdom_id },
              ambition: "Secure dependable food",
              asOfGameTimeMs: f.now().getTime(),
              buildings: [{ kind: "farm", level }],
              builders: [],
              balances: { iron: { ordinaryUnits: "1000" } },
            }
          : read(t, a);
      return g;
    };
    const model: ModelPort = {
      decide: async (input) => {
        const c = JSON.parse(input.messages[1].content);
        const d =
          step++ === 0
            ? { kind: "read", tool: "fleet_continuation_schema", args: {}, summary: "Inspect structured continuation" }
            : {
                kind: "wait",
                summary: "Wait until fresh Farm III exists",
                continuation: {
                  expectedVersion: c.continuation.version,
                  goal: { id: "farm-goal", title: "Secure dependable food" },
                  steps: [
                    {
                      id: "upgrade",
                      intent: "Complete Farm III",
                      dependsOn: [],
                      postcondition: { kind: "building_level", referenceId: "farm", operator: "at_least", value: 3 },
                    },
                  ],
                  nextStepId: "upgrade",
                  wait: {
                    reason: "Farm upgrade is pending",
                    until: { kind: "building_level", referenceId: "farm", operator: "at_least", value: 3 },
                  },
                },
              };
        const decision = memory
          ? {
              cognition: {
                expectedVersion: c.cognition.version,
                analysis: { type: "none", reason: "No new verified outcome to reinterpret" },
              },
              decision: d,
            }
          : d;
        expect(new Ajv({ strict: false, validateFormats: false }).compile(input.schema)(decision)).toBe(true);
        return { decision, inputTokens: 500, outputTokens: 100 };
      },
    };
    const firstGame = game(claim);
    await new Engine(f.store, model, async () => firstGame, true, pactAdapter).run(claim);
    const stored = await new Continuation(f.store).load(claim.agentId);
    expect(stored.goalStatus).toBe("waiting");
    expect(stored.wait).not.toBeNull();
    expect(firstGame.opened).toBe(0);
    level = 3;
    f.advance(900000);
    const next = await f.store.claim("restarted");
    if (!next) throw Error("claim");
    const after = new FakeModel([{ kind: "wait", summary: "Reconsider the next useful goal" }]),
      secondGame = game(next);
    await new Engine(f.store, after, async () => secondGame, true, pactAdapter).run(next);
    const delivered = JSON.parse(after.inputs[0].messages[1].content).continuation;
    expect(delivered.goalStatus).toBe("observed_complete");
    expect(delivered.wait).toBeNull();
    expect(delivered.reconsideration).toContain("Fresh facts");
    expect(secondGame.submits).toEqual([]);
    expect((await f.store.agent(next.agentId)).notes).toBe("Legacy authored prose retained as history");
    expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n).toBe(3);
  });
it("hands off a final-decision role failure with its exact target; WAIT preserves it without pending-command fiction", async () => {
  const f = await fixture();
  close = () => f.pool.end();
  const id = await ready(f.store, 1);
  await f.pool.query(`UPDATE cohorts SET budget=jsonb_set(budget,'{maxCallsPerTurn}','2') WHERE id=$1`, [id]);
  const claim = await f.store.claim("handoff");
  if (!claim) throw Error("claim");
  const requestId = randomUUID(),
    g = new FakeGame(claim),
    read = g.read.bind(g);
  g.read = async (t, a) =>
    t === "pact_agent_guide_v1"
      ? {
          socialDelegation: { mode: "agent_decides" },
          contacts: [],
          contactRequests: [
            {
              id: requestId,
              direction: "outgoing",
              status: "pending",
              expiresGameTimeMs: String(f.now().getTime() + 3600000),
            },
          ],
        }
      : read(t, a);
  const model = new FakeModel([
    { kind: "read", tool: "pact_world_read_v1", args: {}, summary: "Read current state" },
    {
      kind: "action",
      action: { kind: "game.contact.answer", requestId, accept: true },
      summary: "Invalid outgoing target",
    },
  ]);
  await new Engine(f.store, model, async () => g, true, pactAdapter).run(claim);
  expect(g.submits).toEqual([]);
  f.advance(900000);
  const next = await f.store.claim("next");
  if (!next) throw Error("claim");
  const wait = new FakeModel([{ kind: "wait", summary: "Reconsider the failed target" }]);
  await new Engine(f.store, wait, async () => new FakeGame(next), true, pactAdapter).run(next);
  const context = JSON.parse(wait.inputs[0].messages[1].content);
  expect(context.decisionFeedback[0]).toMatchObject({
    code: "OBSERVED_REQUEST_NOT_ANSWERABLE",
    referenceId: requestId,
    submitted: false,
  });
  expect(
    context.continuation.outcomes.some(
      (o: Data) => o.category === "not_submitted" && o.code === "OBSERVED_REQUEST_NOT_ANSWERABLE",
    ),
  ).toBe(true);
  const agent = await f.store.agent(next.agentId);
  expect(Boolean(agent.decision_feedback_cipher)).toBe(true);
  expect(agent.failure_count).toBeGreaterThan(0);
  expect(
    (await f.pool.query("SELECT pending_command FROM turns WHERE agent_id=$1", [next.agentId])).rows.every(
      (r) => r.pending_command === null,
    ),
  ).toBe(true);
  expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n).toBe(3);
});
it("rejects cyclic/stale continuation updates and fences writes after pause without rewriting history", async () => {
  const f = await fixture();
  close = () => f.pool.end();
  const id = await ready(f.store, 1),
    claim = await f.store.claim("state");
  if (!claim) throw Error("claim");
  const support = new Continuation(f.store),
    update = {
      expectedVersion: 0,
      goal: { id: "goal", title: "A bounded authored goal" },
      steps: [
        {
          id: "one",
          intent: "Read a fact",
          dependsOn: ["one"],
          postcondition: { kind: "fact", referenceId: "one", operator: "equals", value: true },
        },
      ],
      nextStepId: "one",
      wait: null,
    };
  await expect(support.apply(claim, 0, update, [], "owner")).rejects.toThrow("CONTINUATION_DEPENDENCY_CYCLE");
  await support.apply(claim, 0, { ...update, steps: [{ ...update.steps[0], dependsOn: [] }] }, [], "owner");
  await expect(support.apply(claim, 1, { ...update, steps: [], nextStepId: null }, [], "owner")).rejects.toThrow(
    "CONTINUATION_STALE_VERSION",
  );
  await f.store.setState(id, "paused", false);
  await expect(support.outcome(claim, 1, { category: "wait" })).rejects.toThrow("CLAIM_FENCED");
  expect((await new Continuation(f.store).load(claim.agentId)).goal?.title).toBe(update.goal.title);
});

it("deduplicates a proposal, isolates agents, withholds inspection and expires history without resetting authority", async () => {
  const f = await fixture();
  close = () => f.pool.end();
  const id = await ready(f.store, 2),
    claim = await f.store.claim("plan-controls");
  if (!claim) throw Error("claim");
  const support = new Continuation(f.store);
  const proposal = {
    expectedVersion: 0,
    goal: { id: "owned", title: "An authored bounded goal" },
    steps: [],
    nextStepId: null,
    wait: null,
  };
  const first = await support.apply(claim, 0, proposal, [], "owner");
  expect((await support.apply(claim, 0, proposal, [], "owner")).version).toBe(first.version);
  await expect(
    support.apply(claim, 0, { ...proposal, goal: { id: "other", title: "Changed" } }, [], "owner"),
  ).rejects.toThrow("CONTINUATION_UPDATE_CONFLICT");
  const other = (await f.pool.query("SELECT id FROM agents WHERE cohort_id=$1 AND id<>$2", [id, claim.agentId])).rows[0]
    .id;
  expect((await support.load(other)).goal).toBeNull();
  await f.pool.query("UPDATE cohorts SET observation_consent=false WHERE id=$1", [id]);
  expect(await support.inspect(claim.agentId)).toEqual({ withheld: true });
  const before = await f.store.agent(claim.agentId);
  f.advance(31 * 86400000);
  const expired = await support.load(claim.agentId);
  expect(expired.goal).toBeNull();
  expect(expired.version).toBe(first.version);
  expect(expired.reconsideration).toContain("expired");
  await support.prune();
  expect((await f.pool.query("SELECT count(*)::int n FROM decision_states")).rows[0].n).toBe(0);
  expect(await f.store.agent(claim.agentId)).toEqual(before);
});
