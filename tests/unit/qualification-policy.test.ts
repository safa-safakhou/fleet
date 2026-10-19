import { expect, it } from "vitest";
import { qualificationTrialKeys, qualificationVerdict } from "../../src/qualification-policy.js";

const trials = () =>
  qualificationTrialKeys.map(({ profile, trial }) => ({
    profile,
    trial,
    result: {
      state: "complete",
      code: "WAIT",
      calls: 1,
      pending: false,
      invalidActions: 0,
      scopeViolation: false,
      semanticRejections: 0,
    },
  }));
const base = () => ({
  state: "Q2_done",
  executions: 52,
  invalid: 0,
  unknown: 0,
  unresolved: 0,
  calibrationCasesPassed: 4,
  trials: trials(),
});
it("qualifies recovered JSON and proposals under one rule, retaining both raw failures", () => {
  const x = base();
  x.invalid = 1;
  x.trials[0].result.semanticRejections = 1;
  expect(qualificationVerdict(x)).toMatchObject({
    passed: true,
    recoveryPassed: true,
    rawSchemaPassed: false,
    rawSemanticPassed: false,
    rawPassed: false,
    semanticRecoveries: 1,
  });
});
it("requires the exact full48-cell matrix and rejects exhausted corrections and uncertain actions", () => {
  const x = base();
  expect(qualificationVerdict(x).passed).toBe(true);
  for (const change of [
    { trials: x.trials.slice(1) },
    { trials: [...x.trials.slice(1), x.trials[1]] },
    { unknown: 1 },
    { unresolved: 1 },
    { calibrationCasesPassed: 3 },
    { state: "blocked" },
  ])
    expect(qualificationVerdict({ ...x, ...change }).passed).toBe(false);
  for (const change of [
    { code: "INVALID_MODEL_OUTPUT" },
    { code: "MODEL_PROPOSAL_REJECTED" },
    { calls: 0 },
    { calls: 3 },
    { pending: true },
    { invalidActions: 1 },
    { scopeViolation: true },
    { state: "running" },
    { semanticRejections: -1 },
    { semanticRejections: undefined },
    { semanticRejections: "unknown" },
  ]) {
    const y = base();
    Object.assign(y.trials[0].result, change);
    expect(qualificationVerdict(y).passed).toBe(false);
    if ("semanticRejections" in change) expect(qualificationVerdict(y).rawSemanticPassed).toBe(false);
  }
});
