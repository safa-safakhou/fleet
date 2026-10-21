import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { transaction } from "../db.js";
import { FleetError } from "../domain.js";
import {
  type ConflictIntent,
  type ConflictPolicy,
  type ConflictRecord,
  resolveConflict,
} from "../engines/autonomous-specialists/conflicts.js";
import type { BindingRef, EnvironmentEvent } from "../platform/contracts.js";
import { launchDigest } from "../platform/launch.js";
import { ParticipantDelivery } from "../platform/participant-delivery.js";
import type { SpecialistScope } from "../platform/participant-state.js";
import type { TaskStore } from "../platform/tasks.js";
import type { Store } from "../store.js";
export class ParticipantConflicts {
  constructor(
    private store: Store,
    private tasks: TaskStore,
    private binding: BindingRef,
    private instanceId: string,
    private guard: (db: PoolClient) => Promise<void> = async () => {},
  ) {}
  private scope(scope: SpecialistScope) {
    if (scope.bindingId !== this.binding.id || scope.instanceId !== this.instanceId)
      throw new FleetError("SPECIALIST_SCOPE_MISMATCH");
  }
  private aad(id: string) {
    return `specialist-conflict:${this.instanceId}:${this.binding.id}:${id}`;
  }
  private async consent(db: PoolClient) {
    const agentId = await this.tasks.bindings.agentFor(this.binding, db),
      agent = await this.store.agent(agentId, db);
    await db.query("SELECT id FROM cohorts WHERE id=$1 FOR UPDATE", [agent.cohort_id]);
    if (!(await this.store.cohort(agent.cohort_id, db)).observation_consent) throw new FleetError("CONSENT_REQUIRED");
    await this.guard(db);
  }
  async publish(
    scope: SpecialistScope,
    input: { taskId: string; intents: ConflictIntent[]; policy: ConflictPolicy },
  ): Promise<ConflictRecord> {
    this.scope(scope);
    if (
      !input.intents.length ||
      input.intents.length > 4 ||
      Buffer.byteLength(JSON.stringify(input)) > 64000 ||
      input.intents.some((i) => i.intent.bindingId !== this.binding.id)
    )
      throw new FleetError("INVALID_CONFLICT");
    return transaction(this.store.pool, async (db) => {
      await this.consent(db);
      await db.query("SELECT id FROM environment_bindings WHERE id=$1 FOR UPDATE", [this.binding.id]);
      const parent = (
        await db.query(
          "SELECT id,root_id,depth FROM specialist_deliveries WHERE instance_id=$1 AND binding_id=$2 AND recipient=$3 AND task_id=$4 ORDER BY sequence DESC LIMIT 1",
          [this.instanceId, this.binding.id, scope.specialistId, input.taskId],
        )
      ).rows[0];
      if (!parent) throw new FleetError("CONFLICT_SOURCE_REQUIRED");
      const resourceKeys = [
        ...new Set(
          input.intents.flatMap((i) => i.effects.claims.map((c) => JSON.stringify([c.kind, c.schemaId, c.key]))),
        ),
      ].sort();
      const key = launchDigest(resourceKeys),
        revision = launchDigest({
          revisions: input.intents.map((i) => i.effects.revision).sort(),
          capacities: input.intents
            .map((i) => ({ specialistId: i.specialistId, capacities: i.effects.capacities }))
            .sort((a, b) => a.specialistId.localeCompare(b.specialistId)),
          owner: input.policy.version,
        });
      const proposalDigest = launchDigest(
        input.intents
          .map((i) => ({
            specialistId: i.specialistId,
            schemaId: i.intent.schemaId,
            payload: i.intent.payload,
            claims: i.effects.claims,
          }))
          .sort((a, b) => a.specialistId.localeCompare(b.specialistId)),
      );
      const old = (
        await db.query(
          "SELECT * FROM specialist_conflicts WHERE instance_id=$1 AND binding_id=$2 AND concern_key=$3 AND revision=$4 FOR UPDATE",
          [this.instanceId, this.binding.id, key, revision],
        )
      ).rows[0];
      if (
        old &&
        (!old.detail_cipher || new Date(old.updated_at).getTime() <= this.store.now().getTime() - 30 * 86400000)
      )
        throw new FleetError("CONFLICT_EVIDENCE_UNAVAILABLE");
      if (old && (old.proposal_digest === proposalDigest || (old.status === "blocked" && old.round >= 2)))
        return this.store.vault.decrypt(old.detail_cipher, this.aad(old.id));
      const id = old?.id ?? randomUUID(),
        round = old ? Math.min(2, old.round + 1) : 0;
      const record: ConflictRecord = {
        id,
        rootId: old?.root_id ?? parent.root_id,
        round,
        revision,
        resourceKeys,
        intents: input.intents,
        policy: input.policy,
        result: resolveConflict({ round, intents: input.intents }, input.policy),
      };
      const status =
        record.result.kind === "negotiate" ? "open" : record.result.kind === "admit" ? "resolved" : "blocked";
      const cipher = this.store.vault.encrypt(record, this.aad(id));
      await db.query(
        "INSERT INTO specialist_conflicts VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11) ON CONFLICT(instance_id,binding_id,concern_key,revision) DO UPDATE SET round=excluded.round,proposal_digest=excluded.proposal_digest,status=excluded.status,detail_cipher=excluded.detail_cipher,updated_at=excluded.updated_at",
        [
          id,
          this.instanceId,
          this.binding.id,
          key,
          revision,
          record.rootId,
          round,
          proposalDigest,
          status,
          cipher,
          this.store.now(),
        ],
      );
      await db.query("INSERT INTO specialist_conflict_revisions VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING", [
        id,
        round,
        proposalDigest,
        cipher,
        this.store.now(),
      ]);
      if (record.result.kind === "negotiate") {
        const cause = (
          await db.query(
            "SELECT id,depth FROM specialist_deliveries WHERE instance_id=$1 AND binding_id=$2 AND root_id=$3 ORDER BY sequence DESC LIMIT 1",
            [this.instanceId, this.binding.id, record.rootId],
          )
        ).rows[0];
        if (cause && cause.depth < 4) {
          const event: EnvironmentEvent = {
            id: `conflict:${id}:${round}`,
            type: "internal_conflict",
            sourceRef: `conflict:${id}:${round}`,
            observedAt: this.store.now().toISOString(),
            environmentTime: { clockId: "utc", value: this.store.now().toISOString() },
            metadata: {
              category: "internal",
              groupRef: id,
              conflictId: id,
              round,
              result: record.result,
              untrustedPeerContent: true,
              authorityNotGranted: true,
            },
          };
          await new ParticipantDelivery(this.tasks).ingestWithin(
            db,
            this.binding,
            event,
            [...new Set(input.intents.map((i) => i.specialistId))].map((participantId) => ({
              participantId,
              subscriptionVersion: "1",
              taskKey: `conflict:${id}`,
            })),
            { rootId: record.rootId, parentId: cause.id, depth: cause.depth + 1 },
          );
        }
      }
      return record;
    });
  }
  async list(scope: SpecialistScope): Promise<ConflictRecord[]> {
    this.scope(scope);
    return transaction(this.store.pool, async (db) => {
      await this.consent(db);
      const rows = (
        await db.query(
          "SELECT id,detail_cipher FROM specialist_conflicts WHERE instance_id=$1 AND binding_id=$2 AND detail_cipher IS NOT NULL AND updated_at>$3 ORDER BY updated_at DESC,id LIMIT 32",
          [this.instanceId, this.binding.id, new Date(this.store.now().getTime() - 30 * 86400000)],
        )
      ).rows;
      return rows
        .map((r) => this.store.vault.decrypt<ConflictRecord>(r.detail_cipher, this.aad(r.id)))
        .filter((r) => r.intents.some((i) => i.specialistId === scope.specialistId));
    });
  }
}
