import { FleetError } from "../domain.js";
import { designDigest, type NegotiationCell } from "../negotiation-plan.js";
import type { NativeAccounting, NegotiationBinding } from "../negotiation-run.js";
import type { Store } from "../store.js";
/** Durable nonce control; never stores private grants or a second spend counter.
 * Terminal nonce markers are intentionally not pruned or made reusable.
 */
export class NegotiationNonceStore {
  constructor(private store: Store) {}
  async claimNonce(nonce: string, protocolDigest: string, grantDigest: string) {
    return Boolean(
      (
        await this.store.pool.query(
          "INSERT INTO negotiation_protocol_batches(nonce,protocol_digest,grant_digest,status,consumed_at) VALUES($1,$2,$3,'consumed',$4) ON CONFLICT DO NOTHING",
          [nonce, protocolDigest, grantDigest, this.store.now()],
        )
      ).rowCount,
    );
  }
  async finishNonce(nonce: string, status: string, resultDigest: string) {
    if (!["complete", "stopped"].includes(status)) throw new FleetError("INVALID_NEGOTIATION_TERMINAL_STATUS");
    const saved = await this.store.pool.query(
      "UPDATE negotiation_protocol_batches SET status=$2,finished_at=$3,result_digest=$4 WHERE nonce=$1 AND status='consumed'",
      [nonce, status, this.store.now(), resultDigest],
    );
    if (!saved.rowCount) throw new FleetError("NEGOTIATION_NONCE_ALREADY_TERMINAL");
  }
  async consumed(nonce: string) {
    return Boolean(
      (await this.store.pool.query("SELECT 1 FROM negotiation_protocol_batches WHERE nonce=$1", [nonce])).rowCount,
    );
  }
}
type WorldAccounting = Pick<
  NativeAccounting,
  | "ownershipValid"
  | "privacyValid"
  | "authorityValid"
  | "duplicateEffects"
  | "gameTimeMs"
  | "startGameTimeMs"
  | "nextScheduledGameTimeMs"
>;
/** Read-only Fleet view. The trusted owned-world adapter supplies normal clock
 * and material safety facts; this reader never connects to a game or provider.
 */
export async function readNativeNegotiationAccounting(
  store: Store,
  binding: NegotiationBinding,
  cell: Pick<NegotiationCell, "limits" | "profile">,
  world: WorldAccounting,
): Promise<NativeAccounting> {
  const cohort = await store.cohort(binding.cohortId),
    budget = cohort.budget;
  const roster = (
    await store.pool.query(
      "SELECT b.*,a.account_id,a.kingdom_id FROM environment_bindings b JOIN agents a ON a.id=b.agent_id WHERE a.cohort_id=$1 AND b.state='active' ORDER BY a.ordinal",
      [binding.cohortId],
    )
  ).rows;
  const profile = (
    await store.pool.query("SELECT profile_id,profile_version FROM cohort_engine_profiles WHERE cohort_id=$1", [
      binding.cohortId,
    ])
  ).rows[0];
  const allocations = (
    await store.pool.query(
      "SELECT l.*,a.kingdom_id FROM compute_ledger l JOIN turns t ON t.id=l.turn_id JOIN agents a ON a.id=t.agent_id WHERE l.cohort_id=$1 ORDER BY l.created_at,l.id",
      [binding.cohortId],
    )
  ).rows;
  const turns = (
    await store.pool.query(
      "SELECT t.id,a.kingdom_id FROM turns t JOIN agents a ON a.id=t.agent_id WHERE t.cohort_id=$1 ORDER BY t.started_at,t.id",
      [binding.cohortId],
    )
  ).rows;
  const pending = (
    await store.pool.query(
      "SELECT p.command_id FROM platform_commands p JOIN turns t ON t.id=p.turn_id WHERE t.cohort_id=$1 AND p.state IN('pending','unknown')",
      [binding.cohortId],
    )
  ).rows;
  const wake = (
    await store.pool.query("SELECT 1 FROM cohort_wake_policies WHERE cohort_id=$1 AND policy->>'enabled'='true'", [
      binding.cohortId,
    ])
  ).rowCount;
  const owned =
    roster.length === 2 &&
    roster.every(
      (r) =>
        binding.bindingIds.includes(r.id) &&
        binding.actorIds.includes(r.entity_ref) &&
        r.environment_id === "pact" &&
        r.environment_version === "1" &&
        r.instance_id === binding.worldId &&
        r.entity_ref === r.kingdom_id &&
        r.actor_ref === r.account_id &&
        r.account_ref === r.account_id,
    );
  const limits = Boolean(
    budget &&
      budget.mode === "finite" &&
      budget.callLimit === cell.limits.callsPerWorld &&
      budget.tokenLimit === cell.limits.reservedTokensPerWorld &&
      budget.perCallTokenLimit === 40000 &&
      budget.maxCallsPerTurn === 3 &&
      budget.maxOutputTokens === cell.limits.outputTokens &&
      budget.inputByteLimit === cell.limits.inputBytes &&
      budget.concurrency === 1 &&
      cohort.interval_minutes === 15 &&
      !wake,
  );
  return {
    ...world,
    ownershipValid: world.ownershipValid && owned,
    allocations: allocations.map((a) => ({
      id: a.id,
      actorId: a.kingdom_id,
      turnId: a.turn_id,
      reservedTokens: Number(a.tokens),
      inputTokens: a.input_tokens === null ? null : Number(a.input_tokens),
      outputTokens: a.output_tokens === null ? null : Number(a.output_tokens),
      status: a.status,
    })),
    turns: turns.map((t) => ({ actorId: t.kingdom_id, turnId: t.id })),
    inFlight: turns.length
      ? Number(
          (
            await store.pool.query("SELECT count(*) n FROM turns WHERE cohort_id=$1 AND state='running'", [
              binding.cohortId,
            ])
          ).rows[0].n,
        )
      : 0,
    uncertainCommands: pending.map((p) => p.command_id),
    limitsDigest: limits
      ? designDigest(cell.limits)
      : designDigest({ budget, interval: cohort.interval_minutes, wake }),
    profile: { id: profile?.profile_id ?? "unavailable", version: profile?.profile_version ?? "unavailable" },
    deadlineAt: budget?.deadlineAt ?? "1970-01-01T00:00:00Z",
  };
}
