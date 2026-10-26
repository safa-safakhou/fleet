import { type Data, FleetError, type ModelPort } from "../domain.js";
import type { Observation } from "./contracts.js";
import type { DecisionFeedback, FeedbackPolicy, runDecisionFeedback } from "./decision-feedback.js";

type Request = Parameters<ModelPort["decide"]>[0];
type Input = Pick<Request, "messages" | "schema">;
/** Trusted adapter policy, never model-authored authority. Native envelopes remain engine-owned. */
export interface DecisionGrounding {
  /** Optional architecture scope; unrelated engines retain their full input budget. */
  appliesTo?(profile: { id: string; version: string }): boolean;
  /** Capacity withheld from initial engine packing for grounding and bounded correction messages. */
  inputReserveBytes?: number;
  prepare(input: Input, observation: Observation): Input;
  /** Trusted request identity for active correction feedback, not general error history. */
  feedbackScope?(observation: Observation): string;
  /** Additional generation constraints derived from a rejected proposal and the same authorized goal. */
  correctionSchema?(schema: Data, observation: Observation, feedback: DecisionFeedback): Data;
  validate(
    decision: unknown,
    observation: Observation,
    input: Input,
  ): DecisionFeedback | null | Promise<DecisionFeedback | null>;
  refreshQuery?(feedback: DecisionFeedback): Data | undefined;
}
export async function executeGroundedDecision(
  request: Request,
  initial: Observation,
  policy: DecisionGrounding,
  host: {
    run(
      request: Request,
      policy: Pick<FeedbackPolicy, "maxAttempts" | "validate" | "prepareRetry">,
    ): ReturnType<typeof runDecisionFeedback>;
    observe(query: Data): Promise<Observation>;
  },
) {
  let observation = structuredClone(initial);
  let input = policy.prepare(
    { messages: structuredClone(request.messages), schema: structuredClone(request.schema) },
    structuredClone(observation),
  );
  const outcome = await host.run(
    { ...request, ...input, outputContract: structuredClone(request.outputContract ?? request.schema) },
    {
      maxAttempts: 3,
      validate: (decision) => policy.validate(decision, structuredClone(observation), structuredClone(input)),
      prepareRetry: async (retry, feedback) => {
        const query = policy.refreshQuery?.(feedback);
        if (query !== undefined) {
          const next = await host.observe(query);
          if (next.schemaId !== initial.schemaId) throw new FleetError("OBSERVATION_SCOPE_MISMATCH", true);
          observation = structuredClone(next);
          input = policy.prepare({ messages: retry.messages, schema: request.schema }, structuredClone(observation));
          retry = { ...retry, ...input };
        }
        if (policy.correctionSchema)
          retry = { ...retry, schema: policy.correctionSchema(retry.schema, structuredClone(observation), feedback) };
        input = { messages: retry.messages, schema: retry.schema };
        return retry;
      },
    },
  );
  return { ...outcome, observation };
}
