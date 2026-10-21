import { z } from "zod";
import type { Data } from "../domain.js";
import type { DomainTime } from "./contracts.js";

const clock = z.object({ clockId: z.string().min(1).max(100), value: z.string().min(1).max(200) }).strict();
export const WakeConditionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("event"), category: z.string().min(1).max(64) }).strict(),
  z.object({ kind: z.literal("reply"), requestId: z.uuid(), deadline: clock }).strict(),
  z.object({ kind: z.literal("deadline"), at: clock }).strict(),
  z.object({ kind: z.literal("periodic"), at: clock }).strict(),
  z
    .object({
      kind: z.literal("predicate"),
      name: z.string().min(1).max(100),
      version: z.string().min(1).max(40),
      args: z.record(z.string(), z.unknown()),
    })
    .strict(),
]);
export type WakeCondition = z.infer<typeof WakeConditionSchema>;
export type WakeFacts = { categories?: string[]; replies?: string[]; facts?: Data };
export type WakePredicates = ReadonlyMap<string, (args: Data, facts: Data) => boolean | undefined>;
export function compareDomainTime(at: DomainTime, now?: DomainTime): number | undefined {
  if (!now || at.clockId !== now.clockId) return undefined;
  if (at.clockId === "utc") {
    const a = Date.parse(at.value),
      b = Date.parse(now.value);
    return Number.isFinite(a) && Number.isFinite(b) ? Math.sign(b - a) : undefined;
  }
  if (!/^-?\d{1,40}$/.test(at.value) || !/^-?\d{1,40}$/.test(now.value)) return undefined;
  const a = BigInt(at.value),
    b = BigInt(now.value);
  return b === a ? 0 : b > a ? 1 : -1;
}
export function evaluateWake(
  raw: unknown,
  facts: WakeFacts,
  time?: DomainTime,
  predicates: WakePredicates = new Map(),
): "ready" | "waiting" | "unknown" {
  const parsed = WakeConditionSchema.safeParse(raw);
  if (!parsed.success) return "unknown";
  const condition = parsed.data;
  if (condition.kind === "predicate") {
    const predicate = predicates.get(`${condition.name}@${condition.version}`);
    if (!predicate || !facts.facts) return "unknown";
    try {
      const result = predicate(condition.args, facts.facts);
      return result === true ? "ready" : result === false ? "waiting" : "unknown";
    } catch {
      return "unknown";
    }
  }
  if (condition.kind === "event")
    return !facts.categories ? "unknown" : facts.categories.includes(condition.category) ? "ready" : "waiting";
  if (condition.kind === "reply" && facts.replies?.includes(condition.requestId)) return "ready";
  const comparison = compareDomainTime(condition.kind === "reply" ? condition.deadline : condition.at, time);
  return comparison === undefined ? "unknown" : comparison >= 0 ? "ready" : "waiting";
}
