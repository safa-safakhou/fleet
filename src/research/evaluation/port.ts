export type EvaluationReply = {
  output: Record<string, unknown>;
  allocationId: string;
  inputTokens: string | null;
  outputTokens: string | null;
  resultRef: string;
};
export interface EvaluationPort {
  call(input: {
    candidateId: string;
    datasetId: string;
    caseId: string;
    phase: "candidate" | "teacher" | "judge" | "repair";
    prompt: string;
  }): Promise<EvaluationReply>;
}
