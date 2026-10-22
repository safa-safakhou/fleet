import { Ajv } from "ajv";
import { expect, it } from "vitest";
import { z } from "zod";
import { InternalMessageSchema } from "../../src/engines/autonomous-specialists/messaging.js";
import * as binding from "../../src/engines/autonomous-specialists/participant-interface.js";
import { SpecialistEnvelopeSchema } from "../../src/platform/participant-state.js";

const existing = "11111111-1111-4111-8111-111111111111",
  delivery = "22222222-2222-4222-8222-222222222222",
  source = "33333333-3333-4333-8333-333333333333",
  child = "44444444-4444-4444-8444-444444444444",
  parent = "55555555-5555-4555-8555-555555555555";
const schema = z.toJSONSchema(
  z.object({
    update: SpecialistEnvelopeSchema.omit({ intent: true, deliveryIds: true }).extend({
      messages: z.array(InternalMessageSchema).max(8),
    }),
  }),
  { target: "draft-7" },
);
const context = {
  specialistId: "resources",
  recipientIds: ["resources", "diplomacy"],
  deliveries: [{ id: delivery, depth: 0, event: { type: "resource" } }],
  evidenceIds: [source],
  conditionContracts: [],
  knownRequestIds: [],
  goalParents: [existing],
};
const goal = (id: string, parentId: unknown) => ({
  id,
  parentId,
  objective: "Observed supply",
  rationale: "Current scoped need",
  status: "active",
  evidenceIds: [source],
  assessment: "Read actual receipts",
  wake: "Review on changed evidence",
});
const envelope = (goals: unknown[]) => ({
  update: { goals, memories: [], predictions: [], plan: null, messages: [], wakeConditions: [] },
});
const contract = (ids: string[] = []) =>
  binding.participantGenerationContract(schema, { ...context, goalParents: ids });
it("keeps goal parents separate from delivered message/evidence IDs and preserves the legacy contract", () => {
  const before = structuredClone(schema),
    c = contract([existing]),
    v = new Ajv({ strict: false, validateFormats: false }).compile(c.schema);
  for (const p of [null, existing, { goalIndex: 1 }])
    expect(v(envelope([goal(child, p), goal(parent, null)]))).toBe(true);
  for (const p of [delivery, source, parent, { goalIndex: -1 }, { goalIndex: 32 }, { goalIndex: 1, extra: true }])
    expect(v(envelope([goal(child, p)]))).toBe(false);
  const empty = new Ajv({ strict: false, validateFormats: false }).compile(contract().schema);
  expect(empty(envelope([goal(child, existing)]))).toBe(false);
  expect(schema).toEqual(before);
  expect(JSON.stringify(c.prompt)).toContain("goalIndex");
  expect(JSON.stringify(c.prompt)).toContain("delivery");
  const { goalParents: _removed, ...old } = context;
  expect(
    new Ajv({ strict: false, validateFormats: false }).compile(
      binding.participantGenerationContract(schema, old).schema,
    )(envelope([goal(child, delivery)])),
  ).toBe(true);
});
it("resolves same-update forward and backward goal references without mutating literal content or new IDs", () => {
  expect(binding.decodeParticipantGoalParents).toBeTypeOf("function");
  const input = envelope([
    goal(child, { goalIndex: 1 }),
    { ...goal(parent, null), routine: { kind: "synthetic", parameters: { parentId: delivery, goalIndex: 99 } } },
  ]);
  const before = structuredClone(input),
    decoded = binding.decodeParticipantGoalParents(input, [existing]);
  expect(decoded).toEqual(
    envelope([
      goal(child, parent),
      { ...goal(parent, null), routine: { kind: "synthetic", parameters: { parentId: delivery, goalIndex: 99 } } },
    ]),
  );
  expect(input).toEqual(before);
  expect(
    binding.decodeParticipantGoalParents(envelope([goal(parent, existing), goal(child, { goalIndex: 0 })]), [existing]),
  ).toEqual(envelope([goal(parent, existing), goal(child, parent)]));
});
it.each([delivery, source, { goalIndex: 1 }, { goalIndex: -1 }, { goalIndex: 0.5 }, { goalIndex: 0, extra: true }])(
  "refuses an unsupported parent before native acceptance: %j",
  (p) => {
    expect(binding.decodeParticipantGoalParents).toBeTypeOf("function");
    expect(() => binding.decodeParticipantGoalParents(envelope([goal(child, p)]), [existing])).toThrow(
      "GOAL_PARENT_NOT_DELIVERED",
    );
  },
);
it("rejects an invalid scope and leaves absent updates/learning data unchanged", () => {
  expect(() => contract(["bad"])).toThrow();
  const learning = { decision: { kind: "wait" }, proposals: [{ parentId: delivery }] };
  expect(binding.decodeParticipantGoalParents(learning, [])).toEqual(learning);
});
it("keeps empty goal updates valid when no evidence was delivered", () => {
  const c = binding.participantGenerationContract(schema, { ...context, evidenceIds: [], goalParents: [] });
  const v = new Ajv({ strict: false, validateFormats: false }).compile(c.schema);
  expect(v(envelope([]))).toBe(true);
  expect(v(envelope([goal(child, null)]))).toBe(false);
});
