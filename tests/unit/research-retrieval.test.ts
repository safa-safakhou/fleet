import { expect, test } from "vitest";
import { reciprocalRankFusion } from "../../src/research/memory/fusion.js";

test("RRF uses one-based rank, constant60 and stable source IDs", () => {
  const result = reciprocalRankFusion([
    ["b", "a"],
    ["a", "b"],
  ]);
  expect(result.map((r) => r.id)).toEqual(["a", "b"]);
  expect(result[0].score).toBeCloseTo(1 / 61 + 1 / 62, 15);
  expect(reciprocalRankFusion([["a", "a"]])[0].score).toBeCloseTo(1 / 61, 15);
});
