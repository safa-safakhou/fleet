import { FleetError } from "../../domain.js";
import type { TaskStore } from "../../platform/tasks.js";
import type { Store } from "../../store.js";
import { StepJournal } from "../broker/steps.js";
import type { BrokerResult } from "../contracts.js";
import type { TemporalTaskOwner } from "./outbox.js";
export type RecoveryStatus = {
  taskId: string;
  phase: string;
  stop: { requested: boolean; fenced: boolean; acknowledged: boolean };
  pendingEffects: {
    logicalStepId: string;
    originalEpoch: string;
    allocationId?: string;
    commandId?: string;
    status: string;
  }[];
  unknownUsage: string[];
  reviewRequired: boolean;
  reasons: string[];
};
/** Inspection and projection only. Never launches a worker, dispatches, refunds, approves or calls a provider/game. */
export class RuntimeReconciler {
  private journal: StepJournal;
  constructor(
    readonly store: Store,
    tasks: TaskStore,
    readonly owner: TemporalTaskOwner,
  ) {
    this.journal = new StepJournal(store, tasks);
  }
  async inspect(taskId: string): Promise<RecoveryStatus> {
    const owner = (await this.store.pool.query("SELECT * FROM research_task_owners WHERE task_id=$1", [taskId]))
      .rows[0];
    if (!owner) throw new FleetError("TASK_OWNER_MISMATCH", true);
    const rows = (
      await this.store.pool.query(
        "SELECT s.* FROM research_steps s JOIN research_operations o ON o.operation_id=s.operation_id WHERE o.task_id=$1 ORDER BY s.operation_id,s.logical_step_id",
        [taskId],
      )
    ).rows;
    const usage = (
      await this.store.pool.query(
        "SELECT l.id,l.status FROM compute_ledger l JOIN platform_task_claims c ON c.turn_id=l.turn_id WHERE c.task_id=$1 AND l.status IN('reserved','unknown') ORDER BY l.id",
        [taskId],
      )
    ).rows;
    const reasons = new Set<string>();
    if (usage.some((r) => r.status === "unknown")) reasons.add("USAGE_UNKNOWN");
    if (usage.some((r) => r.status === "reserved")) reasons.add("USAGE_PENDING");
    const pendingEffects = rows
      .filter((r) => !["completed", "not_dispatched"].includes(r.result.status))
      .map((r) => ({ logicalStepId: r.logical_step_id, originalEpoch: r.original_epoch, ...r.result }));
    if (pendingEffects.length) reasons.add("STEP_UNRESOLVED");
    if (rows.some((r) => r.result.status === "completed" && !r.result.resultRef))
      reasons.add("RESULT_PAYLOAD_UNAVAILABLE");
    if (
      (
        await this.store.pool.query(
          "SELECT 1 FROM research_task_executions e JOIN turns t ON t.id=e.turn_id WHERE e.task_id=$1 AND t.state='running' LIMIT 1",
          [taskId],
        )
      ).rowCount
    )
      reasons.add("WORKER_STILL_ACTIVE");
    if (
      (
        await this.store.pool.query(
          "SELECT 1 FROM platform_commands p JOIN platform_task_claims c ON c.turn_id=p.turn_id WHERE c.task_id=$1 AND p.state NOT IN('confirmed','rejected') LIMIT 1",
          [taskId],
        )
      ).rowCount
    )
      reasons.add("RECEIPT_PENDING");
    if (
      (
        await this.store.pool.query(
          "SELECT 1 FROM research_runs r JOIN research_operations o ON o.scope->>'runId'=r.run_id WHERE o.task_id=$1 AND r.capture_failed LIMIT 1",
          [taskId],
        )
      ).rowCount
    )
      reasons.add("EVIDENCE_UNAVAILABLE");
    return {
      taskId,
      phase: owner.phase,
      stop: { requested: !!owner.stop_requested_at, fenced: !!owner.fenced_at, acknowledged: !!owner.acknowledged_at },
      pendingEffects,
      unknownUsage: usage.filter((r) => r.status === "unknown").map((r) => r.id),
      reviewRequired: reasons.size > 0,
      reasons: [...reasons].sort(),
    };
  }
  async reconcileKnown(taskId: string): Promise<RecoveryStatus> {
    await this.inspect(taskId);
    const rows = (
      await this.store.pool.query(
        "SELECT s.*,o.scope FROM research_steps s JOIN research_operations o ON o.operation_id=s.operation_id WHERE o.task_id=$1 AND s.result->>'status' IN('pending','unknown') ORDER BY s.logical_step_id",
        [taskId],
      )
    ).rows;
    for (const row of rows) {
      const result: BrokerResult = row.result,
        key = { operationId: row.operation_id, operationEpoch: row.original_epoch, logicalStepId: row.logical_step_id };
      if (result.allocationId) {
        const native = (
          await this.store.pool.query(
            "SELECT status,input_tokens::text,output_tokens::text FROM compute_ledger WHERE id=$1",
            [result.allocationId],
          )
        ).rows[0];
        // Late observations attached to an unknown allocation do not change its authoritative status.
        if (native?.status === "reported")
          await this.journal.complete(row.scope, key, {
            ...result,
            status: "completed",
            usage: { inputTokens: native.input_tokens, outputTokens: native.output_tokens },
          });
        else if (native?.status === "not_dispatched" && result.status === "pending")
          await this.journal.complete(row.scope, key, { ...result, status: "not_dispatched", usage: null });
      } else if (result.commandId) {
        const command = (
          await this.store.pool.query("SELECT state FROM platform_commands WHERE command_id=$1", [result.commandId])
        ).rows[0];
        if (command && ["confirmed", "rejected"].includes(command.state))
          await this.journal.complete(row.scope, key, { ...result, status: "completed" });
      }
    }
    const delivery = (
      await this.store.pool.query(
        "SELECT id FROM research_task_outbox WHERE task_id=$1 ORDER BY created_at,id LIMIT 1",
        [taskId],
      )
    ).rows[0];
    if (delivery) await this.owner.project(await this.owner.reference(delivery.id));
    return this.inspect(taskId);
  }
}
