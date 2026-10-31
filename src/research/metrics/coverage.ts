import type { Measurement, MetricValue } from "./types.js";
export function measurementCoverage(rows: Measurement[], expected = rows.length): MetricValue["coverage"] {
  const recorded = rows.filter((r) => r.status === "complete").length,
    censored = rows.filter((r) => r.status === "censored").length,
    ungraded = rows.reduce((n, r) => n + (r.ungraded ?? (r.status === "ungraded" ? 1 : 0)), 0);
  return {
    status: !recorded ? "unavailable" : recorded < expected ? "partial" : "complete",
    expected,
    recorded,
    censored,
    ungraded,
  };
}
