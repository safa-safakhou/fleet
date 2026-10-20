import { expect, it } from "vitest";
import { Budget } from "../../src/domain.js";
import { continuousBudget } from "../helpers.js";

it("permits a 4096-token final-answer allowance inside the existing 40000-token per-execution reservation", () => {
  expect(Budget.safeParse({ ...continuousBudget, maxOutputTokens: 4096 }).success).toBe(true);
  expect(Budget.safeParse({ ...continuousBudget, maxOutputTokens: 4097 }).success).toBe(false);
});
