import { isDeepStrictEqual } from "node:util";
import { FleetError, object } from "../../domain.js";
import type { RequestedFact } from "../../platform/contracts.js";

export const unresolvedFactSummary = "Requested facts remain unresolved; no result is asserted.";

export function parseRequestedFacts(value: unknown): RequestedFact[] {
  if (value === undefined) return [];
  const invalid = () => {
    throw new FleetError("REQUESTED_FACT_STATE_INVALID", true);
  };
  if (!Array.isArray(value) || value.length > 8) return invalid();
  const ids = new Set<string>();
  for (const raw of value) {
    const fact = object(raw);
    if (
      typeof fact.id !== "string" ||
      !fact.id.length ||
      fact.id.length > 120 ||
      ids.has(fact.id) ||
      typeof fact.tool !== "string" ||
      !fact.tool.length ||
      fact.tool.length > 100
    )
      return invalid();
    ids.add(fact.id);
    const keys =
      fact.state === "known"
        ? ["id", "tool", "state", "value"]
        : fact.state === "blocked"
          ? ["id", "tool", "state", "code"]
          : ["id", "tool", "state"];
    if (
      Object.keys(fact).some((key) => key !== "args" && !keys.includes(key)) ||
      (Object.hasOwn(fact, "args") && (!fact.args || typeof fact.args !== "object" || Array.isArray(fact.args))) ||
      !["unknown", "known", "blocked"].includes(String(fact.state))
    )
      return invalid();
    if (fact.state === "known" && (!Object.hasOwn(fact, "value") || fact.value === undefined)) return invalid();
    if (fact.state === "blocked" && (typeof fact.code !== "string" || !/^[A-Z][A-Z0-9_]{1,79}$/.test(fact.code)))
      return invalid();
  }
  try {
    if (Buffer.byteLength(JSON.stringify(value)) > 8000) return invalid();
  } catch {
    return invalid();
  }
  return structuredClone(value) as RequestedFact[];
}

/** Only the matching real observation port may promote a pending value. Missing
 * metadata never completes a request; an adapter cannot silently change scope. */
export function reconcileRequestedFacts(previous: unknown, incoming: unknown, readTool?: string): RequestedFact[] {
  const prior = parseRequestedFacts(previous),
    next = parseRequestedFacts(incoming);
  for (const fact of next) {
    const old = prior.find((p) => p.id === fact.id);
    if (!old || old.tool !== fact.tool || !isDeepStrictEqual(old.args, fact.args))
      throw new FleetError("REQUESTED_FACT_SCOPE_CHANGED", true);
    if (fact.state === "known" && !isDeepStrictEqual(fact, old) && readTool !== fact.tool)
      throw new FleetError("REQUESTED_FACT_RESULT_UNREAD", true);
  }
  return prior.map((fact) => next.find((n) => n.id === fact.id) ?? fact);
}
