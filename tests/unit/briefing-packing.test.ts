import { expect, it } from "vitest";
import { expandFactTables } from "../../src/fact-table.js";
import { compactBriefingGuidance, compactCurrentFacts, compactEnvironment } from "../../src/games/pact/environment.js";

it("retains briefing explanations when only optional history needs removal", () => {
  const agentBriefing = { execution: { guidance: "Useful explanation", allowedActions: [] } };
  expect(
    compactEnvironment({ profile: { id: "self" }, agentBriefing, history: "x".repeat(5000) }, 2000).agentBriefing,
  ).toEqual(agentBriefing);
});

it("withholds declared briefing prose without losing any current facts or action checks", () => {
  const input = {
    execution: {
      allowedActions: ["building.queue"],
      guidance: "Repeated execution prose",
      humanOnly: "Approval prose",
    },
    construction: {
      options: [{ building: "farm", startStatus: "ready" }],
      queuedProgress: [{ phase: "stock_shortage" }],
      coverage: "Repeated rule prose",
      goalReconciliation: "Repeated goal prose",
    },
  };
  const result = compactBriefingGuidance(input);
  expect(result.execution).toEqual({ allowedActions: ["building.queue"] });
  expect(result.construction).toEqual({
    options: input.construction.options,
    queuedProgress: input.construction.queuedProgress,
  });
  expect(result.guidanceOmitted).toContain("construction.goalReconciliation");
  expect(input.execution.guidance).toBe("Repeated execution prose");
});
it("preserves every native construction stock check under reversible whole-row encoding", () => {
  const facts = {
    constructionStockChecks: Array.from({ length: 8 }, (_, i) => ({
      building: `building-${i}`,
      targetLevel: 2,
      stockAffordable: true,
      costWhole: { iron: "100", silver: "200", grain: "0" },
      sourceRef: "native-synthetic-source",
    })),
  };
  const packed = compactCurrentFacts(facts);
  const { factEncoding: _, ...expanded } = expandFactTables(packed) as typeof packed;
  expect(expanded).toEqual(facts);
  expect(JSON.stringify(packed).length).toBeLessThan(JSON.stringify(facts).length);
});
