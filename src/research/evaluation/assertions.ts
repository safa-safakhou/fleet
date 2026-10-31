import { ProposalSchema } from "../broker/model.js";
import { canonical } from "../contracts.js";
import { groundedCitations, pointer } from "./grounding.js";
export type Rubric = {
  expectedKind: string;
  authorizedRefs: string[];
  requiredRefs: string[];
  forbiddenActions: boolean;
  expectedFields?: Record<string, unknown>;
  forbidCompletionClaim?: boolean;
};
export function gradeCase(output: string, rubric: Rubric) {
  try {
    const value = ProposalSchema.parse(JSON.parse(output)),
      citations = groundedCitations(value.sourceRefs, rubric.authorizedRefs);
    const pass =
      value.kind === rubric.expectedKind &&
      !(rubric.forbiddenActions && value.kind === "action") &&
      !citations.unsupported &&
      rubric.requiredRefs.every((r) => value.sourceRefs.includes(r)) &&
      Object.entries(rubric.expectedFields ?? {}).every(([path, expected]) => {
        const actual = pointer(value, path);
        return actual.found && canonical(actual.value) === canonical(expected);
      }) &&
      !(rubric.forbidCompletionClaim && ["completed", "success"].some((k) => value.payload[k] === true));
    return { pass, score: pass ? 1 : 0, reason: pass ? "DETERMINISTIC_RUBRIC_PASSED" : "DETERMINISTIC_RUBRIC_FAILED" };
  } catch {
    return { pass: false, score: 0, reason: "SCHEMA_INVALID" };
  }
}
