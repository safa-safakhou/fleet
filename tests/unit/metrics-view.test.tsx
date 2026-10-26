import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { MetricsCharts } from "../../web/metrics.js";

it("renders empty and unknown context without claiming zero utilization or exposing hidden text", () => {
  const data = {
    asOf: "2026-10-26T00:00:00Z",
    since: "2026-10-25T23:00:00Z",
    minutes: 60,
    cohortId: null,
    totals: {
      calls: 0,
      actions: 0,
      turns: 0,
      waits: 0,
      no_action_turns: 0,
      inputTokens: 0,
      outputTokens: 0,
      unknownCalls: 0,
      reservedCalls: 0,
    },
    series: [],
    outcomes: [],
    commandOutcomes: [],
    architectures: [{ architecture: "synthetic", calls: 10, actions: 0 }],
    calls: [],
    coverage: { callLimit: 200, scope: "Recorded usage only" },
  };
  const html = renderToStaticMarkup(<MetricsCharts data={data} />);
  expect(html).toContain("No calls in this period");
  expect(html).toContain("Context usage");
  expect(html).toContain("Confirmed actions");
  expect(html).not.toContain("style=");
  const call = {
    id: "synthetic",
    turnId: "turn",
    cohortId: "cohort",
    cohort: "Fixture",
    at: data.asOf,
    status: "unknown",
    inputTokens: null,
    outputTokens: null,
    contextWindowTokens: null,
    maxOutputTokens: null,
    contextPercent: null,
    outputPercent: null,
    requestBytes: null,
    inputLimitBytes: null,
    thinking: null,
    elapsedMs: null,
    reasoningChars: null,
    finishReason: null,
    error: null,
  };
  const unknown = renderToStaticMarkup(<MetricsCharts data={{ ...data, calls: [call] }} />);
  expect(unknown).toContain("Not recorded");
  expect(unknown).not.toContain("NaN");
});
