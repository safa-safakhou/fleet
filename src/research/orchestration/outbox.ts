import { randomUUID } from "node:crypto";
import { transaction } from "../../db.js";
import { FleetError } from "../../domain.js";
import type { TaskClaim, TaskStore } from "../../platform/tasks.js";
import type { Store } from "../../store.js";
import { ManifestRepository } from "../manifests/repository.js";
import { type TaskProjection, type TaskWorkflowClient, type WorkflowRef, WorkflowRefSchema } from "./types.js";
export class TemporalTaskOwner {
  constructor(
    readonly store: Store,
    readonly tasks: TaskStore,
    readonly client: TaskWorkflowClient,
    private run: (claim: TaskClaim) => Promise<void>,
    private admissionOpen: () => boolean = () => true,
    private stopWork: (taskId: string) => Promise<void> = async () => {},
  ) {}
  async enroll(taskId: string, manifestDigest: string) {
    const manifest = await new ManifestRepository(this.store.pool).load(manifestDigest);
    await transaction(this.store.pool, async (db) => {
      const row = (
        await db.query(
          "SELECT t.*,c.state cohort_state FROM platform_tasks t JOIN cohorts c ON c.id=t.cohort_id WHERE t.id=$1 FOR UPDATE OF t,c",
          [taskId],
        )
      ).rows[0];
      if (!row) throw new FleetError("TASK_NOT_FOUND", true);
      if (row.scheduler_owner === "temporal" && row.research_manifest_digest === manifestDigest) return;
      if (
        row.scheduler_owner !== "platform" ||
        row.state !== "ready" ||
        row.fence !== "0" ||
        row.active_turn_id ||
        !["draft", "paused"].includes(row.cohort_state) ||
        (await db.query("SELECT 1 FROM turns WHERE cohort_id=$1 LIMIT 1", [row.cohort_id])).rowCount
      )
        throw new FleetError("CONSUMED_PROFILE_IMMUTABLE", true);
      if (
        manifest.environment.bindingId !== row.binding_id ||
        manifest.profile.id !== row.profile_id ||
        manifest.profile.version !== row.profile_version
      )
        throw new FleetError("OPERATION_SCOPE_MISMATCH", true);
      const route = (
        await db.query("SELECT * FROM research_task_routes WHERE binding_id=$1 AND task_key=$2", [
          row.binding_id,
          row.task_key,
        ])
      ).rows[0];
      if (route && route.manifest_digest !== manifestDigest)
        throw new FleetError("RESEARCH_ROUTE_PROFILE_MISMATCH", true);
      await db.query(
        "INSERT INTO research_task_routes(binding_id,task_key,profile_id,profile_version,manifest_digest) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
        [row.binding_id, row.task_key, row.profile_id, row.profile_version, manifestDigest],
      );
      const now = this.store.now();
      await db.query("UPDATE platform_tasks SET scheduler_owner='temporal',research_manifest_digest=$2 WHERE id=$1", [
        taskId,
        manifestDigest,
      ]);
      await db.query(
        "INSERT INTO research_task_owners(task_id,manifest_digest,phase,created_at) VALUES($1,$2,'ready',$3)",
        [taskId, manifestDigest, now],
      );
      await db.query(
        "INSERT INTO research_task_outbox(task_id,kind,dedupe_key,created_at) VALUES($1,'wake','enrolled',$2)",
        [taskId, now],
      );
    });
  }
  async reference(id: string): Promise<WorkflowRef> {
    const row = (
      await this.store.pool.query(
        "SELECT o.id,o.task_id,o.kind,t.manifest_digest FROM research_task_outbox o JOIN research_task_owners t ON t.task_id=o.task_id WHERE o.id=$1",
        [id],
      )
    ).rows[0];
    if (!row) throw new FleetError("TASK_DELIVERY_NOT_FOUND", true);
    return WorkflowRefSchema.parse({
      taskId: row.task_id,
      manifestDigest: row.manifest_digest,
      deliveryId: row.id,
      kind: row.kind,
    });
  }
  async deliver(id: string) {
    const ref = await this.reference(id),
      row = (await this.store.pool.query("SELECT delivered_at FROM research_task_outbox WHERE id=$1", [id])).rows[0];
    if (row.delivered_at) return;
    await this.store.pool.query("UPDATE research_task_outbox SET attempts=attempts+1 WHERE id=$1", [id]);
    if (!["completed", "cancelled"].includes((await this.inspect(ref)).phase)) {
      try {
        await this.client.send(ref);
      } catch {
        throw new FleetError("TEMPORAL_UNAVAILABLE", true);
      }
    }
    await this.store.pool.query(
      "UPDATE research_task_outbox SET delivered_at=$2 WHERE id=$1 AND delivered_at IS NULL",
      [id, this.store.now()],
    );
  }
  async inspect(ref: WorkflowRef): Promise<TaskProjection> {
    WorkflowRefSchema.parse(ref);
    const row = (
      await this.store.pool.query("SELECT phase FROM research_task_owners WHERE task_id=$1 AND manifest_digest=$2", [
        ref.taskId,
        ref.manifestDigest,
      ])
    ).rows[0];
    if (!row) throw new FleetError("TASK_OWNER_MISMATCH", true);
    return { phase: row.phase };
  }
  async execute(ref: WorkflowRef): Promise<TaskProjection> {
    WorkflowRefSchema.parse(ref);
    if (ref.kind !== "wake") return this.inspect(ref);
    if (!this.admissionOpen()) {
      await this.park(ref);
      return this.inspect(ref);
    }
    const fresh = await transaction(this.store.pool, async (db) => {
      const row = (
        await db.query(
          "SELECT o.*,t.state FROM research_task_owners o JOIN platform_tasks t ON t.id=o.task_id WHERE o.task_id=$1 AND o.manifest_digest=$2 FOR UPDATE OF o,t",
          [ref.taskId, ref.manifestDigest],
        )
      ).rows[0];
      const delivery = await db.query("SELECT 1 FROM research_task_outbox WHERE id=$1 AND task_id=$2 AND kind='wake'", [
        ref.deliveryId,
        ref.taskId,
      ]);
      if (!row || !delivery.rowCount) throw new FleetError("TASK_OWNER_MISMATCH", true);
      if ((await db.query("SELECT 1 FROM research_task_executions WHERE delivery_id=$1", [ref.deliveryId])).rowCount)
        return false;
      if (row.stop_id || ["completed", "cancelled"].includes(row.phase)) return false;
      if (["executing", "awaiting_reconciliation"].includes(row.phase)) return false;
      const now = this.store.now();
      await db.query(
        "INSERT INTO research_task_executions(delivery_id,task_id,phase,created_at,updated_at) VALUES($1,$2,'prepared',$3,$3)",
        [ref.deliveryId, ref.taskId, now],
      );
      await db.query("UPDATE platform_tasks SET state='ready' WHERE id=$1 AND state='waiting'", [ref.taskId]);
      await db.query("UPDATE research_task_owners SET phase='executing' WHERE task_id=$1", [ref.taskId]);
      return true;
    });
    if (!fresh) return this.inspect(ref);
    try {
      const claim = await this.tasks.claimTemporal(`temporal:${ref.deliveryId}`, this.store.now(), ref);
      if (!claim) {
        await this.park(ref);
        return this.inspect(ref);
      }
      await this.run(claim);
      return await this.project(ref);
    } catch {
      await this.park(ref);
      return this.inspect(ref);
    } finally {
      await this.acknowledgeStoppedExecution(ref.taskId);
    }
  }
  private async acknowledgeStoppedExecution(taskId: string) {
    await this.store.pool.query(
      "UPDATE research_task_owners SET acknowledged_at=$2 WHERE task_id=$1 AND stop_id IS NOT NULL",
      [taskId, this.store.now()],
    );
  }
  async park(ref: WorkflowRef) {
    await transaction(this.store.pool, async (db) => {
      await db.query(
        "UPDATE research_task_executions SET phase='awaiting_reconciliation',updated_at=$2 WHERE delivery_id=$1 AND phase<>'settled'",
        [ref.deliveryId, this.store.now()],
      );
      await db.query(
        "UPDATE research_task_owners SET phase='awaiting_reconciliation' WHERE task_id=$1 AND phase NOT IN ('completed','cancelled')",
        [ref.taskId],
      );
    });
  }
  async project(ref: WorkflowRef): Promise<TaskProjection> {
    await transaction(this.store.pool, async (db) => {
      const row = (
        await db.query(
          "SELECT o.stop_id,t.*,x.state native_state,x.code native_code,x.pending_command,x.unknown_usage,e.turn_id execution_turn_id,e.delivery_id FROM research_task_owners o JOIN platform_tasks t ON t.id=o.task_id LEFT JOIN research_task_executions e ON e.task_id=t.id AND e.phase<>'settled' LEFT JOIN turns x ON x.id=e.turn_id WHERE t.id=$1 AND o.manifest_digest=$2 FOR UPDATE OF o,t",
          [ref.taskId, ref.manifestDigest],
        )
      ).rows[0];
      if (!row) throw new FleetError("TASK_OWNER_MISMATCH", true);
      if (!row.delivery_id) {
        if (row.stop_id) {
          await db.query("UPDATE research_task_owners SET phase='cancelled' WHERE task_id=$1", [ref.taskId]);
          await db.query("UPDATE platform_tasks SET state='cancelled',code='OPERATION_STOPPED' WHERE id=$1", [
            ref.taskId,
          ]);
        }
        return;
      }
      const unknown = (
        await db.query("SELECT 1 FROM compute_ledger WHERE turn_id=$1 AND status IN ('reserved','unknown') LIMIT 1", [
          row.active_turn_id,
        ])
      ).rowCount;
      const uncertain =
        !row.native_state ||
        row.native_state === "running" ||
        row.pending_command ||
        row.unknown_usage ||
        unknown ||
        row.native_state === "needs_owner";
      const phase = uncertain
        ? "awaiting_reconciliation"
        : row.stop_id
          ? "cancelled"
          : row.wake?.kind === "event" && row.native_code === "WAIT"
            ? "waiting"
            : "completed";
      await db.query("UPDATE research_task_owners SET phase=$2 WHERE task_id=$1", [ref.taskId, phase]);
      await db.query("UPDATE platform_tasks SET state=$2,code=$3 WHERE id=$1", [
        ref.taskId,
        phase === "awaiting_reconciliation" ? "blocked" : phase,
        row.native_code ?? "EXECUTION_UNCERTAIN",
      ]);
      await db.query("UPDATE research_task_executions SET phase=$2,updated_at=$3 WHERE delivery_id=$1", [
        row.delivery_id,
        uncertain ? "awaiting_reconciliation" : "settled",
        this.store.now(),
      ]);
    });
    return this.inspect(ref);
  }
  async requestStop(taskId: string, stopId = randomUUID()) {
    await transaction(this.store.pool, async (db) => {
      const row = (
        await db.query(
          "SELECT t.*,o.stop_id FROM platform_tasks t JOIN research_task_owners o ON o.task_id=t.id WHERE t.id=$1 FOR UPDATE OF t,o",
          [taskId],
        )
      ).rows[0];
      if (!row) throw new FleetError("TASK_OWNER_MISMATCH", true);
      if (row.stop_id) return;
      const now = this.store.now();
      await db.query("UPDATE research_task_owners SET stop_id=$2,stop_requested_at=$3,fenced_at=$3 WHERE task_id=$1", [
        taskId,
        stopId,
        now,
      ]);
      await db.query("UPDATE platform_tasks SET fence=fence+1 WHERE id=$1", [taskId]);
      await db.query(
        "UPDATE agents SET fence=fence+1 WHERE id=(SELECT agent_id FROM turns WHERE id=$1 AND state='running')",
        [row.active_turn_id],
      );
      await db.query(
        "UPDATE research_worker_sessions SET status='fenced',stopped_at=$2 WHERE operation_id IN(SELECT operation_id FROM research_operations WHERE task_id=$1) AND status='active'",
        [taskId, now],
      );
      if (
        !row.active_turn_id &&
        !(await db.query("SELECT 1 FROM research_task_executions WHERE task_id=$1 AND phase<>'settled'", [taskId]))
          .rowCount
      ) {
        await db.query("UPDATE research_task_owners SET phase='cancelled',acknowledged_at=$2 WHERE task_id=$1", [
          taskId,
          now,
        ]);
        await db.query("UPDATE platform_tasks SET state='cancelled',code='OPERATION_STOPPED' WHERE id=$1", [taskId]);
      }
      await db.query(
        "INSERT INTO research_task_outbox(id,task_id,kind,dedupe_key,created_at) VALUES($1,$2,'stop',$3,$4)",
        [stopId, taskId, `stop:${stopId}`, now],
      );
    });
    await this.stopWork(taskId);
  }
}
