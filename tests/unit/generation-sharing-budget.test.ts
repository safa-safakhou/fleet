import { Ajv } from "ajv";
import { expect, it } from "vitest";
import { shareGenerationSchema } from "../../src/modules/generation-schema/v1.js";

it("optionally inlines generated definitions used once after factoring without weakening nested bounds or literals", () => {
  const item = {
    type: "object",
    properties: {
      evidence: { type: "string", enum: ["a".repeat(100), "b".repeat(100)] },
      count: { type: "integer", minimum: 1, maximum: 2 },
    },
    required: ["evidence", "count"],
    additionalProperties: false,
  };
  const list = { type: "array", items: item, minItems: 1, maxItems: 2 };
  const schema = {
    type: "object",
    properties: { left: list, right: list },
    required: ["left", "right"],
    additionalProperties: false,
  };
  const original = structuredClone(schema),
    legacy = shareGenerationSchema(schema),
    compact = shareGenerationSchema(schema, { inlineSingleUse: true });
  expect(JSON.stringify(compact).length).toBeLessThan(JSON.stringify(legacy).length);
  expect(shareGenerationSchema(schema)).toEqual(legacy);
  const ajv = new Ajv({ strict: false, validateFormats: false }),
    checks = [schema, legacy, compact].map((s) => ajv.compile(s));
  const record = { evidence: "a".repeat(100), count: 1 },
    valid = { left: [record], right: [record] };
  const candidates = [
    valid,
    { ...valid, left: [] },
    { ...valid, right: [{ ...record, count: 3 }] },
    { ...valid, left: [{ ...record, evidence: "wrong" }] },
    { ...valid, right: [record, record, record] },
  ];
  for (const value of candidates)
    expect(checks.map((c) => Boolean(c(value)))).toEqual(Array(3).fill(Boolean(checks[0](value))));
  expect(schema).toEqual(original);
});
