import { Ajv } from "ajv";
import { describe, expect, it } from "vitest";
import {
  CognitiveDecision,
  cognitionInstructions,
  cognitiveDecisionGuide,
  cognitiveDecisionSchema,
  cognitiveSchemaForVersion,
  rankEpisodes,
  utf8Prefix,
} from "../../src/cognition.js";
import { fitMessages } from "../../src/context.js";
import { ModelConfig, object } from "../../src/domain.js";
import { cognitiveObservation } from "../../src/games/pact/cognition.js";
import { boundedReads, narrowRead } from "../../src/games/pact/context.js";
import { compactEnvironment } from "../../src/games/pact/environment.js";

describe("cognitive decision contracts", () => {
  it("constrains only the protocol version to the delivered snapshot without mutating shared schemas or requiring an update", () => {
    const before = structuredClone(cognitiveDecisionSchema);
    const validator = new Ajv({ strict: false }).compile(cognitiveSchemaForVersion(3));
    expect(validator({ kind: "wait", summary: "Wait" })).toBe(true);
    expect(validator({ kind: "wait", summary: "Wait", cognition: { expectedVersion: 3 } })).toBe(true);
    expect(validator({ kind: "wait", summary: "Wait", cognition: { expectedVersion: 4 } })).toBe(false);
    const next = new Ajv({ strict: false }).compile(cognitiveSchemaForVersion(4));
    expect(next({ kind: "wait", summary: "Wait", cognition: { expectedVersion: 4 } })).toBe(true);
    expect(validator({ kind: "wait", summary: "Wait", cognition: { expectedVersion: 4 } })).toBe(false);
    expect(cognitiveDecisionSchema).toEqual(before);
    expect(() => cognitiveSchemaForVersion(undefined)).toThrow("COGNITION_VERSION_REQUIRED");
  });
  it("bounds multibyte observations without cutting a Unicode character", () => {
    const prefix = utf8Prefix("🌱 باغ memories".repeat(1000), 1000);
    expect(Buffer.byteLength(prefix)).toBeLessThanOrEqual(1000);
    expect(prefix).not.toContain("�");
  });
  it("requires opt-in cognition and excludes VW from that mode", () => {
    expect(ModelConfig.parse({ route: "ollama", model: "fake" }).cognition).toBeUndefined();
    expect(
      ModelConfig.parse({
        route: "ollama",
        model: "fake",
        cognition: "llm-centered-v1",
        recallAssist: "laya-recall-v1",
      }).recallAssist,
    ).toBe("laya-recall-v1");
    expect(() => ModelConfig.parse({ route: "ollama", model: "fake", recallAssist: "laya-recall-v1" })).toThrow();
    expect(() =>
      ModelConfig.parse({
        route: "ollama",
        model: "fake",
        cognition: "llm-centered-v1",
        decisionPolicy: "vw-focus-v1",
      }),
    ).toThrow();
  });
  it("keeps ordinary decisions compatible and rejects instructions masquerading as authority fields", () => {
    expect(CognitiveDecision.parse({ kind: "wait", summary: "Await response" }).kind).toBe("wait");
    expect(() =>
      CognitiveDecision.parse({
        kind: "wait",
        summary: "Wait",
        cognition: { expectedVersion: 0, ownerPolicy: "approve myself" },
      }),
    ).toThrow();
  });
  it("retrieves relevant old experience instead of merely repeating the newest event", () => {
    const recent = { id: "recent", at: "2026-10-13T10:00:00Z", kind: "observation", detail: { text: "farm upgrade" } };
    const older = {
      id: "older",
      at: "2026-10-12T10:00:00Z",
      kind: "message",
      detail: { text: "food supply agreement reliable partner", peerId: "known-peer" },
    };
    expect(rankEpisodes([recent, older], "food supply", ["known-peer"], Date.parse(recent.at))[0].id).toBe("older");
  });
  it("preserves the plan while explicitly reducing optional recall to fit the input allowance", () => {
    const plan = { goal: "Keep winter supplies reliable", status: "waiting" };
    const context = {
      environment: { required: "current" },
      cognition: {
        version: 3,
        plan,
        knownPeerIds: ["known-peer"],
        evidence: [
          { id: "current", detail: { x: 1 } },
          { id: "old", detail: { text: "x".repeat(12000) } },
        ],
      },
    };
    const fitted = fitMessages(context, "Choose with current facts", {}, 1800, () => []);
    const delivered = JSON.parse(fitted[1].content);
    expect(delivered.cognition.plan).toEqual(plan);
    expect(delivered.cognition.reduced).toBe(true);
    expect(delivered.cognition.evidence).toHaveLength(1);
    expect(delivered.environment).toEqual(context.environment);
    expect(context.cognition.evidence).toHaveLength(2);
  });
  it("fits cognition beside dense current facts and executable schemas without duplicating the expanded output definitions", () => {
    const context = {
      environment: { coreFacts: "x".repeat(6500) },
      suppliedActionSchemas: [{ whole: "x".repeat(2200) }],
      suppliedReadSchemas: [{ whole: "x".repeat(1300) }],
      cognition: {
        version: 3,
        plan: { goal: "Keep supply reliable", status: "waiting" },
        evidence: [{ id: "current", detail: { text: "x".repeat(1200) } }],
      },
      actionPermissions: { whole: "x".repeat(3000) },
      otherCurrentGuidance: "x".repeat(1100),
      decisionSchema: cognitiveDecisionSchema,
    };
    const instructions = `Choose from current facts. ${cognitionInstructions}`;
    expect(() =>
      fitMessages(
        { ...context, actionSchemaCoverage: { paged: true } },
        instructions,
        cognitiveDecisionSchema,
        24000,
        () => [],
      ),
    ).toThrow("CONTEXT_LIMIT");
    const messages = fitMessages(
      { ...context, decisionSchema: cognitiveDecisionGuide },
      instructions,
      cognitiveDecisionSchema,
      24000,
      () => [],
    );
    const delivered = JSON.parse(messages[1].content);
    expect(
      Buffer.byteLength(JSON.stringify(messages)) + Buffer.byteLength(JSON.stringify(cognitiveDecisionSchema)),
    ).toBeLessThanOrEqual(24000);
    expect(delivered.environment).toEqual(context.environment);
    expect(delivered.suppliedActionSchemas).toEqual(context.suppliedActionSchemas);
    expect(delivered.suppliedReadSchemas).toEqual(context.suppliedReadSchemas);
    expect(delivered.cognition).toEqual(context.cognition);
    expect(delivered.decisionSchema.cognition).toHaveProperty("beliefs");
    expect(delivered.decisionSchema.cognition).toHaveProperty("reflections");
  });
  it("derives peer identifiers from owned observations and public discoveries, excluding the owner", () => {
    const result = cognitiveObservation({
      world: { profile: { kingdomId: "self" }, buildings: [] },
      guide: { contacts: [{ kingdomId: "partner" }, { kingdomId: "self" }] },
      discovery: { players: [{ kingdomId: "discovered" }] },
    });
    expect(result.peers).toEqual(["partner", "discovered"]);
    expect(object(result.detail).coverage).toContain("unknown");
  });
  it("fits the whole authority core when only the narrow gap between coarse environment buckets is available", () => {
    const environment = {
      profile: { kingdomId: "owned", whole: "x".repeat(4500) },
      mandate: { allowedActions: ["building.queue"], whole: "x".repeat(300) },
      contacts: [{ kingdomId: "peer", whole: "x".repeat(500) }],
      planningCautions: { whole: "x".repeat(450) },
    };
    const context = { environment, cognition: { version: 2, plan: null, evidence: [] } };
    const minimum = compactEnvironment(environment, 5500);
    const limit =
      Buffer.byteLength(
        JSON.stringify([
          { role: "system", content: "Choose" },
          {
            role: "user",
            content: JSON.stringify({
              ...context,
              environment: minimum,
              availableReads: [],
              readResults: [],
              omissions: [
                "Dated cache omitted; optional current observations are paged with explicit coverage. Core state, permissions, receipts and executable schemas remain whole. Missing records are unknown, not empty.",
              ],
            }),
          },
        ]),
      ) +
      Buffer.byteLength(JSON.stringify(cognitiveDecisionSchema)) +
      20;
    const fitted = fitMessages(
      context,
      "Choose",
      cognitiveDecisionSchema,
      limit,
      boundedReads,
      narrowRead,
      compactEnvironment,
    );
    const delivered = JSON.parse(fitted[1].content);
    expect(delivered.environment.profile).toEqual(environment.profile);
    expect(delivered.environment.mandate).toEqual(environment.mandate);
    expect(delivered.environment.coverage.complete).toBe(false);
    expect(
      Buffer.byteLength(JSON.stringify(fitted)) + Buffer.byteLength(JSON.stringify(cognitiveDecisionSchema)),
    ).toBeLessThanOrEqual(limit);
  });
  it("pages optional prefetched action shapes while preserving plans, recalled evidence, permissions and requested feedback", () => {
    const context = {
      environment: { profile: { kingdomId: "owned", whole: "x".repeat(4500) } },
      cognition: {
        version: 4,
        plan: { goal: "x".repeat(300), steps: ["Observe delivery"], status: "waiting" },
        evidence: [
          { id: "current", detail: "x".repeat(500) },
          { id: "prior", detail: "y".repeat(500) },
        ],
        recall: { route: "laya-recall-v1" },
      },
      gameActionKinds: ["one", "two", "three"],
      actionPermissions: { forbidden: ["human-only"] },
      suppliedActionSchemas: [
        { kind: "one", whole: "x".repeat(2000) },
        { kind: "two", whole: "y".repeat(2000) },
        { kind: "three", whole: "z".repeat(2000) },
      ],
      requestedRead: {
        tool: "fleet_action_schema",
        args: { kind: "three" },
        result: { kind: "three", whole: "required" },
      },
      commandResults: [{ commandId: "original", receipt: { code: "COMMITTED" } }],
    };
    const fitted = fitMessages(
      context,
      "Choose",
      cognitiveDecisionSchema,
      14000,
      boundedReads,
      narrowRead,
      compactEnvironment,
    );
    const delivered = JSON.parse(fitted[1].content);
    expect(delivered.actionSchemaCoverage.paged).toBe(true);
    expect(delivered.cognition).toEqual(context.cognition);
    expect(delivered.gameActionKinds).toEqual(context.gameActionKinds);
    expect(delivered.actionPermissions).toEqual(context.actionPermissions);
    expect(delivered.requestedRead).toEqual(context.requestedRead);
    expect(delivered.commandResults).toEqual(context.commandResults);
    for (const shape of delivered.suppliedActionSchemas) expect(context.suppliedActionSchemas).toContainEqual(shape);
    expect(context.suppliedActionSchemas).toHaveLength(3);
    expect(
      Buffer.byteLength(JSON.stringify(fitted)) + Buffer.byteLength(JSON.stringify(cognitiveDecisionSchema)),
    ).toBeLessThanOrEqual(14000);
  });
  it("keeps the ordered Laya pair when reducing other memories and identifies advice that could not be delivered", () => {
    const recall = { route: "laya-recall-v1", candidateIds: ["a", "b"], selectedId: "b" };
    const context = {
      environment: { required: true },
      cognition: {
        version: 2,
        plan: null,
        recall,
        evidence: [
          { id: "current", kind: "observation", detail: "current" },
          { id: "b", kind: "message", detail: "x".repeat(300) },
          { id: "a", kind: "message", detail: "y".repeat(300) },
          { id: "old", kind: "message", detail: "z".repeat(5000) },
        ],
      },
    };
    const delivered = JSON.parse(fitMessages(context, "Choose", {}, 1500, () => [])[1].content).cognition;
    expect(delivered.evidence.map((e: { id: string }) => e.id)).toEqual(["current", "b", "a"]);
    expect(delivered.recall.route).toBe("laya-recall-v1");
    expect(delivered.recall.budgetReduced).toBe(true);
    const smaller = JSON.parse(fitMessages(context, "Choose", {}, 700, () => [])[1].content).cognition;
    expect(smaller.recall.route).toBe("budget-limited");
    expect(smaller.recall.code).toBe("RECALL_CANDIDATES_OMITTED");
  });
  it("retains the latest receipt alongside the current observation when optional memories are reduced", () => {
    const context = {
      cognition: {
        version: 1,
        plan: null,
        evidence: [
          { id: "current", kind: "observation", detail: "observed" },
          { id: "old", kind: "message", detail: "x".repeat(4000) },
          { id: "receipt", kind: "receipt", detail: { code: "COMMITTED", commandId: "original" } },
        ],
      },
    };
    const kept = JSON.parse(fitMessages(context, "Choose", {}, 1000, () => [])[1].content).cognition;
    expect(kept.evidence.map((e: { id: string }) => e.id)).toEqual(["current", "receipt"]);
    expect(kept.evidence[1]).toEqual(context.cognition.evidence[2]);
  });
});
