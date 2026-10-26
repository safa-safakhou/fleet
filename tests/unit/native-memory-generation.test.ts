import { expect, it } from "vitest";
import type { Data } from "../../src/domain.js";
import { compileGenerationSchema } from "../../src/model-schema.js";
import { NegotiationDecisionStep } from "../../src/modules/continuity/v2/decision.js";

class Probe extends NegotiationDecisionStep {
  contract(payload: Data) {
    return this.generationSchema(payload, this.decisionSchema);
  }
}
it("advertises only delivered original IDs for native memory, retaining optional abstention", () => {
  const allowed = "00000000-0000-4000-8000-000000000001",
    foreign = "00000000-0000-4000-8000-000000000002";
  const schema = new Probe().contract({
    negotiationMemory: { deliveredIds: [allowed], bundles: [{ originals: [{ id: allowed }] }] },
  });
  const validate = compileGenerationSchema(schema);
  const decision = { kind: "wait", summary: "Synthetic current constraint" };
  const memory = (ref: string) => ({
    decision,
    memory: { memories: [{ id: "interpretation", text: "Subjective interpretation", evidenceRefs: [ref] }] },
  });
  expect(validate(memory(allowed))).toBe(true);
  expect(validate(memory(foreign))).toBe(false);
  expect(validate({ decision })).toBe(true);
});
