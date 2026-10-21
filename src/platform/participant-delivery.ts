import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { FleetError } from "../domain.js";
import type { RecipientSpec } from "./architecture.js";
import type { BindingRef, EnvironmentEvent } from "./contracts.js";
import type { TaskStore } from "./tasks.js";

const recipientSchema = z
  .object({
    participantId: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
    subscriptionVersion: z.string().min(1).max(40),
    taskKey: z.string().min(1).max(8000),
  })
  .strict();
export class ParticipantDelivery {
  constructor(
    private tasks: TaskStore,
    private limits = { concerns: 100, critical: 1000 },
  ) {}
  async ingestWithin(
    db: PoolClient,
    binding: BindingRef,
    event: EnvironmentEvent,
    raw: RecipientSpec[],
    lineage?: { rootId: string; parentId: string; depth: number },
  ) {
    const recipients = z.array(recipientSchema).max(4).parse(raw);
    if (
      !Number.isInteger(this.limits.concerns) ||
      this.limits.concerns < 1 ||
      this.limits.concerns > 100 ||
      !Number.isInteger(this.limits.critical) ||
      this.limits.critical < 1 ||
      this.limits.critical > 1000
    )
      throw new FleetError("INVALID_INBOX_LIMITS");
    if (
      new Set(recipients.map((r) => JSON.stringify([r.participantId, r.subscriptionVersion]))).size !==
      recipients.length
    )
      throw new FleetError("DUPLICATE_RECIPIENT");
    const agentId = await this.tasks.bindings.agentFor(binding, db);
    await db.query("SELECT id FROM environment_bindings WHERE id=$1 FOR UPDATE", [binding.id]);
    const agent = await this.tasks.store.agent(agentId, db),
      cohort = await this.tasks.store.cohort(agent.cohort_id, db);
    const profile = (
      await db.query("SELECT profile_id,profile_version FROM cohort_engine_profiles WHERE cohort_id=$1", [
        agent.cohort_id,
      ])
    ).rows[0];
    if (!profile) throw new FleetError("ENGINE_ENROLLMENT_REQUIRED");
    const instanceId = `${binding.id}:${profile.profile_id}@${profile.profile_version}`;
    if (
      !event.id ||
      event.id.length > 2000 ||
      !event.sourceRef ||
      event.sourceRef.length > 8000 ||
      !Number.isFinite(Date.parse(event.observedAt))
    )
      throw new FleetError("INVALID_EVENT_METADATA");
    if (
      lineage &&
      (!z.uuid().safeParse(lineage.rootId).success ||
        !z.uuid().safeParse(lineage.parentId).success ||
        !Number.isInteger(lineage.depth) ||
        lineage.depth < 1 ||
        lineage.depth > 4)
    )
      throw new FleetError("INVALID_MESSAGE_LINEAGE");
    const rootId =
      lineage?.rootId ??
      (
        await db.query(
          "INSERT INTO specialist_event_roots VALUES($1,$2,$3) ON CONFLICT(binding_id,event_id) DO UPDATE SET root_id=specialist_event_roots.root_id RETURNING root_id",
          [binding.id, event.id, randomUUID()],
        )
      ).rows[0].root_id;
    const taskIds: string[] = [];
    for (const recipient of recipients) {
      const prior = (
        await db.query(
          "SELECT task_id FROM specialist_deliveries WHERE instance_id=$1 AND binding_id=$2 AND event_id=$3 AND recipient=$4 AND subscription_version=$5",
          [instanceId, binding.id, event.id, recipient.participantId, recipient.subscriptionVersion],
        )
      ).rows[0];
      if (prior) {
        taskIds.push(prior.task_id);
        continue;
      }
      const taskId = await this.tasks.upsertRecipientWithin(db, binding, event, recipient, instanceId),
        id = randomUUID();
      const critical =
        ["contract", "deadline", "result"].includes(String(event.metadata.category)) || event.type === "command_result";
      if (critical) {
        const count = (
          await db.query(
            "SELECT count(*)::int n FROM specialist_deliveries WHERE instance_id=$1 AND binding_id=$2 AND recipient=$3 AND status='pending' AND critical",
            [instanceId, binding.id, recipient.participantId],
          )
        ).rows[0].n;
        if (count >= this.limits.critical) throw new FleetError("CRITICAL_INBOX_BACKPRESSURE");
      } else {
        const count = (
          await db.query(
            "SELECT count(DISTINCT task_id)::int n FROM specialist_deliveries WHERE instance_id=$1 AND binding_id=$2 AND recipient=$3 AND status='pending' AND NOT critical AND task_id<>$4",
            [instanceId, binding.id, recipient.participantId, taskId],
          )
        ).rows[0].n;
        if (count >= this.limits.concerns) throw new FleetError("INBOX_BACKPRESSURE");
        if (["resource_changed", "stock_changed", "snapshot"].includes(event.type))
          await db.query(
            "UPDATE specialist_deliveries SET status='superseded' WHERE task_id=$1 AND status='pending' AND NOT critical",
            [taskId],
          );
      }
      await db.query(
        "INSERT INTO specialist_deliveries(id,instance_id,binding_id,event_id,recipient,subscription_version,task_id,source_ref,observed_at,environment_time,root_id,parent_id,depth,critical,detail_cipher,received_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)",
        [
          id,
          instanceId,
          binding.id,
          event.id,
          recipient.participantId,
          recipient.subscriptionVersion,
          taskId,
          event.sourceRef,
          new Date(event.observedAt),
          event.environmentTime,
          rootId,
          lineage?.parentId ?? null,
          lineage?.depth ?? 0,
          ["contract", "deadline", "result"].includes(String(event.metadata.category)) ||
            event.type === "command_result",
          cohort.observation_consent
            ? this.tasks.store.vault.encrypt(
                event,
                `specialist-delivery:${instanceId}:${binding.id}:${recipient.participantId}:${id}`,
              )
            : null,
          this.tasks.store.now(),
        ],
      );
      taskIds.push(taskId);
    }
    return taskIds;
  }
}
