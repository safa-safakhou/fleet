import { validateClaims } from "../../modules/action-admission/v1/claims.js";
import type { ActionIntent } from "../../platform/contracts.js";
import type { ActionEffects } from "../../platform/engine-context.js";
export type ConflictIntent = {
  id: string;
  specialistId: string;
  goalIds: string[];
  intent: ActionIntent;
  effects: ActionEffects;
};
export type ConflictPolicy = {
  version: string;
  priorities: Record<string, number>;
  obligationIntentIds: string[];
  deadlines: Record<string, { at: string; sourceRef: string }>;
  pendingCommandIds: string[];
};
export type ConflictResult = { kind: "admit" | "negotiate" | "blocked"; eligibleIntentIds: string[]; reason: string };
export type ConflictRecord = {
  id: string;
  rootId: string;
  round: number;
  revision: string;
  resourceKeys: string[];
  intents: ConflictIntent[];
  policy: ConflictPolicy;
  result: ConflictResult;
};
/** Policy is trusted owner/environment metadata; prose and role names never rank intents. */
export function resolveConflict(
  conflict: { round: number; intents: ConflictIntent[] },
  ownerPolicy: ConflictPolicy,
): ConflictResult {
  const blocked = (reason: string): ConflictResult => ({ kind: "blocked", eligibleIntentIds: [], reason });
  if (ownerPolicy.pendingCommandIds.length) return blocked("PENDING_COMMAND");
  if (
    !Number.isInteger(conflict.round) ||
    conflict.round < 0 ||
    conflict.round > 2 ||
    !conflict.intents.length ||
    conflict.intents.length > 4
  )
    return blocked("INVALID_CONFLICT");
  if (new Set(conflict.intents.map((i) => i.effects.revision)).size !== 1) return blocked("STALE_CONFLICT_SNAPSHOT");
  if (conflict.intents.some((i) => validateClaims(i.effects, []).length))
    return blocked("RESOURCE_OR_AUTHORITY_SHORTAGE");
  const tuple = (i: ConflictIntent) => {
    const p = ownerPolicy.priorities[i.id],
      d = ownerPolicy.deadlines[i.id],
      at = d?.sourceRef ? Date.parse(d.at) : Number.NaN;
    return [
      ownerPolicy.obligationIntentIds.includes(i.id) ? 1 : 0,
      Number.isInteger(p) && p >= 0 && p <= 100 ? p : 0,
      Number.isFinite(at) ? -at : -Infinity,
    ];
  };
  const compare = (a: ConflictIntent, b: ConflictIntent) => {
    const x = tuple(a),
      y = tuple(b);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] > y[i] ? -1 : 1;
    return 0;
  };
  const sorted = [...conflict.intents].sort((a, b) => compare(a, b) || a.id.localeCompare(b.id)),
    eligible: ConflictIntent[] = [];
  for (let start = 0; start < sorted.length; ) {
    let end = start + 1;
    while (end < sorted.length && compare(sorted[start], sorted[end]) === 0) end++;
    const group = sorted.slice(start, end),
      proposed = [...eligible];
    let fits = true;
    for (const i of group) {
      if (
        validateClaims(
          i.effects,
          proposed.map((p) => p.effects.claims),
        ).length
      ) {
        fits = false;
        break;
      }
      proposed.push(i);
    }
    if (fits) eligible.push(...group);
    else if (group.length > 1)
      return conflict.round >= 2
        ? blocked("CONFLICT_ROUND_LIMIT")
        : { kind: "negotiate", eligibleIntentIds: eligible.map((i) => i.id), reason: "PEER_REVISION_REQUIRED" };
    start = end;
  }
  return eligible.length
    ? {
        kind: "admit",
        eligibleIntentIds: eligible.map((i) => i.id),
        reason: eligible.length === sorted.length ? "COMPATIBLE_INTENTS" : "OWNER_POLICY_PRECEDENCE",
      }
    : blocked("RESOURCE_OR_AUTHORITY_SHORTAGE");
}
