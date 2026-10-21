import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { transaction } from "../db.js";
import { type Data, FleetError } from "../domain.js";
import type { Claim, Store } from "../store.js";
import type { EngineProfileRef, RecipientSpec } from "./architecture.js";
import type { Bindings } from "./bindings.js";
import type { BindingRef, DomainTime, EnvironmentEvent } from "./contracts.js";
import type { EnvironmentRegistry } from "./environment-registry.js";
import { ParticipantDelivery } from "./participant-delivery.js";
export type TaskState = "ready" | "running" | "waiting" | "completed" | "blocked" | "cancelled";
export interface TaskRecord {
  id: string;
  bindingId: string;
  profile: EngineProfileRef;
  key: string;
  sourceRefs: string[];
  sourceCount: number;
  sourceRefsOmitted: number;
  state: TaskState;
  deadline?: DomainTime;
  wake?: Data;
  revision: number;
  code: string | null;
  participantId?: string;
  instanceId?: string;
}
export interface TaskClaim {
  turn: Claim;
  taskId: string;
  bindingId: string;
  profile: EngineProfileRef;
  fence: number;
  revision: number;
}
export class TaskStore {
  constructor(
    readonly store: Store,
    readonly bindings: Bindings,
    readonly maxConcurrency = 1,
    readonly routingEnvironment?: EnvironmentRegistry,
  ) {}
  async enroll(cohortId: string, profile: EngineProfileRef, timedReviews = false, client?: PoolClient) {
    if (!profile.id || !profile.version) throw new FleetError("INVALID_ENGINE_PROFILE");
    const write = async (db: PoolClient) => {
      const cohort = (await db.query("SELECT * FROM cohorts WHERE id=$1 FOR UPDATE", [cohortId])).rows[0];
      if (!cohort) throw new FleetError("NOT_FOUND");
      const old = (await db.query("SELECT * FROM cohort_engine_profiles WHERE cohort_id=$1", [cohortId])).rows[0];
      if (
        old?.profile_id === profile.id &&
        old.profile_version === profile.version &&
        old.timed_reviews === timedReviews
      )
        return;
      if (
        (
          await db.query(
            "SELECT 1 FROM turns WHERE cohort_id=$1 UNION ALL SELECT 1 FROM platform_tasks WHERE cohort_id=$1 LIMIT 1",
            [cohortId],
          )
        ).rowCount
      )
        throw new FleetError("CONSUMED_PROFILE_IMMUTABLE");
      if (!["draft", "paused"].includes(cohort.state)) throw new FleetError("COHORT_NOT_EDITABLE");
      await db.query("DELETE FROM cohort_wake_policies WHERE cohort_id=$1", [cohortId]);
      await db.query(
        "INSERT INTO cohort_engine_profiles(cohort_id,profile_id,profile_version,timed_reviews,created_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(cohort_id) DO UPDATE SET profile_id=excluded.profile_id,profile_version=excluded.profile_version,timed_reviews=excluded.timed_reviews",
        [cohortId, profile.id, profile.version, timedReviews, this.store.now()],
      );
    };
    return client ? write(client) : transaction(this.store.pool, write);
  }
  async upsertFromEvent(binding: BindingRef, event: EnvironmentEvent, key: string): Promise<TaskRecord> {
    const id = await transaction(this.store.pool, (db) => this.upsertWithin(db, binding, event, key));
    return this.get(id);
  }
  async publishFromEvent(binding: BindingRef, event: EnvironmentEvent, key: string): Promise<TaskRecord[]> {
    const ids = await transaction(this.store.pool, (db) => this.publishWithin(db, binding, event, key));
    return Promise.all(ids.map((id) => this.get(id)));
  }
  /** Pure registered routing is evaluated before any inference; legacy source keys stay unchanged. */
  async publishWithin(db: PoolClient, binding: BindingRef, event: EnvironmentEvent, key: string): Promise<string[]> {
    const agentId = await this.bindings.agentFor(binding, db),
      agent = await this.store.agent(agentId, db);
    const p = (
      await db.query(
        "SELECT profile_id,profile_version,architecture_config FROM cohort_engine_profiles WHERE cohort_id=$1",
        [agent.cohort_id],
      )
    ).rows[0];
    const manifest =
        p &&
        this.store.architectures.list().find((m) => m.ref.id === p.profile_id && m.ref.version === p.profile_version),
      definition = manifest && this.store.architectures.resolve(manifest.ref);
    if (!definition?.route) return [await this.upsertWithin(db, binding, event, key)];
    const instanceId = `${binding.id}:${p.profile_id}@${p.profile_version}`,
      preset = this.routingEnvironment
        ?.resolve(binding.environment)
        .specialistPresets?.find((r) => r.id === p.architecture_config.preset),
      configuration = structuredClone(p.architecture_config),
      recipients = definition.route(
        { instanceId, binding, event },
        preset
          ? {
              ...configuration,
              subscriptions: preset.roles.map((r) => ({
                participantId: r.charter.id,
                subscriptionVersion: r.subscriptions.version,
                categories: r.subscriptions.categories,
                periodic: r.subscriptions.periodic,
              })),
            }
          : configuration,
      );
    return new ParticipantDelivery(this).ingestWithin(db, binding, event, recipients);
  }
  async upsertRecipientWithin(
    db: PoolClient,
    binding: BindingRef,
    event: EnvironmentEvent,
    recipient: RecipientSpec,
    instanceId: string,
  ): Promise<string> {
    const agentId = await this.bindings.agentFor(binding, db),
      agent = await this.store.agent(agentId, db);
    const profile = (await db.query("SELECT * FROM cohort_engine_profiles WHERE cohort_id=$1", [agent.cohort_id]))
      .rows[0];
    if (!profile || instanceId !== `${binding.id}:${profile.profile_id}@${profile.profile_version}`)
      throw new FleetError("SPECIALIST_SCOPE_MISMATCH");
    const key = `participant:${recipient.participantId}:${createHash("sha256")
      .update(JSON.stringify([instanceId, recipient.taskKey]))
      .digest("hex")}`;
    const old = (
      await db.query(
        "SELECT id,deadline FROM platform_tasks WHERE binding_id=$1 AND task_key=$2 AND state IN('ready','running','waiting','blocked') FOR UPDATE",
        [binding.id, key],
      )
    ).rows[0];
    const deadline = earliestDeadline(old?.deadline ?? undefined, event.deadline),
      deadlineAt = deadline?.clockId === "utc" ? new Date(deadline.value) : null;
    if (deadlineAt && !Number.isFinite(deadlineAt.getTime())) throw new FleetError("INVALID_DEADLINE");
    if (old) {
      await db.query(
        "UPDATE platform_tasks SET revision=revision+1,state=CASE WHEN state='waiting' THEN 'ready' ELSE state END,wake=NULL,deadline=$2,deadline_at=$3 WHERE id=$1",
        [old.id, deadline ?? null, deadlineAt],
      );
      return old.id;
    }
    const id = randomUUID();
    await db.query(
      "INSERT INTO platform_tasks(id,binding_id,cohort_id,profile_id,profile_version,task_key,due_at,deadline,deadline_at,created_at,participant_id,architecture_instance_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$7,$10,$11)",
      [
        id,
        binding.id,
        agent.cohort_id,
        profile.profile_id,
        profile.profile_version,
        key,
        this.store.now(),
        deadline ?? null,
        deadlineAt,
        recipient.participantId,
        instanceId,
      ],
    );
    return id;
  }
  /** Caller owns the transaction: source/task/cursor effects commit together. */
  async upsertWithin(db: PoolClient, binding: BindingRef, event: EnvironmentEvent, key: string): Promise<string> {
    const agentId = await this.bindings.agentFor(binding, db);
    if (
      !key ||
      key.length > 200 ||
      !event.id ||
      event.id.length > 2000 ||
      !event.sourceRef ||
      event.sourceRef.length > 8000
    )
      throw new FleetError("INVALID_TASK_SOURCE");
    await db.query("SELECT id FROM environment_bindings WHERE id=$1 FOR UPDATE", [binding.id]);
    const prior = (
      await db.query("SELECT task_id FROM platform_task_sources WHERE binding_id=$1 AND event_id=$2", [
        binding.id,
        event.id,
      ])
    ).rows[0];
    if (prior) return prior.task_id;
    const agent = await this.store.agent(agentId, db),
      profile = (await db.query("SELECT * FROM cohort_engine_profiles WHERE cohort_id=$1", [agent.cohort_id])).rows[0];
    if (!profile) throw new FleetError("ENGINE_ENROLLMENT_REQUIRED");
    let task = (
      await db.query(
        "SELECT * FROM platform_tasks WHERE binding_id=$1 AND task_key=$2 AND state IN('ready','running','waiting','blocked') FOR UPDATE",
        [binding.id, key],
      )
    ).rows[0];
    if (!task) {
      const id = randomUUID();
      const deadlineAt = event.deadline?.clockId === "utc" ? new Date(event.deadline.value) : null;
      if (deadlineAt && !Number.isFinite(deadlineAt.getTime())) throw new FleetError("INVALID_DEADLINE");
      task = (
        await db.query(
          "INSERT INTO platform_tasks(id,binding_id,cohort_id,profile_id,profile_version,task_key,due_at,deadline,deadline_at,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$7) RETURNING *",
          [
            id,
            binding.id,
            agent.cohort_id,
            profile.profile_id,
            profile.profile_version,
            key,
            this.store.now(),
            event.deadline ?? null,
            deadlineAt,
          ],
        )
      ).rows[0];
    } else {
      const deadline = earliestDeadline(task.deadline ?? undefined, event.deadline);
      await db.query(
        "UPDATE platform_tasks SET revision=revision+1,state=CASE WHEN state='waiting' THEN 'ready' ELSE state END,wake=NULL,deadline=$2,deadline_at=$3 WHERE id=$1",
        [task.id, deadline ?? null, deadline?.clockId === "utc" ? new Date(deadline.value) : null],
      );
    }
    await db.query(
      "INSERT INTO platform_task_sources(binding_id,event_id,task_id,source_ref,observed_at) VALUES($1,$2,$3,$4,$5)",
      [binding.id, event.id, task.id, event.sourceRef, event.observedAt],
    );
    return task.id as string;
  }
  async get(id: string): Promise<TaskRecord> {
    const row = (await this.store.pool.query("SELECT * FROM platform_tasks WHERE id=$1", [id])).rows[0];
    if (!row) throw new FleetError("TASK_NOT_FOUND");
    const refs = (
      await this.store.pool.query(
        row.participant_id
          ? "SELECT source_ref FROM (SELECT source_ref,sequence FROM specialist_deliveries WHERE task_id=$1 ORDER BY sequence DESC LIMIT 100) s ORDER BY sequence"
          : "SELECT source_ref FROM (SELECT source_ref,sequence FROM platform_task_sources WHERE task_id=$1 ORDER BY sequence DESC LIMIT 100) s ORDER BY sequence",
        [id],
      )
    ).rows;
    const sourceCount = (
      await this.store.pool.query(
        row.participant_id
          ? "SELECT count(*)::int n FROM specialist_deliveries WHERE task_id=$1"
          : "SELECT count(*)::int n FROM platform_task_sources WHERE task_id=$1",
        [id],
      )
    ).rows[0].n;
    return {
      id: row.id,
      bindingId: row.binding_id,
      profile: { id: row.profile_id, version: row.profile_version },
      key: row.task_key,
      sourceRefs: refs.map((r) => r.source_ref),
      sourceCount,
      sourceRefsOmitted: Math.max(0, sourceCount - refs.length),
      state: row.state,
      ...(row.deadline ? { deadline: row.deadline } : {}),
      ...(row.wake ? { wake: row.wake } : {}),
      revision: Number(row.revision),
      code: row.code,
      ...(row.participant_id ? { participantId: row.participant_id, instanceId: row.architecture_instance_id } : {}),
    };
  }
  async seedScheduled() {
    const rows = (
      await this.store.pool.query(
        "SELECT a.id,a.next_due_at FROM agents a JOIN cohort_engine_profiles p ON p.cohort_id=a.cohort_id JOIN cohorts c ON c.id=a.cohort_id WHERE p.timed_reviews AND c.state='running' AND a.state='ready' AND a.next_due_at<=$1",
        [this.store.now()],
      )
    ).rows;
    for (const row of rows) {
      const binding = await this.bindings.forAgent(row.id);
      if (binding)
        await this.publishFromEvent(
          binding,
          {
            id: `schedule:${row.next_due_at.toISOString()}`,
            type: "scheduled",
            sourceRef: `schedule:${row.next_due_at.toISOString()}`,
            observedAt: this.store.now().toISOString(),
            environmentTime: { clockId: "utc", value: row.next_due_at.toISOString() },
            metadata: {},
          },
          "scheduled",
        );
    }
  }
  async claim(workerId: string, now: Date, selectedTaskId?: string): Promise<TaskClaim | null> {
    await this.store.recoverExpired();
    await this.recover();
    await this.seedScheduled();
    return transaction(this.store.pool, async (db) => {
      await db.query("SELECT pg_advisory_xact_lock(19281462)");
      if ((await db.query("SELECT count(*)::int n FROM turns WHERE state='running'")).rows[0].n >= this.maxConcurrency)
        return null;
      await db.query(
        "UPDATE platform_tasks SET state='ready' WHERE state='waiting' AND wake->>'kind'='retry' AND due_at<=$1",
        [now],
      );
      const candidate = (
        await db.query(
          `SELECT t.*,a.id actor_agent_id FROM platform_tasks t JOIN environment_bindings b ON b.id=t.binding_id JOIN agents a ON a.id=b.agent_id JOIN cohorts c ON c.id=t.cohort_id JOIN cohort_engine_profiles p ON p.cohort_id=c.id LEFT JOIN platform_cohort_admission admission ON admission.cohort_id=c.id
    WHERE t.state='ready' AND t.due_at<=$1 AND b.state='active' AND c.state='running' AND a.state='ready' AND a.credential_state='ready' AND c.model IS NOT NULL AND c.budget IS NOT NULL
    AND b.environment_id=$2 AND b.environment_version=$3 AND b.instance_id=$4 AND ($5::uuid IS NULL OR t.id=$5)
    AND NOT EXISTS(SELECT 1 FROM turns x WHERE x.agent_id=a.id AND (x.state IN('running','pending','needs_owner') OR x.pending_command IS NOT NULL))
    AND NOT EXISTS(SELECT 1 FROM agent_blockers x WHERE x.agent_id=a.id) AND NOT EXISTS(SELECT 1 FROM maintenance_holds h WHERE h.cohort_id=c.id AND h.released_at IS NULL)
    AND (SELECT count(*) FROM turns x WHERE x.cohort_id=c.id AND x.state='running')<(c.budget->>'concurrency')::int
    ORDER BY coalesce(admission.last_ticket,0),c.created_at,c.id,t.owner_priority DESC,t.deadline_at NULLS LAST,t.due_at,t.sequence FOR UPDATE OF t,a SKIP LOCKED LIMIT 1`,
          [
            now,
            this.bindings.selected.id,
            this.bindings.selected.version,
            this.bindings.selected.instanceId,
            selectedTaskId ?? null,
          ],
        )
      ).rows[0];
      if (!candidate) return null;
      const agent = await this.store.agent(candidate.actor_agent_id, db);
      const turn = await this.store.admitAgent(db, agent, workerId, now, candidate.due_at);
      if (!turn) return null;
      const fence = Number(candidate.fence) + 1;
      await db.query("UPDATE platform_tasks SET state='running',fence=$2,active_turn_id=$3 WHERE id=$1", [
        candidate.id,
        fence,
        turn.id,
      ]);
      await db.query(
        "INSERT INTO platform_task_claims(turn_id,task_id,fence,revision,profile_id,profile_version,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [turn.id, candidate.id, fence, candidate.revision, candidate.profile_id, candidate.profile_version, now],
      );
      await db.query(
        "INSERT INTO platform_cohort_admission(cohort_id,last_ticket) VALUES($1,nextval('platform_admission_ticket')) ON CONFLICT(cohort_id) DO UPDATE SET last_ticket=excluded.last_ticket",
        [turn.cohortId],
      );
      return {
        turn,
        taskId: candidate.id,
        bindingId: candidate.binding_id,
        profile: { id: candidate.profile_id, version: candidate.profile_version },
        fence,
        revision: Number(candidate.revision),
      };
    });
  }
  async check(claim: TaskClaim, db?: PoolClient, deadlines = true) {
    const client = db ?? this.store.pool;
    const row = (
      await client.query(
        "SELECT t.deadline FROM platform_tasks t JOIN platform_task_claims c ON c.task_id=t.id JOIN turns x ON x.id=c.turn_id JOIN environment_bindings b ON b.id=t.binding_id WHERE t.id=$1 AND t.state='running' AND t.fence=$2 AND t.active_turn_id=$3 AND c.turn_id=$3 AND c.profile_id=$4 AND c.profile_version=$5 AND t.binding_id=$6 AND x.agent_id=$7 AND x.cohort_id=$8 AND b.agent_id=x.agent_id AND t.cohort_id=x.cohort_id",
        [
          claim.taskId,
          claim.fence,
          claim.turn.id,
          claim.profile.id,
          claim.profile.version,
          claim.bindingId,
          claim.turn.agentId,
          claim.turn.cohortId,
        ],
      )
    ).rows[0];
    if (!row) throw new FleetError("TASK_FENCED");
    if (deadlines && row.deadline?.clockId === "utc")
      assertDeadline(row.deadline, { clockId: "utc", value: this.store.now().toISOString() }, this.store.now());
    await this.store.active(claim.turn, client);
  }
  async finish(claim: TaskClaim, code: string) {
    await this.store.finish(claim.turn, code, "", undefined, true);
    await this.recover();
  }
  async cancel(claim: TaskClaim) {
    await transaction(this.store.pool, async (db) => {
      await this.check(claim, db, false);
      await db.query("UPDATE platform_tasks SET state='cancelled',fence=fence+1,code='OPERATION_STOPPED' WHERE id=$1", [
        claim.taskId,
      ]);
      await db.query("UPDATE agents SET fence=fence+1 WHERE id=$1", [claim.turn.agentId]);
    });
  }
  async recover() {
    await transaction(this.store.pool, async (db) => {
      await db.query(
        "DELETE FROM model_capacity_leases l USING turns t WHERE l.turn_id=t.id AND l.expires_at<=$1 AND t.state<>'running'",
        [this.store.now()],
      );
      const rows = (
        await db.query(
          "SELECT t.*,x.state turn_state,x.code turn_code,x.pending_command,x.unknown_usage,c.revision claimed_revision,a.next_due_at,o.phase recovery_phase FROM platform_tasks t JOIN turns x ON x.id=t.active_turn_id JOIN platform_task_claims c ON c.turn_id=x.id JOIN agents a ON a.id=x.agent_id LEFT JOIN recovery_operations o ON o.turn_id=x.id WHERE t.state IN('running','blocked') AND x.state<>'running' FOR UPDATE OF t",
        )
      ).rows;
      for (const row of rows) {
        let state: TaskState = "completed",
          wake: Data | null = null,
          due = row.due_at;
        if (row.turn_state === "cancelled") state = "cancelled";
        else if (row.pending_command || row.unknown_usage || row.turn_state === "needs_owner") state = "blocked";
        else if (Number(row.revision) > Number(row.claimed_revision) || row.turn_code === "WORKER_EXPIRED")
          state = "ready";
        else if (row.turn_code === "WAIT" && row.wake?.kind === "event") {
          state = "waiting";
          wake = row.wake;
        } else if (!["WAIT", "COMMITTED", "ALREADY_COMMITTED", "DEADLINE_MISSED"].includes(row.turn_code)) {
          state = "waiting";
          wake = { kind: "retry", code: row.turn_code };
          due = row.next_due_at;
        }
        await db.query("UPDATE platform_tasks SET state=$2,code=$3,wake=$4,due_at=$5 WHERE id=$1", [
          row.id,
          state,
          row.turn_code,
          wake,
          due,
        ]);
      }
      await db.query(
        "UPDATE platform_commands p SET state='rejected',outcome=jsonb_build_object('commandId',p.command_id,'code','COMMAND_NOT_DISPATCHED','status','rejected','sourceRefs','[]'::jsonb),updated_at=$1 FROM command_resolutions r WHERE r.command_id=p.command_id AND r.source='not_dispatched' AND p.state='prepared'",
        [this.store.now()],
      );
    });
  }
}

