import { z } from "zod";
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
const Config = z
  .object({ mode: z.literal("offline"), datasetId: z.string().min(1), candidateId: z.string().min(1) })
  .strict();
/** Only this provider is admitted by the owned runner; no provider registry or environment lookup. */
export class FleetEvalProvider {
  readonly handlesOwnRetries = true;
  readonly config: z.infer<typeof Config>;
  constructor(
    raw: unknown,
    readonly broker: EvaluationPort,
  ) {
    this.config = Config.parse(raw);
  }
  id() {
    return `fleet-evaluation:${this.config.candidateId}`;
  }
  async callApi(prompt: string, context: { vars?: Record<string, unknown> } = {}, _options?: unknown) {
    const caseId = z.string().min(1).parse(context.vars?.caseId),
      result = await this.broker.call({
        candidateId: this.config.candidateId,
        datasetId: this.config.datasetId,
        caseId,
        phase: "candidate",
        prompt,
      });
    return {
      output: JSON.stringify(result.output),
      ...(result.inputTokens !== null && result.outputTokens !== null
        ? {
            tokenUsage: {
              prompt: Number(result.inputTokens),
              completion: Number(result.outputTokens),
              total: Number(BigInt(result.inputTokens) + BigInt(result.outputTokens)),
            },
          }
        : {}),
      metadata: {
        allocationId: result.allocationId,
        resultRef: result.resultRef,
        caseId,
        candidateId: this.config.candidateId,
        usageStatus: result.inputTokens === null || result.outputTokens === null ? "unknown" : "reported",
      },
    };
  }
}
