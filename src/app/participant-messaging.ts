import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { transaction } from "../db.js";
import { FleetError } from "../domain.js";
import { InternalMessageSchema } from "../engines/autonomous-specialists/messaging.js";
import type { BindingRef, DomainTime, EnvironmentEvent } from "../platform/contracts.js";
import { ParticipantDelivery } from "../platform/participant-delivery.js";
import type { SpecialistEnvelope, SpecialistScope } from "../platform/participant-state.js";
import type { TaskStore } from "../platform/tasks.js";
import {
  compareDomainTime,
  evaluateWake,
  WakeConditionSchema,
  type WakeFacts,
  type WakePredicates,
} from "../platform/wake-conditions.js";
import type { Store } from "../store.js";

type Context = { taskId: string; deliveryIds: string[]; clock: DomainTime };
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
/** Bound to one native operation. No model-selectable root, world or task. */
export class ParticipantMessages {
  constructor(
    private store: Store,
    private tasks: TaskStore,
    private binding: BindingRef,
    private instanceId: string,
    private context?: Context,
  ) {}
  private scope(scope: SpecialistScope) {
    if (scope.bindingId !== this.binding.id || scope.instanceId !== this.instanceId)
      throw new FleetError("SPECIALIST_SCOPE_MISMATCH");
  }
  private async consent(db: PoolClient) {
    const agent = await this.tasks.bindings.agentFor(this.binding, db),
      a = await this.store.agent(agent, db),
      c = await this.store.cohort(a.cohort_id, db);
    if (!c.observation_consent) throw new FleetError("CONSENT_REQUIRED");
  }
  private async parents(db: PoolClient, scope: SpecialistScope) {
    const context = this.context;
    if (!context) throw new FleetError("PARTICIPANT_OPERATION_REQUIRED");
    const rows = (
      await db.query(
        "SELECT * FROM specialist_deliveries WHERE instance_id=$1 AND binding_id=$2 AND recipient=$3 AND task_id=$4 AND id=ANY($5::uuid[]) FOR UPDATE",
        [this.instanceId, this.binding.id, scope.specialistId, context.taskId, context.deliveryIds],
      )
    ).rows;
    return new Map(rows.map((r) => [r.id, r]));
  }
  async acceptWithin(db: PoolClient, scope: SpecialistScope, operationId: string, envelope: SpecialistEnvelope) {
    this.scope(scope);
    await this.consent(db);
    const messages = z.array(InternalMessageSchema).max(8).parse(envelope.messages),
      wakes = z.array(WakeConditionSchema).max(8).parse(envelope.wakeConditions),
      parents = await this.parents(db, scope);
    if (envelope.deliveryIds.some((id) => !parents.has(id))) throw new FleetError("FOREIGN_DELIVERY");
    const requestIds = new Map<number, string>();
    for (let index = 0; index < messages.length; index++) {
      const message = messages[index],
        parent = parents.get(message.parentDeliveryId);
      if (
        !parent ||
        !parent.detail_cipher ||
        new Date(parent.received_at).getTime() <= this.store.now().getTime() - 30 * 86400000
      )
        throw new FleetError("MESSAGE_PARENT_REQUIRED");
      if (parent.depth >= 4) throw new FleetError("MESSAGE_CHAIN_LIMIT");
      if (message.to === scope.specialistId) throw new FleetError("SELF_INTERNAL_MESSAGE");
      if (
        !(
          await db.query(
            "SELECT 1 FROM specialist_states WHERE instance_id=$1 AND binding_id=$2 AND specialist_id=$3",
            [this.instanceId, this.binding.id, message.to],
          )
        ).rowCount
      )
        throw new FleetError("UNKNOWN_MESSAGE_RECIPIENT");
      const source = this.store.vault.decrypt<EnvironmentEvent>(
        parent.detail_cipher,
        `specialist-delivery:${this.instanceId}:${this.binding.id}:${scope.specialistId}:${parent.id}`,
      );
      const round = Number(source.metadata.conflictRound ?? 0) + (message.kind === "conflict" ? 1 : 0);
      let replyToRequestId: string | null = null;
      if (message.kind === "reply") {
        if (
          !source.id.startsWith("internal:") ||
          source.metadata.kind !== "request" ||
          source.metadata.sender !== message.to
        )
          throw new FleetError("REPLY_REQUEST_REQUIRED");
        const candidate = source.id.slice(9);
        const original = (
          await db.query(
            "SELECT id FROM specialist_outbox WHERE id=$1 AND instance_id=$2 AND binding_id=$3 AND sender=$4 AND recipient=$5 AND status='delivered'",
            [candidate, this.instanceId, this.binding.id, message.to, scope.specialistId],
          )
        ).rows[0];
        if (!original) throw new FleetError("REPLY_REQUEST_REQUIRED");
        replyToRequestId = original.id;
      }
      if (!Number.isInteger(round) || round > 2) throw new FleetError("CONFLICT_ROUND_LIMIT");
      if (message.evidenceIds.length) {
        const count = (
          await db.query(
            "SELECT count(*)::int n FROM architecture_scoped_evidence WHERE instance_id=$1 AND binding_id=$2 AND id=ANY($3::uuid[]) AND created_at>$4",
            [
              this.instanceId,
              this.binding.id,
              message.evidenceIds,
              new Date(this.store.now().getTime() - 30 * 86400000),
            ],
          )
        ).rows[0].n;
        if (count !== new Set(message.evidenceIds).size) throw new FleetError("SUPPORT_UNAVAILABLE");
      }
      const payloadDigest = digest({
        to: message.to,
        kind: message.kind,
        text: message.text,
        evidenceIds: [...message.evidenceIds].sort(),
      });
      const duplicate = (
        await db.query(
          "SELECT id FROM specialist_outbox WHERE instance_id=$1 AND binding_id=$2 AND sender=$3 AND root_id=$4 AND payload_digest=$5",
          [this.instanceId, this.binding.id, scope.specialistId, parent.root_id, payloadDigest],
        )
      ).rows[0];
      if (duplicate) {
        if (message.kind === "request") requestIds.set(index, duplicate.id);
        continue;
      }
      const id = randomUUID();
      if (message.kind === "request") requestIds.set(index, id);
      await db.query(
        "INSERT INTO specialist_outbox(id,instance_id,binding_id,sender,recipient,operation_id,message_index,root_id,parent_id,depth,conflict_round,payload_cipher,payload_digest,evidence_ids,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)",
        [
          id,
          this.instanceId,
          this.binding.id,
          scope.specialistId,
          message.to,
          operationId,
          index,
          parent.root_id,
          parent.id,
          parent.depth + 1,
          round,
          this.store.vault.encrypt(message, `specialist-outbox:${this.instanceId}:${this.binding.id}:${id}`),
          payloadDigest,
          message.evidenceIds,
          this.store.now(),
        ],
      );
      if (replyToRequestId)
        await db.query("UPDATE specialist_outbox SET reply_request_id=$2 WHERE id=$1", [id, replyToRequestId]);
    }
    for (let condition of wakes) {
      if (condition.kind === "reply") {
        const requestId = condition.requestId ?? requestIds.get(condition.requestIndex ?? -1);
        if (
          !requestId ||
          !(
            await db.query(
              "SELECT 1 FROM specialist_outbox WHERE id=$1 AND instance_id=$2 AND binding_id=$3 AND sender=$4",
              [requestId, this.instanceId, this.binding.id, scope.specialistId],
            )
          ).rowCount
        )
          throw new FleetError("WAKE_REQUEST_REQUIRED");
        condition = { kind: "reply", requestId, deadline: condition.deadline };
      }
      const parent = parents.values().next().value;
      if (!parent) throw new FleetError("WAKE_PARENT_REQUIRED");
      if (condition.kind === "deadline" || condition.kind === "periodic" || condition.kind === "reply") {
        const comparison = compareDomainTime(
          condition.kind === "reply" ? condition.deadline : condition.at,
          (condition.kind === "reply" ? condition.deadline : condition.at).clockId === "utc"
            ? { clockId: "utc", value: this.store.now().toISOString() }
            : this.context?.clock,
        );
        if (comparison === undefined || comparison >= 0) throw new FleetError("FUTURE_WAKE_REQUIRED");
      }
      if (Buffer.byteLength(JSON.stringify(condition)) > 8000) throw new FleetError("WAKE_DATA_LIMIT");
      const id = randomUUID();
      await db.query(
        "INSERT INTO specialist_wakes(id,instance_id,binding_id,specialist_id,condition_cipher,root_id,created_at,updated_at,condition_digest,parent_id) VALUES($1,$2,$3,$4,$5,$6,$7,$7,$8,$9) ON CONFLICT DO NOTHING",
        [
          id,
          this.instanceId,
          this.binding.id,
          scope.specialistId,
          this.store.vault.encrypt(
            condition,
            `specialist-wake:${this.instanceId}:${this.binding.id}:${scope.specialistId}:${id}`,
          ),
          parent.root_id,
          this.store.now(),
          digest(condition),
          parent.id,
        ],
      );
    }
    await db.query("UPDATE specialist_deliveries SET status='acknowledged' WHERE id=ANY($1::uuid[])", [
      envelope.deliveryIds,
    ]);
    // Finish only the delivered batch. Remaining work must survive even if the
    // model chose to wait and no new external event arrives to wake this task.
    if (envelope.deliveryIds.length && this.context)
      await db.query(
        "UPDATE platform_tasks SET revision=revision+1 WHERE id=$1 AND EXISTS(SELECT 1 FROM specialist_deliveries WHERE task_id=$1 AND status='pending')",
        [this.context.taskId],
      );
  }
  private limit(limit: number) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new FleetError("PARTICIPANT_WORK_LIMIT");
  }
  async deliverOutbox(limit: number, signal: AbortSignal) {
    this.limit(limit);
    let processed = 0;
    for (let i = 0; i < limit && !signal.aborted; i++) {
      const done = await transaction(this.store.pool, async (db) => {
        await db.query("SELECT id FROM environment_bindings WHERE id=$1 FOR UPDATE", [this.binding.id]);
        await this.consent(db);
        const row = (
          await db.query(
            "SELECT * FROM specialist_outbox WHERE instance_id=$1 AND binding_id=$2 AND status='pending' ORDER BY created_at,id FOR UPDATE LIMIT 1",
            [this.instanceId, this.binding.id],
          )
        ).rows[0];
        if (!row) return false;
        if (!row.payload_cipher || new Date(row.created_at).getTime() <= this.store.now().getTime() - 30 * 86400000) {
          await db.query("UPDATE specialist_outbox SET status='blocked',payload_cipher=NULL WHERE id=$1", [row.id]);
          return true;
        }
        const message = this.store.vault.decrypt<z.infer<typeof InternalMessageSchema>>(
          row.payload_cipher,
          `specialist-outbox:${this.instanceId}:${this.binding.id}:${row.id}`,
        );
        const retained = (
          await db.query(
            "SELECT id FROM architecture_scoped_evidence WHERE instance_id=$1 AND binding_id=$2 AND id=ANY($3::uuid[]) AND created_at>$4",
            [this.instanceId, this.binding.id, row.evidence_ids, new Date(this.store.now().getTime() - 30 * 86400000)],
          )
        ).rowCount;
        if (retained !== row.evidence_ids.length) {
          await db.query("UPDATE specialist_outbox SET status='blocked',payload_cipher=NULL WHERE id=$1", [row.id]);
          return true;
        }
        const event: EnvironmentEvent = {
          id: `internal:${row.id}`,
          type: "internal_message",
          sourceRef: `internal:${row.id}`,
          observedAt: this.store.now().toISOString(),
          environmentTime: { clockId: "utc", value: this.store.now().toISOString() },
          metadata: {
            category: "internal",
            groupRef: row.root_id,
            sender: row.sender,
            kind: message.kind,
            text: message.text,
            evidenceIds: message.evidenceIds,
            conflictRound: row.conflict_round,
            ...(row.reply_request_id ? { replyToRequestId: row.reply_request_id } : {}),
            untrustedPeerContent: true,
          },
        };
        const ids = await new ParticipantDelivery(this.tasks).ingestWithin(
          db,
          this.binding,
          event,
          [{ participantId: row.recipient, subscriptionVersion: "1", taskKey: `internal:${row.root_id}` }],
          { rootId: row.root_id, parentId: row.parent_id, depth: row.depth },
        );
        const delivery = (
          await db.query("SELECT id FROM specialist_deliveries WHERE event_id=$1 AND task_id=$2", [event.id, ids[0]])
        ).rows[0];
        await db.query("UPDATE specialist_outbox SET status='delivered',delivery_id=$2 WHERE id=$1", [
          row.id,
          delivery.id,
        ]);
        return true;
      });
      if (!done) break;
      processed++;
    }
    return processed;
  }
  async evaluateWakes(
    facts: WakeFacts,
    time: DomainTime | undefined,
    signal: AbortSignal,
    predicates?: WakePredicates,
  ) {
    if (signal.aborted) return 0;
    return transaction(this.store.pool, async (db) => {
      await db.query("SELECT id FROM environment_bindings WHERE id=$1 FOR UPDATE", [this.binding.id]);
      await this.consent(db);
      const rows = (
        await db.query(
          "SELECT * FROM specialist_wakes WHERE instance_id=$1 AND binding_id=$2 AND status IN('waiting','unknown') ORDER BY updated_at,id FOR UPDATE LIMIT 100",
          [this.instanceId, this.binding.id],
        )
      ).rows;
      let ready = 0;
      for (const row of rows) {
        if (signal.aborted) break;
        const condition =
            new Date(row.created_at).getTime() > this.store.now().getTime() - 30 * 86400000 &&
            row.condition_cipher &&
            this.store.vault.decrypt(
              row.condition_cipher,
              `specialist-wake:${this.instanceId}:${this.binding.id}:${row.specialist_id}:${row.id}`,
            ),
          parsed = WakeConditionSchema.safeParse(condition),
          at = parsed.success
            ? parsed.data.kind === "reply"
              ? parsed.data.deadline
              : parsed.data.kind === "deadline" || parsed.data.kind === "periodic"
                ? parsed.data.at
                : undefined
            : undefined,
          state = evaluateWake(
            condition,
            facts,
            at?.clockId === "utc" ? { clockId: "utc", value: this.store.now().toISOString() } : time,
            predicates,
          );
        await db.query("UPDATE specialist_wakes SET status=$2,updated_at=$3 WHERE id=$1", [
          row.id,
          row.condition_cipher ? state : "blocked",
          this.store.now(),
        ]);
        if (state !== "ready") continue;
        const event: EnvironmentEvent = {
          id: `wake:${row.id}`,
          type: "explicit_wake",
          sourceRef: `wake:${row.id}`,
          observedAt: this.store.now().toISOString(),
          environmentTime: time ?? { clockId: "unavailable", value: "unavailable" },
          metadata: {
            category: "deadline",
            groupRef: row.id,
            reason:
              (condition as { kind?: string }).kind === "reply"
                ? "Reply observed or reply assessment deadline reached; no refusal inferred"
                : "Persisted wake condition met",
          },
        };
        await new ParticipantDelivery(this.tasks).ingestWithin(db, this.binding, event, [
          { participantId: row.specialist_id, subscriptionVersion: "1", taskKey: `wake:${row.id}` },
        ]);
        ready++;
      }
      return ready;
    });
  }
}
