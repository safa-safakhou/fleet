import { Ajv } from "ajv";
import { expect, it } from "vitest";
import { specialistWakeClockSchema } from "../../src/engines/autonomous-specialists/clock-interface.js";
import {
  queryContractGuide,
  responseContractGuide,
} from "../../src/engines/autonomous-specialists/response-interface.js";

const schema = {
  $defs: {
    body: {
      type: "object",
      properties: {
        kind: { const: "game.contact.request" },
        peer: { enum: ["authorized-peer"] },
        text: { type: "string", minLength: 1, maxLength: 80 },
      },
      required: ["kind", "peer", "text"],
      additionalProperties: false,
    },
  },
  anyOf: [
    {
      type: "object",
      properties: {
        decision: {
          anyOf: [
            {
              type: "object",
              properties: {
                kind: { const: "read" },
                query: { type: "object", description: "already in readInterface" },
                summary: { type: "string", maxLength: 400 },
              },
              required: ["kind", "query", "summary"],
              additionalProperties: false,
            },
          ],
        },
      },
      required: ["decision"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        decision: {
          anyOf: [
            {
              type: "object",
              properties: {
                kind: { const: "action" },
                schemaId: { const: "board.action" },
                payload: { $ref: "#/$defs/body" },
                summary: { type: "string", maxLength: 400 },
                expectedOutcome: {
                  type: "object",
                  properties: { accepted: { type: "boolean" } },
                  additionalProperties: false,
                },
              },
              required: ["kind", "schemaId", "payload", "summary"],
              additionalProperties: false,
            },
          ],
        },
      },
      required: ["decision"],
      additionalProperties: false,
    },
  ],
};
it("grounds exact current action fields, IDs, required/optional bounds and read-query reference", () => {
  const before = structuredClone(schema),
    text = JSON.stringify(responseContractGuide(schema));
  for (const s of [
    "game.contact.request",
    "authorized-peer",
    "schemaId",
    "payload",
    "expectedOutcome?",
    "maxLength=80",
    "readInterface.queryShape",
  ])
    expect(text).toContain(s);
  expect(text).not.toContain("already in readInterface");
  expect(text).toContain("not authority");
  expect(schema).toEqual(before);
});
it("removes unavailable actions when the actual evidence-only schema changes", () => {
  const onlyRead = { anyOf: [schema.anyOf[0]] };
  const text = JSON.stringify(responseContractGuide(onlyRead));
  expect(text).toContain("readInterface.queryShape");
  expect(text).not.toContain("game.contact.request");
});
it("refuses unresolved or cyclic references and never treats literal values as schemas", () => {
  expect(() => responseContractGuide({ $ref: "https://not-allowed.invalid" })).toThrow();
  const literal = {
    type: "object",
    properties: {
      decision: {
        type: "object",
        properties: { kind: { const: "wait" }, summary: { enum: ["literal $ref=missing \\d"] } },
        required: ["kind", "summary"],
        additionalProperties: false,
      },
    },
    required: ["decision"],
    additionalProperties: false,
  };
  expect(JSON.stringify(responseContractGuide(literal))).toContain("literal $ref=missing");
  expect(() => responseContractGuide({ $defs: { x: { $ref: "#/$defs/x" } }, $ref: "#/$defs/x" })).toThrow();
});
it("uses portable digit classes only in opted-in clocks and preserves accepted lexical values", () => {
  const now = { clockId: "sim.ms", value: "0" },
    old = specialistWakeClockSchema(now),
    portable = specialistWakeClockSchema(now, { portableDigits: true });
  expect(JSON.stringify(old)).toContain("\\\\d");
  expect(JSON.stringify(portable)).not.toContain("\\\\d");
  expect(JSON.stringify(portable)).toContain("[0-9]");
  const ajv = new Ajv({ strict: false, validateFormats: false }),
    a = ajv.compile(old),
    b = ajv.compile(portable);
  for (const clockId of ["utc", "sim.ms", "invented"])
    for (const value of [
      "0",
      "60000",
      "-1",
      "1.5",
      "},",
      "2026-10-22T20:00:00Z",
      "2026-10-22T20:00:00.123Z",
      "2026-10-22T20:00:00+00:00",
      "١٢",
      "9".repeat(40),
      "9".repeat(41),
    ])
      expect(b({ clockId, value })).toBe(a({ clockId, value }));
});

it("retains query documentation, names, bounds and dependencies in the compact prompt", () => {
  const query = {
    description: "Read-only; no messages or grants.",
    oneOf: [
      {
        type: "object",
        properties: {
          tool: { enum: ["authorized_read"] },
          args: { type: "object", additionalProperties: true },
          coordination: { const: true },
          continuity: { const: true },
        },
        required: ["tool", "args"],
        dependencies: { coordination: ["continuity"] },
        additionalProperties: false,
      },
    ],
  };
  const g = queryContractGuide(query),
    text = JSON.stringify(g);
  expect(g.instructions).toBe(query.description);
  for (const value of ["authorized_read", "tool:", "args:", "dependencies=", "continuity"])
    expect(text).toContain(value);
});
it("factors repeated schema nodes without rewriting literal strings or colliding with aliases", () => {
  const variant = (kind: string) => ({
    type: "object",
    properties: {
      kind: { const: kind },
      payload: {
        type: "object",
        properties: {
          literal: { const: "@0 string<maxLength=400>" },
          a: { type: "string", maxLength: 400 },
          b: { type: "string", maxLength: 400 },
          c: { type: "string", maxLength: 400 },
        },
        required: ["literal", "a", "b", "c"],
        additionalProperties: false,
      },
    },
    required: ["kind", "payload"],
    additionalProperties: false,
  });
  const g = responseContractGuide({ properties: { decision: { anyOf: [variant("a"), variant("b"), variant("c")] } } });
  expect(g.definitions).toBeDefined();
  expect(Object.keys(g.definitions as object)).not.toContain("@0");
  expect(JSON.stringify(g)).toContain("@0 string<maxLength=400>");
});

it("expands every local alias to the same unshared decision signatures", () => {
  const decision = {
    type: "object",
    properties: {
      kind: { const: "action" },
      schemaId: { const: "same.schema" },
      payload: {
        type: "object",
        properties: {
          to: { enum: ["first-authorized-target", "second-authorized-target"] },
          a: { type: "string", maxLength: 400 },
          b: { type: "string", maxLength: 400 },
        },
        required: ["to", "a", "b"],
        additionalProperties: false,
      },
    },
    required: ["kind", "schemaId", "payload"],
    additionalProperties: false,
  };
  const source = { properties: { decision: { anyOf: [decision, decision, decision] } } },
    guide = responseContractGuide(source),
    plain = responseContractGuide(source, { share: false }),
    defs = guide.definitions as Record<string, string> | undefined;
  const expand = (s: string, depth = 0): string => {
    if (depth > 50) throw Error("CYCLIC_TEST_ALIAS");
    return s.replace(/@[0-9]+/g, (name) => (defs?.[name] === undefined ? name : expand(defs[name], depth + 1)));
  };
  expect((guide.decisions as string[]).map((s) => expand(s))).toEqual(plain.decisions);
});
