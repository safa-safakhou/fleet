import { expect, it } from "vitest";
import { object } from "../../src/domain.js";
import { expandFactTables } from "../../src/fact-table.js";
import { projectPactObservation } from "../../src/games/pact/negotiation-state.js";
import { packPactObservation } from "../../src/games/pact/packing.js";
import { NegotiationDecisionStep } from "../../src/modules/continuity/v2/decision.js";
import type { DecisionContext } from "../../src/modules/decision-step/v1/context.js";
import type { Observation } from "../../src/platform/contracts.js";

it("v2 distinguishes exact ordinary stock from founding allowance without changing v1 or the source", () => {
  const original: Observation = {
    schemaId: "pact.observation.v1",
    revision: "0",
    observedAt: "2026-10-21T00:00:00Z",
    sourceRefs: ["authorized:read"],
    environmentTime: { clockId: "pact.game-time-ms", value: "0" },
    coverage: { authorizedView: true },
    payload: {
      world: {
        profile: { kingdomId: "self" },
        asOfGameTimeMs: 0,
        balances: {
          iron: {
            ordinaryUnits: "599",
            foundingAllowanceUnits: "120000",
            lockedUnits: "601",
            capacityUnits: "360000",
            facts: { ordinaryWhole: "≈1", allowanceWhole: "200", rates: { net: { perHourWhole: "20" } } },
          },
          silver: { foundingAllowanceUnits: "60000" },
        },
      },
      guide: { asOfGameTimeMs: 0 },
    },
  };
  const before = JSON.stringify(original),
    v1 = packPactObservation(projectPactObservation(original, { id: "negotiation", version: "1" }), 12000),
    v2 = packPactObservation(projectPactObservation(original, { id: "negotiation", version: "2" }), 12000);
  expect(JSON.stringify(original)).toBe(before);
  expect(JSON.stringify(v1)).toContain("120000");
  expect(v2.schemaId).toBe("pact.observation.negotiation.v2");
  expect(object(object(expandFactTables(v2.payload)).environment).balances).toEqual({
    iron: {
      ordinaryWholeFloor: "0",
      ordinaryRemainderMarked: "599",
      lockedWholeFloor: "1",
      lockedRemainderMarked: "1",
      capacityWholeFloor: "600",
      capacityRemainderMarked: "0",
      ratesWholePerHour: { net: "20" },
    },
    silver: {
      ordinaryWholeFloor: null,
      ordinaryRemainderMarked: null,
      lockedWholeFloor: null,
      lockedRemainderMarked: null,
      capacityWholeFloor: null,
      capacityRemainderMarked: null,
      ratesWholePerHour: {},
    },
  });
  expect(JSON.stringify(v2.payload)).not.toContain("120000");
  expect(JSON.stringify(v2.coverage)).toContain("founding allowance omitted");
});

it("v2 presents ordinary-only stock even when the uncompressed request already fits", async () => {
  let delivered = "";
  const observation = {
    schemaId: "pact.observation.v1",
    revision: "0",
    observedAt: "2026-10-21T00:00:00Z",
    sourceRefs: ["read:one"],
    coverage: { authorizedView: true },
    payload: {
      world: {
        profile: { kingdomId: "self" },
        asOfGameTimeMs: 0,
        balances: { iron: { ordinaryUnits: "0", foundingAllowanceUnits: "120000", facts: { rates: {} } } },
      },
      guide: { asOfGameTimeMs: 0 },
    },
  };
  const ctx = {
    observation,
    binding: { id: "binding" },
    task: { key: "test", sourceCount: 1, sourceRefsOmitted: 0 },
    eventRefs: [],
    configuration: {
      model: { route: "ollama", model: "authored-fake" },
      budget: { maxCallsPerTurn: 1, inputByteLimit: 24000, maxOutputTokens: 2000 },
    },
    state: { load: async () => null, accept: async () => ({ accepted: true, version: 1 }) },
    evidence: { retained: async () => [] },
    projectObservation: projectPactObservation,
    packObservation: packPactObservation,
    model: {
      decide: async (request: { messages: { content: string }[] }) => {
        delivered = request.messages[1].content;
        return { decision: { decision: { kind: "wait", summary: "No agreement established." } } };
      },
    },
  } as unknown as DecisionContext;
  await new NegotiationDecisionStep().runContext(ctx);
  expect(delivered).not.toContain("120000");
  expect(delivered).toContain("ordinaryWholeFloor");
  expect(delivered).toContain("pact.negotiation-view.v2");
});
