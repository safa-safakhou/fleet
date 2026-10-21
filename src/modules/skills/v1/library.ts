import type { SpecialistScope } from "../../../platform/participant-state.js";
import type { SkillCandidate, SkillRef, SkillStatus, SkillSummary, SkillVersion } from "./schema.js";
/** Public data-only port. Evaluation/qualification mutation is intentionally not an engine operation. */
export interface SkillLibrary {
  propose(scope: SpecialistScope, candidate: SkillCandidate): Promise<SkillRef>;
  publish(scope: SpecialistScope, ref: SkillRef): Promise<void>;
  adopt(scope: SpecialistScope, ref: SkillRef): Promise<void>;
  retrieve(scope: SpecialistScope, query: { goal: string; event: string; limit: number }): Promise<SkillSummary[]>;
  loadSelected(scope: SpecialistScope, refs: SkillRef[]): Promise<SkillVersion[]>;
}
export type SkillTransition = { expectedStatus: SkillStatus; nextStatus: SkillStatus; evaluationId?: string };
