import type { Strategy } from "./domain.js";

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
