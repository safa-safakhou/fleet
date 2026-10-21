import { z } from "zod";
import { designDigest } from "./negotiation-plan.js";
import { NegotiationGrantSchema } from "./negotiation-run.js";
import { prepareRC1Protocol, type RC1Protocol } from "./post-e3-plan.js";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const RC1GrantSchema = NegotiationGrantSchema.extend({
  schemaVersion: z.literal("fleet.rc1-grant.v2"),
  seedCommitment: hash,
  bundleDigest: hash,
}).strict();
export type RC1Grant = z.infer<typeof RC1GrantSchema>;
/** Validation is not an authorization source. Private operator grants and
 * platform policy approval are distinct from this pure scope/time check. */
export function validateRC1Grant(protocol: RC1Protocol, raw: unknown, now: number, usedNonces: readonly string[] = []) {
  const reasons: string[] = [];
  let canonical: RC1Protocol | undefined;
  try {
    canonical = prepareRC1Protocol(protocol.selection);
  } catch {
    /* Refuse malformed selections. */
  }
  if (!canonical || designDigest(canonical) !== designDigest(protocol)) reasons.push("RC1_PROTOCOL_CHANGED");
  const parsed = RC1GrantSchema.safeParse(raw);
  if (!parsed.success) return { valid: false, reasons: [...reasons, "RC1_EXACT_GRANT_REQUIRED"] };
  const grant = parsed.data;
  if (
    grant.protocolDigest !== protocol.digest ||
    grant.batchNonce !== protocol.selection.batchNonce ||
    grant.seedCommitment !== protocol.seedCommitment ||
    grant.bundleDigest !== protocol.selection.bundleDigest
  )
    reasons.push("RC1_GRANT_SCOPE");
  for (const field of ["sources", "modelDigest", "policyDigest", "settingsDigest"] as const)
    if (designDigest(grant[field]) !== designDigest(protocol.selection[field]))
      reasons.push("RC1_SOURCE_OR_SETTINGS_DRIFT");
  if (
    !Number.isSafeInteger(now) ||
    Date.parse(grant.startsAt) > now ||
    Date.parse(grant.cutoffAt) <= now ||
    Date.parse(grant.cutoffAt) <= Date.parse(grant.startsAt) ||
    Date.parse(grant.cutoffAt) - Date.parse(grant.startsAt) > protocol.maxima.wallDeadlineMs
  )
    reasons.push("RC1_UTC_WINDOW");
  if (usedNonces.includes(grant.batchNonce)) reasons.push("RC1_NONCE_CONSUMED");
  if (
    grant.bindings.length !== protocol.cells.length ||
    new Set(grant.bindings.map((b) => b.cellId)).size !== protocol.cells.length ||
    protocol.cells.some((c) => !grant.bindings.some((b) => b.cellId === c.id))
  )
    reasons.push("RC1_CELL_BINDINGS");
  const ids = new Set<string>();
  for (const b of grant.bindings) {
    for (const id of [b.worldId, b.controlWorldId, b.cohortId, ...b.actorIds, ...b.bindingIds]) {
      if (ids.has(id)) reasons.push("RC1_DUPLICATE_IDENTITY");
      ids.add(id);
    }
  }
  return { valid: reasons.length === 0, reasons: [...new Set(reasons)] };
}
