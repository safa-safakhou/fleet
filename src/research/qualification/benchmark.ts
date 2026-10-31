import { z } from "zod";

const sample = z.object({
  enabled: z.boolean(),
  operations: z.literal(1000),
  concurrency: z.literal(4),
  fakeProviderMs: z.literal(50),
  providerCalls: z.literal(1000),
  p95ServiceMs: z.number().positive(),
  p95ProviderMs: z.number().nonnegative(),
  peakRssBytes: z.number().int().positive(),
  counts: z.object({ events: z.number().int().nonnegative(), artifacts: z.number().int().nonnegative() }),
  runner: z.object({ os: z.literal("linux") }),
});
const pairs = z
  .array(z.object({ repetition: z.number().int(), warmup: z.boolean(), enabled: sample, disabled: sample }))
  .length(6);
export function assessBenchmark(input: unknown) {
  const parsed = pairs.safeParse(input);
  if (!parsed.success)
    return {
      status: "blocked" as const,
      latencyOverhead: null,
      rssOverhead: null,
      blockers: ["INVALID_OR_MISSING_BENCHMARK_SAMPLES"],
    };
  const data = parsed.data,
    measured = data.filter((x) => !x.warmup),
    blockers: string[] = [];
  if (
    data.filter((x) => x.warmup).length !== 1 ||
    measured
      .map((x) => x.repetition)
      .sort()
      .join(",") !== "0,1,2,3,4"
  )
    blockers.push("INVALID_REPETITION_DESIGN");
  if (
    data.some(
      (x) =>
        !x.enabled.enabled ||
        x.disabled.enabled ||
        x.enabled.counts.events !== 4004 ||
        x.enabled.counts.artifacts !== 2000 ||
        x.disabled.counts.events !== 0 ||
        x.disabled.counts.artifacts !== 0,
    )
  )
    blockers.push("OPERATION_RECONCILIATION_FAILED");
  if (measured.length !== 5)
    return {
      status: "blocked" as const,
      latencyOverhead: null,
      rssOverhead: null,
      blockers: [...blockers, "INVALID_REPETITION_DESIGN"],
    };
  const mean = (mode: "enabled" | "disabled") => measured.reduce((s, x) => s + x[mode].p95ServiceMs, 0) / 5;
  const peak = (mode: "enabled" | "disabled") => Math.max(...measured.map((x) => x[mode].peakRssBytes));
  const latencyOverhead = mean("enabled") / mean("disabled") - 1,
    rssOverhead = peak("enabled") / peak("disabled") - 1;
  if (mean("enabled") * 100 > mean("disabled") * 110) blockers.push("SERVICE_P95_OVERHEAD_EXCEEDS_10_PERCENT");
  if (peak("enabled") * 100 > peak("disabled") * 115) blockers.push("PEAK_RSS_INCREASE_EXCEEDS_15_PERCENT");
  return {
    status: blockers.length ? ("blocked" as const) : ("passed" as const),
    latencyOverhead,
    rssOverhead,
    blockers,
  };
}
