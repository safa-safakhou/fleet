import type { ResearchBroker } from "../broker/server.js";
import type { WorkerSession } from "../broker/session.js";
import { canonical, type RunScope } from "../contracts.js";
import { POLICY_VERSION, type PolicyInput, StatechartPolicy } from "../workers/statechart.js";
/** Persistence/evidence adapter, deliberately outside the pure policy. Submission remains a broker port. */
export async function checkpointScriptedPolicy(
  broker: ResearchBroker,
  session: WorkerSession,
  scope: RunScope,
  input: PolicyInput,
  workerVersion: string,
  expectedVersion: string,
  checkpoint?: unknown,
) {
  const result = new StatechartPolicy().step(input, checkpoint);
  const loaded = checkpoint ? await broker.loadCheckpoint(session, scope) : null;
  if (checkpoint && (!loaded || canonical(loaded.state.policy) !== canonical(result.checkpoint)))
    throw new Error("CHECKPOINT_INCOMPATIBLE");
  const ref = loaded
    ? { id: loaded.id, version: loaded.version }
    : await broker.checkpoint(session, scope, expectedVersion, {
        workerVersion,
        policyVersion: POLICY_VERSION,
        steps: [],
        sourceRefs: result.proposal.sourceRefs,
        state: { policy: result.checkpoint },
      });
  const stored = (
    await broker.store.pool.query("SELECT state_ref FROM research_worker_checkpoints WHERE id=$1 AND operation_id=$2", [
      ref.id,
      scope.operationId,
    ])
  ).rows[0];
  // The encrypted checkpoint contains the trace. Restoring repairs a missing event with the same artifact identity.
  await broker.capture.recorder.append(scope, {
    kind: "policy.transition",
    streamId: "policy",
    producerKey: `transition:${result.checkpoint.proposalId}`,
    artifacts: [stored.state_ref],
  });
  return { ...result, checkpointRef: ref };
}
