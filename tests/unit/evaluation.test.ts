import { expect, it } from "vitest";
import { EvaluationRecord, evaluate } from "../../src/evaluation.js";

const base = {
  replicaId: "overflow:11:baseline",
  scenario: "overflow",
  arm: "baseline",
  seed: 11,
  split: "development",
  evidence: "deterministic_fake",
  configurationDigest: "a".repeat(64),
  attempted: ["delivery", "generation", "validation", "authority", "commit", "activation", "fulfilment"],
  passed: ["delivery", "generation", "validation", "authority", "commit", "activation", "fulfilment"],
  failedStage: null,
  goalEligibility: "supported",
  goalCompleted: true,
  obligationsDue: 60,
  obligationsFulfilled: 60,
  materialBenefitVerified: true,
  soloControlReplicaId: "overflow:11:solo",
  authoritativeReadback: true,
  justifiedWait: false,
  calls: 2,
  reportedTokens: 1000,
  unknownAllocatedTokens: 40,
  latencyMs: 20,
  diagnostics: [],
};
it("reports stage denominators, material/fulfilled outcomes, unresolved goals and conserved unknown cost", () => {
  const result = evaluate([
    base,
    {
      ...base,
      replicaId: "overflow:29:baseline",
      seed: 29,
      attempted: ["delivery", "generation"],
      passed: ["delivery"],
      failedStage: "generation",
      goalCompleted: false,
      obligationsDue: 0,
      obligationsFulfilled: 0,
      materialBenefitVerified: false,
      unknownAllocatedTokens: 40000,
    },
  ])[0];
  expect(result?.stages.generation).toEqual({ attempted: 2, passed: 1, failed: 1 });
  expect(result?.stages.fulfilment).toEqual({ attempted: 1, passed: 1, failed: 0 });
  expect(result?.unknownAllocatedTokens).toBe(40040);
  expect(result?.conservativeTokensPerUsefulOutcome).toBe(42040);
  expect(result?.materialBenefitVersusSolo).toBe(1);
  const wait = evaluate([
    {
      ...base,
      goalEligibility: "owner_decision_required",
      goalCompleted: false,
      obligationsDue: 0,
      obligationsFulfilled: 0,
      materialBenefitVerified: false,
      justifiedWait: true,
    },
  ])[0];
  expect(wait?.goals.eligible).toBe(0);
  expect(wait?.callsPerUsefulOutcome).toBeNull();
});
it("refuses duplicate/mixed evidence, invented success and private payload fields", () => {
  expect(() => evaluate([base, base])).toThrow("DUPLICATE_REPLICA");
  expect(() => evaluate([base, { ...base, replicaId: "another", evidence: "real_provider" }])).toThrow(
    "MIXED_EVIDENCE_LEVELS",
  );
  for (const value of [
    { ...base, privatePrompt: "not retained" },
    { ...base, authoritativeReadback: false },
    { ...base, soloControlReplicaId: null },
    { ...base, goalEligibility: "unsupported_mechanic" },
    { ...base, passed: ["unknown"] },
  ])
    expect(EvaluationRecord.safeParse(value).success).toBe(false);
});
