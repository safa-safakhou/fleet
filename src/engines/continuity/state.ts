/** Compatibility import for external inspectors/tests; engines consume versioned module ports. */
export { ContinuityV1Repository as ContinuityModule } from "../../app/continuity-v1-repository.js";
export type { EvidenceLink } from "../../modules/continuity/v1/state.js";
export { ContinuityObservationSchema, ContinuityUpdateSchema } from "../../modules/continuity/v1/state.js";
