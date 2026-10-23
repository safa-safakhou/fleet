import { Ajv } from "ajv";
import { expect, it } from "vitest";
import { z } from "zod";
import { type Data, object } from "../../src/domain.js";
import * as binding from "../../src/engines/autonomous-specialists/decision-interface.js";

const summary = z.string().max(100),
  base = z.toJSONSchema(
    z
      .object({
        decision: z.discriminatedUnion("kind", [
          z.object({ kind: z.literal("read"), query: z.object({}).strict(), summary }).strict(),
          z.object({ kind: z.literal("wait"), summary }).strict(),
          z.object({ kind: z.literal("action"), value: z.number().int().min(1).max(2), summary }).strict(),
        ]),
        update: z
          .object({ messages: z.array(z.string().max(20)).max(2) })
          .strict()
          .optional(),
        skills: z
          .object({
            select: z.array(z.string()).max(2).optional(),
            publish: z.array(z.string()).max(2).optional(),
            adopt: z.array(z.string()).max(2).optional(),
          })
          .strict()
          .optional(),
      })
      .strict(),
    { target: "draft-7" },
  );
const read = { kind: "read", query: {}, summary: "Read only" },
  wait = { kind: "wait", summary: "Final wait" },
  action = { kind: "action", value: 1, summary: "Proposed action" },
  update = { messages: ["Current facts only"] };
function contract() {
  expect(binding.readFinalGenerationContract).toBeTypeOf("function");
  const schema = binding.readFinalGenerationContract(base);
  return { schema, accepts: new Ajv({ strict: false }).compile(schema) };
}
it("rejects R10 read+update while keeping read-only, wait+update and action+update", () => {
  const c = contract();
  expect(c.accepts({ decision: read })).toBe(true);
  expect(c.accepts({ decision: read, update })).toBe(false);
  for (const decision of [wait, action]) expect(c.accepts({ decision, update })).toBe(true);
  expect(new Ajv({ strict: false }).compile(base)({ decision: read, update })).toBe(true);
});
it("limits read skills to selection, retaining final publication/adoption and original array bounds", () => {
  const c = contract();
  expect(c.accepts({ decision: read, skills: { select: ["a"] } })).toBe(true);
  for (const key of ["publish", "adopt"]) {
    expect(c.accepts({ decision: read, skills: { [key]: ["a"] } })).toBe(false);
    expect(c.accepts({ decision: wait, skills: { [key]: ["a"] } })).toBe(true);
  }
  expect(c.accepts({ decision: read, skills: { select: ["a", "b", "c"] } })).toBe(false);
});
it("retains final numeric/message/unknown-field constraints and leaves the base untouched", () => {
  const before = structuredClone(base),
    c = contract();
  expect(c.accepts({ decision: { ...action, value: 3 }, update })).toBe(false);
  expect(c.accepts({ decision: wait, update: { messages: ["a", "b", "c"] } })).toBe(false);
  expect(c.accepts({ decision: read, unexpected: true })).toBe(false);
  expect(base).toEqual(before);
});
it("keeps extraction/no-read schemas unchanged", () => {
  expect(binding.readFinalGenerationContract).toBeTypeOf("function");
  const extraction = z.toJSONSchema(
    z.object({ decision: z.object({ kind: z.literal("wait") }), proposals: z.array(z.string()).max(2) }),
    { target: "draft-7" },
  );
  expect(binding.readFinalGenerationContract(extraction)).toEqual(extraction);
});
it("preserves root definitions referenced inside both read and final branches", () => {
  const input: Data = structuredClone(base);
  input.$defs = { choice: { type: "string", enum: ["a"] } };
  object(object(object(object(input.properties).skills).properties).select).items = { $ref: "#/$defs/choice" };
  const accepts = new Ajv({ strict: false }).compile(binding.readFinalGenerationContract(input));
  for (const decision of [read, wait]) {
    expect(accepts({ decision, skills: { select: ["a"] } })).toBe(true);
    expect(accepts({ decision, skills: { select: ["b"] } })).toBe(false);
  }
});
it("fails closed for envelopes that cannot structurally exclude read updates without changing their required contract", () => {
  expect(() => binding.readFinalGenerationContract({ ...base, additionalProperties: true })).toThrow(
    "READ_FINAL_SCHEMA_REQUIRED",
  );
  expect(() => binding.readFinalGenerationContract({ ...base, required: ["decision", "update"] })).toThrow(
    "READ_FINAL_SCHEMA_REQUIRED",
  );
});

it("pins read summaries to prospective text while retaining final summaries", () => {
  const accepts = new Ajv({ strict: false }).compile(
    binding.readFinalGenerationContract(base, {
      readSummary: "Read requested; result not yet observed.",
    }),
  );
  expect(accepts({ decision: { ...read, summary: "Read requested; result not yet observed." } })).toBe(true);
  expect(accepts({ decision: { ...read, summary: "observed the current status code" } })).toBe(false);
  expect(accepts({ decision: wait, update })).toBe(true);
});
it("reserves the last decision for a final wait or action without relaxing final constraints", () => {
  const accepts = new Ajv({ strict: false }).compile(binding.readFinalGenerationContract(base, { finalOnly: true }));
  expect(accepts({ decision: read })).toBe(false);
  expect(accepts({ decision: wait, update })).toBe(true);
  expect(accepts({ decision: action })).toBe(true);
  expect(accepts({ decision: { ...action, value: 3 } })).toBe(false);
});
