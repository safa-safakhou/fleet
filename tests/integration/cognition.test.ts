import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { Cognition } from "../../src/cognition.js";
import { type Data, type ModelPort, object } from "../../src/domain.js";
import { Engine } from "../../src/engine.js";
import { pactAdapter } from "../../src/games/pact/adapter.js";
import { Observability } from "../../src/observability.js";
import { FakeGame, FakeModel, fixture, ready } from "../helpers.js";

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
});
async function setup(count = 1) {
  const f = await fixture();
  close = () => f.pool.end();
  const id = await ready(f.store, count);
  await f.pool.query(
    'UPDATE cohorts SET model=model||\'{"cognition":"llm-centered-v1"}\'::jsonb,observation_consent=true WHERE id=$1',
    [id],
  );
  const claim = await f.store.claim("test");
  if (!claim) throw Error("missing claim");
  const support = new Cognition(f.store),
    peer = randomUUID();
  const evidence = await support.capture(claim, "message", "message-one", {
    peerId: peer,
    body: "The promised grain arrived on time.",
  });
  const context = await support.context(claim, [peer], evidence, "trade");
  return { ...f, id, claim, support, peer, evidence, context };
}
function update(f: Awaited<ReturnType<typeof setup>>) {
  return {
    expectedVersion: 0,
    plan: {
      goal: "Negotiate reliable winter supply",
      steps: ["Read current terms", "Ask for a smaller trial"],
      status: "active",
      reconsiderWhen: "Delivery fails or terms change",
      evidenceRefs: [f.evidence],
    },
    beliefs: [
      {
        peerId: f.peer,
        hypothesis: "This partner may value reliability",
        alternative: "One timely shipment could be luck",
        confidence: "low",
        prediction: "They will deliver the next agreed shipment on time",
        assessment: "untested",
        evidenceRefs: [f.evidence],
      },
    ],
    reflections: [
      {
        expected: "The partner might miss delivery",
        observed: "This observed message reports arrival; receipt still needs checking",
        revision: "Consider a small trial, while retaining uncertainty",
        evidenceRefs: [f.evidence],
      },
    ],
    memories: [{ summary: "A grain exchange worth reviewing", importance: 4, evidenceRefs: [f.evidence] }],
  };
}
describe("LLM memory, plans and beliefs", () => {
  it("keeps Laya optional, retains both candidates and records abstention without changing the plan", async () => {
    const f = await setup();
    await f.support.capture(f.claim, "message", "other", { peerId: f.peer, body: "A timber offer" });
    await f.support.capture(f.claim, "receipt", "receipt", { receipt: { code: "COMMITTED" } });
    if (!f.claim.cohort.model) throw Error("missing model");
    f.claim.cohort.model = { ...f.claim.cohort.model, recallAssist: "laya-recall-v1" };
    let candidateIds: string[] = [];
    const helper = new Cognition(f.store, {
      choose: async (_q, candidates) => {
        candidateIds = candidates.map((c) => c.id);
        return { id: candidates[1].id, probability: 0.8, certificate: "a".repeat(64) };
      },
    });
    const delivered = await helper.context(f.claim, [f.peer], f.evidence, "food");
    expect(object(delivered.recall).route).toBe("laya-recall-v1");
    const ids = (delivered.evidence as Data[]).map((e) => e.id);
    expect(candidateIds.every((id) => ids.includes(id))).toBe(true);
    const abstaining = new Cognition(f.store, {
      choose: async () => {
        throw new (await import("../../src/domain.js")).FleetError("LAYA_ABSTAINED");
      },
    });
    const fallback = await abstaining.context(f.claim, [f.peer], f.evidence, "food");
    expect(object(fallback.recall).assist).toBe("abstained");
    expect((await f.pool.query("SELECT * FROM cognitive_states")).rowCount).toBe(0);
  });
  it("retains old plan evidence when observation volume exceeds the bounded journal", async () => {
    const f = await setup();
    await f.support.apply(f.claim, 0, update(f), f.context);
    let newest = "";
    for (let i = 0; i < 205; i++)
      newest = await f.support.capture(f.claim, "observation", `snapshot-${i}`, { value: i });
    expect(
      (await f.pool.query("SELECT * FROM cognitive_episodes WHERE agent_id=$1", [f.claim.agentId])).rowCount,
    ).toBeLessThanOrEqual(200);
    expect((await f.pool.query("SELECT id FROM cognitive_episodes WHERE id=$1", [f.evidence])).rowCount).toBe(1);
    expect((await f.pool.query("SELECT id FROM cognitive_episodes WHERE id=$1", [newest])).rowCount).toBe(1);
  });
  it("does not save a cognitive update from unknown model usage", async () => {
    const f = await setup(),
      game = new FakeGame(f.claim);
    const model: ModelPort = {
      decide: async () => ({
        decision: { kind: "wait", summary: "Wait", cognition: { expectedVersion: 0, plan: null } },
        inputTokens: null,
        outputTokens: null,
      }),
    };
    await new Engine(f.store, model, async () => game, true, pactAdapter, undefined, undefined, f.support).run(f.claim);
    expect((await f.pool.query("SELECT * FROM cognitive_states")).rowCount).toBe(0);
    expect((await f.pool.query("SELECT status FROM compute_ledger")).rows[0].status).toBe("unknown");
    expect((await f.pool.query("SELECT state FROM turns")).rows[0].state).toBe("needs_owner");
  });
  it("retains an uncertain original command without inventing a committed memory", async () => {
    const f = await setup(),
      game = new FakeGame(f.claim);
    game.failSubmit = true;
    const model = new FakeModel([
      {
        kind: "action",
        summary: "Queue a farm",
        action: { kind: "game.building.queue", building: "farm", targetLevel: 2, slot: 1 },
      },
    ]);
    await new Engine(f.store, model, async () => game, true, pactAdapter, undefined, undefined, f.support).run(f.claim);
    expect(game.submits).toHaveLength(1);
    const turn = (await f.pool.query("SELECT state,pending_command FROM turns")).rows[0];
    expect(turn.state).toBe("pending");
    expect(turn.pending_command).toBe(game.submits[0].commandId);
    expect((await f.pool.query("SELECT * FROM cognitive_episodes WHERE kind='receipt'")).rowCount).toBe(0);
  });
  it("persists and retrieves subjective state after restart, with source-linked reflection and no queued command", async () => {
    const f = await setup();
    const payload = update(f);
    await f.support.apply(f.claim, 0, payload, f.context);
    await f.support.apply(f.claim, 0, payload, f.context);
    const restarted = new Cognition(f.store);
    const view = await restarted.context(f.claim, [f.peer], f.evidence, "winter supply");
    expect(view.version).toBe(1);
    expect(object(view.plan).goal).toBe(payload.plan.goal);
    expect(object((view.beliefs as Data[])[0]).assessment).toBe("untested");
    expect((view.reflections as Data[])[0].revision).toBe(payload.reflections[0].revision);
    expect((await f.pool.query("SELECT * FROM cognitive_updates")).rowCount).toBe(1);
    const state = (await f.pool.query("SELECT detail_cipher FROM cognitive_states")).rows[0].detail_cipher;
    expect(state).not.toContain("winter");
    expect((await f.pool.query("SELECT pending_command FROM turns")).rows[0].pending_command).toBeNull();
    const raw = (await f.pool.query("SELECT kind FROM cognitive_episodes ORDER BY kind")).rows;
    expect(raw.map((r) => r.kind)).toEqual(["interpretation", "message"]);
  });
  it("accepts contrary evidence and lowers an earlier belief without replacing identity or the persistent plan", async () => {
    const f = await setup();
    await f.support.apply(f.claim, 0, update(f), f.context);
    const newer = await f.support.capture(f.claim, "receipt", "late-delivery", {
      peerId: f.peer,
      receipt: { code: "DELIVERY_MISSED" },
    });
    const context = await f.support.context(f.claim, [f.peer], newer, "review reliability");
    const prior = update(f).beliefs[0];
    await f.support.apply(
      f.claim,
      1,
      {
        expectedVersion: 1,
        beliefs: [
          {
            ...prior,
            confidence: "low",
            assessment: "contradicted",
            hypothesis: "The evidence now challenges reliable delivery",
            evidenceRefs: [newer],
          },
        ],
        reflections: [
          {
            expected: prior.prediction,
            observed: "The supplied receipt reports a missed delivery",
            revision: "Reconsider the trial before making another commitment",
            evidenceRefs: [newer],
          },
        ],
      },
      context,
    );
    const result = await f.support.context(f.claim, [f.peer], newer, "supply");
    expect(object(result.plan).goal).toBe(update(f).plan.goal);
    expect((result.beliefs as Data[])[0].assessment).toBe("contradicted");
    expect((await f.store.agent(f.claim.agentId)).account_id).toBe(f.claim.agent.account_id);
  });
  it("refuses fabricated references, unobserved players, stale versions and interpretation as corroborating evidence", async () => {
    const f = await setup(),
      payload = update(f);
    await expect(
      f.support.apply(f.claim, 0, { ...payload, plan: { ...payload.plan, evidenceRefs: [randomUUID()] } }, f.context),
    ).rejects.toThrow("COGNITION_EVIDENCE_NOT_DELIVERED");
    await expect(
      f.support.apply(
        f.claim,
        0,
        { ...payload, beliefs: [{ ...payload.beliefs[0], peerId: randomUUID() }] },
        f.context,
      ),
    ).rejects.toThrow("COGNITION_PEER_NOT_OBSERVED");
    await f.support.apply(f.claim, 0, payload, f.context);
    await expect(f.support.apply(f.claim, 1, payload, f.context)).rejects.toThrow("COGNITION_STALE_VERSION");
    const context = await f.support.context(f.claim, [f.peer], f.evidence, "grain exchange");
    const interpreted = (context.evidence as Data[]).find((e) => e.kind === "interpretation");
    expect(interpreted).toBeTruthy();
    await expect(
      f.support.apply(
        f.claim,
        2,
        {
          expectedVersion: 1,
          memories: [{ summary: "Self confirmation", importance: 5, evidenceRefs: [interpreted?.id] }],
        },
        context,
      ),
    ).rejects.toThrow("COGNITION_INTERPRETATION_NOT_EVIDENCE");
  });
  it("keeps memory scoped to the owning agent and hides inspection without observation consent", async () => {
    const f = await setup(2);
    const other = (await f.pool.query("SELECT id FROM agents WHERE cohort_id=$1 AND id<>$2", [f.id, f.claim.agentId]))
      .rows[0].id;
    const view = await f.support.inspect(other);
    expect(view.episodes).toEqual([]);
    await f.pool.query("UPDATE cohorts SET observation_consent=false WHERE id=$1", [f.id]);
    const hidden = await new Observability(f.store).inspect(f.claim.agentId);
    expect(hidden.cognition.withheld).toBe(true);
    expect(hidden.cognition).not.toHaveProperty("episodes");
  });
  it("fences updates after pause and expires evidence and stale beliefs independently of fresh state", async () => {
    const f = await setup();
    await f.support.apply(f.claim, 0, update(f), f.context);
    await f.store.setState(f.id, "paused", true);
    await expect(f.support.apply(f.claim, 1, { expectedVersion: 1 }, f.context)).rejects.toThrow("CLAIM_FENCED");
    f.advance(31 * 86400000);
    await f.support.prune();
    expect((await f.pool.query("SELECT * FROM cognitive_episodes")).rowCount).toBe(0);
    expect((await f.pool.query("SELECT * FROM cognitive_states")).rowCount).toBe(0);
  });
  it("passes plans into subsequent scheduled decisions without extra inference or VW", async () => {
    const f = await setup();
    let round = 0;
    const inputs: Parameters<ModelPort["decide"]>[0][] = [];
    const model: ModelPort = {
      decide: async (input) => {
        inputs.push(input);
        const c = object(JSON.parse(input.messages[1].content).cognition);
        return {
          decision: {
            kind: "wait",
            summary: "Observe before committing",
            ...(round++ === 0
              ? {
                  cognition: {
                    expectedVersion: c.version,
                    plan: {
                      goal: "Understand current supply",
                      steps: ["Inspect future delivery"],
                      status: "waiting",
                      reconsiderWhen: "A new delivery is observed",
                      evidenceRefs: [(c.evidence as Data[])[0].id],
                    },
                  },
                }
              : {}),
          },
          inputTokens: 500,
          outputTokens: 80,
        };
      },
    };
    const game = new FakeGame(f.claim);
    const engine = new Engine(
      f.store,
      model,
      async () => game,
      true,
      pactAdapter,
      undefined,
      {
        begin: async () => {
          throw Error("VW must stay unused");
        },
      } as never,
      f.support,
    );
    await engine.run(f.claim);
    f.advance(15 * 60000);
    await engine.tick("test");
    expect(inputs).toHaveLength(2);
    expect(object(JSON.parse(inputs[1].messages[1].content).cognition.plan).status).toBe("waiting");
    expect(game.submits).toHaveLength(0);
    expect((await f.pool.query("SELECT * FROM compute_ledger")).rowCount).toBe(2);
    expect((await f.pool.query("SELECT * FROM decision_choices")).rowCount).toBe(0);
  });
  it("keeps authority checks in force even when a saved plan claims a forbidden action is desirable", async () => {
    const f = await setup(),
      game = new FakeGame(f.claim);
    const model = new FakeModel([
      {
        kind: "action",
        summary: "Cancel for strategic reasons",
        action: { kind: "game.building.cancel", instructionId: randomUUID() },
      },
    ]);
    await new Engine(f.store, model, async () => game, true, pactAdapter, undefined, undefined, f.support).run(f.claim);
    expect(game.opened).toBe(0);
    expect(game.submits).toHaveLength(0);
  });
  it("allows valid game decisions when the optional cognitive update is rejected and records the exact error", async () => {
    const f = await setup(),
      game = new FakeGame(f.claim);
    const model = new FakeModel([{ kind: "wait", summary: "Wait", cognition: { expectedVersion: 99, plan: null } }]);
    await new Engine(f.store, model, async () => game, true, pactAdapter, undefined, undefined, f.support).run(f.claim);
    expect((await f.pool.query("SELECT code FROM turns")).rows[0].code).toBe("WAIT");
    expect((await f.pool.query("SELECT * FROM cognitive_states")).rowCount).toBe(0);
    const history = await new Observability(f.store).history(f.id);
    expect(history.turns[0].events.some((e) => e.detail?.code === "COGNITION_STALE_VERSION")).toBe(true);
  });
});
