import { describe, expect, it } from "vitest";
import { ComparisonTemplate, comparisonPreview } from "../../src/comparisons.js";
import { budget, continuousBudget } from "../helpers.js";

const template = {
  version: 1,
  name: "Synthetic comparison",
  intervalMinutes: 15,
  seed: "matched",
  strategies: ["guardian", "expansionist", "merchant", "diplomat", "opportunist"],
  model: { route: "ollama", model: "synthetic-nemotron", thinking: true },
  budget,
  recallAssist: "laya-recall-v1",
};
describe("portable comparison templates", () => {
  it("defaults to five per arm and changes only the cognition selection", () => {
    const p = comparisonPreview(template);
    expect(p.totalAgents).toBe(10);
    expect(p.arms[0].model).toEqual(template.model);
    expect(p.arms[1].model).toEqual({
      ...template.model,
      cognition: "llm-centered-v1",
      recallAssist: "laya-recall-v1",
    });
    expect(p.totalCallLimit).toBe(budget.callLimit * 2);
    expect(p.totalTokenLimit).toBe(budget.tokenLimit * 2);
    expect(comparisonPreview(JSON.parse(JSON.stringify(p.template)))).toEqual(p);
  });
  it("supports recall ablation, other providers and explicitly accepted continuous budgets", () => {
    const p = comparisonPreview({
      ...template,
      recallAssist: undefined,
      countPerArm: 7,
      budget: continuousBudget,
      model: { route: "codex-cli", model: "synthetic-subscription-model", reasoningEffort: "medium" },
    });
    expect(p.totalAgents).toBe(14);
    expect(p.totalCallLimit).toBeNull();
    expect(p.totalTokenLimit).toBeNull();
    expect(p.arms[1].model.recallAssist).toBeUndefined();
    expect(() => comparisonPreview({ ...p.template, budget: { ...continuousBudget, concurrency: 2 } })).toThrow(
      "CODEX_EXECUTION_BUDGET_REQUIRED",
    );
  });
  it("rejects credentials, runtime bindings, VW and mislabeled baseline cognition", () => {
    for (const extra of [
      { credentials: {} },
      { accountId: "real-account" },
      { start: true },
      { endpoint: "https://private.example" },
    ])
      expect(ComparisonTemplate.safeParse({ ...template, ...extra }).success).toBe(false);
    for (const extra of [
      { decisionPolicy: "vw-focus-v1" },
      { cognition: "llm-centered-v1" },
      { recallAssist: "laya-recall-v1" },
      { apiKey: "never-export" },
    ])
      expect(ComparisonTemplate.safeParse({ ...template, model: { ...template.model, ...extra } }).success).toBe(false);
  });
  it("enforces count, deadline, allowance and supported version constraints", () => {
    for (const extra of [
      { countPerArm: 0 },
      { countPerArm: 501 },
      { version: 2 },
      { budget: { ...budget, tokenLimit: 1 } },
      { budget: { ...continuousBudget, continuousExecutionAccepted: undefined } },
    ])
      expect(ComparisonTemplate.safeParse({ ...template, ...extra }).success).toBe(false);
  });
});
