import { performance } from "node:perf_hooks";
import { isDeepStrictEqual } from "node:util";
import { Ajv } from "ajv";
import { FleetError, type ModelPort, safeCode } from "../domain.js";
import { compileGenerationSchema } from "../model-schema.js";

type Request = Parameters<ModelPort["decide"]>[0];
type Result = Awaited<ReturnType<ModelPort["decide"]>>;
export type DecisionFeedback = { code: string; message: string; retryable: boolean };
export type FeedbackPolicy = {
  attempt: (request: Request, attempt: number) => Promise<Result>;
  canRetry: () => Promise<boolean>;
  validate: (decision: unknown) => DecisionFeedback | null | Promise<DecisionFeedback | null>;
  inputByteLimit: number;
  maxAttempts: number;
  prepareRetry?: (request: Request, feedback: DecisionFeedback) => Promise<Request>;
};
export type FeedbackMetrics = {
  attempts: number;
  corrections: number;
  feedbackDelivered: number;
  firstAttemptValid: boolean | null;
  finalValid: boolean;
  recovered: boolean;
  repeatedFailures: number;
  unknownUsageCalls: number;
  inputTokens: number | null;
  outputTokens: number | null;
  elapsedMs: number;
  attemptLatencyMs: number[];
  errors: string[];
};
const outputErrors = new Set(["INVALID_MODEL_OUTPUT", "MODEL_OUTPUT_TRUNCATED", "MODEL_THINKING_WITHOUT_FINAL"]);
/** Opt-in proposal correction only. Each attempt must settle through the caller's ledger.
 * No commands are executed here; uncertain executions and authority failures are never replayed. */
