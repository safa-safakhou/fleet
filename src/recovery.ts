import type { Data } from "./domain.js";

export function recoveryPlan(
  cohortState: string,
  credentialState: string,
  agentState: string,
  turns: Data[],
  reason?: string | null,
) {
  const steps: { kind: string; turnId?: string; instruction: string }[] = [];
  if (["stopped", "finished"].includes(cohortState))
    return {
      resumable: false,
      status: "terminal",
      steps: [
        {
          kind: "preserve",
          instruction:
            "This cohort is terminal. Preserve its accounts, history and pending commands; it cannot be resumed.",
        },
      ],
    };
  if (reason === "CONFIGURATION_RECEIPT_REQUIRED")
    steps.push({
      kind: "configuration_receipt",
      instruction:
        "Resolve the original account configuration receipt. Its pending command is retained; making the account ready cannot bypass it.",
    });
  if (credentialState !== "ready")
    steps.push({
      kind: "reconnect",
      instruction:
        "Reconnect this same idle account when required. A saved proof-bound refresh recovers automatically; preserve pending commands and never blindly repeat a legacy uncertain exchange.",
    });
  for (const t of turns) {
    if (t.code === "AUTH_TEMPORARY" && !t.pending_command && credentialState === "ready")
      steps.push({
        kind: "scheduled_retry",
        turnId: String(t.id),
        instruction:
          "Both bounded refresh attempts were locally confirmed not processed. The same credentials may retry only at the original scheduled turn; no usage, command, identity or schedule was reset.",
      });

    if (t.state === "running")
      steps.push({
        kind: "wait",
        turnId: String(t.id),
        instruction: "Wait for this bounded active execution to finish before review or replacement.",
      });
    else if (t.pending_command)
      steps.push({
        kind: "reconcile",
        turnId: String(t.id),
        instruction:
          "Read the original command receipt. A missing receipt is still unresolved; never replay or discard this command blindly.",
      });
    else if (t.state === "needs_owner")
      steps.push({
        kind: "review_execution",
        turnId: String(t.id),
        instruction:
          "Inspect this execution and explicitly review its scoped recovery gate. Historical cases without an operation record still require a paused, quiescent fleet. Retain the original result, unknown usage and full allocation; no inference or game action is replayed.",
      });
  }
  if (!steps.length && agentState !== "ready")
    steps.push({
      kind: "ready",
      instruction: "Make this existing account ready, then resume the same fleet on its original schedule.",
    });
  if (!steps.length)
    steps.push({
      kind: "scheduled",
      instruction:
        "This account is ready. Known invalid model answers and pre-submission errors replan within the remaining decision budget or next original scheduled turn.",
    });
  return {
    resumable: !steps.some((s) => ["wait", "reconnect", "reconcile", "review_execution"].includes(s.kind)),
    status: steps[0].kind,
    steps,
  };
}

export function recoveryHint(phase: string, code: string | null, status: string, origin?: string | null): string {
  if (code === "AUTH_REQUIRED" && origin?.startsWith("model_"))
    return "Restore access to the model route and review any retained unknown allocation. Reconnecting the game account does not repair model credentials.";
  if (phase === "usage_uncertain" || code === "USAGE_EXPOSURE_GATE")
    return "Owner decision required: retain the unknown allocation and review cost exposure before another paid attempt.";
  if (phase === "command_uncertain" || status === "reconcile")
    return "Checking the original command receipt automatically. No replacement command will be submitted.";
  if (code === "USAGE_EXCEEDED")
    return "Owner review required: reported consumption exceeded the individual allocation.";
  if (code === "IDENTITY_MISMATCH")
    return "Reconnect the original account and verify its identity. Execution remains blocked.";
  if (code === "AUTH_REQUIRED" || phase === "authorization_or_exposure")
    return "Reconnect the same account; unrelated recovery blockers remain in force.";
  if (phase === "budget_wait")
    return "Waiting for the next authorized budget period or original deadline. Allowances are not replenished.";
  if (phase === "input_wait")
    return "Input does not fit. The next scheduled attempt will rebuild context; repeated failures require input/configuration repair.";
  if (code === "CODEX_LEGACY_LOCK")
    return "An older execution lock needs ownership verification. Do not delete it while an old process may still run.";
  if (status === "retry") return "Retry scheduled on the original cadence. No additional model health probe is made.";
  return "Execution is active within its original deadline.";
}
