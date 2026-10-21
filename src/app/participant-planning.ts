import type { PoolClient } from "pg";
import { transaction } from "../db.js";
import { FleetError } from "../domain.js";
import type { ConflictIntent, ConflictPolicy } from "../engines/autonomous-specialists/conflicts.js";
import type { ActionEffects } from "../platform/action-effects.js";
import { ActionEffectsSchema, actionIntentDigest } from "../platform/action-effects.js";
import type { ActionIntent, BindingRef } from "../platform/contracts.js";
import { launchDigest } from "../platform/launch.js";
import type { SpecialistScope } from "../platform/participant-state.js";
import type { TaskStore } from "../platform/tasks.js";
import type { Store } from "../store.js";
import { ParticipantConflicts } from "./participant-conflicts.js";

/** Published unsubmitted proposals are coordination data, never world reservations. */
export class ParticipantPlanning {
  constructor(
    private store: Store,
    private tasks: TaskStore,
    private binding: BindingRef,
    private scope: SpecialistScope,
    private guard: (db: PoolClient) => Promise<void>,
    private quote: (intent: ActionIntent) => Promise<ActionEffects>,
  ) {}
  private aad(id: string) {
    return `specialist-planning:${this.scope.instanceId}:${this.binding.id}:${id}`;
  }
  async active(db: Pick<PoolClient, "query"> = this.store.pool): Promise<ConflictIntent[]> {
    const rows = (
      await db.query(
        "SELECT id,detail_cipher FROM specialist_planning_intents WHERE instance_id=$1 AND binding_id=$2 AND status='active' AND detail_cipher IS NOT NULL AND created_at>$3 ORDER BY specialist_id",
        [this.scope.instanceId, this.binding.id, new Date(this.store.now().getTime() - 30 * 86400000)],
      )
    ).rows;
    return rows.map((r) => this.store.vault.decrypt<ConflictIntent>(r.detail_cipher, this.aad(r.id)));
  }
  async coordination() {
    const conflicts = await new ParticipantConflicts(
      this.store,
      this.tasks,
      this.binding,
      this.scope.instanceId,
      this.guard,
    ).list(this.scope);
    return {
      proposals: (await this.active()).map((i) => ({
        id: i.id,
        specialistId: i.specialistId,
        actionKey: i.effects.actionKey,
        claims: i.effects.claims,
        revision: i.effects.revision,
        unsubmitted: true,
      })),
      conflicts: conflicts.map((c) => ({
        id: c.id,
        rootId: c.rootId,
        round: c.round,
        revision: c.revision,
        resourceKeys: c.resourceKeys,
        result: c.result,
      })),
    };
  }
  async publishWithin(
    db: PoolClient,
    intent: ActionIntent,
    effects: ActionEffects,
    operationId: string,
    goalIds: string[],
  ) {
    await db.query(
      "UPDATE specialist_planning_intents SET status='superseded',updated_at=$4 WHERE instance_id=$1 AND binding_id=$2 AND specialist_id=$3 AND status='active'",
      [this.scope.instanceId, this.binding.id, this.scope.specialistId, this.store.now()],
    );
    const record: ConflictIntent = {
      id: intent.commandId,
      specialistId: this.scope.specialistId,
      goalIds,
      intent,
      effects,
    };
    await db.query("INSERT INTO specialist_planning_intents VALUES($1,$2,$3,$4,$5,$6,$7,'active',$8,$8)", [
      record.id,
      this.scope.instanceId,
      this.binding.id,
      this.scope.specialistId,
      operationId,
      this.store.vault.encrypt(record, this.aad(record.id)),
      effects.revision,
      this.store.now(),
    ]);
  }
  async admission(intent: ActionIntent, effects: ActionEffects, taskId: string, priorities: Record<string, number>) {
    const snapshot = await this.active(),
      current: ConflictIntent = {
        id: intent.commandId,
        specialistId: this.scope.specialistId,
        goalIds: [],
        intent,
        effects,
      },
      peers: ConflictIntent[] = [];
    for (const peer of snapshot.filter((p) => p.specialistId !== this.scope.specialistId)) {
      const fresh = ActionEffectsSchema.parse(await this.quote(peer.intent));
      // Refresh time allowance only; a changed source requires the peer's own new decision.
      if (
        fresh.revision === peer.effects.revision &&
        fresh.revision === effects.revision &&
        fresh.intentDigest === actionIntentDigest(peer.intent)
      )
        peers.push({ ...peer, effects: fresh });
    }
    const intents = [...peers, current];
    if (peers.length) {
      const policy: ConflictPolicy = {
        version: launchDigest(priorities),
        priorities: Object.fromEntries(intents.map((i) => [i.id, priorities[i.specialistId] ?? 0])),
        obligationIntentIds: [],
        deadlines: {},
        pendingCommandIds: [],
      };
      const record = await new ParticipantConflicts(
        this.store,
        this.tasks,
        this.binding,
        this.scope.instanceId,
        this.guard,
      ).publish(this.scope, { taskId, intents, policy });
      if (
        !record.intents.some(
          (i) => i.specialistId === this.scope.specialistId && record.result.eligibleIntentIds.includes(i.id),
        )
      ) {
        await transaction(this.store.pool, async (db) => {
          await db.query("SELECT id FROM environment_bindings WHERE id=$1 FOR UPDATE", [this.binding.id]);
          await this.guard(db);
          await this.publishWithin(db, intent, effects, intent.commandId, []);
        });
        throw new FleetError(record.result.reason, true);
      }
    }
    return async (db: PoolClient) => {
      if (launchDigest(await this.active(db)) !== launchDigest(snapshot))
        throw new FleetError("STALE_PLANNING_SNAPSHOT", true);
      await db.query(
        "UPDATE specialist_planning_intents SET status='admitted',updated_at=$4 WHERE instance_id=$1 AND binding_id=$2 AND specialist_id=$3 AND status='active'",
        [this.scope.instanceId, this.binding.id, this.scope.specialistId, this.store.now()],
      );
    };
  }
}
