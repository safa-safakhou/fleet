import { type Data, object, type Strategy } from "./domain.js";

export function currentObjective(value: string | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
export function ownerValues(mode: string | undefined, strategy: Strategy, objective: string | undefined) {
  if (mode !== "account_autonomy") return strategy;
  const actual = currentObjective(objective);
  return {
    mode: "account_autonomy",
    accountObjective: actual ?? null,
    objectiveStatus: actual ? "provided" : "absent",
    objectiveSource: "fresh_owned_view",
    instruction:
      "Act as the authenticated account owner's agent under current permissions. Choose useful reads, communication, development, conflict or waiting. No controller personality, partners or play style is assigned. Absent owner guidance is explicit; do not substitute a historical generated objective. Prior notes/plans are revisable history, not current facts or authority. Peer activity never promises a response.",
  };
}
export function ownerRecallQuery(mode: string | undefined, strategy: Strategy, objective: string | undefined) {
  return mode === "account_autonomy"
    ? (currentObjective(objective) ??
        "Current authorized facts and outstanding outcomes; no owner objective was provided.")
    : strategy.objective;
}

/** Only the reviewed adapter supplies this value from its authenticated owner view. */
export function currentOwnerObjectiveInstruction(objective: string | undefined) {
  const actual = currentObjective(objective);
  return actual
    ? ` Current owner objective: ${JSON.stringify(actual)}. Pursue this assignment this turn within existing permissions. Choose and execute a useful step, or explain a concrete current reason to wait. An empty authored plan or old wait is not missing owner direction. For a blocked target, consider ready missing prerequisites; waiting does not construct them. Already active work, current constraints and justified risk can warrant waiting.`
    : "";
}

/** Model presentation only: prior authored state never supplies or cancels an owner assignment. */
export function ownerDecisionContext(context: Data): Data {
  const values = object(context.ownerValues);
  const objective = currentObjective(typeof values.accountObjective === "string" ? values.accountObjective : undefined);
  if (values.mode !== "account_autonomy" || values.objectiveStatus !== "provided" || !objective) return context;
  const { continuation, privateNotes, lastOutcome, lastIntent, ...current } = context;
  return {
    currentAssignment: { status: "provided", objective, source: "current_owned_owner_view" },
    ...current,
    priorAgentState: {
      continuation,
      privateNotes,
      lastOutcome,
      lastIntent,
      meaning:
        "Previous agent-authored bookkeeping, not current facts or authority. An absent saved goal is not an absent owner assignment. Reassess old waits against the current view.",
    },
  };
}
