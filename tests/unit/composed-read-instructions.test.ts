import { expect, it } from "vitest";
import { queryContractGuide } from "../../src/engines/autonomous-specialists/response-interface.js";

const schema = {
  anyOf: [
    {
      description: "readSchema returns metadata only; it never refreshes game facts.",
      oneOf: [
        {
          type: "object",
          properties: { readSchema: { const: "native_read" } },
          required: ["readSchema"],
          additionalProperties: false,
        },
      ],
    },
    {
      type: "object",
      properties: { skillSchema: { const: true } },
      required: ["skillSchema"],
      additionalProperties: false,
    },
  ],
};
it("delivers nested read instructions through the exact skills union without changing legacy guides", () => {
  const legacy = queryContractGuide(schema),
    next = queryContractGuide(schema, { inheritDescriptions: true });
  expect(legacy).not.toHaveProperty("instructions");
  expect(queryContractGuide({ ...schema, description: "" })).toHaveProperty("instructions", "");
  expect(next.instructions).toContain("metadata only");
  expect(next.instructions).toContain("never refreshes");
  expect(next.variants).toEqual(legacy.variants);
});
it("does not promote argument descriptions or literal values into read instructions", () => {
  const guide = queryContractGuide(
    {
      description: "Read-only native metadata.",
      anyOf: [
        {
          description: "Read-only native metadata.",
          type: "object",
          properties: { args: { description: "not top-level guidance", const: "literal description" } },
        },
      ],
    },
    { inheritDescriptions: true },
  );
  expect(guide.instructions).toBe("Read-only native metadata.");
  expect(JSON.stringify(guide.variants)).toContain("literal description");
});
