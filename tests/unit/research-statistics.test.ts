import { expect, test } from "vitest";
import { clusterInterval } from "../../src/research/experiments/statistics.js";

const options = { baseline: "base", candidate: "candidate", paired: false, seed: 42, resamples: 2000 as const };
test("shared_world_is_one_cluster despite 40 agents and repeated turns", () => {
  const rows = Array.from({ length: 40 }, (_, i) => ({
    cluster: i < 20 ? "world-a" : "world-b",
    arm: i < 20 ? "base" : "candidate",
    value: i < 20 ? 1 : 2,
  }));
  const result = clusterInterval(rows, options);
  expect(result.independentUnits).toBe(2);
  expect(result.estimate).toBe(1);
  expect(result.lower).toBeNull();
  expect(result.reason).toBe("INSUFFICIENT_INDEPENDENT_UNITS");
});
test("paired deltas, unmatched pairs and seeded eligible intervals are explicit", () => {
  const paired = clusterInterval(
    [
      { cluster: "b1", pairId: "p1", arm: "base", value: 10 },
      { cluster: "c1", pairId: "p1", arm: "candidate", value: 12 },
      { cluster: "b2", pairId: "p2", arm: "base", value: 20 },
      { cluster: "c2", pairId: "p2", arm: "candidate", value: 23 },
      { cluster: "lost", pairId: "p3", arm: "base", value: 100 },
    ],
    { ...options, paired: true },
  );
  expect(paired.estimate).toBe(2.5);
  expect(paired.independentUnits).toBe(2);
  expect(paired.unmatched).toEqual(["p3"]);
  const rows = Array.from({ length: 10 }, (_, i) => ({
    cluster: `world-${i}`,
    arm: i < 5 ? "base" : "candidate",
    value: i < 5 ? 0 : 1,
  }));
  const first = clusterInterval(rows, options);
  expect(first.lower).toBe(1);
  expect(first.upper).toBe(1);
  expect(clusterInterval(rows, options)).toEqual(first);
  const missing = clusterInterval(
    [
      { cluster: "w1", arm: "base", value: null, status: "censored" },
      { cluster: "w2", arm: "candidate", value: 0 },
    ],
    options,
  );
  expect(missing.estimate).toBeNull();
  expect(missing.missing).toBe(1);
});

test("same-world treatment interference and all-unknown values block intervals", () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({
    cluster: `world-${Math.floor(i / 2)}`,
    arm: i % 2 ? "candidate" : "base",
    value: i % 2,
  }));
  expect(clusterInterval(rows, options).reason).toBe("SHARED_WORLD_INTERFERENCE");
  const unknown = clusterInterval(
    rows.map((r) => ({ ...r, value: null })),
    options,
  );
  expect(unknown.estimate).toBeNull();
  expect(unknown.missing).toBe(20);
  expect(unknown.lower).toBeNull();
});
