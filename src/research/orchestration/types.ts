import { z } from "zod";
export const WORKFLOW_VERSION = 1;
export const BUILD_ID = "fleet-pact-research-runtime-v1";
export const WorkflowRefSchema = z
  .object({
    taskId: z.uuid(),
    manifestDigest: z.string().regex(/^[a-f0-9]{64}$/),
    deliveryId: z.uuid(),
    kind: z.enum(["wake", "stop", "reconcile"]),
  })
  .strict();
export type WorkflowRef = z.infer<typeof WorkflowRefSchema>;
export type TaskProjection = {
  phase: "ready" | "executing" | "waiting" | "awaiting_reconciliation" | "completed" | "cancelled";
};
export interface TaskWorkflowClient {
  send(ref: WorkflowRef): Promise<void>;
}
export const taskQueue = (manifestDigest: string) => `${BUILD_ID}/${manifestDigest}`;

export const deployment = (manifestDigest: string) => ({
  deploymentName: "fleet-pact-research",
  buildId: `${BUILD_ID}/${manifestDigest}`,
});
