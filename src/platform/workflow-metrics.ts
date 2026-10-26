export type WorkflowMeasurement = {
  id: string;
  bindingId: string;
  completed: boolean;
  factualCorrect: boolean | null;
  objectiveCorrect: boolean | null;
  firstAttemptCorrect: boolean | null;
  recovered: boolean;
  attempts: number;
  corrections: number;
  repeatedFailures: number;
  rejectedProposals: number;
  rejectedValidProposals: number;
  proposalChecks: number;
  invalidEffects: number;
  isolationViolations: number;
  unknownUsageCalls: number;
  inputTokens: number | null;
  outputTokens: number | null;
  elapsedMs: number;
  queueDelayMs: number;
  callLatencyMs: number[];
};
export function latencySummary(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) => (sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] : null);
  return { count: sorted.length, p50: at(0.5), p95: at(0.95), max: sorted.at(-1) ?? null };
}
/** Outcome grades must be supplied by the environment/evaluator, never inferred from parse success. */
export class WorkflowMetrics {
  private rows: WorkflowMeasurement[] = [];
  record(row: WorkflowMeasurement) {
    if (this.rows.some((r) => r.id === row.id)) throw Error("DUPLICATE_WORKFLOW_MEASUREMENT");
    this.rows.push(structuredClone(row));
  }
  snapshot() {
    const sum = (
      key:
        | "attempts"
        | "corrections"
        | "repeatedFailures"
        | "rejectedProposals"
        | "rejectedValidProposals"
        | "proposalChecks"
        | "invalidEffects"
        | "isolationViolations"
        | "unknownUsageCalls",
    ) => this.rows.reduce((n, r) => n + r[key], 0);
    return {
      workflows: this.rows.length,
      uniqueBindings: new Set(this.rows.map((r) => r.bindingId)).size,
      completed: this.rows.filter((r) => r.completed).length,
      firstAttemptCorrect: this.rows.filter((r) => r.firstAttemptCorrect === true).length,
      firstAttemptGraded: this.rows.filter((r) => r.firstAttemptCorrect !== null).length,
      recovered: this.rows.filter((r) => r.recovered).length,
      firstPassFailures: this.rows.filter((r) => r.firstAttemptCorrect === false).length,
      recoveryEligible: this.rows.filter((r) => r.rejectedProposals > 0).length,
      factualCorrect: this.rows.filter((r) => r.factualCorrect === true).length,
      factualGraded: this.rows.filter((r) => r.factualCorrect !== null).length,
      objectiveCorrect: this.rows.filter((r) => r.objectiveCorrect === true).length,
      objectiveGraded: this.rows.filter((r) => r.objectiveCorrect !== null).length,
      attempts: sum("attempts"),
      corrections: sum("corrections"),
      repeatedFailures: sum("repeatedFailures"),
      rejectedProposals: sum("rejectedProposals"),
      rejectedValidProposals: sum("rejectedValidProposals"),
      proposalChecks: sum("proposalChecks"),
      invalidEffects: sum("invalidEffects"),
      isolationViolations: sum("isolationViolations"),
      unknownUsageCalls: sum("unknownUsageCalls"),
      knownInputTokens: this.rows.reduce((n, r) => n + (r.inputTokens ?? 0), 0),
      knownOutputTokens: this.rows.reduce((n, r) => n + (r.outputTokens ?? 0), 0),
      unknownUsageWorkflows: this.rows.filter((r) => r.inputTokens === null || r.outputTokens === null).length,
      workflowLatencyMs: latencySummary(this.rows.map((r) => r.elapsedMs)),
      endToEndLatencyMs: latencySummary(this.rows.map((r) => r.queueDelayMs + r.elapsedMs)),
      queueDelayMs: latencySummary(this.rows.map((r) => r.queueDelayMs)),
      callLatencyMs: latencySummary(this.rows.flatMap((r) => r.callLatencyMs)),
    };
  }
}
