import { isDeepStrictEqual } from "node:util";
import { type Data, FleetError, object } from "../../domain.js";

export const prospectiveReadSummary = "Read requested; result not yet observed.";

/** A specialist already has a current snapshot. Keep explicit scoped selectors,
 * including native empty args, but never offer another selector-free refresh. */
export function scopedReadProgressQuery(
  input: Data,
  pendingTool?: string,
  allowLookup = false,
  requiredArgs?: Data,
): Data | undefined {
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
    if (pendingTool) {
      const selector = object(object(node.properties).tool);
      if (selector.const !== pendingTool && !(Array.isArray(selector.enum) && selector.enum.includes(pendingTool))) {
        const metadata = object(object(node.properties).readSchema);
        if (
          !allowLookup ||
          (metadata.const !== pendingTool && !(Array.isArray(metadata.enum) && metadata.enum.includes(pendingTool)))
        )
          return;
        if (!Array.isArray(node.required) || !node.required.includes("readSchema"))
          throw new FleetError("READ_PROGRESS_QUERY_SCHEMA_REQUIRED", true);
        return { ...node, properties: { ...object(node.properties), readSchema: { ...metadata, const: pendingTool } } };
      }
      if (!Array.isArray(node.required) || !node.required.includes("tool") || !node.required.includes("args"))
        throw new FleetError("READ_PROGRESS_QUERY_SCHEMA_REQUIRED", true);
      return {
        ...node,
        properties: {
          ...object(node.properties),
          tool: { ...selector, const: pendingTool },
          ...(requiredArgs
            ? { args: { ...object(object(node.properties).args), const: structuredClone(requiredArgs) } }
            : {}),
        },
      };
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
export function assertReadProgressDecision(
  decision: Data,
  readsAllowed: boolean,
  pendingTool?: string,
  allowLookup = false,
  requiredArgs?: Data,
): void {
  if (
    readsAllowed &&
    pendingTool &&
    (decision.kind === "wait" ||
      (decision.kind === "read" &&
        object(decision.query).tool !== pendingTool &&
        !(allowLookup && object(decision.query).readSchema === pendingTool)))
  )
    throw new FleetError("SCOPED_READ_REQUIRED", true);
  if (decision.kind !== "read") return;
  if (
    pendingTool &&
    object(decision.query).tool === pendingTool &&
    requiredArgs &&
    !isDeepStrictEqual(object(decision.query).args, requiredArgs)
  )
    throw new FleetError("SCOPED_READ_SCOPE_REQUIRED", true);
  if (!readsAllowed) throw new FleetError("FINAL_DECISION_REQUIRED", true);
  if (!Object.keys(object(decision.query)).length) throw new FleetError("EMPTY_REFRESH_FORBIDDEN", true);
  if (decision.summary !== prospectiveReadSummary) throw new FleetError("READ_RESULT_CLAIM_FORBIDDEN", true);
}
