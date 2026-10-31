import { Client, Connection, WorkflowIdReusePolicy } from "@temporalio/client";
import type { TaskWorkflowClient, WorkflowRef } from "./types.js";
import { deployment, taskQueue, WorkflowRefSchema } from "./types.js";
export class TemporalClient implements TaskWorkflowClient {
  constructor(readonly client: Client) {}
  async send(ref: WorkflowRef) {
    WorkflowRefSchema.parse(ref);
    await this.client.connection.withDeadline(Date.now() + 5000, () =>
      this.client.workflow.signalWithStart("pactTaskWorkflow", {
        workflowId: `fleet-task/${ref.taskId}`,
        taskQueue: taskQueue(ref.manifestDigest),
        args: [{ taskId: ref.taskId, manifestDigest: ref.manifestDigest, version: 1 }],
        signal: "wakeTask",
        signalArgs: [ref],
        workflowIdReusePolicy: WorkflowIdReusePolicy.REJECT_DUPLICATE,
        workflowExecutionTimeout: "30 days",
        retry: { maximumAttempts: 1 },
        versioningOverride: { pinnedTo: deployment(ref.manifestDigest) },
      }),
    );
  }
  static async connect(address: string, namespace: string) {
    const connection = await Connection.connect({ address, connectTimeout: "5 seconds" });
    return { connection, client: new TemporalClient(new Client({ connection, namespace })) };
  }
}
