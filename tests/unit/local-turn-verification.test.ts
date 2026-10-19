import { expect, it } from "vitest";
import { turnVerificationFailure } from "../../scripts/local-turn-verification.js";

const reported = [{ status: "reported" }];
const finished = { state: "finished", actions: 1, code: "COMMITTED", pending_command: null };
it.each(["MODEL_OUTPUT_TRUNCATED", "CONTEXT_LIMIT", "INVALID_MODEL_OUTPUT", "TURN_ACTION_LIMIT"])(
  "does not label earlier committed work a clean turn when it later ends with %s",
  (code) => {
    expect(turnVerificationFailure({ ...finished, code }, reported)).toBe(code);
  },
);
it.each(["COMMITTED", "ALREADY_COMMITTED"])(
  "accepts a finished %s turn with confirmed work and reported usage",
  (code) => {
    expect(turnVerificationFailure({ ...finished, code }, reported)).toBeUndefined();
  },
);
it("allows an intentional wait but refuses pending or unreported work", () => {
  expect(turnVerificationFailure({ ...finished, actions: 0, code: "WAIT" }, reported)).toBeUndefined();
  expect(turnVerificationFailure({ ...finished, pending_command: "uncertain-command" }, reported)).toBeTruthy();
  expect(turnVerificationFailure(finished, [{ status: "unknown" }])).toBeTruthy();
  expect(turnVerificationFailure(finished, [])).toBeTruthy();
});

it.each(["WAIT", "COMMITTED"])("does not hide a rejected game command behind reactive terminal code %s", (code) => {
  expect(
    turnVerificationFailure({ ...finished, code, actions: code === "WAIT" ? 0 : 1 }, reported, [
      ...(code === "COMMITTED" ? [{ code: "COMMITTED" }] : []),
      { code: "INVALID_COMMAND" },
    ]),
  ).toBe("INVALID_COMMAND");
  expect(
    turnVerificationFailure(
      { ...finished, code, actions: code === "WAIT" ? 0 : 1 },
      reported,
      code === "WAIT" ? [] : [{ code: "COMMITTED" }],
    ),
  ).toBeUndefined();
});
