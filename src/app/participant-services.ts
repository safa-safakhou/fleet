import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { transaction } from "../db.js";
import { FleetError } from "../domain.js";
import { reviseGoals } from "../engines/autonomous-specialists/goals.js";
import type { ScopedEvidence } from "../platform/engine-context.js";
import {
  CharterSchema,
  type SpecialistCharter,
  type SpecialistEnvelope,
  SpecialistEnvelopeSchema,
  type SpecialistScope,
  SpecialistScopeSchema,
  type SpecialistState,
} from "../platform/participant-state.js";
import type { Store } from "../store.js";

type Bound = Pick<SpecialistScope, "instanceId" | "bindingId">;
type PrivateState = Pick<SpecialistState, "goals" | "memories" | "predictions" | "plan">;
const empty = (): PrivateState => ({ goals: [], memories: [], predictions: [], plan: null });
const requestSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    operationId: z.uuid(),
    envelope: SpecialistEnvelopeSchema,
  })
  .strict();

/** Composition owns the binding and task guard; model output never supplies either. */
export class SpecialistRepository {
  constructor(
    private store: Store,
    private bound: Bound,
    private guard: (db: PoolClient) => Promise<void> = async () => {},
    private effects?: (
      db: PoolClient,
      scope: SpecialistScope,
      operationId: string,
      envelope: SpecialistEnvelope,
    ) => Promise<void>,
    private intentWithin?: (
      db: PoolClient,
      scope: SpecialistScope,
      operationId: string,
      intent: Record<string, unknown>,
    ) => Promise<void>,
  ) {}
  private scope(scope: SpecialistScope) {
    const value = SpecialistScopeSchema.parse(scope);
    if (value.instanceId !== this.bound.instanceId || value.bindingId !== this.bound.bindingId)
      throw new FleetError("SPECIALIST_SCOPE_MISMATCH");
    return [value.instanceId, value.bindingId, value.specialistId];
  }
  private aad(scope: SpecialistScope, kind: string) {
    return `specialist:${JSON.stringify(this.scope(scope))}:${kind}:1`;
  }
  private cutoff() {
    return new Date(this.store.now().getTime() - 30 * 86400000);
  }
  private async consent(db: PoolClient) {
    const row = (
      await db.query(
        "SELECT c.observation_consent FROM environment_bindings b JOIN agents a ON a.id=b.agent_id JOIN cohorts c ON c.id=a.cohort_id WHERE b.id=$1 AND b.state='active' FOR UPDATE OF c",
        [this.bound.bindingId],
      )
    ).rows[0];
    if (!row) throw new FleetError("SPECIALIST_SCOPE_MISMATCH");
    if (!row.observation_consent) throw new FleetError("CONSENT_REQUIRED");
    await this.guard(db);
  }
  async initialize(raw: unknown) {
    const charters = z.array(CharterSchema).min(1).max(4).parse(raw);
    if (new Set(charters.map((c) => c.id)).size !== charters.length) throw new FleetError("DUPLICATE_SPECIALIST");
    await transaction(this.store.pool, async (db) => {
      await this.consent(db);
      const enrolled = (
        await db.query(
          "SELECT specialist_id FROM specialist_states WHERE instance_id=$1 AND binding_id=$2 ORDER BY specialist_id",
          [this.bound.instanceId, this.bound.bindingId],
        )
      ).rows.map((r) => r.specialist_id);
      if (enrolled.length && JSON.stringify(enrolled) !== JSON.stringify(charters.map((c) => c.id).sort()))
        throw new FleetError("SPECIALIST_ROSTER_IMMUTABLE");
      await db.query(
        "INSERT INTO specialist_instances VALUES($1,$2,'autonomous-specialists','1',$3) ON CONFLICT DO NOTHING",
        [this.bound.instanceId, this.bound.bindingId, this.store.now()],
      );
      for (const charter of charters) {
        const scope = { ...this.bound, specialistId: charter.id },
          args = this.scope(scope);
        const old = (
          await db.query(
            "SELECT charter_cipher FROM specialist_states WHERE instance_id=$1 AND binding_id=$2 AND specialist_id=$3",
            args,
          )
        ).rows[0];
        if (old) {
          if (
            JSON.stringify(this.store.vault.decrypt(old.charter_cipher, this.aad(scope, "charter"))) !==
            JSON.stringify(charter)
          )
            throw new FleetError("CHARTER_IMMUTABLE");
          continue;
        }
        await db.query(
          "INSERT INTO specialist_states(instance_id,binding_id,specialist_id,charter_revision,charter_cipher,updated_at) VALUES($1,$2,$3,$4,$5,$6)",
          [...args, charter.revision, this.store.vault.encrypt(charter, this.aad(scope, "charter")), this.store.now()],
        );
      }
    });
  }
  private async support(db: PoolClient, scope: SpecialistScope, ids: string[]) {
    if (!ids.length) return new Map<string, ScopedEvidence>();
    const rows = (
      await db.query(
        "SELECT id,detail_cipher FROM architecture_scoped_evidence WHERE instance_id=$1 AND binding_id=$2 AND id=ANY($3::uuid[]) AND created_at>$4",
        [scope.instanceId, scope.bindingId, ids, this.cutoff()],
      )
    ).rows;
    return new Map(
      rows.map((r) => [
        r.id,
        this.store.vault.decrypt<ScopedEvidence>(
          r.detail_cipher,
          `architecture-evidence:${scope.instanceId}:${scope.bindingId}:${r.id}`,
        ),
      ]),
    );
  }
  private async readWithin(db: PoolClient, scope: SpecialistScope, lock = false): Promise<SpecialistState> {
    const row = (
      await db.query(
        `SELECT * FROM specialist_states WHERE instance_id=$1 AND binding_id=$2 AND specialist_id=$3${lock ? " FOR UPDATE" : ""}`,
        this.scope(scope),
      )
    ).rows[0];
    if (!row) throw new FleetError("UNKNOWN_SPECIALIST");
    const base = {
      version: row.version,
      charterVersion: row.charter_revision,
      charter: this.store.vault.decrypt<SpecialistCharter>(row.charter_cipher, this.aad(scope, "charter")),
    };
    if (!row.state_cipher || new Date(row.updated_at) <= this.cutoff()) {
      const count = (
        await db.query(
          "SELECT count(*)::int n FROM specialist_goals WHERE instance_id=$1 AND binding_id=$2 AND specialist_id=$3",
          this.scope(scope),
        )
      ).rows[0].n;
      return {
        ...base,
        ...empty(),
        coverage: {
          complete: row.version === 0,
          omittedGoals: count,
          omittedMemories: 0,
          ...(row.version ? { reason: "PRIVATE_STATE_UNAVAILABLE" } : {}),
        },
      };
    }
    const state = this.store.vault.decrypt<PrivateState>(row.state_cipher, this.aad(scope, "state")),
      support = await this.support(db, scope, row.support_ids);
    const available = (x: { evidenceIds: string[] }) => x.evidenceIds.every((id) => support.has(id));
    const goals = state.goals.filter(available),
      memories = state.memories.filter(available),
      predictions = state.predictions.filter(available),
      complete =
        goals.length === state.goals.length &&
        memories.length === state.memories.length &&
        predictions.length === state.predictions.length;
    return {
      ...base,
      goals,
      memories,
      predictions,
      plan: complete ? state.plan : null,
      coverage: {
        complete,
        omittedGoals: state.goals.length - goals.length,
        omittedMemories: state.memories.length + state.predictions.length - memories.length - predictions.length,
        ...(!complete ? { reason: "SUPPORT_UNAVAILABLE" } : {}),
      },
    };
  }
  async load(scope: SpecialistScope) {
    this.scope(scope);
    return transaction(this.store.pool, async (db) => {
      await this.consent(db);
      return this.readWithin(db, scope);
    });
  }
  async accept(scope: SpecialistScope, raw: unknown) {
    const args = this.scope(scope),
      input = requestSchema.parse(raw),
      envelope = input.envelope;
    if (Buffer.byteLength(JSON.stringify(envelope)) > 64000) throw new FleetError("SPECIALIST_DATA_LIMIT");
    if (
      (envelope.intent && !this.intentWithin) ||
      (!this.effects && (envelope.messages.length || envelope.deliveryIds.length || envelope.wakeConditions.length))
    )
      throw new FleetError("UNSUPPORTED_SPECIALIST_EFFECT");
    return transaction(this.store.pool, async (db) => {
      await this.consent(db);
      const current = await this.readWithin(db, scope, true);
      const digest = createHash("sha256").update(JSON.stringify(input)).digest("hex");
      const prior = (
        await db.query(
          "SELECT digest,version FROM specialist_updates WHERE instance_id=$1 AND binding_id=$2 AND specialist_id=$3 AND operation_id=$4",
          [...args, input.operationId],
        )
      ).rows[0];
      if (prior) {
        if (prior.digest !== digest) throw new FleetError("IDEMPOTENCY_CONFLICT");
        return { version: prior.version as number, accepted: true };
      }
      if (input.expectedVersion !== current.version) throw new FleetError("STALE_STATE_VERSION");
      const state = this.revise(current, envelope),
        supportIds = [
          ...new Set([...state.goals, ...state.memories, ...state.predictions].flatMap((g) => g.evidenceIds)),
        ];
      const support = await this.support(db, scope, supportIds);
      if (support.size !== supportIds.length) throw new FleetError("SUPPORT_UNAVAILABLE");
      for (const goal of envelope.goals)
        if (
          goal.status === "completed" &&
          !goal.evidenceIds.some((id) => {
            const record = support.get(id);
            return record?.kind === "outcome" && record.detail.fulfilled === true;
          })
        )
          throw new FleetError("GOAL_OUTCOME_REQUIRED");
      const version = current.version + 1;
      await this.effects?.(db, scope, input.operationId, envelope);
      if (envelope.intent) await this.intentWithin?.(db, scope, input.operationId, envelope.intent);
      await db.query(
        "UPDATE specialist_states SET version=$4,state_cipher=$5,support_ids=$6,updated_at=$7 WHERE instance_id=$1 AND binding_id=$2 AND specialist_id=$3",
        [...args, version, this.store.vault.encrypt(state, this.aad(scope, "state")), supportIds, this.store.now()],
      );
      for (const goal of state.goals)
        await db.query(
          "INSERT INTO specialist_goals VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(instance_id,binding_id,specialist_id,goal_id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at",
          [...args, goal.id, goal.status, this.store.now()],
        );
      await db.query("INSERT INTO specialist_updates VALUES($1,$2,$3,$4,$5,$6,$7)", [
        ...args,
        input.operationId,
        digest,
        version,
        this.store.now(),
      ]);
      return { version, accepted: true };
    });
  }
  private revise(current: SpecialistState, envelope: SpecialistEnvelope): PrivateState {
    const merge = <T extends { id: string }>(previous: T[], next: T[]) => {
      const records = new Map(previous.map((v) => [v.id, v]));
      if (new Set(next.map((v) => v.id)).size !== next.length) throw new FleetError("DUPLICATE_MEMORY");
      for (const v of next) records.set(v.id, v);
      if (records.size > 128) throw new FleetError("MEMORY_LIMIT");
      return [...records.values()];
    };
    return {
      goals: reviseGoals(current.goals, envelope.goals, current.charter),
      memories: merge(current.memories, envelope.memories),
      predictions: merge(current.predictions, envelope.predictions),
      plan: envelope.plan,
    };
  }
}
