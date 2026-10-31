import { expect, test } from "vitest";
import { PactEvaluator } from "../../src/research/evaluation/pact.js";
import { metricFixture } from "../fixtures/research/metrics.js";

test("independent PACT observation grades completion, never an admitted receipt or agent success claim", async () => {
  const f = metricFixture();
  const evidence = {
    ...f.evidence,
    observations: [
      {
        eventId: "native-observation",
        artifactId: "native-facts",
        observedAt: f.window.start,
        sourceRefs: ["native:kingdom"],
        payload: { buildings: { hall: { level: 2 }, farm: { level: 0 } }, stock: 100 },
      },
    ],
    claims: [{ id: "forged", success: true, stock: 999, oracle: "ORACLE_SENTINEL" }],
  };
  const spec = {
    version: "pact-rules@1" as const,
    window: f.window,
    objectives: [
      { id: "hall", pointer: "/buildings/hall/level", equals: 2 },
      { id: "farm", pointer: "/buildings/farm/level", equals: 1 },
      { id: "missing", pointer: "/unobserved", equals: true },
    ],
    facts: [{ id: "stock", pointer: "/stock", claimed: 999 }],
    receipts: [{ commandId: "one", meaning: "admission" as const }],
  };
  const result = await new PactEvaluator({ load: async () => evidence }).grade(f.snapshot, spec);
  expect(result.objectives.map((x) => x.status)).toEqual(["completed", "failed", "ungraded"]);
  expect(result.facts[0].correct).toBe(false);
  expect(result.receipts[0].completedObjective).toBe(false);
  expect(result.oracleIsolation).toBe("evaluation-only");
  expect(JSON.stringify(result)).not.toContain("ORACLE_SENTINEL");
});
