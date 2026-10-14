import { randomUUID } from "node:crypto";
import { Ajv } from "ajv";
import { describe, expect, it } from "vitest";
import { analysisOpportunities, analysisSchemaForVersion, normalizeAnalysis } from "../../src/cognitive-analysis.js";
import { fitMessages } from "../../src/context.js";
import { object } from "../../src/domain.js";

const current = {
  id: randomUUID(),
  kind: "observation",
  at: "2026-10-14T00:00:00Z",
  detail: { asOfGameTimeMs: 1000000, peerFacts: [] },
};
const incoming = {
  id: randomUUID(),
  kind: "message",
  at: current.at,
  detail: { direction: "incoming", peerId: "peer", body: "I would discuss a small grain exchange" },
};
const outcome = {
  id: randomUUID(),
  kind: "receipt",
  at: current.at,
  detail: {
    intent: "Try to queue a farm",
    actionKind: "game.building.queue",
    code: "INVALID_GAME_ACTION",
    source: "controller_rejection",
    submitted: false,
    committed: false,
  },
};
const context = {
  version: 2,
  currentEvidenceId: current.id,
  evidence: [current, incoming, outcome],
  knownPeerIds: ["peer"],
  beliefs: [],
};
const belief = {
  expectedVersion: 2,
  analysis: {
    type: "belief",
    opportunity: "peer_evidence",
    hypothesis: "They may want a cautious trial before committing",
    alternative: "They may be sounding out prices without intent to trade",
    prediction: "They will reply to a concrete small trial offer",
    predictedEvent: "reply",
    reviewAfterMinutes: 60,
    confidence: "low",
  },
};

