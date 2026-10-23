import { type Data, FleetError, object } from "../../domain.js";

export const prospectiveReadSummary = "Read requested; result not yet observed.";

/** A specialist already has a current snapshot. Keep explicit scoped selectors,
 * including native empty args, but never offer another selector-free refresh. */
export function scopedReadProgressQuery(input: Data): Data | undefined {
  const visit = (raw: Data): Data | undefined => {
    // These are query alternatives, not nested tool argument schemas. Replace
    // their old refresh guidance together with the changed query grammar.
    const { description: _description, ...node } = raw;
    const key = Array.isArray(node.oneOf) ? "oneOf" : Array.isArray(node.anyOf) ? "anyOf" : undefined;
    if (key) {
      const variants = (node[key] as Data[]).flatMap((v) => {
        const constrained = visit(v);
        return constrained ? [constrained] : [];
      });
      return variants.length ? { ...node, [key]: variants } : undefined;
    }
    if (Array.isArray(node.required) && node.required.length) return node;
    if (node.additionalProperties !== false || node.$ref || node.allOf)
      throw new FleetError("READ_PROGRESS_QUERY_SCHEMA_REQUIRED", true);
    const selectors = Object.keys(object(node.properties));
    if (!selectors.length) return;
    return { anyOf: selectors.map((name) => ({ ...node, required: [name] })) };
  };
  const result = visit(structuredClone(input));
  return result
    ? {
        ...result,
        description:
          "Snapshot delivered; no empty refresh. Use scoped reads for missing facts; look up unknown tool schemas first. Displayed args are known. Reads grant nothing and have no result yet.",
      }
    : undefined;
}

/** Defense in depth for providers/ports that bypass the generated grammar. */
export function assertReadProgressDecision(decision: Data, readsAllowed: boolean): void {
  if (decision.kind !== "read") return;
  if (!readsAllowed) throw new FleetError("FINAL_DECISION_REQUIRED", true);
  if (!Object.keys(object(decision.query)).length) throw new FleetError("EMPTY_REFRESH_FORBIDDEN", true);
  if (decision.summary !== prospectiveReadSummary) throw new FleetError("READ_RESULT_CLAIM_FORBIDDEN", true);
}
