import type { Data } from "./domain.js";

export function recoveryPlan(cohortState: string, credentialState: string, agentState: string, turns: Data[]) {
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
  if (credentialState !== "ready")
    steps.push({
      kind: "reconnect",
      instruction:
        "Pause the fleet and reconnect this same account. Preserve any pending command and avoid repeating an uncertain token exchange.",
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
          "Pause at a quiescent boundary, inspect this execution and explicitly review it. Retain the original result, unknown usage and full allocation; no inference or game action is replayed.",
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
