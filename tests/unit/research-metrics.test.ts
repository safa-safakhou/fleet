import { expect, test } from "vitest";
import { MetricAggregator } from "../../src/research/metrics/aggregate.js";
import { MetricCatalog } from "../../src/research/metrics/catalog.js";
import { metricFixture } from "../fixtures/research/metrics.js";

test("known_metric_fixture_is_exact over the complete immutable population", async () => {
  const { snapshot, evidence, window } = metricFixture();
  const service = new MetricAggregator({ load: async () => evidence }, { window });
  const ids = [
    "objective_success_rate.v1",
    "first_pass_accuracy.v1",
    "recovery_rate.v1",
    "duplicate_effect_rate.v1",
    "known_tokens_per_success.v1",
    "evidence_event_coverage.v1",
    "latency_p95.v1",
    "calls.v1",
    "waits_without_effects.v1",
    "cohorts_created.v1",
    "cohorts_completed.v1",
  ];
  const result = await service.compute(snapshot, ids),
    values = Object.fromEntries(result.values.map((v) => [v.id, v]));
  expect(values[ids[0]].value).toBe(0.5);
  expect(values[ids[0]].denominator).toBe("2");
  expect(values[ids[1]].value).toBe(0.75);
  expect(values[ids[2]].value).toBe(0.5);
  expect(values[ids[3]].value).toBeCloseTo(1 / 3);
  expect(values[ids[4]].value).toBeNull();
  expect(values[ids[4]].numerator).toBe("3075");
  expect(values[ids[4]].exclusions).toContain("UNKNOWN_USAGE");
  expect(values[ids[5]].value).toBe(0.9);
  expect(values[ids[6]].value).toBe(195);
  expect(values["calls.v1"].value).toBe(207);
  expect(values["waits_without_effects.v1"].value).toBe(0);
  expect(values["cohorts_created.v1"].value).toBe(2);
  expect(values["cohorts_completed.v1"].value).toBe(1);
  expect(result.unresolvedUsage).toEqual({ allocations: 2, reservedTokens: "200" });
  expect(result.ungraded).toBe(1);
  const first = JSON.stringify(result);
  snapshot.native.allocations[205].status = "reported";
  snapshot.native.allocations[205].inputTokens = "99";
  expect(JSON.stringify(result)).toBe(first);
});
test("every catalog metric computes an exact synthetic sample and explicit missing-data result", async () => {
  const catalog = new MetricCatalog(),
    f = metricFixture();
  for (const definition of catalog.list().filter((d) => d.source === "measurement")) {
    const evidence = {
      ...f.evidence,
      measurements: [
        {
          id: definition.id,
          at: f.window.start,
          value: 4,
          numerator: 3,
          denominator: 4,
          status: "complete" as const,
          sourceRefs: ["fixture:typed-native"],
          priceVersion: "synthetic@1",
          billableUnits: 4,
        },
      ],
    };
    const value = (
      await new MetricAggregator(
        { load: async () => evidence },
        { window: f.window, priceVersion: "synthetic@1" },
      ).compute(f.snapshot, [definition.id])
    ).values[0];
    expect(value.value).toBe(definition.operation === "ratio" ? 0.75 : 4);
    const missing = (
      await new MetricAggregator(
        { load: async () => ({ ...evidence, measurements: [] }) },
        { window: f.window },
      ).compute(f.snapshot, [definition.id])
    ).values[0];
    expect(missing.value).toBeNull();
    expect(missing.coverage.status).toBe("unavailable");
  }
  const zero = {
    ...f.evidence,
    measurements: [
      {
        id: "first_pass_accuracy.v1",
        at: f.window.start,
        value: null,
        numerator: 0,
        denominator: 0,
        status: "complete" as const,
        sourceRefs: [],
      },
    ],
  };
  expect(
    (
      await new MetricAggregator({ load: async () => zero }, { window: f.window }).compute(f.snapshot, [
        "first_pass_accuracy.v1",
      ])
    ).values[0].value,
  ).toBeNull();
});

test("missing timestamps, token measurements and ratio fields stay unavailable rather than zero", async () => {
  const f = metricFixture();
  f.snapshot.native.cohorts = [{ id: "finished", createdAt: f.window.start, completedAt: null, state: "finished" }];
  f.snapshot.native.allocations.forEach((c) => {
    c.inputTokens = null;
  });
  f.evidence.measurements = [
    { id: "schema_validity.v1", at: f.window.start, value: null, denominator: 1, status: "complete", sourceRefs: [] },
  ];
  const result = await new MetricAggregator({ load: async () => f.evidence }, { window: f.window }).compute(
    f.snapshot,
    ["cohorts_completed.v1", "known_input_tokens.v1", "schema_validity.v1"],
  );
  expect(result.values.map((v) => v.value)).toEqual([null, null, null]);
});

test("metric protobuf roundtrip preserves zero, null and unknown usage distinctions", async () => {
  const f = metricFixture(),
    { encodeMetricSet, decodeMetricSet } = await import("../../src/research/metrics/wire.js");
  const metrics = await new MetricAggregator({ load: async () => f.evidence }, { window: f.window }).compute(
    f.snapshot,
    ["calls.v1", "waits_without_effects.v1", "known_tokens_per_success.v1"],
  );
  expect(decodeMetricSet(encodeMetricSet(metrics))).toEqual(metrics);
});
