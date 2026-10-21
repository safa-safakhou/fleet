import { Ajv } from "ajv";
import { expect, it } from "vitest";
import { shareGenerationSchema } from "../../src/modules/generation-schema/v1.js";

const item = {
  type: "object",
  properties: {
    resource: { type: "string", enum: ["iron", "silver", "grain"] },
    wholePerHour: { type: "integer", minimum: 1, maximum: 1000 },
  },
  required: ["resource", "wholePerHour"],
  additionalProperties: false,
};
it("shares repeated schemas losslessly, including nested literal constants and exact invalid boundaries", () => {
  const original = {
    type: "object",
    properties: {
      send: item,
      receive: item,
      bond: { ...item, description: "different schema annotation" },
      literal: { const: { type: "object", properties: { send: item, receive: item } } },
    },
    required: ["send", "receive"],
    additionalProperties: false,
  };
  const compact = shareGenerationSchema(original);
  expect(JSON.stringify(compact).length).toBeLessThan(JSON.stringify(original).length);
  const ajv = new Ajv({ strict: false });
  const a = ajv.compile(original),
    b = ajv.compile(compact);
  for (const send of [
    { resource: "iron", wholePerHour: 2 },
    { resource: "bogus", wholePerHour: 2 },
    { resource: "iron", wholePerHour: 0 },
    { resource: "iron", wholePerHour: 2, extra: 1 },
    null,
  ])
    for (const receive of [{ resource: "silver", wholePerHour: 1 }, undefined])
      for (const literal of [undefined, original.properties.literal.const, { type: "wrong" }]) {
        const output = { send, receive, ...(literal === undefined ? {} : { literal }) };
        expect(b(output)).toBe(a(output));
      }
  expect(original.properties.send).toEqual(item);
  expect(shareGenerationSchema(compact)).toEqual(compact);
});
