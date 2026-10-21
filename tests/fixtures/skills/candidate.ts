import { randomUUID } from "node:crypto";
import type { SkillCandidate } from "../../../src/modules/skills/v1/schema.js";
export function candidate(sourceId: string = randomUUID()): SkillCandidate {
  return {
    representation: "guide" as const,
    purpose: { summary: "Check an existing stock goal", goalKinds: ["stock"], nonGoals: ["Choose a new purchase"] },
    compatibility: {
      environment: { id: "board", version: "1" },
      roles: ["resources", "diplomacy"],
      primitives: [],
      actionKeys: [],
    },
    inputs: {
      type: "object",
      properties: { resource: { type: "string" } },
      required: ["resource"],
      additionalProperties: false,
    },
    applicability: {
      goalKind: "stock",
      maxAgeMs: 60000,
      requiredSourceKinds: ["observation"],
      conditions: [],
      exclusions: ["Unknown current state"],
    },
    procedure: { guide: "Read current stock before comparing with the existing goal.", nodes: [], children: [] },
    completion: { description: "Observe sufficient stock", assessmentMs: 60000 },
    interruption: { abortWhen: ["Source missing"], onUnknown: "return_to_reasoning" as const },
    effects: { actionKeys: [], resourceNeeds: {} },
    limits: { reads: 2, actions: 0, messages: 0, steps: 8, wallTimeMs: 10000, modelCalls: 0 },
    evidence: { sourceIds: [sourceId], episodeIds: [randomUUID()], claimedOutcome: "unproven" as const },
  };
}
