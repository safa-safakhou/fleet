import type { SkillCost, SkillEfficiencyCase } from "../../../src/modules/skills/v1/evaluation.js";
export const cost = (
  phase: SkillCost["phase"],
  actualTokens: number | null,
  modelCalls = actualTokens ? 1 : 0,
): SkillCost => ({
  phase,
  actualTokens,
  modelCalls,
  reservedTokens: modelCalls * 40000,
  reads: phase === "execution" ? 2 : 0,
  actions: phase === "execution" ? 1 : 0,
  messages: 0,
  steps: 1,
  cpuMs: 1,
  wallMs: 2,
});
export function efficiencyCases(repeats = 5): SkillEfficiencyCase[] {
  return Array.from({ length: repeats }, (_, i) => ({
    id: `fixture:${i}`,
    applicability: "match",
    baseline: {
      evidence: "synthetic",
      timing: "simulated",
      costs: [cost("execution", 100)],
      outcome: { kind: "fulfilled", sourceRefs: [`fixture:baseline:${i}`] },
    },
    reuse: {
      evidence: "synthetic",
      timing: "simulated",
      costs: [
        ...(i === 0 ? [cost("acquisition", 250), cost("validation", 0)] : []),
        cost("retrieval", 10),
        cost("execution", 0),
        cost("monitoring", 0),
      ],
      outcome: { kind: "fulfilled", sourceRefs: [`fixture:reuse:${i}`] },
    },
  }));
}
