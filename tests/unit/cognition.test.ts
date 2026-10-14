import { Ajv } from "ajv";
import { describe, expect, it } from "vitest";
import {
  CognitiveDecision,
  cognitionInstructions,
  cognitiveDecisionGuide,
  cognitiveDecisionSchema,
  cognitiveSchemaForVersion,
  compactEpisode,
  episodeText,
  rankEpisodes,
  utf8Prefix,
} from "../../src/cognition.js";
import { fitMessages } from "../../src/context.js";
import { ModelConfig, object } from "../../src/domain.js";
import { cognitiveObservation } from "../../src/games/pact/cognition.js";
import { boundedReads, narrowRead } from "../../src/games/pact/context.js";
import { compactEnvironment } from "../../src/games/pact/environment.js";

describe("cognitive decision contracts", () => {
  it("requires a concise evidence review and pins the delivered version without mutating shared schemas", () => {
    const before = structuredClone(cognitiveDecisionSchema);
    const validator = new Ajv({ strict: false }).compile(cognitiveSchemaForVersion(3));
    expect(validator({ kind: "wait", summary: "Wait" })).toBe(false);
    const review = {
      beliefs: "insufficient_evidence",
      reflection: "unchanged",
      reason: "No new peer statement or tested expectation",
    };
    expect(validator({ kind: "wait", summary: "Wait", cognition: { expectedVersion: 3, review } })).toBe(true);
    expect(validator({ kind: "wait", summary: "Wait", cognition: { expectedVersion: 4, review } })).toBe(false);
    const next = new Ajv({ strict: false }).compile(cognitiveSchemaForVersion(4));
    expect(next({ kind: "wait", summary: "Wait", cognition: { expectedVersion: 4, review } })).toBe(true);
    expect(validator({ kind: "wait", summary: "Wait", cognition: { expectedVersion: 4, review } })).toBe(false);
    expect(cognitiveDecisionSchema).toEqual(before);
    expect(() => cognitiveSchemaForVersion(undefined)).toThrow("COGNITION_VERSION_REQUIRED");
  });
  it("constrains citation/player identities to delivered facts without authoring a hypothesis or disabling an honest review", () => {
    const id = "11111111-1111-4111-8111-111111111111",
      invented = "22222222-2222-4222-8222-222222222222";
    const review = { beliefs: "insufficient_evidence", reflection: "unchanged", reason: "No tested expectation" };
    const schema = cognitiveSchemaForVersion(3, {
      evidence: [
        { id, kind: "message", detail: { peerId: "observed-peer", direction: "incoming" } },
        { id: invented, kind: "interpretation" },
      ],
      knownPeerIds: ["observed-peer"],
    });
    const validate = new Ajv({ strict: false }).compile(schema);
    const decision = {
      kind: "wait",
      summary: "Wait",
      cognition: {
        expectedVersion: 3,
        review,
        memories: [{ summary: "Recorded observation", importance: 2, evidenceRefs: [id] }],
      },
    };
    expect(validate(decision)).toBe(true);
    expect(
      validate({
        ...decision,
        cognition: {
          ...decision.cognition,
          memories: [{ ...decision.cognition.memories[0], evidenceRefs: [invented] }],
        },
      }),
    ).toBe(false);
    const belief = {
      peerId: "observed-peer",
      hypothesis: "May be interested",
      alternative: "Could be busy",
      confidence: "low",
      prediction: "May reply to the invitation before the deadline",
      basis: { sourceId: id, kind: "statement" },
      test: { kind: "reply", afterGameTimeMs: 0, byGameTimeMs: 3600000 },
      assessment: "untested",
      evidenceRefs: [id],
    };
    expect(validate({ ...decision, cognition: { expectedVersion: 3, review, beliefs: [belief] } })).toBe(true);
    expect(
      validate({
        ...decision,
        cognition: { expectedVersion: 3, review, beliefs: [{ ...belief, peerId: "foreign-peer" }] },
      }),
    ).toBe(false);
    const none = new Ajv({ strict: false }).compile(cognitiveSchemaForVersion(3, { evidence: [], knownPeerIds: [] }));
    expect(none({ kind: "wait", summary: "Wait", cognition: { expectedVersion: 3, review } })).toBe(true);
    expect(none(decision)).toBe(false);
  });
  it("labels the speaker and direction in both Laya candidates and compact model evidence", () => {
    const base = {
      id: "message",
      at: "now",
      kind: "message",
      detail: { peerId: "peer", direction: "outgoing", body: "Hello, we could form an alliance." },
    };
    expect(episodeText(base)).toBe("Outgoing self message; peer peer: Hello, we could form an alliance.");
    const incoming = { ...base, detail: { ...base.detail, direction: "incoming" } };
    expect(episodeText(incoming)).toMatch(/^Incoming peer statement/);
    expect(compactEpisode(base).direction).toBe("outgoing");
    const long = { ...base, detail: { ...base.detail, body: base.detail.body.repeat(100) } };
    const compact = compactEpisode(long);
    expect(compact.direction).toBe("outgoing");
    expect(compact.excerpt).toMatch(/^Outgoing self message/);
    expect(Buffer.byteLength(JSON.stringify(compact))).toBeLessThanOrEqual(600);
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
                "Cache omitted; optional current records paged. Core facts, permissions, receipts and supplied schemas retained. Missing records are unknown.",
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
        recall: { route: "relevance-recency-importance" },
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
  it("keeps the ordered Laya pair when reducing other memories and fails closed if it cannot fit", () => {
    const recall = {
      route: "laya-recall-v1",
      candidateIds: ["a", "b"],
      selectedId: "b",
      certificate: "a".repeat(64),
      probability: 0.8,
    };
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
    expect(delivered.recall).not.toHaveProperty("certificate");
    expect(() => fitMessages(context, "Choose", {}, 700, () => [])).toThrow("CONTEXT_LIMIT");
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
  it("puts a long peer statement before metadata and preserves typed identity, UTF-8 and outcome cues", () => {
    const message = compactEpisode({
      id: "message",
      at: "now",
      kind: "message",
      detail: {
        peerId: "known-peer",
        direction: "incoming",
        body: { metadata: "x".repeat(4000), body: "The shipment is delayed. 🌱".repeat(100) },
      },
    });
    expect(Buffer.byteLength(JSON.stringify(message))).toBeLessThanOrEqual(600);
    const escaped = compactEpisode({
      id: "json",
      at: "now",
      kind: "observation",
      detail: { excerpt: '\\"🌱'.repeat(1000) },
    });
    expect(Buffer.byteLength(JSON.stringify(escaped))).toBeLessThanOrEqual(600);
    expect(escaped.excerpt).not.toContain("�");
    expect(message.peerId).toBe("known-peer");
    expect(message.excerpt).toContain("The shipment is delayed");
    expect(message.excerpt).not.toContain("�");
    const receipt = compactEpisode({
      id: "receipt",
      at: "now",
      kind: "receipt",
      detail: {
        commandId: "original",
        intent: "Upgrade the farm",
        action: { kind: "building.queue" },
        receipt: { code: "COMMITTED", metadata: "x".repeat(3000) },
        committed: true,
      },
    });
    expect(receipt).toMatchObject({
      commandId: "original",
      intent: "Upgrade the farm",
      actionKind: "building.queue",
      code: "COMMITTED",
      committed: true,
    });
  });
  it("reserves the ordered pair, latest receipt, plan, belief and reflection before optional read and action shapes", () => {
    const cognition = {
      version: 2,
      plan: { goal: "Resolve the promised delivery", status: "waiting" },
      beliefs: [{ peerId: "peer", hypothesis: "May prioritize another buyer", evidenceRefs: ["b"] }],
      reflections: [{ expected: "Delivery", observed: "Delay", revision: "Check terms", evidenceRefs: ["b"] }],
      knownPeerIds: ["peer"],
      recall: { route: "laya-recall-v1", candidateIds: ["a", "b"], selectedId: "b" },
      evidence: [
        { id: "current", kind: "observation", detail: { actual: "current" } },
        { id: "b", kind: "message", detail: { peerId: "peer", body: "Delivery delayed" } },
        { id: "a", kind: "message", detail: { peerId: "peer", body: "Promised delivery" } },
        { id: "receipt", kind: "receipt", detail: { code: "COMMITTED", commandId: "original" } },
      ],
    };
    const context = {
      environment: { profile: { whole: "x".repeat(6000) } },
      cognition,
      actionPermissions: { forbidden: ["human-only"] },
      suppliedActionSchemas: [{ kind: "optional", whole: "x".repeat(5000) }],
      suppliedReadSchemas: [{ name: "optional", whole: "x".repeat(5000) }],
      requestedRead: { tool: "fleet_action_schema", result: { exact: "required" } },
      commandResults: [{ commandId: "original", receipt: { code: "COMMITTED" } }],
    };
    const messages = fitMessages(
      context,
      "Choose",
      cognitiveSchemaForVersion(2),
      14000,
      boundedReads,
      narrowRead,
      compactEnvironment,
    );
    const delivered = JSON.parse(messages[1].content);
    expect(delivered.cognition).toMatchObject({
      plan: cognition.plan,
      beliefs: cognition.beliefs,
      reflections: cognition.reflections,
      recall: cognition.recall,
    });
    expect(delivered.cognition.evidence.map((e: { id: string }) => e.id)).toEqual(cognition.evidence.map((e) => e.id));
    expect(delivered.cognition.evidence.find((e: { id: string }) => e.id === "receipt").detail.receiptAt).toBe(
      "commandResults",
    );
    expect(delivered.suppliedReadSchemas).toEqual([]);
    expect(delivered.requestedRead).toEqual(context.requestedRead);
    expect(delivered.commandResults).toEqual(context.commandResults);
    expect(delivered.actionPermissions).toEqual(context.actionPermissions);
    expect(
      Buffer.byteLength(JSON.stringify(messages)) + Buffer.byteLength(JSON.stringify(cognitiveSchemaForVersion(2))),
    ).toBeLessThanOrEqual(14000);
  });
  it("protects the newest receipt even when Laya's preferred pair contains an older receipt", () => {
    const cognition = {
      version: 1,
      currentEvidenceId: "current",
      latestReceiptId: "latest",
      recall: { route: "laya-recall-v1", candidateIds: ["older", "message"], selectedId: "message" },
      evidence: [
        { id: "current", kind: "observation", detail: "observed" },
        { id: "message", kind: "message", detail: "peer said" },
        { id: "older", kind: "receipt", detail: "prior commit" },
        { id: "latest", kind: "receipt", detail: "latest actual commit" },
        { id: "optional", kind: "observation", detail: "x".repeat(5000) },
      ],
    };
    const delivered = JSON.parse(fitMessages({ cognition }, "Choose", {}, 1300, () => [])[1].content).cognition;
    expect(delivered.evidence.map((episode: { id: string }) => episode.id)).toEqual([
      "current",
      "message",
      "older",
      "latest",
    ]);
    expect(delivered.latestReceiptId).toBe("latest");
  });
  it("links only this decision's current observation/receipt to already delivered facts without rebinding historical requested evidence", () => {
    const current = { id: "current", kind: "observation", at: "now", detail: { text: "x".repeat(2000) } };
    const receipt = {
      id: "receipt",
      kind: "receipt",
      at: "now",
      detail: { commandId: "exact", intent: "Observed intent", receipt: { code: "COMMITTED", text: "y".repeat(2000) } },
    };
    const oldRead = {
      tool: "fleet_memory_recall",
      result: { evidence: [{ id: "old", at: "yesterday", kind: "observation", detail: { prior: "unchanged" } }] },
    };
    const context = {
      environment: { actual: "fresh" },
      commandResults: [{ commandId: "exact", receipt: { code: "COMMITTED", whole: "result" } }],
      cognition: { version: 0, currentEvidenceId: "current", latestReceiptId: "receipt", evidence: [current, receipt] },
      requestedRead: oldRead,
      gameActionKinds: ["allowed"],
      decisionFeedback: [{ code: "INVALID_GAME_ACTION", availableKinds: ["allowed"], inputSchema: { whole: "shape" } }],
    };
    const delivered = JSON.parse(fitMessages(context, "Choose", {}, 1300, () => [])[1].content);
    expect(delivered.cognition.evidence[0]).toMatchObject({
      id: "current",
      at: "now",
      detail: { factsAt: "environment" },
    });
    expect(delivered.cognition.evidence[1]).toMatchObject({
      id: "receipt",
      at: "now",
      detail: { commandId: "exact", intent: "Observed intent", receiptAt: "commandResults" },
    });
    expect(delivered.requestedRead).toEqual(oldRead);
    expect(delivered.commandResults).toEqual(context.commandResults);
    expect(delivered.decisionFeedback[0]).toMatchObject({
      availableKindsAt: "gameActionKinds",
      inputSchema: { whole: "shape" },
    });
    expect(context.cognition.evidence[0]).toEqual(current);
  });
});
