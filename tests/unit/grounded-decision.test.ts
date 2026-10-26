import { expect, it } from "vitest";
import {
  bindObservedFacts,
  constrainLegalChoices,
  validateNumericObjective,
} from "../../src/platform/grounded-decision.js";

const observed = {
  bindingId: "owned",
  requestId: "owner-1",
  revision: "r1",
  facts: { gold: "135", spendable: "115", delivery: "pending" },
};
const proposal = { kind: "propose", bindingId: "owned", requestId: "owner-1", revision: "r1", offerId: "c" };
it("binds exact observed facts without asking the model to copy historical balances or prices", () => {
  expect(bindObservedFacts(proposal, observed)).toEqual({
    ...proposal,
    gold: "135",
    spendable: "115",
    delivery: "pending",
  });
  expect(() => bindObservedFacts({ ...proposal, gold: "999" }, observed)).toThrow("MODEL_AUTHORED_BOUND_FACT");
  expect(() => bindObservedFacts({ ...proposal, bindingId: "foreign" }, observed)).toThrow("DECISION_SCOPE_MISMATCH");
  expect(() => bindObservedFacts({ ...proposal, revision: "r0" }, observed)).toThrow("DECISION_REVISION_MISMATCH");
});
it("restricts IDs to legal alternatives while retaining inferior legal choices and the no-deal fallback", () => {
  const schema = { type: "object", properties: { offerId: { type: "string" } }, required: ["offerId"] };
  expect(constrainLegalChoices(schema, "offerId", ["b", "d", "none"]).properties.offerId.enum).toEqual([
    "b",
    "d",
    "none",
  ]);
  expect(constrainLegalChoices(schema, "offerId", ["none"]).properties.offerId.enum).toEqual(["none"]);
  expect(() => constrainLegalChoices(schema, "offerId", [])).toThrow("INVALID_LEGAL_CHOICES");
});
it("returns explicit objective feedback rather than changing a legal proposal into the winner", () => {
  const scores = { a: "9007199254740993002", b: "9007199254740993001", none: "0" };
  expect(validateNumericObjective("b", scores)).toMatchObject({ code: "OBJECTIVE_NOT_MET", retryable: true });
  expect(validateNumericObjective("b", scores)?.message).toContain("9007199254740993002");
  expect(validateNumericObjective("a", scores)).toBeNull();
  expect(validateNumericObjective("b", { a: "200", b: "200", none: "0" })).toBeNull();
  expect(() => validateNumericObjective("a", { a: "1.5" })).toThrow("INVALID_OBJECTIVE_SCORES");
});
