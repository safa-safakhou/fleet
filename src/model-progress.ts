import { FleetError } from "./domain.js";
/** Progress is diagnostic only; it cannot settle usage or authorize a retry. */
export type GenerationProgress = {
  requestId: string;
  firstContentMs: number | null;
  elapsedMs: number;
  contentChars: number;
  chunks: number;
  maxWhitespaceRun: number;
  finishReason: string | null;
  /** Count only; private reasoning content is never retained. */
  reasoningChars?: number;
  wireBytes?: number;
  /** Classification only: provider messages may contain prompts or credentials. */
  providerError?: { category: "unsupported_schema_keyword" | "provider_rejection"; unsupportedKeys?: string[] };
};
export class ModelTransportError extends FleetError {
  constructor(
    code: string,
    readonly progress: GenerationProgress,
  ) {
    super(code);
  }
}
export function modelFailureProgress(error: unknown) {
  return error instanceof ModelTransportError ? error.progress : undefined;
}
