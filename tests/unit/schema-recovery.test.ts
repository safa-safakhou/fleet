import { expect, it } from "vitest";
import type { Tool } from "../../src/domain.js";
import { schemaChanged } from "../../src/tools.js";

it("ignores object-key ordering while retaining actual executable schema changes", () => {
  const old: Tool[] = [
    {
      name: "fixture",
      inputSchema: {
        type: "object",
        properties: { amount: { type: "integer", minimum: 1 }, name: { type: "string" } },
      },
    },
  ];
  const reordered: Tool[] = [
    {
      name: "fixture",
      inputSchema: {
        properties: { name: { type: "string" }, amount: { minimum: 1, type: "integer" } },
        type: "object",
      },
    },
  ];
  expect(schemaChanged(old, reordered)).toBe(false);
  reordered[0].inputSchema = { type: "object", properties: { amount: { type: "integer", minimum: 2 } } };
  expect(schemaChanged(old, reordered)).toBe(true);
});
it("detects a read tool becoming a write operation even when input shape is unchanged", () => {
  const old: Tool[] = [{ name: "fixture", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } }];
  expect(schemaChanged(old, [{ ...old[0], annotations: { readOnlyHint: false } }])).toBe(true);
});
