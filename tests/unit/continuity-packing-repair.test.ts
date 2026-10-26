import { Ajv } from "ajv";
import { expect, it } from "vitest";
import { builtinArchitectures } from "../../src/app/builtins.js";
import type { Data } from "../../src/domain.js";
import { definition, PackingRepairDecisionStep } from "../../src/engines/continuity/engine-packing-repair.js";
import { ContinuityDecisionStep } from "../../src/modules/continuity/v1/decision.js";
import { ContinuityV1 } from "../../src/modules/continuity/v1/state.js";
import type { DecisionContext } from "../../src/modules/decision-step/v1/context.js";
import { prepareNegotiationProtocol } from "../../src/negotiation-run.js";

const ports = {
  context: async () => ({}),
  restrict: () => {},
  apply: async () => ({ accepted: true, version: 1, code: "ACCEPTED" }),
  recordCommand: async () => {},
};
class Original extends ContinuityDecisionStep {
  schema(payload: Data) {
    return super.generationSchema(payload, this.decisionSchema);
  }
}
class Candidate extends PackingRepairDecisionStep {
  schema(payload: Data) {
    return super.generationSchema(payload, this.decisionSchema);
  }
}
it.each([
  { ids: [] },
  {
    ids: [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
      "44444444-4444-4444-8444-444444444444",
    ],
  },
])("candidate factors actual v1 schema without changing accepted output for evidence $ids", ({ ids }) => {
  const payload = { continuity: { evidence: ids.map((id) => ({ id })) } },
    a = new Original(new ContinuityV1(ports)).schema(payload),
    b = new Candidate(new ContinuityV1(ports)).schema(payload);
  console.log(
    JSON.stringify({
      ids: ids.length,
      originalBytes: Buffer.byteLength(JSON.stringify(a)),
      candidateBytes: Buffer.byteLength(JSON.stringify(b)),
    }),
  );
  // Both versions now receive the authorized shared schema repair; the separate
  // candidate retains its own view policy and cannot widen the output contract.
  expect(Buffer.byteLength(JSON.stringify(b))).toBeLessThanOrEqual(Buffer.byteLength(JSON.stringify(a)));
  const ajv = new Ajv({ strict: false, formats: { uuid: true } }),
    original = ajv.compile(a),
    candidate = ajv.compile(b);
  const decisions = [
    { kind: "wait", summary: "Await current facts" },
    {
      kind: "read",
      query: { tool: "pact_council_thread_v1", args: { kingdomId: "peer" } },
      summary: "Read original statement",
    },
    {
      kind: "action",
      schemaId: "pact.action.v1",
      payload: { kind: "game.contact.answer", requestId: "request", accept: true },
      summary: "Answer actual request",
    },
    { kind: "bogus" },
    { kind: "wait", summary: "" },
  ];
  const notes = [
    undefined,
    {},
    { memories: [] },
    { memories: [{ text: "Observed terms", evidenceRefs: ids.slice(0, 1) }] },
    { memories: [{ text: "Invented", evidenceRefs: ["55555555-5555-4555-8555-555555555555"] }] },
    { memories: [{ text: "x".repeat(401), evidenceRefs: ids.slice(0, 1) }] },
    { unexpected: true },
  ];
  for (const decision of decisions)
    for (const continuity of notes) {
      const output = { decision, ...(continuity === undefined ? {} : { continuity }) };
      expect(candidate(output)).toBe(original(output));
    }
});
it("approved candidate resolves as a separate exact version without changing original @1", () => {
  expect(definition.manifest.ref).toEqual({ id: "reactive-cognition", version: "1.1" });
  expect(builtinArchitectures().resolve(definition.manifest.ref).manifest.ref).toEqual(definition.manifest.ref);
  expect(builtinArchitectures().resolve({ id: "reactive-cognition", version: "1" }).manifest.ref.version).toBe("1");
});

it("unamended frozen negotiation protocol cannot authorize the separate candidate", () => {
  expect(() => prepareNegotiationProtocol({ selectedProfile: definition.manifest.ref })).toThrow();
});
it("candidate refuses a missing trusted observation policy before any model call", async () => {
  await expect(new Candidate(new ContinuityV1(ports)).runContext({} as DecisionContext)).rejects.toMatchObject({
    code: "PACKING_REPAIR_POLICY_REQUIRED",
  });
});
