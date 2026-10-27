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
    research: {
      taskAttempts: 0,
      distinctTasksAttempted: 0,
      repeatedTaskAttempts: 0,
      legacyAttempts: 0,
      attemptsWithEffects: 0,
      waitsWithoutEffects: 0,
      responseMetadataCalls: 0,
      finishReasonCalls: 0,
      reasoningMetadataCalls: 0,
      comparableTimingCalls: 0,
      correctionCalls: 0,
      truncatedCalls: 0,
      emptyFinalCalls: 0,
      outputErrorCalls: 0,
      lateUsage: { observations: 0, input: 0, output: 0 },
      availability: [],
      strategicQuality: null,
      reciprocalCommunication: { messages: 0, pairs: 0, reciprocal_pairs: 0, directed_edges: 0, participants: 0 },
      coverage: "Metadata coverage only",
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
  expect(html).toContain("Distinct tasks");
  expect(html).toContain("Empty final answers");
  expect(html).toContain("Confirmed actions");
  expect(html).toContain("0 calls report a finish reason");
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
    contextDemandPercent: null,
    outputPercent: null,
    requestBytes: null,
    inputLimitBytes: null,
    thinking: null,
    reasoningEffort: null,
    elapsedMs: null,
    elapsedScope: null,
    providerExecutionMs: null,
    endToEndMs: null,
    messageBytes: null,
    schemaBytes: null,
    inputBytePercent: null,
    inboxDelivered: null,
    inboxOmitted: null,
    quotedOptionsOmitted: null,
    decisionFeedbackCode: null,
    decisionFeedbackRetryable: null,
    queueDelayMs: null,
    firstContentMs: null,
    generationMs: null,
    finalTextChars: null,
    reasoningChars: null,
    finishReason: null,
    error: null,
  };
  const unknown = renderToStaticMarkup(<MetricsCharts data={{ ...data, calls: [call] }} />);
  expect(unknown).toContain("Not recorded");
  expect(unknown).not.toContain("NaN");
  const timing = renderToStaticMarkup(
    <MetricsCharts data={{ ...data, calls: [{ ...call, elapsedMs: 20000, endToEndMs: 30000 }] }} />,
  );
  expect(timing).toContain("<td>30s</td>");
});
