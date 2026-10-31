import { ApplicationFailure, Context } from "@temporalio/activity";
import { safeCode } from "../../domain.js";
import type { TemporalTaskOwner } from "./outbox.js";
import { type WorkflowRef, WorkflowRefSchema } from "./types.js";
export function taskActivities(owner: TemporalTaskOwner) {
  const safe = <T>(work: () => Promise<T>) =>
    work().catch((error) => {
      throw ApplicationFailure.nonRetryable(safeCode(error));
    });
  return {
    inspectTask: (ref: WorkflowRef) => safe(() => owner.inspect(WorkflowRefSchema.parse(ref))),
    parkTask: (ref: WorkflowRef) =>
      safe(async () => {
        await owner.park(WorkflowRefSchema.parse(ref));
        return owner.inspect(ref);
      }),
    executeTask: (ref: WorkflowRef) =>
      safe(async () => {
        WorkflowRefSchema.parse(ref);
        const context = Context.current(),
          heartbeat = setInterval(() => context.heartbeat({ deliveryId: ref.deliveryId }), 3000);
        const cancel = () => {
          void owner.requestStop(ref.taskId).catch(() => {});
        };
        context.cancellationSignal.addEventListener("abort", cancel, { once: true });
        try {
          return await owner.execute(ref);
        } finally {
          clearInterval(heartbeat);
          context.cancellationSignal.removeEventListener("abort", cancel);
        }
      }),
  };
}
