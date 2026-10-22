import { Ajv } from "ajv";
import { expect, it } from "vitest";
import { z } from "zod";
import { readFinalGenerationContract } from "../../src/engines/autonomous-specialists/decision-interface.js";
import {
  assertListedSkillReferences,
  bindListedSkillReferences,
} from "../../src/engines/autonomous-specialists/skill-reference-interface.js";
import { SkillRefSchema } from "../../src/modules/skills/v1/schema.js";

const a = { id: "123e4567-e89b-42d3-a456-426614174000", version: 1, digest: "a".repeat(64) },
  b = { id: "123e4567-e89b-42d3-a456-426614174001", version: 2, digest: "b".repeat(64) };
const base = z.toJSONSchema(
  z
    .object({
      decision: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("read"), query: z.record(z.string(), z.unknown()) }).strict(),
        z.object({ kind: z.literal("wait") }).strict(),
      ]),
      skills: z
        .object({
          select: z.array(SkillRefSchema).max(2).optional(),
          publish: z.array(SkillRefSchema).max(2).optional(),
          adopt: z.array(SkillRefSchema).max(2).optional(),
        })
        .strict()
        .optional(),
    })
    .strict(),
  { target: "draft-7" },
);
const envelope = readFinalGenerationContract(base),
  validate = (refs: (typeof a)[]) =>
    new Ajv({ strict: false, validateFormats: false }).compile(bindListedSkillReferences(envelope, refs));
it("binds complete delivered tuples without allowing IDs, versions or digests to mix", () => {
  const v = validate([a, b]);
  expect(v({ decision: { kind: "read", query: {} }, skills: { select: [a, b] } })).toBe(true);
  for (const ref of [
    { ...a, version: b.version },
    { ...a, digest: b.digest },
    { ...a, id: b.id },
    { ...a, id: "123e4567-e89b-42d3-a456-426614174002" },
  ])
    expect(v({ decision: { kind: "read", query: {} }, skills: { select: [ref] } })).toBe(false);
});
it("permits empty and omitted operations, requiring selection only on reads and publication/adoption only on finals", () => {
  const v = validate([]);
  expect(v({ decision: { kind: "read", query: { actualRead: true } }, skills: { select: [] } })).toBe(true);
  expect(v({ decision: { kind: "wait" }, skills: { publish: [], adopt: [] } })).toBe(true);
  expect(v({ decision: { kind: "wait" } })).toBe(true);
  expect(v({ decision: { kind: "wait" }, skills: { select: [] } })).toBe(false);
  expect(v({ decision: { kind: "read", query: {} }, skills: { publish: [] } })).toBe(false);
  expect(v({ decision: { kind: "read", query: {} }, skills: { select: [a] } })).toBe(false);
  const known = validate([a]);
  expect(known({ decision: { kind: "wait" }, skills: { publish: [a], adopt: [a] } })).toBe(true);
});
it("rejects unsupported actual operations before their library port and preserves inputs/new hypotheses", () => {
  expect(() => assertListedSkillReferences({ select: [a] }, [])).toThrow("SKILL_REFERENCE_NOT_DELIVERED");
  expect(() => assertListedSkillReferences({ publish: [{ ...a, version: 2 }] }, [a])).toThrow();
  expect(() => assertListedSkillReferences({ select: [], publish: [], adopt: [] }, [])).not.toThrow();
  const copy = structuredClone(envelope);
  bindListedSkillReferences(envelope, [a]);
  expect(envelope).toEqual(copy);
  const learning = {
    type: "object",
    properties: {
      decision: { type: "object", properties: { kind: { const: "wait" } } },
      proposals: { type: "array", items: { type: "object", properties: { id: { type: "string" } } } },
    },
  };
  expect(bindListedSkillReferences(learning, [])).toEqual(learning);
  expect(() => bindListedSkillReferences(envelope, [{ ...a, digest: "wrong" }])).toThrow();
});

it("bounds existing parent/child/invocation refs inside learning while preserving new hypothesis data", () => {
  const ref = z.toJSONSchema(SkillRefSchema, { target: "draft-7" }),
    learning = {
      properties: {
        decision: { properties: { kind: { const: "wait" } } },
        proposals: {
          type: "array",
          items: {
            type: "object",
            properties: {
              newId: { type: "string" },
              parent: ref,
              procedure: {
                type: "object",
                properties: {
                  children: { type: "array", items: ref, maxItems: 4 },
                  nodes: {
                    type: "array",
                    items: {
                      anyOf: [
                        {
                          type: "object",
                          properties: { kind: { const: "invoke" }, skill: ref },
                          required: ["kind", "skill"],
                          additionalProperties: false,
                        },
                        {
                          type: "object",
                          properties: { kind: { const: "return_to_reasoning" } },
                          required: ["kind"],
                          additionalProperties: false,
                        },
                      ],
                    },
                  },
                },
                required: ["children", "nodes"],
                additionalProperties: false,
              },
            },
            required: ["newId", "procedure"],
            additionalProperties: false,
          },
        },
      },
      required: ["decision", "proposals"],
      additionalProperties: false,
    };
  const ajv = new Ajv({ strict: false, validateFormats: false }),
    empty = ajv.compile(bindListedSkillReferences(learning, [])),
    known = ajv.compile(bindListedSkillReferences(learning, [a]));
  const proposal = { newId: "a-new-hypothesis", procedure: { children: [], nodes: [{ kind: "return_to_reasoning" }] } };
  expect(empty({ decision: { kind: "wait" }, proposals: [proposal] })).toBe(true);
  expect(empty({ decision: { kind: "wait" }, proposals: [{ ...proposal, parent: a }] })).toBe(false);
  expect(
    known({
      decision: { kind: "wait" },
      proposals: [{ ...proposal, parent: a, procedure: { children: [a], nodes: [{ kind: "invoke", skill: a }] } }],
    }),
  ).toBe(true);
  expect(known({ decision: { kind: "wait" }, proposals: [{ ...proposal, parent: b }] })).toBe(false);
});
