import type { Data } from "../../../domain.js";
import type { ActionOutcome, Observation } from "../../../platform/contracts.js";
export interface ContinuityV1Ports {
  context(observation: Observation): Promise<Data>;
  restrict(context: Data): void;
  apply(expectedVersion: number, raw: unknown): Promise<{ accepted: boolean; version: number; code: string }>;
  recordCommand(result: ActionOutcome): Promise<void>;
}