describe("native analysis grounded in final delivery", () => {
  it("keeps the peer basis and recorded result usable when duplicated details are linked out to fit", () => {
    const observation = {
      ...current,
      detail: { ...current.detail, peerFacts: [{ peerId: "peer", kind: "contact" }], text: "x".repeat(13000) },
    };
    const receipt = {
      ...outcome,
      detail: {
        ...outcome.detail,
        commandId: randomUUID(),
        code: "COMMITTED",
        source: "receipt",
        committed: true,
        submitted: true,
      },
    };
    const cognition = {
      ...context,
      nativeAnalysis: true,
      latestReceiptId: receipt.id,
      evidence: [observation, receipt],
      analysisEvidenceIds: [observation.id, receipt.id],
    };
    const messages = fitMessages(
      {
        environment: { core: "x".repeat(1500) },
        cognition,
        commandResults: [{ commandId: receipt.detail.commandId, receipt: { code: "COMMITTED" } }],
      },
      "Choose with grounded facts",
      analysisSchemaForVersion(2, cognition),
      10000,
      () => [],
    );
    const delivered = object(JSON.parse(messages[1].content).cognition);
    const evidence = delivered.evidence as (typeof observation)[];
    expect(object(evidence[0].detail).factsAt).toBe("environment");
    expect(object(evidence[0].detail).peerFacts).toEqual(observation.detail.peerFacts);
    expect(object(evidence[1].detail).receiptAt).toBe("commandResults");
    expect(analysisOpportunities(delivered).map((o) => o.type)).toEqual(["belief", "reflection"]);
    expect(
      Buffer.byteLength(JSON.stringify(messages)) +
        Buffer.byteLength(JSON.stringify(analysisSchemaForVersion(2, delivered))),
    ).toBeLessThanOrEqual(10000);
  });
  it("offers useful evidence, accepts concise judgments and supplies exact bookkeeping without authoring the judgment", () => {
    const offered = analysisOpportunities(context);
    expect(offered.map((o) => o.type)).toEqual(["belief", "reflection"]);
    expect(offered[1].observed).toContain("not submitted");
    const validate = new Ajv({ strict: false }).compile(analysisSchemaForVersion(2, context));
    expect(validate({ kind: "wait", summary: "Consider a small trial", cognition: belief })).toBe(true);
    const update = object(normalizeAnalysis(belief, context));
    const saved = object((update.beliefs as unknown[])[0]);
    expect(saved.hypothesis).toBe(belief.analysis.hypothesis);
    expect(saved.basis).toEqual({ sourceId: incoming.id, kind: "statement" });
    expect(saved.test).toEqual({ kind: "reply", afterGameTimeMs: 1000000, byGameTimeMs: 4600000 });
    expect(saved.assessment).toBe("untested");
    expect(
      validate({
        kind: "wait",
        summary: "Wait",
        cognition: { expectedVersion: 2, analysis: { type: "none", reason: "No useful change to the current plan" } },
      }),
    ).toBe(true);
  });
  it("cannot turn outgoing speech, missing game time, evicted facts or foreign aliases into a belief", () => {
    for (const delivered of [
      { ...context, evidence: [current, { ...incoming, detail: { ...incoming.detail, direction: "outgoing" } }] },
      { ...context, evidence: [{ ...current, detail: {} }, incoming] },
      { ...context, evidence: [{ ...current, detail: { asOfGameTimeMs: null } }, incoming] },
      { ...context, evidence: [current] },
      { ...context, knownPeerIds: [] },
    ]) {
      expect(analysisOpportunities(delivered).some((o) => o.type === "belief")).toBe(false);
      expect(() => normalizeAnalysis(belief, delivered)).toThrow("COGNITION_ANALYSIS_NOT_OFFERED");
      expect(
        new Ajv({ strict: false }).compile(analysisSchemaForVersion(2, delivered))({
          kind: "wait",
          summary: "Wait",
          cognition: belief,
        }),
      ).toBe(false);
    }
    expect(() =>
      normalizeAnalysis({ ...belief, analysis: { ...belief.analysis, opportunity: "foreign" } }, context),
    ).toThrow("COGNITION_INVALID_ANALYSIS");
  });
  it("withholds uncertain/malformed results and already reflected outcomes even when recalled by Laya", () => {
    for (const detail of [
      { ...outcome.detail, source: "unknown" },
      { ...outcome.detail, intent: "" },
      { ...outcome.detail, committed: true },
    ])
      expect(
        analysisOpportunities({ ...context, evidence: [current, { ...outcome, detail }] }).some(
          (o) => o.type === "reflection",
        ),
      ).toBe(false);
    expect(
      analysisOpportunities({ ...context, reflectedOutcomeIds: [outcome.id] }).some((o) => o.type === "reflection"),
    ).toBe(false);
  });
  it("does not continually restart a prediction based on the same old statement", () => {
    const saved = object(normalizeAnalysis(belief, context)).beliefs;
    expect(analysisOpportunities({ ...context, beliefs: saved }).some((o) => o.type === "belief")).toBe(false);
  });
  it("reassesses a saved prediction only after a later incoming reply within its original window", () => {
    const saved = (object(normalizeAnalysis(belief, context)).beliefs as object[]).map((b) => ({
      ...b,
      updatedAt: current.at,
    }));
    const reply = {
      ...incoming,
      id: randomUUID(),
      at: "2026-10-14T00:01:00Z",
      detail: {
        ...incoming.detail,
        gameTime: "2000000",
        body: "I can discuss a trial but cannot guarantee delivery yet",
      },
    };
    const delivered = { ...context, beliefs: saved, evidence: [current, reply] };
    expect(analysisOpportunities(delivered).some((o) => o.type === "reassessment")).toBe(true);
    const raw = {
      expectedVersion: 2,
      analysis: {
        type: "reassessment",
        opportunity: "tested_prediction",
        hypothesis: "They respond to offers but supply remains unverified",
        alternative: "They may be keeping negotiations open without stock",
        confidence: "low",
        assessment: "supported",
      },
    };
    const revised = object((object(normalizeAnalysis(raw, delivered)).beliefs as unknown[])[0]);
    expect(revised.prediction).toBe(belief.analysis.prediction);
    expect(revised.test).toEqual(object((saved as unknown[])[0]).test);
    expect(revised.basis).toEqual({ sourceId: reply.id, kind: "reply" });
    expect(
      new Ajv({ strict: false }).compile(analysisSchemaForVersion(2, delivered))({
        kind: "wait",
        summary: "Keep the trial small",
        cognition: raw,
      }),
    ).toBe(true);
    expect(() =>
      normalizeAnalysis(raw, {
        ...delivered,
        evidence: [current, { ...reply, detail: { ...reply.detail, gameTime: "5000000" } }],
      }),
    ).toThrow("COGNITION_ANALYSIS_NOT_OFFERED");
  });
});
