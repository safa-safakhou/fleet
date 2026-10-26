import { expect, it } from "vitest";
import { dueRehearsalRounds, rehearsalTurnCode } from "../../scripts/lib/native-rehearsal-control.js";

it("publishes on fixed offered-load boundaries and catches up without skipping rounds", () => {
  expect(dueRehearsalRounds(60000, 1)).toEqual([2]);
  expect(dueRehearsalRounds(181000, 1)).toEqual([2, 3, 4]);
  expect(dueRehearsalRounds(1740000, 29)).toEqual([30]);
  expect(dueRehearsalRounds(1800000, 30)).toEqual([]);
});
it("reports stored uncertainty and internal errors even when legacy control returns normally", () => {
  expect(rehearsalTurnCode({ state: "needs_owner", code: "TRANSPORT_UNCERTAIN", unknown_usage: true })).toBe(
    "TRANSPORT_UNCERTAIN",
  );
  expect(rehearsalTurnCode({ state: "finished", code: "MODEL_OUTPUT_TRUNCATED", unknown_usage: false })).toBe(
    "MODEL_OUTPUT_TRUNCATED",
  );
  expect(rehearsalTurnCode({ state: "finished", code: "WAIT", unknown_usage: false })).toBe("RETURNED");
});
