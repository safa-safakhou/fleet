import {
  CancellationScope,
  condition,
  continueAsNew,
  defineQuery,
  defineSignal,
  proxyActivities,
  setHandler,
  workflowInfo,
} from "@temporalio/workflow";
import type { TaskProjection, WorkflowRef } from "./types.js";
export type TaskWorkflowInput = {
  taskId: string;
  manifestDigest: string;
  version?: 1;
  pending?: WorkflowRef[];
  seen?: string[];
};
export const wakeTask = defineSignal<[WorkflowRef]>("wakeTask");
export const taskStatus = defineQuery<TaskProjection>("taskStatus");
// Execution is NEVER automatically retried. Lookup/park are idempotent SQL projections only.
const execution = proxyActivities<{ executeTask(ref: WorkflowRef): Promise<TaskProjection> }>({
  startToCloseTimeout: "15 minutes",
  scheduleToStartTimeout: "5 minutes",
  heartbeatTimeout: "15 seconds",
  retry: { maximumAttempts: 1 },
  cancellationType: "WAIT_CANCELLATION_COMPLETED",
});
const lookup = proxyActivities<{
  inspectTask(ref: WorkflowRef): Promise<TaskProjection>;
  parkTask(ref: WorkflowRef): Promise<TaskProjection>;
}>({
  startToCloseTimeout: "10 seconds",
  scheduleToCloseTimeout: "1 minute",
  retry: { maximumAttempts: 3, initialInterval: "1 second", maximumInterval: "5 seconds" },
});
export async function pactTaskWorkflow(input: TaskWorkflowInput): Promise<void> {
  if (input.version !== undefined && input.version !== 1) throw new Error("WORKFLOW_VERSION_UNSUPPORTED");
  const queue = [...(input.pending ?? [])],
    seen = new Set(input.seen ?? []);
  let status: TaskProjection = { phase: "ready" },
    active: CancellationScope | undefined,
    handled = 0;
  setHandler(taskStatus, () => status);
  setHandler(wakeTask, (ref) => {
    if (
      ref.taskId !== input.taskId ||
      ref.manifestDigest !== input.manifestDigest ||
      seen.has(ref.deliveryId) ||
      queue.some((r) => r.deliveryId === ref.deliveryId)
    )
      return;
    if (ref.kind === "stop") active?.cancel();
    queue.push(ref);
  });
  for (;;) {
    await condition(() => queue.length > 0);
    const ref = queue.shift()!;
    if (seen.has(ref.deliveryId)) continue;
    status = await lookup.inspectTask(ref);
    if (["completed", "cancelled"].includes(status.phase)) return;
    if (ref.kind === "wake" && ["ready", "waiting"].includes(status.phase)) {
      active = new CancellationScope({ cancellable: true });
      try {
        status = await active.run(() => execution.executeTask(ref));
      } catch {
        status = await CancellationScope.nonCancellable(() => lookup.parkTask(ref));
      } finally {
        active = undefined;
      }
    }
    seen.add(ref.deliveryId);
    handled++;
    if (["completed", "cancelled"].includes(status.phase)) return;
    if (handled >= 128 || workflowInfo().continueAsNewSuggested) {
      await continueAsNew<typeof pactTaskWorkflow>({
        ...input,
        version: 1,
        pending: queue,
        seen: [...seen].slice(-128),
      });
    }
  }
}