export function assertDeadline(deadline: DomainTime | undefined, current: DomainTime, now: Date) {
  if (!deadline) return;
  if (deadline.clockId === "utc") {
    if (!Number.isFinite(Date.parse(deadline.value))) throw new FleetError("INVALID_DEADLINE");
    if (Date.parse(deadline.value) <= now.getTime()) throw new FleetError("DEADLINE_MISSED");
    return;
  }
  if (deadline.clockId !== current.clockId || !/^-?\d+$/.test(deadline.value) || !/^-?\d+$/.test(current.value))
    throw new FleetError("DEADLINE_CLOCK_UNAVAILABLE");
  if (BigInt(current.value) >= BigInt(deadline.value)) throw new FleetError("DEADLINE_MISSED");
}

function earliestDeadline(a: DomainTime | undefined, b: DomainTime | undefined): DomainTime | undefined {
  if (!a) return b;
  if (!b) return a;
  if (a.clockId !== b.clockId) throw new FleetError("DEADLINE_CLOCK_MISMATCH");
  if (a.clockId === "utc") {
    if (!Number.isFinite(Date.parse(a.value)) || !Number.isFinite(Date.parse(b.value)))
      throw new FleetError("INVALID_DEADLINE");
    return Date.parse(a.value) <= Date.parse(b.value) ? a : b;
  }
  if (!/^-?\d+$/.test(a.value) || !/^-?\d+$/.test(b.value)) throw new FleetError("INVALID_DEADLINE");
  return BigInt(a.value) <= BigInt(b.value) ? a : b;
}
