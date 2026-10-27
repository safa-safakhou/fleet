import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { FleetError, ProposalRejection } from "../../../domain.js";
import {
  type ActionEffects,
  ActionEffectsSchema,
  actionIntentDigest,
  type EffectClaim,
} from "../../../platform/action-effects.js";
import type { ActionIntent } from "../../../platform/contracts.js";
import type { SpecialistScope } from "../../../platform/participant-state.js";
import type { Store } from "../../../store.js";
import { checkClaims } from "./claims.js";
/** Caller owns the binding lock and the transaction including state and native command journal. */
export class ActionClaimRepository {
  constructor(private store: Store) {}
  async reserveWithin(db: PoolClient, scope: SpecialistScope, intent: ActionIntent, raw: ActionEffects) {
    if (intent.bindingId !== scope.bindingId) throw new FleetError("BINDING_MISMATCH", true);
    const effects = ActionEffectsSchema.parse(raw),
      intentDigest = actionIntentDigest(intent);
    if (effects.intentDigest !== intentDigest) throw new FleetError("EFFECT_INTENT_MISMATCH", true);
    await db.query("SELECT id FROM environment_bindings WHERE id=$1 FOR UPDATE", [scope.bindingId]);
    const old = (await db.query("SELECT * FROM specialist_claims WHERE command_id=$1", [intent.commandId])).rows[0];
    if (old) {
      if (
        old.intent_digest !== intentDigest ||
        old.instance_id !== scope.instanceId ||
        old.binding_id !== scope.bindingId ||
        old.specialist_id !== scope.specialistId
      )
        throw new FleetError("COMMAND_ID_REUSE", true);
      return old.id as string;
    }
    const rows = (
      await db.query(
        "SELECT * FROM specialist_claims WHERE binding_id=$1 AND status='held' ORDER BY created_at,id FOR UPDATE",
        [scope.bindingId],
      )
    ).rows;
    if (rows.length >= 128) throw new FleetError("PENDING_CLAIM_LIMIT", true);
    const pending = rows.map((r) => {
      if (!r.claims_cipher) throw new FleetError("PENDING_CLAIM_UNAVAILABLE", true);
      return this.store.vault.decrypt<EffectClaim[]>(
        r.claims_cipher,
        `specialist-claim:${r.instance_id}:${r.binding_id}:${r.command_id}`,
      );
    });
    const checked = checkClaims(effects, pending);
    if (checked.reasons.length) {
      const code = checked.reasons[0];
      if (["RESOURCE_CLAIM_CONFLICT", "AUTHORITY_CLAIM_CONFLICT", "PROMISE_CLAIM_CONFLICT"].includes(code))
        throw new ProposalRejection(
          code,
          "This proposal was not accepted or dispatched. Requested units include outstanding local claims; compare them with remaining units in the same native resource/authority bucket. Resource buckets are not interchangeable. Reconsider, read missing facts, or wait for a real change.",
          checked,
        );
      throw new FleetError(code, true);
    }
    const id = randomUUID();
    await db.query(
      "INSERT INTO specialist_claims(id,command_id,instance_id,binding_id,specialist_id,intent_digest,claims_cipher,valid_until,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)",
      [
        id,
        intent.commandId,
        scope.instanceId,
        scope.bindingId,
        scope.specialistId,
        intentDigest,
        this.store.vault.encrypt(
          effects.claims,
          `specialist-claim:${scope.instanceId}:${scope.bindingId}:${intent.commandId}`,
        ),
        effects.validUntil,
        this.store.now(),
      ],
    );
    return id;
  }
}
