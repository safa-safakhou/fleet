import { expect, it } from "vitest";
import { simulationGenerationSchema } from "../../scripts/lib/native-sim-schema.js";
import type { Observation } from "../../src/platform/contracts.js";

const view: Observation = {
  schemaId: "fixture",
  revision: "2",
  observedAt: "now",
  environmentTime: { clockId: "fixture", value: "2" },
  sourceRefs: ["environment-source"],
  payload: { selection: { requestId: "request:1", legal: ["oak", "stone", "none"] } },
  coverage: {},
};
it("narrows native proposals without changing optional memory reference namespaces or literal data", () => {
  const memory = {
    type: "object",
    properties: { evidenceRefs: { type: "array", items: { type: "string", maxLength: 100 }, maxItems: 16 } },
  };
  const schema = {
    type: "object",
    properties: {
      memory,
      proposal: {
        type: "object",
        properties: {
          intent: { type: "object", properties: { schemaId: { type: "string" }, payload: { type: "object" } } },
          evidenceRefs: { type: "array", items: { type: "string" }, maxItems: 20 },
        },
      },
    },
    const: { properties: { action: { literal: true } } },
  };
  const result = simulationGenerationSchema(schema, view) as typeof schema;
  expect(result.properties.memory).toEqual(memory);
  expect(result.const).toEqual(schema.const);
  expect(result.properties.proposal.properties.evidenceRefs.items).toEqual({
    type: "string",
    enum: ["environment-source"],
  });
  expect(schema.properties.proposal.properties.evidenceRefs.items).toEqual({ type: "string" });
});
