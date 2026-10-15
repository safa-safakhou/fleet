import { expect, it } from "vitest";
import { promptFeedback } from "../../src/feedback.js";

it("retains exact rejection references/fields without duplicating schema or submitted prose", () => {
  const feedback = {
    code: "INVALID_GAME_ACTION",
    actionKind: "game.building.queue",
    inputSchema: { type: "object", required: ["slot"], description: "x".repeat(1500) },
    attemptedArgs: { requestId: "actual-reference", body: "private authored prose" },
    errors: [
      { instancePath: "", keyword: "required", params: { missingProperty: "slot" }, message: "repeated explanation" },
    ],
    guidance: "Use exact current shape",
  };
  const before = structuredClone(feedback),
    delivered = promptFeedback(feedback);
  expect(delivered).toMatchObject({
    code: feedback.code,
    actionKind: feedback.actionKind,
    attemptedReferences: { requestId: "actual-reference" },
    errors: [{ keyword: "required", params: { missingProperty: "slot" } }],
  });
  expect(delivered).not.toHaveProperty("inputSchema");
  expect(JSON.stringify(delivered)).not.toContain("private authored prose");
  expect(feedback).toEqual(before);
  expect(Buffer.byteLength(JSON.stringify(delivered))).toBeLessThan(500);
});
