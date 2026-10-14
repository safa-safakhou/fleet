import { randomUUID } from "node:crypto";
import { Ajv } from "ajv";
import { afterEach, describe, expect, it } from "vitest";
import {
  Cognition,
  cognitiveDecisionGuide,
  cognitiveSchemaForVersion,
  deliveredCognition,
} from "../../src/cognition.js";
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
    direction: "incoming",
    gameTime: String(f.now().getTime()),
    body: "The promised grain arrived on time.",
  });
  const outcome = await support.capture(claim, "receipt", "recorded-result", {
    commandId: randomUUID(),
    intent: "Ask for a small grain trial",
    actionKind: "game.message.send",
    receipt: { code: "COMMITTED" },
    source: "receipt",
    committed: true,
  });
  const context = await support.context(claim, [peer], evidence, "trade");
  return { ...f, id, claim, support, peer, evidence, outcome, context };
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
        prediction: "They will reply to discuss a small grain trial",
        basis: { sourceId: f.evidence, kind: "statement" },
        test: { kind: "reply", afterGameTimeMs: f.now().getTime(), byGameTimeMs: f.now().getTime() + 3600000 },
        assessment: "untested",
        evidenceRefs: [f.evidence],
      },
    ],
    reflections: [
      {
        outcomeRef: f.outcome,
        revision: "Consider a small trial, while retaining uncertainty",
        evidenceRefs: [f.outcome],
      },
    ],
    memories: [{ summary: "A grain exchange worth reviewing", importance: 4, evidenceRefs: [f.evidence] }],
  };
}
describe("LLM memory, plans and beliefs", () => {
  it("refuses self speech and unrelated peer sources as evidence about another player", async () => {
    const f = await setup();
    const outgoing = await f.support.capture(f.claim, "message", "self-speech", {
      peerId: f.peer,
      direction: "outgoing",
      body: "We could form an alliance",
    });
    const context = await f.support.context(f.claim, [f.peer], outgoing, "alliance");
    const belief = update(f).beliefs[0];
    await expect(
      f.support.apply(
        f.claim,
        0,
        {
          expectedVersion: 0,
          beliefs: [
            {
              ...belief,
              basis: { kind: "statement", sourceId: outgoing },
              evidenceRefs: [outgoing],
            },
          ],
        },
        context,
      ),
    ).rejects.toThrow("COGNITION_PEER_EVIDENCE_MISMATCH");
    await expect(
      f.support.apply(
        f.claim,
        0,
        {
          expectedVersion: 0,
          beliefs: [
            {
              ...belief,
              peerId: "another-observed-peer",
            },
          ],
        },
        { ...f.context, knownPeerIds: [f.peer, "another-observed-peer"] },
      ),
    ).rejects.toThrow("COGNITION_PEER_EVIDENCE_MISMATCH");
    expect((await f.pool.query("SELECT * FROM cognitive_states")).rowCount).toBe(0);
  });
  it("refuses peer facts that were retained privately but paged out of the delivered source", async () => {
    const f = await setup();
    const id = await f.support.capture(f.claim, "observation", "contact-fact", {
      asOfGameTimeMs: f.now().getTime(),
      peerFacts: [{ peerId: f.peer, kind: "contact" }],
    });
    const context = await f.support.context(f.claim, [f.peer], id, "contact");
    const paged = {
      ...context,
      evidence: (context.evidence as Data[]).map((e) =>
        e.id === id ? { ...e, detail: { factsAt: "environment", coverage: "Contact page omitted" } } : e,
      ),
    };
    await expect(
      f.support.apply(
        f.claim,
        0,
        {
          expectedVersion: 0,
          beliefs: [
            {
              ...update(f).beliefs[0],
              basis: { sourceId: id, kind: "contact" },
              evidenceRefs: [id],
            },
          ],
        },
        paged,
      ),
    ).rejects.toThrow("COGNITION_PEER_EVIDENCE_MISMATCH");
  });
  it("tests an existing prediction against a later peer reply, never retroactively invents success", async () => {
    const f = await setup(),
      belief = update(f).beliefs[0];
    await expect(
      f.support.apply(f.claim, 0, { expectedVersion: 0, beliefs: [{ ...belief, assessment: "supported" }] }, f.context),
    ).rejects.toThrow("COGNITION_TEST_OUTCOME_UNVERIFIED");
    await f.support.apply(f.claim, 0, { expectedVersion: 0, beliefs: [belief] }, f.context);
    f.advance(1000);
    const reply = await f.support.capture(f.claim, "message", "later-reply", {
      peerId: f.peer,
      direction: "incoming",
      gameTime: String(f.now().getTime()),
      body: "Let us discuss the small trial",
    });
    const context = await f.support.context(f.claim, [f.peer], reply, "review trial");
    const supported = {
      ...belief,
      assessment: "supported",
      basis: { kind: "reply", sourceId: reply },
      evidenceRefs: [reply],
    };
    await expect(
      f.support.apply(
        f.claim,
        1,
        {
          expectedVersion: 1,
          beliefs: [{ ...supported, prediction: "They will fulfil a completely different promise" }],
        },
        context,
      ),
    ).rejects.toThrow("COGNITION_RETROACTIVE_PREDICTION");
    await expect(
      f.support.apply(f.claim, 1, { expectedVersion: 1, beliefs: [{ ...supported, confidence: "high" }] }, context),
    ).rejects.toThrow("COGNITION_CONFIDENCE_UNSUPPORTED");
    await f.support.apply(f.claim, 1, { expectedVersion: 1, beliefs: [supported] }, context);
    const stored = await f.support.inspect(f.claim.agentId);
    expect(object((stored.beliefs as Data[])[0]).assessment).toBe("supported");
    const before = (await f.pool.query("SELECT * FROM cognitive_states")).rows[0];
    f.advance(1000);
    await f.support.apply(f.claim, 2, { expectedVersion: 2, beliefs: [supported] }, { ...context, version: 2 });
    expect((await f.pool.query("SELECT * FROM cognitive_states")).rows[0]).toEqual(before);
  });
  it("derives factual reflections from recorded results and refuses fabricated answers or completion", async () => {
    const f = await setup();
    const reflection = {
      outcomeRef: f.outcome,
      revision: "Check for the peer reply before treating the trial as agreed",
      evidenceRefs: [f.outcome],
    };
    await expect(
      f.support.apply(
        f.claim,
        0,
        { expectedVersion: 0, reflections: [{ ...reflection, observed: "Peer contact answered via game.answer" }] },
        f.context,
      ),
    ).rejects.toThrow("COGNITION_OUTCOME_MISMATCH");
    await expect(
      f.support.apply(
        f.claim,
        0,
        { expectedVersion: 0, reflections: [{ ...reflection, outcomeRef: f.evidence, evidenceRefs: [f.evidence] }] },
        f.context,
      ),
    ).rejects.toThrow("COGNITION_RECORDED_OUTCOME_REQUIRED");
    await f.support.apply(f.claim, 0, { expectedVersion: 0, reflections: [reflection] }, f.context);
    const saved = (await f.support.inspect(f.claim.agentId)).reflections as Data[];
    expect(saved[0]).toMatchObject({
      expected: "Ask for a small grain trial",
      observed: "game.message.send: COMMITTED; command committed; later completion unknown.",
      grounding: "recorded_outcome",
    });
  });
  it("does not append paraphrases of the same outcome, including after visible reflection eviction", async () => {
    const f = await setup();
    const reflection = {
      outcomeRef: f.outcome,
      revision: "Check for a peer reply before another commitment",
      evidenceRefs: [f.outcome],
    };
    await f.support.apply(f.claim, 0, { expectedVersion: 0, reflections: [reflection] }, f.context);
    for (let i = 0; i < 8; i++) {
      const id = await f.support.capture(f.claim, "receipt", `outcome-${i}`, {
        commandId: randomUUID(),
        intent: "Check schema before a commitment",
        actionKind: "game.message.send",
        receipt: { code: "REFUSED" },
        source: "explicit_rejection",
        committed: false,
      });
      const c = await f.support.context(f.claim, [f.peer], id, "review");
      await f.support.apply(
        f.claim,
        i + 1,
        { expectedVersion: c.version, reflections: [{ ...reflection, outcomeRef: id, evidenceRefs: [id] }] },
        c,
      );
    }
    const before = (await f.pool.query("SELECT * FROM cognitive_states")).rows[0];
    const c = await f.support.context(f.claim, [f.peer], f.outcome, "review original");
    await f.support.apply(
      f.claim,
      10,
      {
        expectedVersion: c.version,
        reflections: [{ ...reflection, revision: "Review the counterpart response before committing again" }],
      },
      c,
    );
    expect((await f.pool.query("SELECT * FROM cognitive_states")).rows[0]).toEqual(before);
    expect((await f.pool.query("SELECT * FROM cognitive_reflection_keys")).rowCount).toBe(9);
    const events = (await new Observability(f.store).history(f.id)).turns[0].events;
    expect(events.some((e) => e.detail?.duplicateReflectionsSkipped === 1)).toBe(true);
  });
  it("quarantines old unverified prose from prompts without rewriting history or inspection", async () => {
    const f = await setup();
    const legacy = {
      plan: null,
      beliefs: [
        {
          peerId: f.peer,
          hypothesis: "Reliable ally",
          assessment: "supported",
          confidence: "high",
          updatedAt: f.now().toISOString(),
          evidenceRefs: [f.evidence],
        },
      ],
      reflections: [
        {
          expected: "Alliance accepted",
          observed: "Contact answered via game.answer",
          revision: "Confirmed",
          updatedAt: f.now().toISOString(),
          evidenceRefs: [f.outcome],
        },
      ],
    };
    const cipher = f.store.vault.encrypt(legacy, `cognition:${f.claim.agentId}`);
    await f.pool.query("INSERT INTO cognitive_states VALUES($1,$2,5,$3,$4)", [f.claim.agentId, f.id, f.now(), cipher]);
    const context = await f.support.context(f.claim, [f.peer], f.evidence, "alliance");
    expect(context.beliefs).toEqual([]);
    expect(context.reflections).toEqual([]);
    expect(object(context.coverage).legacyUnverifiedBeliefs).toBe(1);
    expect((await f.pool.query("SELECT detail_cipher FROM cognitive_states")).rows[0].detail_cipher).toBe(cipher);
    const view = await f.support.inspect(f.claim.agentId);
    expect((view.beliefs as Data[])[0].grounding).toBe("legacy_unverified");
    expect((view.reflections as Data[])[0].observed).toBe("Contact answered via game.answer");
  });
  it("makes a refused action available as a not-submitted outcome for the next decision", async () => {
    const f = await setup(),
      game = new FakeGame(f.claim);
    let call = 0;
    const model: ModelPort = {
      decide: async (input) => {
        const c = object(JSON.parse(input.messages[1].content).cognition);
        if (call++ === 0)
          return {
            decision: { kind: "action", summary: "Try to accept the invitation", action: { kind: "game.answer" } },
            inputTokens: 100,
            outputTokens: 100,
          };
        const outcome = (c.evidence as Data[]).find((e) => object(e.detail).source === "controller_rejection");
        expect(outcome).toBeTruthy();
        return {
          decision: {
            kind: "wait",
            summary: "Inspect the exact action schema next turn",
            cognition: {
              expectedVersion: c.version,
              review: {
                beliefs: "unchanged",
                reflection: "updated",
                reason: "The attempted action was rejected before submission",
              },
              reflections: [
                {
                  outcomeRef: outcome?.id,
                  revision: "Inspect the admitted contact-answer schema before retrying",
                  evidenceRefs: [outcome?.id],
                },
              ],
            },
          },
          inputTokens: 100,
          outputTokens: 100,
        };
      },
    };
    await new Engine(f.store, model, async () => game, true, pactAdapter, undefined, undefined, f.support).run(f.claim);
    expect(game.submits).toHaveLength(0);
    expect(game.opened).toBe(0);
    const saved = (await f.support.inspect(f.claim.agentId)).reflections as Data[];
    expect(saved[0].observed).toBe("game.answer: INVALID_GAME_ACTION; not submitted.");
    expect((await f.pool.query("SELECT * FROM compute_ledger")).rowCount).toBe(2);
  });
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
  it("journals an evidence review without pretending an empty update changed state", async () => {
    const f = await setup();
    const review = {
      beliefs: "insufficient_evidence",
      reflection: "insufficient_evidence",
      reason: "A peer claim alone cannot establish delivery; no prior expectation was recorded",
    };
    await f.support.apply(
      f.claim,
      0,
      { expectedVersion: 0, review, plan: null, beliefs: [], reflections: [] },
      f.context,
    );
    await f.support.apply(
      f.claim,
      0,
      { expectedVersion: 0, review, plan: null, beliefs: [], reflections: [] },
      f.context,
    );
    expect((await f.pool.query("SELECT * FROM cognitive_states")).rowCount).toBe(0);
    expect((await f.pool.query("SELECT * FROM cognitive_updates")).rowCount).toBe(1);
    const inspected = await f.support.inspect(f.claim.agentId);
    expect(inspected.version).toBe(0);
    expect(inspected.latestReview).toEqual(review);
    const events = (await new Observability(f.store).history(f.id)).turns[0].events;
    expect(events.some((event) => event.label === "LLM reviewed continuity without a revision")).toBe(true);
  });
  it("delivers Laya's ordered pair to the decision model in a dense turn and persists grounded beliefs/reflection without extra calls", async () => {
    const f = await setup(),
      game = new FakeGame(f.claim);
    await f.support.apply(f.claim, 1, update(f), f.context);
    await f.store.rememberDecisionFeedback(f.claim, {
      code: "INVALID_GAME_ACTION",
      actionKind: "game.building.queue",
      schemaDigest: "a".repeat(64),
      errors: [
        {
          instancePath: "",
          keyword: "required",
          params: { missingProperty: "slot" },
          message: "must have required property slot",
        },
      ],
      inputSchema: {
        type: "object",
        required: ["kind", "building", "targetLevel", "slot"],
        properties: {
          kind: { const: "game.building.queue" },
          building: { type: "string" },
          targetLevel: { type: "integer" },
          slot: { type: "integer" },
        },
        additionalProperties: false,
      },
      availableKinds: pactAdapter.actionKinds,
      guidance:
        "No command was submitted. Correct the action fields against the exact schema within remaining decisions.",
    });
    f.claim.agent = await f.store.agent(f.claim.agentId);
    await f.pool.query('UPDATE cohorts SET model=model||\'{"recallAssist":"laya-recall-v1"}\'::jsonb WHERE id=$1', [
      f.id,
    ]);
    f.claim.cohort = await f.store.cohort(f.id);
    const receipt = await f.support.capture(f.claim, "receipt", "confirmed", {
      commandId: randomUUID(),
      intent: "Start a farm upgrade",
      action: { kind: "game.building.queue" },
      receipt: { code: "COMMITTED" },
      committed: true,
      source: "receipt",
    });
    let selected = "",
      candidates: string[] = [],
      calls = 0;
    const support = new Cognition(f.store, {
      choose: async (_query, pair) => {
        candidates = pair.map((candidate) => candidate.id);
        selected = pair[1].id;
        return { id: selected, probability: 0.9, certificate: "a".repeat(64) };
      },
    });
    const model: ModelPort = {
      decide: async (input) => {
        calls++;
        const context = JSON.parse(input.messages[1].content),
          cognition = context.cognition;
        expect(
          Buffer.byteLength(JSON.stringify(input.messages)) + Buffer.byteLength(JSON.stringify(input.schema)),
        ).toBeLessThanOrEqual(24000);
        expect(cognition.recall.route).toBe("laya-recall-v1");
        expect(candidates.every((id) => cognition.evidence.some((episode: Data) => episode.id === id))).toBe(true);
        const pairOrder = cognition.evidence
          .filter((episode: Data) => candidates.includes(String(episode.id)))
          .map((episode: Data) => episode.id);
        expect(pairOrder[0]).toBe(selected);
        expect(cognition.knownPeerIds).toContain(f.peer);
        expect(context.actionPermissions).toBeDefined();
        expect(context.decisionFeedback[0].inputSchema.required).toContain("slot");
        expect(cognition.beliefs).toHaveLength(1);
        expect(cognition.reflections).toHaveLength(1);
        expect(cognition.plan.status).toBe("active");
        const decision = {
          kind: "wait",
          summary: "Check the peer claim before trusting another shipment",
          cognition: {
            expectedVersion: cognition.version,
            review: {
              beliefs: "updated",
              reflection: "updated",
              reason: "The claim permits a cautious hypothesis; the receipt confirms the recorded upgrade intention",
            },
            beliefs: [
              {
                peerId: f.peer,
                hypothesis: "May value dependable supply",
                alternative: "The claim may be inaccurate",
                confidence: "low",
                prediction: "They will reply to discuss a small grain trial",
                basis: { sourceId: f.evidence, kind: "statement" },
                test: { kind: "reply", afterGameTimeMs: f.now().getTime(), byGameTimeMs: f.now().getTime() + 3600000 },
                assessment: "untested",
                evidenceRefs: [f.evidence],
              },
            ],
            reflections: [
              {
                outcomeRef: receipt,
                revision: "Check completion in fresh state before another upgrade",
                evidenceRefs: [receipt],
              },
            ],
          },
        };
        expect(new Ajv({ strict: false }).compile(input.schema)(decision)).toBe(true);
        return { decision, inputTokens: 500, outputTokens: 200 };
      },
    };
    const adapter = {
      ...pactAdapter,
      compactFacts: (facts: Data) => ({
        ...pactAdapter.compactFacts(facts),
        profile: { kingdomId: f.claim.agent.kingdom_id, whole: "x".repeat(4500) },
        contacts: [{ kingdomId: f.peer, whole: "x".repeat(9000) }],
      }),
      availableActions: (facts: Data, owner: Data | null | undefined) => {
        const result = pactAdapter.availableActions?.(facts, owner ?? null);
        if (!result) throw Error("Missing action advertisement");
        return { ...result, schemas: result.schemas.map((shape) => ({ ...shape, whole: "x".repeat(3000) })) };
      },
      suppliedReadSchemas: () => [{ name: "optional", whole: "x".repeat(6000) }],
    };
    await new Engine(f.store, model, async () => game, true, adapter, undefined, undefined, support).run(f.claim);
    expect(calls).toBe(1);
    expect((await f.pool.query("SELECT * FROM compute_ledger")).rowCount).toBe(1);
    expect(game.submits).toHaveLength(0);
    const restarted = await new Cognition(f.store).inspect(f.claim.agentId);
    expect(restarted.beliefs).toHaveLength(1);
    expect(restarted.reflections).toHaveLength(2);
    expect(restarted.version).toBe(2);
    const events = (await new Observability(f.store).history(f.id)).turns[0].events;
    expect(events.find((event) => event.label === "LLM continuity delivered")?.detail?.recallPairDelivered).toBe(true);
  });
  it("reports size-only diagnostics and reserves no call when indispensable current facts cannot fit", async () => {
    const f = await setup(),
      game = new FakeGame(f.claim);
    let calls = 0;
    const model: ModelPort = {
      decide: async () => {
        calls++;
        throw Error("Must fail before inference");
      },
    };
    const adapter = { ...pactAdapter, compactFacts: () => ({ profile: { whole: "x".repeat(26000) } }) };
    await new Engine(f.store, model, async () => game, true, adapter, undefined, undefined, f.support).run(f.claim);
    expect(calls).toBe(0);
    expect((await f.pool.query("SELECT * FROM compute_ledger")).rowCount).toBe(0);
    const event = (await new Observability(f.store).history(f.id)).turns[0].events.find(
      (e) => e.label === "Context packing could not fit",
    );
    expect(event?.detail?.inputByteLimit).toBe(24000);
    expect(object(event?.detail?.sectionBytes).environment).toBeGreaterThan(26000);
    expect(event?.detail).not.toHaveProperty("environment");
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
    expect(
      (await f.pool.query("SELECT * FROM cognitive_episodes WHERE kind='receipt' AND id<>$1", [f.outcome])).rowCount,
    ).toBe(0);
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
    expect(raw.map((r) => r.kind)).toEqual(["interpretation", "message", "receipt"]);
  });
  it("accepts contrary evidence and lowers an earlier belief without replacing identity or the persistent plan", async () => {
    const f = await setup();
    await f.support.apply(f.claim, 0, update(f), f.context);
    f.advance(1000);
    const newer = await f.support.capture(f.claim, "message", "uncertain-supply", {
      peerId: f.peer,
      direction: "incoming",
      gameTime: String(f.now().getTime()),
      body: "I cannot promise reliable supply yet.",
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
            assessment: "unresolved",
            hypothesis: "The peer now expresses uncertainty about supply",
            basis: { sourceId: newer, kind: "statement" },
            evidenceRefs: [newer],
          },
        ],
      },
      context,
    );
    const result = await f.support.context(f.claim, [f.peer], newer, "supply");
    expect(object(result.plan).goal).toBe(update(f).plan.goal);
    expect((result.beliefs as Data[])[0].assessment).toBe("unresolved");
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
    expect(inputs[0].schema).toEqual(
      cognitiveSchemaForVersion(0, deliveredCognition(JSON.parse(inputs[0].messages[1].content))),
    );
    expect(inputs[1].schema).toEqual(
      cognitiveSchemaForVersion(1, deliveredCognition(JSON.parse(inputs[1].messages[1].content))),
    );
    expect(JSON.parse(inputs[0].messages[1].content).decisionSchema).toEqual(cognitiveDecisionGuide);
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
