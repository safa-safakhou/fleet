import { FleetError } from "../domain.js";

/** A failed attempt whose exact allocation is already reported in the native ledger.
 * This is accounting evidence, never permission to retry or execute a partial proposal. */
export class SettledModelAttemptFailure extends FleetError {
  constructor(
    code: string,
    readonly usage: { allocationId: string; inputTokens: number; outputTokens: number },
  ) {
    super(code);
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(usage.allocationId) ||
      !Number.isSafeInteger(usage.inputTokens) ||
      usage.inputTokens < 0 ||
      !Number.isSafeInteger(usage.outputTokens) ||
      usage.outputTokens < 0
    )
      throw new Error("INVALID_SETTLED_USAGE");
  }
}
