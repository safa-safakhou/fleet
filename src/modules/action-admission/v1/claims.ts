import type { ActionEffects, EffectClaim } from "../../../platform/action-effects.js";

const key = (c: { schemaId: string; key: string }) => JSON.stringify([c.schemaId, c.key]);
export function validateClaims(effects: ActionEffects, pending: EffectClaim[][]): string[] {
  return checkClaims(effects, pending).reasons;
}
export function checkClaims(effects: ActionEffects, pending: EffectClaim[][]) {
  const reasons = new Set<string>();
  if (!effects.supported || !effects.coverage.complete || effects.coverage.omitted.length)
    reasons.add("INCOMPLETE_ACTION_EFFECTS");
  const capacities = new Map<string, bigint>();
  for (const c of effects.capacities) {
    const k = key(c);
    if (capacities.has(k)) reasons.add("DUPLICATE_CLAIM_CAPACITY");
    capacities.set(k, BigInt(c.remainingUnits));
  }
  const requested = new Map<string, { units: bigint; kind: "resource" | "authority" }>(),
    promises = new Map<string, string>();
  for (const c of effects.claims) {
    const k = key(c);
    if (c.kind === "promise") {
      if (promises.has(k) && promises.get(k) !== c.value) reasons.add("PROMISE_CLAIM_CONFLICT");
      promises.set(k, c.value);
      continue;
    }
    if (!capacities.has(k)) reasons.add("MISSING_CLAIM_CAPACITY");
    const old = requested.get(k);
    if (old && old.kind !== c.kind) reasons.add("CLAIM_SCHEMA_KIND_MISMATCH");
    requested.set(k, { kind: c.kind, units: (old?.units ?? 0n) + BigInt(c.units) });
  }
  for (const set of pending)
    for (const c of set) {
      const k = key(c);
      if (c.kind === "promise") {
        if (promises.has(k) && promises.get(k) !== c.value) reasons.add("PROMISE_CLAIM_CONFLICT");
        continue;
      }
      const old = requested.get(k);
      if (!old) continue;
      if (old.kind !== c.kind) reasons.add("CLAIM_SCHEMA_KIND_MISMATCH");
      old.units += BigInt(c.units);
    }
  for (const [k, request] of requested)
    if (request.units > (capacities.get(k) ?? 0n))
      reasons.add(request.kind === "resource" ? "RESOURCE_CLAIM_CONFLICT" : "AUTHORITY_CLAIM_CONFLICT");
  return {
    reasons: [...reasons],
    resourceRequirements: [...requested].map(([k, request]) => {
      const [schemaId, claimKey] = JSON.parse(k) as [string, string];
      return {
        schemaId,
        key: claimKey,
        kind: request.kind,
        requestedUnits: request.units.toString(),
        remainingUnits: (capacities.get(k) ?? 0n).toString(),
      };
    }),
  };
}
