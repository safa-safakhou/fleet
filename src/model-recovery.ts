import { setTimeout as delay } from "node:timers/promises";
import { Ajv } from "ajv";
import { FleetError, type ModelPort } from "./domain.js";
import { modelAbortCode } from "./model-deadline.js";
import { compileGenerationSchema } from "./model-schema.js";

type Request = Parameters<ModelPort["decide"]>[0];
type Result = Awaited<ReturnType<ModelPort["decide"]>>;
const recoverable = new Set(["MODEL_THINKING_WITHOUT_FINAL", "INVALID_MODEL_OUTPUT", "MODEL_OUTPUT_TRUNCATED"]);
export function recoverableOutput(code: string | undefined): boolean {
  return !!code && recoverable.has(code);
}
/** Only retries completed, accounted model outputs. Each attempt MUST reserve through its caller's ledger. */
export async function recoverModelOutput(
  request: Request,
  policy: {
    attempt: (request: Request, attempt: number) => Promise<Result>;
    canRetry: () => Promise<boolean>;
    inputByteLimit: number;
    onRetry?: (detail: { code: string; attempt: number; correctionDelivered: boolean }) => Promise<void>;
  },
) {
  if (
    Buffer.byteLength(JSON.stringify(request.messages)) + Buffer.byteLength(JSON.stringify(request.schema)) >
    policy.inputByteLimit
  )
    throw new FleetError("MODEL_REQUEST_NOT_ADMITTED", true);
  const validate = new Ajv({ strict: false, validateFormats: false, allErrors: true }).compile(request.schema);
  const nativeContract = request.outputContract ? compileGenerationSchema(request.outputContract) : undefined;
  let input = request,
    previous: Result | undefined;
  for (let attempt = 1; ; attempt++) {
    if (request.signal.aborted) throw new FleetError(modelAbortCode(request.signal.reason), true);
    let raw: Result;
    try {
      raw = await policy.attempt(input, attempt);
    } catch (error) {
      if (
        previous &&
        error instanceof FleetError &&
        (["TURN_CALL_LIMIT", "BUDGET_EXHAUSTED", "MODEL_RETRY_BUDGET"].includes(error.code) ||
          (error.code === "RUN_WINDOW_MODEL_DRAINING" && error.notDispatched))
      )
        return previous;
      throw error;
    }
    if (request.signal.aborted) throw new FleetError(modelAbortCode(request.signal.reason), true);
    const result =
      !raw.decisionError && (!validate(raw.decision) || (nativeContract && !nativeContract(raw.decision)))
        ? { ...raw, decisionError: "INVALID_MODEL_OUTPUT" }
        : raw;
    const known = [result.inputTokens, result.outputTokens].every(
      (n) => n !== null && Number.isSafeInteger(n) && n >= 0,
    );
    const code = result.decisionError;
    if (!known || !code || !recoverableOutput(code) || attempt >= 2) return result;
    if (request.signal.aborted) throw new FleetError(modelAbortCode(request.signal.reason), true);
    if (!(await policy.canRetry())) return result;
    const correction =
      "The previous response did not provide a valid final answer. Return one complete JSON value matching the supplied schema. If reasoning is enabled, finish it and provide the final answer. Keep the same task, evidence and authority; do not invent outcomes.";
    const messages = request.messages.map((m, i) =>
      i === 0 && m.role === "system" ? { ...m, content: `${m.content}\n${correction}` } : m,
    );
    if (messages[0]?.role !== "system") messages.unshift({ role: "system", content: correction });
    const fits =
      Buffer.byteLength(JSON.stringify(messages)) + Buffer.byteLength(JSON.stringify(request.schema)) <=
      policy.inputByteLimit;
    // A correction must reach the model. Do not spend another call on identical
    // failed input or remove evidence to make space for feedback.
    if (!fits) return result;
    input = { ...request, messages };
    await policy.onRetry?.({ code, attempt: attempt + 1, correctionDelivered: true });
    try {
      await delay(100, undefined, { signal: request.signal });
    } catch {
      throw new FleetError(modelAbortCode(request.signal.reason), true);
    }
    // A concurrent reservation may consume the final slot; preserve the known failed output then.
    previous = result;
  }
}
