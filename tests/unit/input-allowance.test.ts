import { expect, it } from "vitest";
import { Budget } from "../../src/domain.js";
import { budget } from "../helpers.js";

it("accepts an explicitly configured larger packet without changing quotas or existing settings", () => {
  expect(Budget.parse(budget).inputByteLimit).toBe(24000);
  expect(Budget.parse({ ...budget, inputByteLimit: 48000 })).toEqual({ ...budget, inputByteLimit: 48000 });
  expect(Budget.safeParse({ ...budget, inputByteLimit: 64001 }).success).toBe(false);
});
