import { expect, test } from "vitest";
import { comparisonPlotData, comparisonRows, comparisonView, csv } from "../../web/research/comparison.js";
import type { ComparisonReport } from "../../web/research/types.js";

test("comparison_refuses_false_certainty and exported values retain provenance", () => {
  const report = {
    snapshotId: "snapshot",
    snapshotDigest: "source",
    flags: ["UNKNOWN_USAGE", "CENSORED_HORIZON"],
    missingRuns: ["missing-bad-run"],
    intervals: [
      {
        metricId: "accuracy.v1",
        independentUnits: 2,
        estimate: 0.5,
        lower: null,
        upper: null,
        reason: "INSUFFICIENT_INDEPENDENT_UNITS",
      },
    ],
    units: [
      {
        id: "=SUM(1)",
        worldId: "world",
        arm: "candidate",
        missingRuns: [],
        runs: [
          {
            runId: "run",
            snapshotId: "source-run",
            metricId: "published",
            metrics: {
              values: [
                {
                  id: "accuracy.v1",
                  version: "1",
                  value: null,
                  unit: "ratio",
                  numerator: "0",
                  denominator: "2",
                  window: { start: "2026-10-31T10:00:00.000Z", end: "2026-10-31T11:00:00.000Z" },
                  coverage: { status: "partial" },
                  exclusions: ["UNKNOWN_USAGE"],
                  sourceRefs: ["source"],
                  evaluatorDigest: "grader",
                },
              ],
            },
          },
        ],
      },
    ],
  } as unknown as ComparisonReport;
  expect(comparisonPlotData(report, "accuracy.v1").bounds).toEqual([]);
  expect(comparisonPlotData(report, "accuracy.v1").observations).toEqual([]);
  const view = comparisonView(report);
  expect(view.rankable).toBe(false);
  expect(view.descriptive).toBe(true);
  expect(view.reasons).toContain("INSUFFICIENT_INDEPENDENT_UNITS");
  const rows = comparisonRows(report);
  expect(rows[0]).toMatchObject({
    metricId: "accuracy.v1",
    metricVersion: "1",
    value: null,
    denominator: "2",
    runSnapshotId: "source-run",
    comparisonSnapshotId: "snapshot",
  });
  const output = csv(rows);
  expect(output).toContain("'=SUM(1)");
  expect(output).toContain("coverage");
  expect(output).toContain("evaluatorDigest");
  expect(csv([{ id: " \t@formula", value: "safe" }])).toContain("' \t@formula");
});

test("CSV retains safe signed numeric measurements while escaping formula text", () => {
  expect(csv([{ value: -1, label: "-formula" }])).toContain('"-1","\'-formula"');
});
