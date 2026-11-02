import { expect, test } from "vitest";
import { compileGenerationSchema } from "../../src/model-schema.js";
import { oneStepAdvisorySchema } from "../../src/research/recipes/advisory-contract.js";

const valid = {
  kind: "advisory",
  payload: { text: "Stock is observed, no delivery is proven." },
  sourceRefs: ['["synthetic","木材"]'],
  preconditions: {},
};
test("one-step advisory contract accepts grounded terminal advice and wait", () => {
  const check = compileGenerationSchema(oneStepAdvisorySchema(valid.sourceRefs));
  expect(check(valid)).toBe(true);
  expect(check({ ...valid, kind: "wait" })).toBe(true);
});
test.each([
  { ...valid, kind: "read", payload: { tool: "invented", arguments: {} } },
  { ...valid, kind: "action" },
  { ...valid, sourceRefs: ["invented"] },
  { ...valid, sourceRefs: [] },
  { ...valid, preconditions: { clockId: "invented" } },
  { ...valid, payload: { text: "x".repeat(601) } },
  { ...valid, payload: {} },
  { ...valid, extra: "untrusted" },
])("one-step advisory contract rejects an incompatible decision: %#", (value) => {
  expect(compileGenerationSchema(oneStepAdvisorySchema(valid.sourceRefs))(value)).toBe(false);
});
test("an empty delivered evidence set cannot authorize invented sources", () => {
  const check = compileGenerationSchema(oneStepAdvisorySchema([]));
  expect(check({ ...valid, sourceRefs: [] })).toBe(true);
  expect(check(valid)).toBe(false);
});
