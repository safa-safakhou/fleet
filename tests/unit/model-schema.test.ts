import { expect, it, vi } from "vitest";
import { HttpModel } from "../../src/model.js";
import { compileGenerationSchema } from "../../src/model-schema.js";

it("lowers property dependencies without weakening coordination/continuity semantics or literal values", async () => {
  const { prepareVllmGenerationSchema } = await import("../../src/model-schema.js");
  const schema = {
    type: "object",
    properties: {
      coordination: { const: true },
      continuity: { const: true },
      literal: { const: { dependencies: { private: ["literal"] } } },
    },
    dependencies: { coordination: ["continuity"] },
    additionalProperties: false,
  };
  const prepared = prepareVllmGenerationSchema(schema);
  expect(prepared).not.toHaveProperty("dependencies");
  expect(prepared).toHaveProperty("properties.literal.const", schema.properties.literal.const);
  const original = compileGenerationSchema(schema),
    portable = compileGenerationSchema(prepared);
  for (const value of [
    {},
    { continuity: true },
    { coordination: true },
    { coordination: true, continuity: true },
    { coordination: false },
    null,
    [],
  ])
    expect(portable(value)).toBe(original(value));
});

it("rejects a malformed generation schema before dispatch or network invocation", async () => {
  const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("NETWORK_MUST_NOT_RUN"));
  let dispatched = false;
  try {
    await expect(
      new HttpModel({ ollama: "http://127.0.0.1:11434" }, undefined).decide({
        model: { route: "ollama", model: "nemotron-3-nano:4b", thinking: false },
        messages: [{ role: "user", content: "Wait" }],
        schema: { type: "object", properties: { value: { enum: ["x", "x"] } } },
        maxOutputTokens: 2000,
        signal: new AbortController().signal,
        onDispatch: async () => {
          dispatched = true;
        },
      }),
    ).rejects.toMatchObject({ code: "INVALID_GENERATION_SCHEMA", notDispatched: true });
    expect(dispatched).toBe(false);
    expect(network).not.toHaveBeenCalled();
  } finally {
    network.mockRestore();
  }
});

it("prepares vLLM schemas without changing unions, bounds or literal data", async () => {
  const { prepareVllmGenerationSchema } = await import("../../src/model-schema.js");
  const schema = {
    type: "object",
    properties: {
      query: { type: "object", propertyNames: { type: "string" }, additionalProperties: true },
      sharedQuery: { type: "object", propertyNames: { $ref: "#/$defs/key" } },
      boundedKeys: { type: "object", propertyNames: { type: "string", maxLength: 8 } },
      step: { $ref: "#/$defs/step" },
      literal: { const: { propertyNames: { type: "string" }, $ref: "#/$defs/not-a-reference" } },
    },
    required: ["step"],
    $defs: {
      key: { type: "string" },
      step: { oneOf: [{ type: "string", pattern: "^[a-z]+$", minLength: 1, maxLength: 4 }, { type: "null" }] },
    },
  };
  const before = structuredClone(schema),
    prepared = prepareVllmGenerationSchema(schema);
  expect(schema).toEqual(before);
  expect(prepared).not.toHaveProperty("$defs");
  expect(prepared).not.toHaveProperty("properties.query.propertyNames");
  expect(prepared).not.toHaveProperty("properties.sharedQuery.propertyNames");
  expect(prepared).toHaveProperty("properties.boundedKeys.propertyNames.maxLength", 8);
  expect(prepared).toHaveProperty("properties.literal.const", schema.properties.literal.const);
  const original = compileGenerationSchema(schema),
    generation = compileGenerationSchema(prepared);
  for (const step of [null, "a", "abcd", "abcde", "A", 12]) expect(generation({ step })).toBe(original({ step }));
});
it("refuses cyclic or external vLLM schema expansion before dispatch", async () => {
  const { prepareVllmGenerationSchema } = await import("../../src/model-schema.js");
  expect(() =>
    prepareVllmGenerationSchema({ $ref: "#/$defs/node", $defs: { node: { $ref: "#/$defs/node" } } }),
  ).toThrow("PROVIDER_SCHEMA_NOT_SUPPORTED");
  expect(() => prepareVllmGenerationSchema({ $ref: "https://invalid.example/schema" })).toThrow(
    "PROVIDER_SCHEMA_NOT_SUPPORTED",
  );
});
