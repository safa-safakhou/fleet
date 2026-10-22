import { Ajv } from "ajv";
import { expect, it } from "vitest";
import { z } from "zod";
import { InternalMessageSchema } from "../../src/engines/autonomous-specialists/messaging.js";
import * as binding from "../../src/engines/autonomous-specialists/participant-interface.js";
import { SpecialistEnvelopeSchema } from "../../src/platform/participant-state.js";

const parent = "11111111-1111-4111-8111-111111111111",
  evidence = "22222222-2222-4222-8222-222222222222",
  foreign = "33333333-3333-4333-8333-333333333333";
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
  deliveries: [{ id: parent, depth: 0, event: { type: "resource" } }],
  evidenceIds: [evidence],
  conditionContracts: [],
  knownRequestIds: [],
};
const update = {
  goals: [],
  memories: [],
  predictions: [],
  plan: null,
  messages: [
    {
      to: "diplomacy",
      kind: "publish",
      text: "Current scoped stock only",
      evidenceIds: [evidence],
      parentDeliveryId: parent,
    },
  ],
  wakeConditions: [{ kind: "event", category: "offer" }],
};
function contracts(options: binding.ParticipantContractContext = context) {
  expect(binding.participantGenerationContract).toBeTypeOf("function");
  const result = binding.participantGenerationContract(schema, options);
  return { ...result, accepts: new Ajv({ strict: false, validateFormats: false }).compile(result.schema) };
}
it("accepts delivered identifiers/native wakes, leaves the old schema untouched and explains their distinct namespaces", () => {
  const original = structuredClone(schema),
    c = contracts();
  expect(c.accepts({ update })).toBe(true);
  expect(schema).toEqual(original);
  expect(c.prompt).toMatchObject({ parentDeliveryIds: [parent], recipients: ["diplomacy"] });
  expect(JSON.stringify(c.prompt)).toContain("kind");
});
it.each([
  { name: "foreign parent", change: { messages: [{ ...update.messages[0], parentDeliveryId: foreign }] } },
  { name: "self recipient", change: { messages: [{ ...update.messages[0], to: "resources" }] } },
  { name: "unknown recipient", change: { messages: [{ ...update.messages[0], to: "stranger" }] } },
  { name: "foreign evidence", change: { messages: [{ ...update.messages[0], evidenceIds: [foreign] }] } },
  {
    name: "R5 invented wake",
    change: { wakeConditions: [{ type: "offer", sourceRef: "[pct-0]", observedAt: "2026-10-22T16:59:00Z" }] },
  },
  {
    name: "unscoped reply",
    change: {
      wakeConditions: [
        { kind: "reply", requestId: foreign, deadline: { clockId: "utc", value: "2026-10-22T19:00:00Z" } },
      ],
    },
  },
  {
    name: "unknown predicate",
    change: { wakeConditions: [{ kind: "predicate", name: "invented", version: "1", args: {} }] },
  },
])("refuses $name in generation", ({ change }) => {
  expect(contracts().accepts({ update: { ...update, ...change } })).toBe(false);
});
it.each([
  { deliveries: [] },
  { deliveries: [{ id: parent, depth: 4, event: { type: "resource" } }] },
  { deliveries: [{ id: parent, depth: 0, event: null }] },
])("disables causal updates when no eligible delivery is known", ({ deliveries }) => {
  const c = contracts({ ...context, deliveries });
  expect(c.accepts({ update })).toBe(false);
  expect(c.accepts({ update: { ...update, messages: [], wakeConditions: [] } })).toBe(true);
});
it("accepts same-envelope reply indexes and only explicitly delivered retained request IDs", () => {
  const c = contracts({ ...context, knownRequestIds: [evidence] });
  for (const ref of [{ requestIndex: 0 }, { requestId: evidence }])
    expect(
      c.accepts({
        update: {
          ...update,
          wakeConditions: [{ kind: "reply", ...ref, deadline: { clockId: "utc", value: "2026-10-22T19:00:00Z" } }],
        },
      }),
    ).toBe(true);
  expect(
    c.accepts({
      update: {
        ...update,
        wakeConditions: [
          {
            kind: "reply",
            requestIndex: 0,
            requestId: evidence,
            deadline: { clockId: "utc", value: "2026-10-22T19:00:00Z" },
          },
        ],
      },
    }),
  ).toBe(false);
});
it("scopes predicates to an actual declared name/version/argument shape", () => {
  const c = contracts({
    ...context,
    conditionContracts: [
      {
        name: "at_square",
        version: "1",
        description: "synthetic",
        argsSchema: {
          type: "object",
          properties: { square: { enum: ["a2"] } },
          required: ["square"],
          additionalProperties: false,
        },
      },
    ],
  });
  for (const square of ["a2", "invented"])
    expect(
      c.accepts({
        update: {
          ...update,
          wakeConditions: [{ kind: "predicate", name: "at_square", version: "1", args: { square } }],
        },
      }),
    ).toBe(square === "a2");
});
it("does not invent update capability in extraction mode", () => {
  expect(binding.participantGenerationContract).toBeTypeOf("function");
  const base = { type: "object", properties: { decision: { type: "object" } } };
  const c = binding.participantGenerationContract(base, context);
  expect(c.schema).toEqual(base);
  expect(c.prompt.mode).toBe("no_update");
});
it("allows replies only to an actual delivered internal request from the named recipient", () => {
  const response = { update: { ...update, messages: [{ ...update.messages[0], kind: "reply" }] } };
  expect(contracts().accepts(response)).toBe(false);
  const c = contracts({
    ...context,
    recipientIds: [...context.recipientIds, "development"],
    deliveries: [
      {
        id: parent,
        depth: 0,
        event: { id: `internal:${foreign}`, metadata: { kind: "request", sender: "diplomacy" } },
      },
    ],
  });
  expect(c.accepts(response)).toBe(true);
  expect(c.accepts({ update: { ...update, messages: [{ ...response.update.messages[0], to: "development" }] } })).toBe(
    false,
  );
});
it.each(["deadline", "periodic"])(
  "retains exact native %s wake shape when sharing their identical time contract",
  (kind) => {
    const c = contracts(),
      wake = { kind, at: { clockId: "utc", value: "2026-10-22T19:00:00Z" } };
    expect(c.accepts({ update: { ...update, wakeConditions: [wake] } })).toBe(true);
    expect(c.accepts({ update: { ...update, wakeConditions: [{ ...wake, sourceRef: "invented" }] } })).toBe(false);
  },
);
it("fails closed on a corrupt scoped UUID before removing redundant UUID syntax", () => {
  expect(() => contracts({ ...context, evidenceIds: ["not-a-uuid"] })).toThrow("PARTICIPANT_IDENTIFIER_REQUIRED");
});
