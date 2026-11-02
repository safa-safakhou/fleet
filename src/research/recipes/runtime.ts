import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FleetError } from "../../domain.js";
import type { ScopedOperation, ScopedServices } from "../../platform/engine-context.js";
import { pactOptions } from "../broker/game.js";
import type { DecisionProposal, ResearchBroker } from "../broker/server.js";
import { serveBroker } from "../broker/transport.js";
import type { RunScope } from "../contracts.js";
import { ManifestRepository } from "../manifests/repository.js";
import { checkpointScriptedPolicy } from "../policies/pact-scripted.js";
import { type PythonExecutor, runPythonWorker } from "../workers/python.js";
import { ReferenceBrokerClient, runReferenceWorker } from "../workers/reference.js";
import { oneStepAdvisorySchema } from "./advisory-contract.js";
import { RecipeConfig, validateRecipe } from "./pact-reference.js";
/** Kernel-composed runtime for explicitly enrolled fresh PACT tasks only. */
export async function runPactRecipe(
  id: string,
  broker: ResearchBroker,
  scope: RunScope,
  services: ScopedServices,
  operation: ScopedOperation,
  executor?: PythonExecutor,
) {
  const config = RecipeConfig.parse(services.configuration.architectureConfig),
    manifest = await new ManifestRepository(broker.store.pool).load(scope.manifestDigest);
  if (
    validateRecipe(id, config).length ||
    manifest.profile.id !== id ||
    manifest.profile.version !== "1" ||
    manifest.components.worker !== config.worker ||
    manifest.components.policy !== config.policy ||
    manifest.context.policy !== config.contextPolicy ||
    manifest.memory.namespace !== config.memoryNamespace
  )
    throw new FleetError("RECIPE_COMPONENT_INCOMPATIBLE", true);
  const owner = (
    await broker.store.pool.query("SELECT scheduler_owner,research_manifest_digest FROM platform_tasks WHERE id=$1", [
      scope.taskId,
    ])
  ).rows[0];
  if (owner?.scheduler_owner !== "temporal" || owner.research_manifest_digest !== scope.manifestDigest)
    throw new FleetError("RESEARCH_TASK_OWNER_REQUIRED", true);
  const role = manifest.roles.find((r) => r.authority === (id === "pact-research-advisory" ? "advisory" : "actor"));
  if (!role) throw new FleetError("AUTHORITY_DENIED", true);
  const auth = await broker.open(scope, services, role.id, operation.signal, operation.observation),
    session = await broker.authenticate(auth.token);
  let transport: Awaited<ReturnType<typeof serveBroker>> | undefined, ipc: string | undefined;
  try {
    const checkpoint = await broker.loadCheckpoint(session, scope),
      steps = await broker.stepMap(session, scope),
      blocked = steps.some((s) => s.result.status !== "completed" || !s.result.resultRef);
    const oneStepAdvisory = role.authority === "advisory" && config.maxSteps === 1;
    const outputSchema = oneStepAdvisory ? oneStepAdvisorySchema(operation.observation.sourceRefs) : undefined;
    const guidance = oneStepAdvisory
      ? "You are an advisory agent with no gameplay command authority and one final decision. Return advisory or wait with payload {text}, exact sourceRefs selected from the observation, and empty preconditions {}. Do not request another read or an action; there is no remaining reasoning step. Distinguish observed facts from inference and missing information."
      : "Actions use a delivered native quoted payload and exact revision/clock preconditions.";
    const instructions = `${services.configuration.instructions ?? ""}\nUse only the supplied authorized PACT observation. Available read tools: ${JSON.stringify(manifest.tools)}. A read decision has kind read and payload {tool, arguments}. Return sourceRefs from delivered evidence. ${guidance} You cannot claim success; Fleet validates and submits. No implicit repairs.`;
    const input = {
      instructions,
      observation: operation.observation,
      maxSteps: config.maxSteps,
      maxOutputTokens: manifest.model.parameters.maxOutputTokens,
      ...(outputSchema ? { outputSchema } : {}),
      workerVersion: config.worker,
      policyVersion: config.policy,
      checkpoint,
      steps,
      blocked,
    };
    let result: unknown;
    if (id === "pact-research-scripted") {
      if (blocked) throw new FleetError("PARTIAL_OPERATION_REQUIRES_RECONCILIATION", true);
      if (steps.length) {
        const saved = steps.find((s) => s.logical_step_id === "proposal:1");
        if (!checkpoint?.state.policy || steps.length !== 1 || !saved?.result.resultRef)
          throw new FleetError("PARTIAL_OPERATION_REQUIRES_RECONCILIATION", true);
        result = {
          proposalRef: saved.result.resultRef,
          checkpointRef: { id: checkpoint.id, version: checkpoint.version },
          sourceRefs: checkpoint.sourceRefs,
        };
      } else {
        const o = operation.observation,
          option = pactOptions(o).find(
            (x) => config.scriptedAction && (x.payload as Record<string, unknown>)?.kind === config.scriptedAction,
          );
        const candidate: DecisionProposal | undefined = option
          ? {
              kind: "action",
              payload: { schemaId: "pact.action.v1", payload: option.payload },
              sourceRefs: option.sourceRefs as string[],
              preconditions: {},
            }
          : undefined;
        if (candidate && typeof (o.payload.world as Record<string, unknown> | undefined)?.paused !== "boolean")
          throw new FleetError("CLOCK_STATUS_UNAVAILABLE", true);
        const policy = await checkpointScriptedPolicy(
          broker,
          session,
          scope,
          {
            eventRef: operation.eventRefs[0] ?? `task:${scope.taskId}`,
            nowUtc: broker.store.now().toISOString(),
            maxObservationAgeMs: manifest.context.maxObservationAgeMs,
            observation: o,
            clock: {
              ...o.environmentTime,
              paused: (o.payload.world as Record<string, unknown> | undefined)?.paused === true,
            },
            deadline: { clockId: manifest.clock.deadlineId, value: manifest.clock.deadlineValue },
            authority: role.authority,
            candidate,
          },
          config.worker,
          checkpoint?.version ?? "0",
          checkpoint?.state.policy,
        );

        // Stable proposal key persists across checkpoint restore; broker lifetime dedupe owns submission.
        const proposal = await broker.proposeAction(
          session,
          scope,
          { operationId: scope.operationId, operationEpoch: scope.operationEpoch, logicalStepId: "proposal:1" },
          policy.proposal,
        );
        result = {
          proposalRef: proposal.resultRef,
          checkpointRef: policy.checkpointRef,
          sourceRefs: policy.proposal.sourceRefs,
        };
      }
    } else if (config.worker === "typescript-reference@1")
      result = await runReferenceWorker(new ReferenceBrokerClient(broker, session, scope), input);
    else {
      if (!executor) throw new FleetError("RESEARCH_PYTHON_EXECUTOR_REQUIRED", true);
      if (executor.mode === "container" && manifest.components.workerImage !== executor.image)
        throw new FleetError("CAPABILITY_CHANGED", true);
      // Native macOS Unix socket paths are deliberately short; no shared operator socket directory.
      ipc = await mkdtemp(join(tmpdir(), "frw-"));
      transport = await serveBroker(broker, join(ipc, "b.sock"));
      const turn = (await broker.store.pool.query("SELECT deadline_at FROM turns WHERE id=$1", [scope.turnId])).rows[0];
      result = await runPythonWorker(
        executor,
        {
          socket: transport.socket,
          token: auth.token,
          input: {
            protocolVersion: 1,
            scope,
            workerVersion: config.worker,
            policyVersion: config.policy,
            roleId: role.id,
            instructions,
            observationJson: JSON.stringify(operation.observation),
            ...(outputSchema ? { outputSchemaJson: JSON.stringify(outputSchema) } : {}),
            maxSteps: config.maxSteps,
            maxOutputTokens: manifest.model.parameters.maxOutputTokens,
            deadlineUtc: new Date(turn.deadline_at).toISOString(),
          },
        },
        operation.signal,
      );
    }
    await broker.capture.emit(scope, "decision.proposed", result, {}, { required: true });
    await services.trace("deciding", "Experimental PACT recipe produced references", {
      recipe: id,
      worker: config.worker,
    });
  } finally {
    await broker.stop(auth.sessionId);
    await broker.sessions.acknowledge(session);
    await transport?.close();
    if (ipc) await rm(ipc, { recursive: true, force: true });
  }
}
