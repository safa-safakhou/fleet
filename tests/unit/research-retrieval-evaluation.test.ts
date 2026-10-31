import { expect, test } from "vitest";
import { relevanceMetrics } from "../../src/research/memory/evaluation.js";

test("frozen relevance metrics distinguish misses, order, empty results and k denominator", () => {
  expect(relevanceMetrics(["farm", "forest"], { farm: 2, forest: 1 }, 2)).toEqual({
    precisionAtK: 1,
    recallAtK: 1,
    mrr: 1,
    ndcgAtK: 1,
  });
  expect(relevanceMetrics(["castle", "farm"], { castle: 2 }, 2)).toEqual({
    precisionAtK: 0.5,
    recallAtK: 1,
    mrr: 1,
    ndcgAtK: 1,
  });
  const worse = relevanceMetrics(["miss", "farm"], { farm: 2, forest: 1 }, 2);
  expect(worse.mrr).toBe(0.5);
  expect(worse.recallAtK).toBe(0.5);
  expect(worse.ndcgAtK).toBeLessThan(1);
  expect(relevanceMetrics([], { farm: 1 }, 2)).toEqual({ precisionAtK: 0, recallAtK: 0, mrr: 0, ndcgAtK: 0 });
});
