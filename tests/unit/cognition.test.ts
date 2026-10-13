import { describe, expect, it } from "vitest";
import { CognitiveDecision, rankEpisodes, utf8Prefix } from "../../src/cognition.js";
import { fitMessages } from "../../src/context.js";
import { ModelConfig, object } from "../../src/domain.js";
import { cognitiveObservation } from "../../src/games/pact/cognition.js";

describe("cognitive decision contracts", () => {
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
  it("derives peer identifiers from owned observations and public discoveries, excluding the owner", () => {
    const result = cognitiveObservation({
      world: { profile: { kingdomId: "self" }, buildings: [] },
      guide: { contacts: [{ kingdomId: "partner" }, { kingdomId: "self" }] },
      discovery: { players: [{ kingdomId: "discovered" }] },
    });
    expect(result.peers).toEqual(["partner", "discovered"]);
    expect(object(result.detail).coverage).toContain("unknown");
  });
});
