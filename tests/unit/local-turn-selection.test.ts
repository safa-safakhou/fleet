import { expect, it } from "vitest";
import { parseTurnSelection } from "../../scripts/local-turn-selection.js";

it("selects exactly the requested diagnostic actors and preserves the historical first-actor default", () => {
  expect(
    parseTurnSelection(undefined, "legacy-loop:1,legacy-cognition:1,reactive-basic:2,reactive-cognition:0"),
  ).toEqual([
    { profile: "legacy-loop", ordinal: 1 },
    { profile: "legacy-cognition", ordinal: 1 },
    { profile: "reactive-basic", ordinal: 2 },
    { profile: "reactive-cognition", ordinal: 0 },
  ]);
  expect(parseTurnSelection("reactive-basic")).toEqual([{ profile: "reactive-basic", ordinal: 0 }]);
});
it("rejects incomplete, extra, repeated or malformed actor mappings before any run task is created", () => {
  for (const [profiles, actors] of [
    ["unknown", undefined],
    ["legacy-loop,legacy-loop", undefined],
    [undefined, "legacy-loop:1"],
    ["legacy-loop", "reactive-basic:1"],
    ["legacy-loop", "legacy-loop:1,legacy-loop:2"],
    ["legacy-loop", "legacy-loop:-1"],
    ["legacy-loop", "legacy-loop:1.5"],
    ["legacy-loop", "legacy-loop:1:2"],
  ])
    expect(() => parseTurnSelection(profiles, actors)).toThrow();
});