export async function runDecisionFeedback(request: Request, policy: FeedbackPolicy) {
  if (
    !Number.isInteger(policy.maxAttempts) ||
    policy.maxAttempts < 1 ||
    policy.maxAttempts > 3 ||
    !Number.isSafeInteger(policy.inputByteLimit) ||
    policy.inputByteLimit < 1
  )
    throw new FleetError("INVALID_FEEDBACK_POLICY", true);
  const fits = (r: Request) =>
    Buffer.byteLength(JSON.stringify(r.messages)) + Buffer.byteLength(JSON.stringify(r.schema)) <=
    policy.inputByteLimit;
  if (!fits(request)) throw new FleetError("MODEL_REQUEST_NOT_ADMITTED", true);
  const authority = {
    model: structuredClone(request.model),
    signal: request.signal,
    maxOutputTokens: request.maxOutputTokens,
    onDispatch: request.onDispatch,
    outputContract: structuredClone(request.outputContract),
    bindingId: request.decisionEvidence?.bindingId,
  };
  const compiler = new Ajv({ strict: false, validateFormats: false, allErrors: true });
  let schema = compiler.compile(request.schema);
  const nativeContract = request.outputContract ? compileGenerationSchema(request.outputContract) : undefined;
  const started = performance.now();
  const metrics: FeedbackMetrics = {
    attempts: 0,
    corrections: 0,
    feedbackDelivered: 0,
    firstAttemptValid: null,
    finalValid: false,
    recovered: false,
    repeatedFailures: 0,
    unknownUsageCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    elapsedMs: 0,
    attemptLatencyMs: [],
    errors: [],
  };
  let input = request,
    result: Result | null = null,
    previousFailure: string | undefined;
  const finish = (stopReason: string, error?: string) => {
    metrics.elapsedMs = performance.now() - started;
    metrics.corrections = Math.max(0, metrics.attempts - 1);
    metrics.recovered = metrics.finalValid && metrics.firstAttemptValid === false;
    return { result, metrics, stopReason, messages: input.messages, ...(error ? { error } : {}) };
  };
  for (let n = 1; n <= policy.maxAttempts; n++) {
    if (request.signal.aborted) return finish("cancelled");
    const start = performance.now();
    metrics.attempts++;
    if (n > 1) metrics.feedbackDelivered++;
    try {
      result = await policy.attempt(input, n);
    } catch (error) {
      // The caller retains reservations/uncertainty. Never reinterpret a thrown failure as a safe retry.
      if (!(error instanceof FleetError && error.notDispatched)) {
        metrics.unknownUsageCalls++;
        metrics.inputTokens = metrics.outputTokens = null;
      }
      metrics.attemptLatencyMs.push(performance.now() - start);
      return finish(request.signal.aborted ? "cancelled" : "attempt_error", safeCode(error));
    }
    metrics.attemptLatencyMs.push(performance.now() - start);
    const known = (v: number | null) => v !== null && Number.isSafeInteger(v) && v >= 0;
    if (!known(result.inputTokens) || !known(result.outputTokens)) {
      metrics.unknownUsageCalls++;
      metrics.inputTokens = metrics.outputTokens = null;
      return finish("usage_unknown");
    }
    metrics.inputTokens = (metrics.inputTokens ?? 0) + (result.inputTokens ?? 0);
    metrics.outputTokens = (metrics.outputTokens ?? 0) + (result.outputTokens ?? 0);
    if (request.signal.aborted) return finish("cancelled");
    let feedback: DecisionFeedback | null;
    if (result.decisionError) {
      feedback = {
        code: result.decisionError,
        message:
          "The returned proposal was rejected. Return a complete decision matching the supplied schema and current evidence; no effects have been executed by this loop.",
        retryable: outputErrors.has(result.decisionError),
      };
    } else if (!schema(result.decision) || (nativeContract && !nativeContract(result.decision))) {
      feedback = {
        code: "INVALID_MODEL_OUTPUT",
        message: `Proposal does not match its generation/native contract: ${JSON.stringify((schema.errors ?? nativeContract?.errors)?.slice(0, 6).map((e) => ({ path: e.instancePath, code: e.keyword, limit: e.params.limit })))}. Correct these fields or omit optional updates; return one complete JSON object.`,
        retryable: true,
      };
    } else {
      try {
        feedback = await policy.validate(result.decision);
      } catch (error) {
        return finish("validation_error", safeCode(error));
      }
    }
    if (request.signal.aborted) return finish("cancelled");
    const valid = feedback === null;
    if (n === 1) metrics.firstAttemptValid = valid;
    if (feedback === null) {
      metrics.finalValid = true;
      return finish("accepted");
    }
    metrics.errors.push(feedback.code);
    const failure = JSON.stringify([feedback.code, result.decision ?? result.outputText]);
    if (failure === previousFailure) {
      metrics.repeatedFailures++;
      return finish("repeated_failure");
    }
    previousFailure = failure;
    if (!feedback.retryable || /^(AUTH_|PERMISSION_|MANDATE_|CLAIM_FENCED|TASK_FENCED)/.test(feedback.code))
      return finish("not_recoverable");
    if (n === policy.maxAttempts) return finish("attempt_limit");
    try {
      if (!(await policy.canRetry())) return finish("budget_limit");
    } catch (error) {
      // A failed eligibility check must not discard the last accounted proposal or its metrics.
      return finish("retry_check_error", safeCode(error));
    }
    // Keep all prior task/evidence messages. If correction cannot fit, stop rather than delete context.
    const proposal = JSON.stringify(result.decision ?? null);
    const correction = JSON.stringify({
      type: "proposal_rejected",
      code: feedback.code,
      message: feedback.message,
      instruction:
        "Use the unchanged task and authority. Correct the proposal; do not repeat a rejected proposal or claim execution.",
    });
    if (proposal.length > 8192 || correction.length > 4096) return finish("input_limit");
    const next = {
      ...input,
      messages: [...input.messages, { role: "assistant", content: proposal }, { role: "user", content: correction }],
    };
    if (!fits(next)) return finish("input_limit");
    if (policy.prepareRetry) {
      try {
        const expectedMessages = structuredClone(next.messages);
        const refreshInput = {
          ...next,
          model: structuredClone(next.model),
          messages: structuredClone(next.messages),
          schema: structuredClone(next.schema),
          ...(next.decisionEvidence ? { decisionEvidence: structuredClone(next.decisionEvidence) } : {}),
        };
        const refreshed = await policy.prepareRetry(refreshInput, { ...feedback });
        if (
          !isDeepStrictEqual(refreshed.model, authority.model) ||
          refreshed.signal !== authority.signal ||
          refreshed.maxOutputTokens !== authority.maxOutputTokens ||
          refreshed.onDispatch !== authority.onDispatch ||
          !isDeepStrictEqual(refreshed.outputContract, authority.outputContract) ||
          !isDeepStrictEqual(refreshed.decisionEvidence?.bindingId, authority.bindingId) ||
          !isDeepStrictEqual(refreshed.messages.slice(0, expectedMessages.length), expectedMessages) ||
          refreshed.messages.length < expectedMessages.length
        )
          throw new FleetError("REFRESH_SCOPE_CHANGE_REFUSED", true);
        if (!fits(refreshed)) return finish("input_limit");
        schema = compiler.compile(refreshed.schema);
        input = refreshed;
      } catch (error) {
        return finish("refresh_error", safeCode(error));
      }
    } else input = next;
  }
  return finish("attempt_limit");
}
