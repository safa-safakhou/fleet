/** Compatibility exports for historical clients; generic identity lives in architecture.ts. */

export type { LegacyExecution, LegacyManifest } from "../engines/legacy/execution.js";
export {
  currentLegacyClaim,
  inferredLegacyExecution,
  legacyExecutionFor,
  legacyManifestFor,
  legacyProfileFor,
  retainedLegacyExecution,
  withLegacyExecution,
} from "../engines/legacy/execution.js";
export type { EngineProfileRef } from "./architecture.js";
