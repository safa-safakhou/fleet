import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { type Data, object } from "../../src/domain.js";
import { expandFactTables } from "../../src/fact-table.js";
import { instructions, pactAdapter } from "../../src/games/pact/adapter.js";
import { pactAgentBriefing } from "../../src/games/pact/briefing.js";
import { compactBriefingGuidance } from "../../src/games/pact/environment.js";
import { pactCurrentObjective } from "../../src/games/pact/goal-state.js";
import { projectPactObservation } from "../../src/games/pact/negotiation-state.js";
import { packPactObservation } from "../../src/games/pact/packing.js";
import { pactActionContracts } from "../../src/games/pact/proposals.js";
import { ContinuityDecisionStep } from "../../src/modules/continuity/v1/decision.js";
import { ContinuityV1 } from "../../src/modules/continuity/v1/state.js";
import { reactiveProbe } from "../reactive-probe-context.js";
import { decisionProbe } from "../scoped-probe.js";

it.each(["1", "2"])("retains current development and an observed peer in negotiation view %s", (version) => {
  const native = JSON.parse(readFileSync("tests/fixtures/pact-initial-packing.json", "utf8"));
  const projected = projectPactObservation(native.observation, { id: "negotiation", version });
  const packed = packPactObservation(projected, 20000),
    env = object(expandFactTables(packed.payload.environment));
  expect(env.buildings).toEqual(native.observation.payload.world.buildings);
  expect(env.builders).toEqual(native.observation.payload.world.builders);
  expect(object(env.agentBriefing).construction).toEqual(
    object(env.agentBriefing).guidanceOmitted
      ? compactBriefingGuidance(native.observation.payload.agentBriefing).construction
      : native.observation.payload.agentBriefing.construction,
  );
  expect(object(env.publicDiscovery).players).not.toHaveLength(0);
  if (version === "2")
    expect(object(env.constructionStock).balances).toEqual(
      Object.fromEntries(
        Object.entries(native.observation.payload.world.balances).map(([resource, value]) => [
          resource,
          { ordinaryUnits: object(value).ordinaryUnits, foundingAllowanceUnits: object(value).foundingAllowanceUnits },
        ]),
      ),
    );
  expect(Buffer.byteLength(JSON.stringify(packed))).toBeLessThanOrEqual(20000);
});

it.each([false, true])(
  "fits full native cognition with bounded event-source pressure=%s and current construction inside 32000 bytes",
  async (sourcePressure) => {
    const native = JSON.parse(readFileSync("tests/fixtures/pact-initial-packing.json", "utf8"));
    Object.assign(native.observation.payload.world.builders[0], {
      instructionId: "00000000-0000-4000-8000-999999999999",
      kind: "hall",
      targetLevel: 2,
      state: "waiting",
      prerequisiteCheck: "hall_prerequisite",
      missingBuildings: [
        { kind: "farm", level: 2 },
        { kind: "barracks", level: 2 },
      ],
    });
    native.observation.payload.agentBriefing = pactAgentBriefing(native.observation.payload);
    const self = {
      capabilities: native.catalog.slice(0, 40).map((t: Data) => t.name),
      needs: {
        resources: Object.values(native.observation.payload.world.balances),
        feasibility: Array.from({ length: 8 }, () => ({
          ...native.observation.payload.agentBriefing.construction.options[0],
          meaning: "Observed candidate only; not admission, completion or delivery.",
        })),
      },
      dependencies: {},
      ownerValues: { text: native.observation.payload.world.ambition },
    };
    const context = {
      version: 0,
      self,
      evidence: Array.from({ length: 12 }, (_, i) => ({
        id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        fact: { sourceRef: `fixture:${i}`, kind: "state", subject: "self", predicate: `stock:${i}`, value: "1" },
        link: { sourceRef: `fixture:${i}`, observedAt: native.observation.observedAt, taskId: "synthetic-task" },
        environmentTime: native.observation.environmentTime,
      })),
      beliefs: [],
      predictions: [],
      memories: [],
      reflections: [],
      plan: null,
      coverage: {},
    };
    let calls = 0;
    const ctx = reactiveProbe(async (_claim, input) => {
      calls++;
      expect(
        Buffer.byteLength(JSON.stringify(input.messages)) + Buffer.byteLength(JSON.stringify(input.schema)),
      ).toBeLessThanOrEqual(32000);
      expect((expandFactTables(JSON.parse(input.messages[1].content).continuity) as Data).evidence).not.toEqual([]);
      const packet = JSON.parse(input.messages[1].content),
        env = object(expandFactTables(packet.observation.payload.environment));
      expect(object(object(object(expandFactTables(packet)).continuity).self).capabilities).toEqual(self.capabilities);
      expect(env.buildings).toEqual(native.observation.payload.world.buildings);
      expect((expandFactTables(packet.catalog) as Data[]).map((tool) => tool.name)).toEqual(
        native.catalog.filter(pactAdapter.isRead).map((tool: Data) => tool.name),
      );
      if (sourcePressure) {
        expect(packet.task.eventRefs.length).toBeLessThan(20);
        expect(packet.task.eventRefs.length + packet.task.sourceRefsOmitted).toBe(20);
        expect(packet.task.sourceCount).toBe(20);
      }
      const briefing = object(env.agentBriefing);
      expect(briefing.construction).toEqual(
        briefing.guidanceOmitted
          ? compactBriefingGuidance(native.observation.payload.agentBriefing).construction
          : native.observation.payload.agentBriefing.construction,
      );
      expect(object(env.publicDiscovery).players).not.toHaveLength(0);
      return {
        decision: { decision: { kind: "wait", summary: "Synthetic native packing only" } },
        inputTokens: 1,
        outputTokens: 1,
      };
    });
    ctx.claim.turn.cohort.budget!.inputByteLimit = 32000;
    if (sourcePressure) {
      ctx.eventRefs = Array.from({ length: 20 }, (_, i) => `synthetic-trigger:${i}:${"x".repeat(3000)}`);
      ctx.task.sourceCount = 20;
      ctx.task.sourceRefsOmitted = 0;
    }
    ctx.observation = {
      ...native.observation,
      continuity: { schemaVersion: "fleet.continuity-observation.v1", self, facts: [] },
    };
    ctx.instructions = instructions;
    ctx.accountObjective = (o) => pactCurrentObjective(o.payload);
    ctx.schemas = { observations: ["pact.observation.v1"], actions: ["pact.action.v1"] };
    // Runtime retains all native capabilities, but exposes only read tools here.
    ctx.catalog = async () => native.catalog.filter(pactAdapter.isRead);
    ctx.actionContracts = async () => pactActionContracts(native.observation.payload);
    ctx.packObservation = packPactObservation;
    await new ContinuityDecisionStep(
      new ContinuityV1({
        context: async () => structuredClone(context),
        restrict: () => {},
        apply: async () => {
          throw Error("UNEXPECTED_UPDATE");
        },
        recordCommand: async () => {},
      } as never),
    ).runContext(decisionProbe(ctx));
    expect(calls).toBe(1);
  },
);
