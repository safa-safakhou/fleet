import type { Data } from "../../../domain.js";
import type { ActionEffects } from "../../../platform/action-effects.js";
import type { PrimitiveRegistry } from "./primitives.js";
import type { QualificationPolicy, TrustedCaseSet } from "./qualification.js";
import type { SkillVersion } from "./schema.js";
/** Adapter-owned code. Never constructed from a model response. */
export type SkillSupport = {
  registry: PrimitiveRegistry;
  policy: QualificationPolicy;
  cases(skill: SkillVersion): TrustedCaseSet | undefined;
  schemaId: string;
  templates?: Data[];
  reserveConstraints?(inputs: Data, effects: ActionEffects): Record<string, string>;
};
