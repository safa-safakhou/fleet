import { expect, it } from "vitest";
import type { Data } from "../../src/domain.js";
import { actionSchema } from "../../src/games/pact/contracts.js";
import { bindGenerationSchema, closedDecisionSchema } from "../../src/generation.js";
import { qualifyOutput } from "../../src/qualification.js";

const schema = closedDecisionSchema({
  actionKinds: ["game.supply.sign"],
  actionSchemas: [actionSchema("game.supply.sign")],
  reads: [],
  selectedReadNames: [],
  memory: false,
});
const action = {
  kind: "action",
  action: { kind: "game.supply.sign", offerId: "00000000-0000-4000-8000-000000000001", version: 2 },
  summary: "Choose actual observed offer",
};
it("qualifies deterministic outputs against the actual closed action contract with field-only diagnostics", () => {
  expect(qualifyOutput(schema, [], action).valid).toBe(true);
  expect(qualifyOutput(schema, [], { kind: "wait", summary: "No beneficial action" }).valid).toBe(true);
  for (const output of [
    { ...action, action: { ...action.action, version: "two" } },
    { ...action, action: { ...action.action, kind: "game.contact.answer" } },
    { ...action, action: { ...action.action, secret: "never echo" } },
  ]) {
    const result = qualifyOutput(schema, [], output);
    expect(result.valid).toBe(false);
    expect(result.stage).toBe("generation");
    expect(JSON.stringify(result)).not.toContain("never echo");
    expect(result.diagnostics.length).toBeGreaterThan(0);
  }
  expect(qualifyOutput(schema, [{ role: "user", content: "x".repeat(24000) }], action).stage).toBe("delivery");
});
it("uses the single native schema binding without relaxing the final action contract", () => {
  const analysis: Data = {
    type: "object",
    properties: {
      cognition: {
        type: "object",
        properties: { expectedVersion: { const: 0 } },
        required: ["expectedVersion"],
        additionalProperties: false,
      },
      decision: {},
    },
    required: ["cognition", "decision"],
    additionalProperties: false,
  };
  const native = bindGenerationSchema(analysis, schema);
  expect(qualifyOutput(native, [], { cognition: { expectedVersion: 0 }, decision: action }).valid).toBe(true);
  expect(qualifyOutput(native, [], { cognition: { expectedVersion: 1 }, decision: action }).valid).toBe(false);
  expect(
    qualifyOutput(native, [], {
      cognition: { expectedVersion: 0 },
      decision: { ...action, action: { ...action.action, version: "two" } },
    }).valid,
  ).toBe(false);
});
