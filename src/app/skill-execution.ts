import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { transaction } from "../db.js";
import { type Data, FleetError } from "../domain.js";
import type {
  Checkpoint,
  ExistingSkillGoal,
  Invocation,
  InvocationRepository,
} from "../modules/skills/v1/checkpoints.js";
import {
  minimumWorkLimits,
  type WorkKind,
  type WorkLedger,
  type WorkLimits,
  workKinds,
} from "../modules/skills/v1/costs.js";
import type { SkillRef } from "../modules/skills/v1/schema.js";
import { launchDigest } from "../platform/launch.js";
import { WorkLimitsSchema } from "../platform/launch-contracts.js";
import type { SpecialistScope } from "../platform/participant-state.js";
import type { Store } from "../store.js";

/** One bound native operation; no model-selected account, parent allowance or task fence. */
export class SkillExecutionStore implements InvocationRepository, WorkLedger {
  constructor(
    private store: Store,
    private scope: SpecialistScope,
    private guard: (db: PoolClient) => Promise<void> = async () => {},
    private roleLimits?: WorkLimits,
  ) {}
  private aad(id: string, kind = "invocation") {
    return `skill-${kind}:${this.scope.instanceId}:${this.scope.bindingId}:${this.scope.specialistId}:${id}`;
  }
  private async authorize(db: PoolClient) {
    const r = (
      await db.query(
        "SELECT c.id,c.observation_consent,p.non_model_limits FROM environment_bindings b JOIN agents a ON a.id=b.agent_id JOIN cohorts c ON c.id=a.cohort_id LEFT JOIN cohort_engine_profiles p ON p.cohort_id=c.id WHERE b.id=$1 AND b.state='active' FOR UPDATE OF c",
        [this.scope.bindingId],
      )
    ).rows[0];
    if (!r || !r.observation_consent) throw new FleetError("CONSENT_REQUIRED", true);
    await this.guard(db);
    return r;
  }
  private async parent(db: PoolClient) {
    const r = await this.authorize(db),
      parsed = WorkLimitsSchema.safeParse(r.non_model_limits);
    if (!parsed.success) throw new FleetError("PARENT_WORK_LIMITS_REQUIRED", true);
    return { cohortId: r.id, limits: parsed.data };
  }
  private checkScope(s: SpecialistScope) {
    if (launchDigest(s) !== launchDigest(this.scope)) throw new FleetError("SKILL_SCOPE_MISMATCH", true);
  }
  private async used(db: PoolClient, cohortId: string, kind: string, invocationId?: string, role = false) {
    return BigInt(
      (
        await db.query(
          "SELECT coalesce(sum(w.units),0)::text n FROM skill_work_reservations w JOIN skill_invocations i ON i.id=w.invocation_id WHERE i.cohort_id=$1 AND w.kind=$2 AND ($3::uuid IS NULL OR i.id=$3) AND (NOT $4 OR (i.binding_id=$5 AND i.specialist_id=$6))",
          [cohortId, kind, invocationId ?? null, role, this.scope.bindingId, this.scope.specialistId],
        )
      ).rows[0].n,
    );
  }
  async limits(recipe: WorkLimits, requested?: Partial<WorkLimits>) {
    return transaction(this.store.pool, async (db) => {
      const p = await this.parent(db),
        remaining = { ...p.limits },
        roleRemaining = { ...(this.roleLimits ?? p.limits) };
      for (const k of workKinds) {
        const left = BigInt(p.limits[k]) - (await this.used(db, p.cohortId, k));
        remaining[k] = Number(left > 0n ? left : 0n);
        const roleLeft =
          BigInt((this.roleLimits ?? p.limits)[k]) - (await this.used(db, p.cohortId, k, undefined, true));
        roleRemaining[k] = Number(roleLeft > 0n ? roleLeft : 0n);
      }
      const limits = minimumWorkLimits(
        recipe,
        p.limits,
        this.roleLimits ?? p.limits,
        { ...recipe, ...requested },
        remaining,
        roleRemaining,
      );
      if (limits.steps < 1 || limits.wallTimeMs < 1) throw new FleetError("WORK_LIMIT_EXHAUSTED", true);
      return limits;
    });
  }
  async start(
    s: SpecialistScope,
    input: { skillRef: SkillRef; goal: ExistingSkillGoal; inputs: Data; triggerId: string; limits: WorkLimits },
  ) {
    this.checkScope(s);
    if (input.triggerId.length > 8000 || !input.triggerId) throw new FleetError("INVALID_SKILL_TRIGGER", true);
    return transaction(this.store.pool, async (db) => {
      const parent = await this.parent(db);
      const old = (
        await db.query(
          "SELECT * FROM skill_invocations WHERE instance_id=$1 AND binding_id=$2 AND specialist_id=$3 AND goal_id=$4 AND skill_id=$5 AND skill_version=$6 AND skill_digest=$7 FOR UPDATE",
          [
            s.instanceId,
            s.bindingId,
            s.specialistId,
            input.goal.id,
            input.skillRef.id,
            input.skillRef.version,
            input.skillRef.digest,
          ],
        )
      ).rows[0];
      if (old) return this.decode(old);
      const id = randomUUID(),
        detail = {
          inputs: input.inputs,
          values: {},
          goalRevision: input.goal.revision,
          ownerRevision: input.goal.ownerRevision,
        };
      const r = (
        await db.query(
          "INSERT INTO skill_invocations(id,instance_id,binding_id,specialist_id,cohort_id,skill_id,skill_version,skill_digest,goal_id,trigger_id,state,effective_limits,detail_cipher,started_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active',$11,$12,$13,$13) RETURNING *",
          [
            id,
            s.instanceId,
            s.bindingId,
            s.specialistId,
            parent.cohortId,
            input.skillRef.id,
            input.skillRef.version,
            input.skillRef.digest,
            input.goal.id,
            input.triggerId,
            input.limits,
            this.store.vault.encrypt(detail, this.aad(id)),
            this.store.now(),
          ],
        )
      ).rows[0];
      return this.decode(r);
    });
  }
  private decode(r: Record<string, any>): Invocation {
    const available = r.detail_cipher && new Date(r.started_at).getTime() > this.store.now().getTime() - 30 * 86400000,
      detail = available
        ? this.store.vault.decrypt<{ inputs: Data; values: Data; goalRevision: string; ownerRevision: string }>(
            r.detail_cipher,
            this.aad(r.id),
          )
        : { inputs: {}, values: {}, goalRevision: "unavailable", ownerRevision: "unavailable" };
    return {
      id: r.id,
      scope: { instanceId: r.instance_id, bindingId: r.binding_id, specialistId: r.specialist_id },
      skillRef: { id: r.skill_id, version: r.skill_version, digest: r.skill_digest },
      goalId: r.goal_id,
      triggerId: r.trigger_id,
      state: r.state,
      revision: r.revision,
      nodeIndex: r.node_index,
      effectiveLimits: WorkLimitsSchema.parse(r.effective_limits),
      startedAt: new Date(r.started_at).toISOString(),
      ...detail,
      reason: r.reason,
      privateUnavailable: !available,
    };
  }
  private async row(db: PoolClient, id: string) {
    const r = (
      await db.query(
        "SELECT * FROM skill_invocations WHERE id=$1 AND instance_id=$2 AND binding_id=$3 AND specialist_id=$4 FOR UPDATE",
        [id, this.scope.instanceId, this.scope.bindingId, this.scope.specialistId],
      )
    ).rows[0];
    if (!r) throw new FleetError("SKILL_INVOCATION_NOT_FOUND", true);
    return r;
  }
  async load(id: string) {
    return transaction(this.store.pool, async (db) => {
      await this.authorize(db);
      return this.decode(await this.row(db, id));
    });
  }
  async forGoal(goalId: string, ref: SkillRef) {
    return transaction(this.store.pool, async (db) => {
      await this.authorize(db);
      const r = (
        await db.query(
          "SELECT * FROM skill_invocations WHERE instance_id=$1 AND binding_id=$2 AND specialist_id=$3 AND goal_id=$4 AND skill_id=$5 AND skill_version=$6 AND skill_digest=$7 ORDER BY started_at DESC LIMIT 1",
          [
            this.scope.instanceId,
            this.scope.bindingId,
            this.scope.specialistId,
            goalId,
            ref.id,
            ref.version,
            ref.digest,
          ],
        )
      ).rows[0];
      return r ? this.decode(r) : undefined;
    });
  }
  async acceptEvent(id: string, eventId: string) {
    if (!eventId || eventId.length > 8000) throw new FleetError("INVALID_SKILL_TRIGGER", true);
    return transaction(this.store.pool, async (db) => {
      await this.authorize(db);
      await this.row(db, id);
      return !!(
        await db.query(
          "INSERT INTO skill_invocation_events VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING invocation_id",
          [id, eventId, this.store.now()],
        )
      ).rowCount;
    });
  }
  private cp(r: Record<string, any>): Checkpoint {
    return {
      invocationId: r.invocation_id,
      nodeId: r.node_id,
      revision: r.revision,
      state: r.state,
      commandId: r.command_id ?? undefined,
      payloadDigest: r.payload_digest ?? undefined,
      result: r.detail_cipher
        ? this.store.vault.decrypt<Data>(r.detail_cipher, this.aad(`${r.invocation_id}:${r.node_id}`, "checkpoint"))
        : undefined,
    };
  }
  async checkpoint(inv: Invocation, nodeId: string, commandId?: string) {
    if (nodeId.length > 500) throw new FleetError("INVALID_SKILL_NODE", true);
    return transaction(this.store.pool, async (db) => {
      await this.authorize(db);
      const r = await this.row(db, inv.id);
      if (r.revision !== inv.revision) throw new FleetError("STALE_SKILL_CHECKPOINT", true);
      await db.query(
        "INSERT INTO skill_checkpoints(invocation_id,node_id,state,command_id,created_at,updated_at) VALUES($1,$2,'prepared',$3,$4,$4) ON CONFLICT DO NOTHING",
        [inv.id, nodeId, commandId ?? null, this.store.now()],
      );
      return this.cp(
        (await db.query("SELECT * FROM skill_checkpoints WHERE invocation_id=$1 AND node_id=$2", [inv.id, nodeId]))
          .rows[0],
      );
    });
  }
  async outstanding(id: string) {
    return transaction(this.store.pool, async (db) => {
      await this.authorize(db);
      await this.row(db, id);
      const r = (
        await db.query(
          "SELECT * FROM skill_checkpoints WHERE invocation_id=$1 AND state IN('prepared','started','unknown') ORDER BY created_at DESC,node_id LIMIT 1",
          [id],
        )
      ).rows[0];
      return r ? this.cp(r) : undefined;
    });
  }
  async begin(cp: Checkpoint) {
    return transaction(this.store.pool, async (db) => {
      await this.authorize(db);
      await this.row(db, cp.invocationId);
      return !!(
        await db.query(
          "UPDATE skill_checkpoints SET state='started',revision=revision+1,updated_at=$4 WHERE invocation_id=$1 AND node_id=$2 AND revision=$3 AND state='prepared' RETURNING invocation_id",
          [cp.invocationId, cp.nodeId, cp.revision, this.store.now()],
        )
      ).rowCount;
    });
  }
  async submission(cp: Checkpoint, payload: Data) {
    return transaction(this.store.pool, async (db) => {
      await this.authorize(db);
      await this.row(db, cp.invocationId);
      const r = (
          await db.query(
            "SELECT payload_digest FROM skill_checkpoints WHERE invocation_id=$1 AND node_id=$2 FOR UPDATE",
            [cp.invocationId, cp.nodeId],
          )
        ).rows[0],
        digest = launchDigest(payload);
      if (!r || (r.payload_digest && r.payload_digest !== digest)) throw new FleetError("IDEMPOTENCY_CONFLICT", true);
      await db.query("UPDATE skill_checkpoints SET payload_digest=$3 WHERE invocation_id=$1 AND node_id=$2", [
        cp.invocationId,
        cp.nodeId,
        digest,
      ]);
    });
  }
  async resetUnstarted(cp: Checkpoint) {
    return transaction(this.store.pool, async (db) => {
      await this.authorize(db);
      await this.row(db, cp.invocationId);
      const used = (
        await db.query(
          "SELECT 1 FROM skill_work_reservations WHERE invocation_id=$1 AND node_id=$2 AND actual_units>0 LIMIT 1",
          [cp.invocationId, cp.nodeId],
        )
      ).rowCount;
      if (used) return false;
      if (
        cp.commandId &&
        (await db.query("SELECT 1 FROM platform_commands WHERE command_id=$1", [cp.commandId])).rowCount
      )
        return false;
      return !!(
        await db.query(
          "UPDATE skill_checkpoints SET state='prepared',revision=revision+1 WHERE invocation_id=$1 AND node_id=$2 AND state='started' RETURNING invocation_id",
          [cp.invocationId, cp.nodeId],
        )
      ).rowCount;
    });
  }
  async finish(
    inv: Invocation,
    cp: Checkpoint | null,
    update: { state: Invocation["state"]; nodeIndex: number; values: Data; reason?: string; result?: Data },
  ) {
    if (Buffer.byteLength(JSON.stringify(update.values)) > 48000) throw new FleetError("SKILL_STATE_LIMIT", true);
    return transaction(this.store.pool, async (db) => {
      await this.authorize(db);
      const r = await this.row(db, inv.id);
      if (r.revision !== inv.revision) throw new FleetError("STALE_SKILL_CHECKPOINT", true);
      if (cp)
        await db.query(
          "UPDATE skill_checkpoints SET state=$3,revision=revision+1,detail_cipher=$4,updated_at=$5 WHERE invocation_id=$1 AND node_id=$2",
          [
            inv.id,
            cp.nodeId,
            update.state === "waiting" ? "waiting" : update.state === "unknown" ? "unknown" : "completed",
            update.result
              ? this.store.vault.encrypt(update.result, this.aad(`${inv.id}:${cp.nodeId}`, "checkpoint"))
              : null,
            this.store.now(),
          ],
        );
      const detail = {
          inputs: inv.inputs,
          values: update.values,
          goalRevision: inv.goalRevision,
          ownerRevision: inv.ownerRevision,
        },
        changed = (
          await db.query(
            "UPDATE skill_invocations SET state=$2,node_index=$3,revision=revision+1,detail_cipher=$4,reason=$5,updated_at=$6 WHERE id=$1 RETURNING *",
            [
              inv.id,
              update.state,
              update.nodeIndex,
              this.store.vault.encrypt(detail, this.aad(inv.id)),
              update.reason ?? null,
              this.store.now(),
            ],
          )
        ).rows[0];
      return this.decode(changed);
    });
  }
  async reserve(inv: Invocation, nodeId: string, work: Partial<WorkLimits>) {
    await transaction(this.store.pool, async (db) => {
      const p = await this.parent(db);
      const persisted = this.decode(await this.row(db, inv.id));
      for (const k of workKinds) {
        const units = work[k] ?? 0;
        if (!Number.isSafeInteger(units) || units < 0) throw new FleetError("INVALID_WORK_RESERVATION", true);
        if (!units) continue;
        const old = (
          await db.query(
            "SELECT units FROM skill_work_reservations WHERE invocation_id=$1 AND node_id=$2 AND kind=$3",
            [inv.id, nodeId, k],
          )
        ).rows[0];
        if (old) {
          if (Number(old.units) !== units) throw new FleetError("WORK_RESERVATION_CONFLICT", true);
          continue;
        }
        if (
          (await this.used(db, p.cohortId, k)) + BigInt(units) > BigInt(p.limits[k]) ||
          (await this.used(db, p.cohortId, k, inv.id)) + BigInt(units) > BigInt(persisted.effectiveLimits[k]) ||
          (await this.used(db, p.cohortId, k, undefined, true)) + BigInt(units) >
            BigInt((this.roleLimits ?? p.limits)[k])
        )
          throw new FleetError("WORK_LIMIT_EXHAUSTED", true);
        await db.query("INSERT INTO skill_work_reservations VALUES($1,$2,$3,$4,0,$5)", [
          inv.id,
          nodeId,
          k,
          units,
          this.store.now(),
        ]);
      }
    });
  }
  async consume(inv: Invocation, nodeId: string, kind: WorkKind, units: number) {
    if (!Number.isSafeInteger(units) || units < 1) throw new FleetError("INVALID_WORK_RESERVATION", true);
    await transaction(this.store.pool, async (db) => {
      await this.authorize(db);
      await this.row(db, inv.id);
      if (
        !(
          await db.query(
            "UPDATE skill_work_reservations SET actual_units=actual_units+$4 WHERE invocation_id=$1 AND node_id=$2 AND kind=$3 AND actual_units+$4<=units RETURNING invocation_id",
            [inv.id, nodeId, kind, units],
          )
        ).rowCount
      )
        throw new FleetError("UNDECLARED_OR_EXHAUSTED_PRIMITIVE_WORK", true);
    });
  }
  async meterWall(inv: Invocation, enforce: boolean) {
    const exceeded = await transaction(this.store.pool, async (db) => {
      const p = await this.parent(db);
      await this.row(db, inv.id);
      const elapsed = Math.max(0, this.store.now().getTime() - Date.parse(inv.startedAt)),
        old = (
          await db.query(
            "SELECT units FROM skill_work_reservations WHERE invocation_id=$1 AND node_id='elapsed' AND kind='wallTimeMs'",
            [inv.id],
          )
        ).rows[0],
        previous = Number(old?.units ?? 0),
        actual = Math.max(previous, elapsed);
      await db.query(
        "INSERT INTO skill_work_reservations VALUES($1,'elapsed','wallTimeMs',$2,$2,$3) ON CONFLICT(invocation_id,node_id,kind) DO UPDATE SET units=greatest(skill_work_reservations.units,excluded.units),actual_units=greatest(skill_work_reservations.actual_units,excluded.actual_units)",
        [inv.id, actual, this.store.now()],
      );
      return (
        actual > inv.effectiveLimits.wallTimeMs ||
        (await this.used(db, p.cohortId, "wallTimeMs")) > BigInt(p.limits.wallTimeMs) ||
        (await this.used(db, p.cohortId, "wallTimeMs", undefined, true)) >
          BigInt((this.roleLimits ?? p.limits).wallTimeMs)
      );
    });
    if (enforce && exceeded) throw new FleetError("SKILL_WALL_LIMIT", true);
  }
  async recordRecovery(inv: Invocation, nodeId: string, eventId: string) {
    await transaction(this.store.pool, async (db) => {
      await this.authorize(db);
      await this.row(db, inv.id);
      await db.query(
        "INSERT INTO skill_work_reservations VALUES($1,$2,'recovery_reads',0,1,$3) ON CONFLICT DO NOTHING",
        [inv.id, `${nodeId}:${launchDigest(eventId)}`, this.store.now()],
      );
    });
  }
}
