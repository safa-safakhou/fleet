import { expect, it } from "vitest";
import { benchmarkRequest, summarizeCalls } from "../../scripts/benchmark-nemotron-pools.js";

it("calculates measured throughput from total wall time rather than multiplying slot count", () => {
  const summary = summarizeCalls(
    [
      { elapsedMs: 2000, inputTokens: 100, outputTokens: 20 },
      { elapsedMs: 4000, inputTokens: 200, outputTokens: 30 },
    ],
    4000,
  );
  expect(summary).toMatchObject({
    calls: 2,
    meanMs: 3000,
    p50Ms: 2000,
    p95Ms: 4000,
    callsPerMinute: 30,
    effectiveOverlap: 1.5,
    inputTokens: 300,
    outputTokens: 50,
  });
});
it("keeps synthetic requests independent and pins only Nemotron with no executable action", () => {
  const a = benchmarkRequest("kingdom-a"),
    b = benchmarkRequest("kingdom-b");
  expect(a.model).toEqual({ route: "ollama", model: "nemotron-3-nano:4b", thinking: false });
  expect(a.messages).not.toEqual(b.messages);
  expect(a.schema.properties.kind).toEqual({ const: "wait" });
  expect(a.maxOutputTokens).toBe(512);
});

it("reports incorrect decisions separately from successful inference completion", async () => {
  const { assessBenchmarkDecision } = await import("../../scripts/benchmark-nemotron-pools.js");
  const decision = {
    kingdomId: "k",
    kind: "wait",
    selectedOfferId: "offer-b",
    canAfford: true,
    summary: "Synthetic",
    checks: ["gold", "reserve", "offers", "selection"],
  };
  expect(assessBenchmarkDecision(decision, "k")).toEqual({ schemaValid: true, coreFieldsCorrect: true });
  expect(assessBenchmarkDecision({ ...decision, kingdomId: "invented", canAfford: false }, "k")).toEqual({
    schemaValid: true,
    coreFieldsCorrect: false,
  });
  expect(assessBenchmarkDecision(null, "k")).toEqual({ schemaValid: false, coreFieldsCorrect: false });
});
