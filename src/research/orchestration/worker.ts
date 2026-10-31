import { fileURLToPath } from "node:url";
import { NativeConnection, Worker } from "@temporalio/worker";
import type { TaskClaim, TaskStore } from "../../platform/tasks.js";
import type { Store } from "../../store.js";
import { taskActivities } from "./activities.js";
import { TemporalClient } from "./client.js";
import { TemporalTaskOwner } from "./outbox.js";
import { BUILD_ID, taskQueue } from "./types.js";
/** Explicit bootstrap only. Ordinary installation and historical workers never call this. */
export async function startTaskRuntime(options: {
  store: Store;
  tasks: TaskStore;
  run: (claim: TaskClaim) => Promise<void>;
  address: string;
  namespace: string;
  manifestDigest: string;
  admissionOpen: () => boolean;
  stop?: (taskId: string) => Promise<void>;
}) {
  const transport = await TemporalClient.connect(options.address, options.namespace),
    connection = await NativeConnection.connect({ address: options.address }).catch(async (error) => {
      await transport.connection.close();
      throw error;
    });
  const owner = new TemporalTaskOwner(
    options.store,
    options.tasks,
    transport.client,
    async (claim) => {
      if (!options.admissionOpen()) throw Error("RESEARCH_ADMISSION_CLOSED");
      await options.run(claim);
    },
    options.admissionOpen,
    options.stop,
  );
  const worker = await Worker.create({
    connection,
    namespace: options.namespace,
    taskQueue: taskQueue(options.manifestDigest),
    workflowsPath: fileURLToPath(
      new URL(import.meta.url.endsWith(".ts") ? "./workflow.ts" : "./workflow.js", import.meta.url),
    ),
    activities: taskActivities(owner),
    maxConcurrentActivityTaskExecutions: 1,
    workerDeploymentOptions: {
      version: { deploymentName: "fleet-pact-research", buildId: `${BUILD_ID}/${options.manifestDigest}` },
      useWorkerVersioning: true,
      defaultVersioningBehavior: "PINNED",
    },
  }).catch(async (error) => {
    await connection.close();
    await transport.connection.close();
    throw error;
  });
  const running = worker.run();
  void running.catch(() => {});
  let busy = false;
  let delivery: Promise<void> | undefined;
  const timer = setInterval(() => {
    if (busy) return;
    busy = true;
    delivery = (async () => {
      const rows = (
        await options.store.pool.query(
          "SELECT o.id FROM research_task_outbox o JOIN research_task_owners t ON t.task_id=o.task_id WHERE o.delivered_at IS NULL AND t.manifest_digest=$1 ORDER BY o.created_at,o.id LIMIT 10",
          [options.manifestDigest],
        )
      ).rows;
      for (const row of rows) await owner.deliver(row.id);
    })()
      .catch(() => {})
      .finally(() => {
        busy = false;
      });
  }, 2000);
  return {
    owner,
    running,
    close: async () => {
      clearInterval(timer);
      worker.shutdown();
      try {
        await running;
      } finally {
        await delivery;
        await connection.close();
        await transport.connection.close();
      }
    },
  };
}
