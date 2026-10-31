import { expect, test } from "vitest";
import { assessBenchmark } from "../../src/research/qualification/benchmark.js";

function pairs() {
  return Array.from({ length: 6 }, (_, i) => ({
    repetition: i - 1,
    warmup: i === 0,
    disabled: {
      enabled: false,
      operations: 1000,
      concurrency: 4,
      fakeProviderMs: 50,
      providerCalls: 1000,
      p95ServiceMs: 100,
      p95ProviderMs: 50,
      peakRssBytes: 1000000,
      counts: { events: 0, artifacts: 0 },
      runner: { os: "linux" },
    },
    enabled: {
      enabled: true,
      operations: 1000,
      concurrency: 4,
      fakeProviderMs: 50,
      providerCalls: 1000,
      p95ServiceMs: 110,
      p95ProviderMs: 50,
      peakRssBytes: 1150000,
      counts: { events: 4004, artifacts: 2000 },
      runner: { os: "linux" },
    },
  }));
}
test("exact budget boundaries pass without rounding away real overhead", () => {
  expect(assessBenchmark(pairs()).status).toBe("passed");
  const x = pairs();
  x[1].enabled.p95ServiceMs = 111;
  expect(assessBenchmark(x).blockers).toContain("SERVICE_P95_OVERHEAD_EXCEEDS_10_PERCENT");
  const y = pairs();
  y[2].enabled.peakRssBytes = 1150001;
  expect(assessBenchmark(y).blockers).toContain("PEAK_RSS_INCREASE_EXCEEDS_15_PERCENT");
});
test("missing samples, nonfinite timings, wrong platform or missing events cannot pass", () => {
  for (const mutate of [
    (x: any) => x.pop(),
    (x: any) => (x[1].enabled.p95ServiceMs = NaN),
    (x: any) => (x[1].disabled.peakRssBytes = 0),
    (x: any) => (x[1].enabled.runner.os = "darwin"),
    (x: any) => (x[1].enabled.counts.events = 4003),
  ]) {
    const x = pairs();
    mutate(x);
    expect(assessBenchmark(x).status).toBe("blocked");
  }
});
