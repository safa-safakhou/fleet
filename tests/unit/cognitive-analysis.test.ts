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
    commandId: randomUUID(),
    code: "REJECTED",
    source: "explicit_rejection",
    submitted: true,
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
    inferredMotive: "They may want a cautious trial before committing",
    alternativeMotive: "They may be sounding out prices without intent to trade",
    expectedPeerResponse: "A reply discussing the concrete small trial offer",
    evidenceQuote: incoming.detail.body,
    predictedEvent: "reply",
    reviewAfterMinutes: 60,
    confidence: "low",
  },
};

describe("native analysis grounded in final delivery", () => {
  it("fits a successful command's large receipt beside growing continuity without claiming omitted effects", () => {
    const receipt = {
      ...outcome,
      detail: { ...outcome.detail, code: "COMMITTED", source: "receipt", committed: true },
    };
    const cognition = {
      ...context,
      nativeAnalysis: true,
      evidence: [current, incoming, receipt],
      latestReceiptId: receipt.id,
      analysisEvidenceIds: [incoming.id, receipt.id],
      plan: {
        goal: "Retain a cautious trade plan".repeat(8),
        steps: ["Read the next reply"],
        status: "waiting",
        reconsiderWhen: "When new evidence changes supply".repeat(8),
        evidenceRefs: [incoming.id],
      },
    };
    const wholeReceipt = { code: "COMMITTED", result: { opaqueDetails: "x".repeat(14000) } };
    const prompt = {
      environment: { core: "x".repeat(2000) },
      cognition,
      commandResults: [
        {
          commandId: receipt.detail.commandId,
          actionKind: receipt.detail.actionKind,
          outcomeSource: "receipt",
          receipt: wholeReceipt,
        },
      ],
    };
    const messages = fitMessages(prompt, "Use observed facts", analysisSchemaForVersion(2, cognition), 11000, () => []);
    const fitted = JSON.parse(messages[1].content);
    expect(fitted.commandResults[0].receipt).toEqual({ code: "COMMITTED" });
    expect(fitted.commandResults[0].receiptCoverage).toContain("omitted, not unchanged");
    expect(fitted.cognition.plan).toEqual(cognition.plan);
    expect(fitted.cognition.evidence.some((e: typeof receipt) => e.id === receipt.id)).toBe(true);
    expect(prompt.commandResults[0].receipt).toEqual(wholeReceipt);
    expect(Object.keys(fitted).at(-1)).toBe("cognition");
  });
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
    expect(offered[1].observed).toContain("not committed");
    const validate = new Ajv({ strict: false }).compile(analysisSchemaForVersion(2, context));
    expect(validate({ cognition: belief, decision: { kind: "wait", summary: "Consider a small trial" } })).toBe(true);
    const update = object(normalizeAnalysis(belief, context));
    const saved = object((update.beliefs as unknown[])[0]);
    expect(saved.hypothesis).toBe(belief.analysis.inferredMotive);
    expect(saved.basis).toEqual({ sourceId: incoming.id, kind: "statement" });
    expect(saved.test).toEqual({ kind: "reply", afterGameTimeMs: 1000000, byGameTimeMs: 4600000 });
    expect(saved.assessment).toBe("untested");
    expect(
      validate({
        decision: { kind: "wait", summary: "Wait" },
        cognition: { expectedVersion: 2, analysis: { type: "none", reason: "No useful change to the current plan" } },
      }),
    ).toBe(true);
  });
  it("places cognition before the new decision and requires the exact past result before a reflection", () => {
    const schema = analysisSchemaForVersion(2, context);
    expect(Object.keys(object(schema.properties))).toEqual(["cognition", "decision"]);
    const observedFact = analysisOpportunities(context).find((o) => o.type === "reflection")?.observed;
    const raw = {
      expectedVersion: 2,
      analysis: {
        type: "reflection",
        opportunity: "recorded_result",
        observedFact,
        difference: "The queue attempt was rejected without committing resources",
        lesson: "Do not treat the failed attempt as progress toward a farm",
        nextStep: "Check the exact permitted queue shape before retrying",
      },
    };
    const validate = new Ajv({ strict: false }).compile(schema);
    expect(validate({ cognition: raw, decision: { kind: "wait", summary: "Check before retrying" } })).toBe(true);
    const forged = { ...raw, analysis: { ...raw.analysis, observedFact: "The farm completed" } };
    expect(validate({ cognition: forged, decision: { kind: "wait", summary: "Wait" } })).toBe(false);
    expect(() => normalizeAnalysis(forged, context)).toThrow("COGNITION_OUTCOME_MISMATCH");
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
      { ...outcome.detail, source: "controller_rejection", submitted: false },
      { ...outcome.detail, code: "INVALID_COMMAND" },
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
  it("does not rotate through older messages or repeated contact snapshots to refresh a peer forecast", () => {
    const saved = (object(normalizeAnalysis(belief, context)).beliefs as object[]).map((b) => ({
      ...b,
      updatedAt: "2026-10-14T00:01:00Z",
    }));
    const old = { ...incoming, id: randomUUID() };
    const contacts = {
      ...current,
      id: randomUUID(),
      detail: { ...current.detail, peerFacts: [{ peerId: "peer", kind: "contact" }] },
    };
    expect(
      analysisOpportunities({ ...context, beliefs: saved, evidence: [current, old, contacts] }).some(
        (o) => o.type === "belief",
      ),
    ).toBe(false);
    const fresh = { ...old, at: "2026-10-14T00:02:00Z" };
    expect(
      analysisOpportunities({ ...context, beliefs: saved, evidence: [current, fresh] }).some(
        (o) => o.type === "belief",
      ),
    ).toBe(true);
    expect(() =>
      normalizeAnalysis({ ...belief, analysis: { ...belief.analysis, reviewAfterMinutes: 179 } }, context),
    ).toThrow("COGNITION_INVALID_ANALYSIS");
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
        evidenceQuote: reply.detail.body,
        inferredMotive: "They respond to offers but supply remains unverified",
        alternativeMotive: "They may be keeping negotiations open without stock",
        confidence: "low",
        assessment: "supported",
      },
    };
    const revised = object((object(normalizeAnalysis(raw, delivered)).beliefs as unknown[])[0]);
    expect(revised.prediction).toBe(`Expect reply within 60 game minutes: ${belief.analysis.expectedPeerResponse}`);
    expect(revised.test).toEqual(object((saved as unknown[])[0]).test);
    expect(revised.basis).toEqual({ sourceId: reply.id, kind: "reply" });
    expect(
      new Ajv({ strict: false }).compile(analysisSchemaForVersion(2, delivered))({
        cognition: raw,
        decision: { kind: "wait", summary: "Keep the trial small" },
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
