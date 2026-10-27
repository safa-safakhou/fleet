/** Spend exact quoted units, including repeated claims against the same pool. Missing is not zero. */
export function consumeClaimCapacity(
  pools: Map<string, bigint>,
  claim: { schemaId: string; key: string; units: string },
) {
  const key = JSON.stringify([claim.schemaId, claim.key]),
    available = pools.get(key);
  if (available === undefined) return "UNKNOWN_CLAIM_CAPACITY";
  if (BigInt(claim.units) > available) return "STRUCTURED_CAPACITY_CONFLICT";
  pools.set(key, available - BigInt(claim.units));
}
