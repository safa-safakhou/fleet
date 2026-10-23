import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { type Data, FleetError, object, type Tool } from "../../domain.js";
import type { RequestedFact } from "../../platform/contracts.js";

const request = z
  .object({
    entityRef: z.string().min(1).max(120),
    id: z.string().min(1).max(120),
    tool: z
      .string()
      .regex(/^pact_[a-z0-9_]+$/)
      .max(100),
    args: z.record(z.string(), z.unknown()),
    path: z
      .array(
        z
          .string()
          .min(1)
          .max(100)
          .refine((v) => !["__proto__", "prototype", "constructor"].includes(v)),
      )
      .min(1)
      .max(8),
  })
  .strict();
export type PactFactRequest = z.infer<typeof request>;
/** Operator configuration only. Neither goals, peer text nor model output author requests. */
export function parsePactFactRequests(value: string | undefined): PactFactRequest[] {
  if (value === undefined) return [];
  try {
    if (Buffer.byteLength(value) > 16000) throw Error();
    const requests = z.array(request).max(32).parse(JSON.parse(value));
    const scopes = new Map<string, Set<string>>();
    for (const r of requests) {
      const ids = scopes.get(r.entityRef) ?? new Set<string>();
      if (ids.has(r.id) || ids.size >= 8) throw Error();
      ids.add(r.id);
      scopes.set(r.entityRef, ids);
    }
    return requests;
  } catch {
    throw new FleetError("PACT_FACT_REQUESTS_INVALID", true);
  }
}
export function createPactFactTracker(input: PactFactRequest[], entityRef: string) {
  const requests = parsePactFactRequests(JSON.stringify(input)).filter((r) => r.entityRef === entityRef);
  let states: RequestedFact[] = requests.map((r) => ({ id: r.id, tool: r.tool, args: r.args, state: "unknown" }));
  return {
    update(query: Data, result: unknown, catalog: Tool[]): RequestedFact[] {
      states = requests.map((r, index): RequestedFact => {
        const base = { id: r.id, tool: r.tool, args: r.args };
        if (!catalog.some((t) => t.name === r.tool && t.annotations?.readOnlyHint === true))
          return { ...base, state: "blocked", code: "READ_TOOL_UNAVAILABLE" };
        if (query.tool !== r.tool || !isDeepStrictEqual(object(query.args), r.args))
          return states[index].state === "blocked" ? { ...base, state: "unknown" } : states[index];
        let value = result;
        for (const part of r.path) {
          if (!value || typeof value !== "object" || !Object.hasOwn(value, part)) return { ...base, state: "unknown" };
          value = (value as Data)[part];
        }
        return value === undefined
          ? { ...base, state: "unknown" }
          : { ...base, state: "known", value: structuredClone(value) };
      });
      return structuredClone(states);
    },
  };
}
