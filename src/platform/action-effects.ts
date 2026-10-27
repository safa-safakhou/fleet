import { createHash } from "node:crypto";
import { z } from "zod";
import { consumeClaimCapacity } from "../claim-capacity.js";
import type { ActionIntent } from "./contracts.js";

const id = z.string().min(1).max(2000),
  units = z.string().regex(/^(0|[1-9]\d{0,39})$/);
export const StructuredClaimSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("resource"), schemaId: id, key: id, units }).strict(),
  z.object({ kind: z.literal("authority"), schemaId: id, key: id, units }).strict(),
  z.object({ kind: z.literal("promise"), schemaId: id, key: id, value: z.string().max(4000) }).strict(),
]);
export const ActionEffectsSchema = z
  .object({
    schemaVersion: z.literal("fleet.action-effects.v1"),
    revision: id,
    intentDigest: z.string().regex(/^[a-f0-9]{64}$/),
    actionKey: id,
    claims: z.array(StructuredClaimSchema).min(1).max(32),
    capacities: z.array(z.object({ schemaId: id, key: id, remainingUnits: units }).strict()).max(64),
    sourceRefs: z.array(z.string().min(1).max(8000)).min(1).max(100),
    validUntil: z.object({ clockId: id, value: id }).strict(),
    coverage: z.object({ complete: z.boolean(), omitted: z.array(z.string().max(1000)).max(100) }).strict(),
    supported: z.boolean(),
  })
  .strict();
export type ActionEffects = z.infer<typeof ActionEffectsSchema>;
export type EffectClaim = z.infer<typeof StructuredClaimSchema>;
export function fitsClaimCapacities(claims: EffectClaim[], capacities: ActionEffects["capacities"]) {
  const pools = new Map(capacities.map((c) => [JSON.stringify([c.schemaId, c.key]), BigInt(c.remainingUnits)]));
  return claims.every((c) => c.kind === "promise" || !consumeClaimCapacity(pools, c));
}
function canonical(value: unknown): unknown {
  return Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .filter(([, v]) => v !== undefined)
            .sort(([a], [b]) => a.localeCompare(b, "en"))
            .map(([k, v]) => [k, canonical(v)]),
        )
      : value;
}
export function actionIntentDigest(intent: ActionIntent) {
  const { guard: _guard, ...bare } = intent;
  return createHash("sha256")
    .update(JSON.stringify(canonical(bare)))
    .digest("hex");
}
