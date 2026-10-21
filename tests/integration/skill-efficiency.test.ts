import { expect, it } from "vitest";
import { evaluateSkillReuse } from "../../src/modules/skills/v1/evaluation.js";
import { cost, efficiencyCases } from "../fixtures/skills/efficiency-cases.js";

it("keeps acquisition and validation in totals and observes amortization only after comparable reuse", () => {
  const r = evaluateSkillReuse(efficiencyCases());
  expect(r.evidenceLevel).toBe("synthetic");
  expect(r.timingEvidence).toEqual(["simulated"]);
  expect(r.totals.reuse.actualTokens).toBe(300);
  expect(r.totals.baseline?.actualTokens).toBe(500);
  expect(r.phases.acquisition.actualTokens).toBe(250);
  expect(r.observedAmortizationHorizon).toBe(3);
  expect(evaluateSkillReuse(efficiencyCases(1)).totals.actualTokenSavings).toBe(-160);
});
it("includes applicability fallback and expensive retrieval, preserving quality regressions", () => {
  const c = efficiencyCases(1);
  c[0].applicability = "miss";
  c[0].reuse.costs.push(cost("fallback", 100), cost("retrieval", 500));
  c[0].reuse.outcome = { kind: "admitted", sourceRefs: ["receipt:only"] };
  const r = evaluateSkillReuse(c);
  expect(r.coverage).toMatchObject({ applicabilityMisses: 1, fulfilled: 0, admittedOnly: 1, qualityRegressions: 1 });
  expect(r.phases.fallback.actualTokens).toBe(100);
  expect(r.totals.actualTokenSavings).toBeLessThan(0);
  expect(r.observedAmortizationHorizon).toBeNull();
});
it("never presents missing actual usage or an unobserved counterfactual as measured savings", () => {
  const c = efficiencyCases(2);
  c[0].baseline = null;
  c[1].reuse.costs.push(cost("fallback", null, 1));
  const r = evaluateSkillReuse(c);
  expect(r.totals.baseline).toBeNull();
  expect(r.totals.actualTokenSavings).toBeNull();
  expect(r.totals.reuse.actualTokens).toBeNull();
  expect(r.totals.reuse.reservedTokens).toBeGreaterThan(0);
  expect(r.observedAmortizationHorizon).toBeNull();
});
