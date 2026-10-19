import { Ajv } from "ajv";
import { expect, it } from "vitest";
import { analysisSchemaForVersion } from "../../src/cognitive-analysis.js";
import { pactAdapter } from "../../src/games/pact/adapter.js";
import { bindGenerationSchema, closedDecisionSchema } from "../../src/generation.js";
import archived from "../fixtures/legacy-baseline.json" with { type: "json" };
import correction from "../fixtures/legacy-contract-correction-20261018.json" with { type: "json" };

const kinds = ["game.building.queue", "game.message.send"];
const schema = closedDecisionSchema({
  actionKinds: kinds,
  actionSchemas: kinds.map(pactAdapter.actionSchema),
  reads: [
    {
      name: "pact_world_read_v1",
      inputSchema: { type: "object", properties: { forecastMinutes: { type: "integer", minimum: 1, maximum: 60 } } },
    },
  ],
  selectedReadNames: ["pact_world_read_v1"],
  memory: false,
});
const valid = {
  kind: "action",
  summary: "Fixture",
  action: { kind: "game.building.queue", building: "farm", targetLevel: 2, slot: 1 },
};
const invalid = [
  { ...valid, action: { ...valid.action, kind: "building.queue" } },
  { ...valid, action: { ...valid.action, summary: "Extra" } },
  {
    kind: "action",
    summary: "Fixture",
    action: { kind: "game.message.send", recipientKingdomId: "11111111-1111-4111-8111-111111111111" },
  },
  { kind: "read", summary: "Fixture", tool: "pact_conversation_read_v2", args: {} },
];
it("closes exact operations/args, rejects all four archived synthetic calls and retains a legitimate call", () => {
  const check = new Ajv({ strict: false, validateFormats: false }).compile(schema);
  expect(check(valid)).toBe(true);
  for (const bad of invalid) expect(check(bad)).toBe(false);
  expect(check({ kind: "read", summary: "Read", tool: "pact_world_read_v1", args: { arbitrary: true } })).toBe(false);
  for (const args of [null, false, 1, "{}", []])
    expect(check({ kind: "read", summary: "Read", tool: "pact_world_read_v1", args })).toBe(false);
  expect(check({ kind: "read", summary: "Read", tool: "pact_world_read_v1" })).toBe(false);
  expect(check({ kind: "read", summary: "Read", tool: 1, args: {} })).toBe(false);
  expect(
    check({ kind: "read", summary: "Read", tool: "fleet_read_schema", args: { name: "pact_conversation_read_v2" } }),
  ).toBe(false);
});
it("binds the same closed decision into native cognition without imposing cognition IDs on game targets", () => {
  const native = bindGenerationSchema(analysisSchemaForVersion(0, {}), schema);
  const check = new Ajv({ strict: false, validateFormats: false }).compile(native);
  const cognition = { expectedVersion: 0, analysis: { type: "none", reason: "No new evidence" } };
  expect(check({ cognition, decision: valid })).toBe(true);
  for (const bad of invalid) expect(check({ cognition, decision: bad })).toBe(false);
});
it("accepts unversioned compatible catalogs and rejects declared version/name mismatch", () => {
  expect(() => pactAdapter.validateCatalog?.([{ name: "pact_world_read_v1", inputSchema: {} }])).not.toThrow();
  expect(() =>
    pactAdapter.validateCatalog?.([
      {
        name: "pact_world_read_v1",
        inputSchema: {},
        _meta: { "pact/operation": { catalogVersion: "future", name: "pact_world_read_v1" } },
      },
    ]),
  ).toThrow("SCHEMA_CHANGED");
});

it("never widens an unsupported schema dialect or admits an action without its exact kind", () => {
  expect(() =>
    closedDecisionSchema({
      actionKinds: [],
      actionSchemas: [],
      reads: [
        { name: "future", inputSchema: { $schema: "https://json-schema.org/draft/2020-12/schema", type: "object" } },
      ],
      selectedReadNames: ["future"],
      memory: false,
    }),
  ).toThrow("SCHEMA_CHANGED");
  const check = new Ajv({ strict: false, validateFormats: false }).compile(schema);
  expect(check({ ...valid, action: { building: "farm", slot: 1, targetLevel: 2 } })).toBe(false);
});

it("makes every grammar union branch self-contained so converters cannot drop the read discriminator", () => {
  const reads = (schema.anyOf as Record<string, unknown>[]).filter((b) => JSON.stringify(b).includes('"tool"'));
  expect(reads.length).toBeGreaterThan(0);
  const visit = (s: unknown): void => {
    if (!s || typeof s !== "object") return;
    const o = s as Record<string, unknown>;
    if (Array.isArray(o.anyOf)) {
      expect(o.properties).toBeUndefined();
      expect(o.required).toBeUndefined();
    }
    for (const v of Object.values(o))
      if (Array.isArray(v)) v.forEach(visit);
      else visit(v);
  };
  visit(schema);
  for (const bad of [{ args: {} }, { tool: "pact_world_read_v1", args: {} }]) {
    const check = new Ajv({ strict: false, validateFormats: false }).compile(schema);
    expect(check(bad)).toBe(false);
  }
});

it("retains archived fingerprints separately from the explicit generation contract correction", () => {
  expect(correction.cases.map((c) => c.priorModelInputDigest)).toEqual(archived.cases.map((c) => c.modelInputDigest));
});
