import type { Data } from "./domain.js";
export const qualificationScenarioIds = [
  "prerequisites",
  "threat-help",
  "multiple-events",
  "scarcity-trade",
  "untrusted-peer",
  "stale-receipt",
] as const;
const profiles = ["legacy-loop", "legacy-cognition", "reactive-basic", "reactive-cognition"];
export const qualificationTrialKeys = qualificationScenarioIds.flatMap((scenario) =>
  [1, 2].flatMap((repeat) => profiles.map((profile) => ({ profile, trial: `${scenario}:${repeat}` }))),
);
export function acceptableQualificationTrial(result: Data) {
  return (
    Number.isSafeInteger(result.semanticRejections) &&
    Number(result.semanticRejections) >= 0 &&
    result.state === "complete" &&
    Number.isInteger(result.calls) &&
    Number(result.calls) >= 1 &&
    Number(result.calls) <= 2 &&
    !result.pending &&
    !result.invalidActions &&
    !result.scopeViolation &&
    ["WAIT", "READ", "QUALIFICATION_COMMAND_WITHHELD", "TURN_ACTION_LIMIT"].includes(String(result.code))
  );
}
/** V3 only: recovered acceptance never erases raw schema or semantic errors. */
export function qualificationVerdict(input: {
  state: unknown;
  executions: number;
  invalid: number;
  unknown: number;
  unresolved: number;
  calibrationCasesPassed: number;
  trials: { profile: string; trial: string; result: Data }[];
}) {
  const keys = input.trials.map((t) => `${t.profile}:${t.trial}`),
    expected = qualificationTrialKeys.map((t) => `${t.profile}:${t.trial}`);
  const coverageComplete =
    keys.length === expected.length &&
    new Set(keys).size === expected.length &&
    expected.every((k) => keys.includes(k));
  const failures = input.trials.filter((t) => !acceptableQualificationTrial(t.result)).length;
  const semanticTelemetryComplete =
    input.trials.length > 0 &&
    input.trials.every(
      (t) => Number.isSafeInteger(t.result.semanticRejections) && Number(t.result.semanticRejections) >= 0,
    );
  const semanticRejections = input.trials.reduce(
    (n, t) =>
      n + (Number.isSafeInteger(t.result.semanticRejections) ? Math.max(0, Number(t.result.semanticRejections)) : 0),
    0,
  );
  const semanticRecoveries = input.trials.filter(
    (t) => acceptableQualificationTrial(t.result) && Number(t.result.semanticRejections ?? 0) > 0,
  ).length;
  const known = input.executions > 0 && !input.unknown && !input.unresolved;
  const recoveryPassed =
    input.state === "Q2_done" && coverageComplete && !failures && known && input.calibrationCasesPassed === 4;
  const rawSchemaPassed = known && !input.invalid,
    rawSemanticPassed = known && semanticTelemetryComplete && !semanticRejections;
  return {
    unsafeTrials: input.trials.filter((t) => t.result.pending || t.result.scopeViolation).length,
    policy: "fleet.qualification-policy.v3",
    coverageComplete,
    trialFailures: failures,
    semanticTelemetryComplete,
    semanticRejections,
    semanticRecoveries,
    rawSchemaPassed,
    rawSemanticPassed,
    rawPassed: recoveryPassed && rawSchemaPassed && rawSemanticPassed,
    rawOutputsPassed: recoveryPassed && rawSchemaPassed && rawSemanticPassed,
    recoveryPassed,
    passed: recoveryPassed,
  };
}
