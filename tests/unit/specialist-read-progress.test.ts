import { Ajv } from "ajv";
import { expect, it } from "vitest";
import * as progress from "../../src/engines/autonomous-specialists/read-progress.js";
import { pactReadQuerySchema } from "../../src/games/pact/read-queries.js";

const future = "Read requested; result not yet observed.";
const tool = {
  name: "fixture.status.read",
  inputSchema: {
    type: "object",
    properties: { scope: { const: "self" } },
    required: ["scope"],
    additionalProperties: false,
  },
};
it("removes empty refresh but retains exact scoped reads and metadata selectors", () => {
  const input = pactReadQuerySchema([tool.name, "other.read"], true, [tool], [], 3);
  const before = structuredClone(input);
  const scoped = progress.scopedReadProgressQuery(input);
  if (!scoped) throw Error("SCOPED_QUERY_REQUIRED");
  const check = new Ajv({ strict: false }).compile(scoped);
  expect(check({})).toBe(false);
  expect(check({ continuity: true, coordination: true })).toBe(true);
  expect(check({ coordination: true })).toBe(false);
  expect(check({ tool: tool.name, args: { scope: "self" } })).toBe(true);
  expect(check({ tool: tool.name, args: {} })).toBe(false);
  expect(check({ tool: tool.name, args: { scope: "other" } })).toBe(false);
  expect(check({ readSchema: tool.name })).toBe(false);
  expect(check({ readSchema: "other.read" })).toBe(true);
  expect(input).toEqual(before);
  expect(new Ajv({ strict: false }).compile(input)({})).toBe(true);
});
it("has no read choice for a refresh-only environment without inventing a selector", () => {
  expect(progress.scopedReadProgressQuery(pactReadQuerySchema([], false, []))).toBeUndefined();
});
it("preserves native default reads and continuity when those selectors are advertised", () => {
  const schema = progress.scopedReadProgressQuery(pactReadQuerySchema([tool.name], true, [], [tool.name], 3));
  if (!schema) throw Error("SCOPED_QUERY_REQUIRED");
  const check = new Ajv({ strict: false }).compile(schema);
  expect(check({ tool: tool.name, args: {} })).toBe(true);
  expect(check({ continuity: true })).toBe(true);
  expect(check({ invented: true })).toBe(false);
});
it.each([
  [{ kind: "read", query: {}, summary: future }, true, "EMPTY_REFRESH_FORBIDDEN"],
  [
    { kind: "read", query: { tool: tool.name, args: { scope: "self" } }, summary: "observed the current status code" },
    true,
    "READ_RESULT_CLAIM_FORBIDDEN",
  ],
  [{ kind: "read", query: { readSchema: tool.name }, summary: future }, false, "FINAL_DECISION_REQUIRED"],
] as const)("rejects an invalid read before observation: %s", (decision, allowed, code) => {
  expect(() => progress.assertReadProgressDecision(decision, allowed)).toThrow(code);
});
it("accepts a prospective scoped request and does not reinterpret a final observation", () => {
  expect(() =>
    progress.assertReadProgressDecision({ kind: "read", query: { readSchema: tool.name }, summary: future }, true),
  ).not.toThrow();
  expect(() =>
    progress.assertReadProgressDecision(
      { kind: "wait", summary: "Observed status ready after the scoped answer" },
      false,
    ),
  ).not.toThrow();
});

it("does not retain contradictory refresh instructions inside composed read queries", () => {
  const query = progress.scopedReadProgressQuery({
    anyOf: [
      pactReadQuerySchema([tool.name], true, []),
      {
        type: "object",
        properties: { skillSchema: { const: true } },
        required: ["skillSchema"],
        additionalProperties: false,
      },
    ],
  });
  expect(JSON.stringify(query)).not.toContain("{} refreshes");
});
