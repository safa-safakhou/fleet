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
it("uses collision-safe short references only when opted in without changing accepted outputs", () => {
  const repeated = { type: "string", minLength: 1, maxLength: 80, pattern: "^[a-z]+$" };
  const schema = {
    type: "object",
    properties: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`key${i}`, repeated])),
    additionalProperties: false,
    $defs: { f0: { const: "kept" } },
  };
  const legacy = shareGenerationSchema(schema, { inlineSingleUse: true }),
    short = shareGenerationSchema(schema, { inlineSingleUse: true, compactNames: true });
  expect(JSON.stringify(short).length).toBeLessThan(JSON.stringify(legacy).length);
  expect((short.$defs as Record<string, unknown>).f0).toEqual({ const: "kept" });
  const ajv = new Ajv({ strict: false }),
    a = ajv.compile(schema),
    b = ajv.compile(short);
  for (const value of [
    {},
    { key0: "ok" },
    { key0: "" },
    { key0: "9" },
    { key0: "x".repeat(81) },
    { unknown: "ok" },
    { key0: 4 },
  ])
    expect(b(value)).toBe(a(value));
  expect(shareGenerationSchema(schema, { inlineSingleUse: true })).toEqual(legacy);
});
