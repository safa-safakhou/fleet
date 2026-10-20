import { FleetError, safeCode } from "../domain.js";
import { Observability } from "../observability.js";
import type { ModelAdmission } from "./admission.js";
import type { ArchitectureDefinition } from "./architecture.js";
import type { Bindings } from "./bindings.js";
import type { EnvironmentSession, Observation } from "./contracts.js";
import type { ScopedOperation, ScopedServices } from "./engine-context.js";
import type { EngineContext, EngineRegistry } from "./engine-registry.js";
import { type EnvironmentRegistry, requireCapabilities } from "./environment-registry.js";
import type { CommandExecutor } from "./execution.js";
import { assertDeadline, type TaskClaim, type TaskStore } from "./tasks.js";
export class OperationSupervisor {
  private stopping = false;
  private operations = new Map<string, { claim: TaskClaim; controller: AbortController; promise: Promise<void> }>();
  constructor(private tasks: TaskStore) {}
  run(claim: TaskClaim, operation: (signal: AbortSignal) => Promise<void>): Promise<void> {
    if (this.stopping) return Promise.reject(new FleetError("HOST_STOPPED"));
    if (this.operations.has(claim.taskId)) return Promise.reject(new FleetError("OPERATION_ALREADY_ACTIVE"));
    const controller = new AbortController();
    const promise = (async () => {
      const signal = AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(Math.max(1, claim.turn.deadline.getTime() - this.tasks.store.now().getTime())),
      ]);
      const guard = setInterval(() => {
        void this.tasks.check(claim).catch((error) => controller.abort(error));
      }, 250);
      try {
        await this.tasks.check(claim);
        if (signal.aborted) throw new FleetError("TASK_FENCED");
        await operation(signal);
        await this.tasks.finish(claim, "WAIT");
      } catch (error) {
        await this.tasks.finish(claim, safeCode(error));
        throw error;
      } finally {
        clearInterval(guard);
        this.operations.delete(claim.taskId);
      }
    })();
    this.operations.set(claim.taskId, { claim, controller, promise });
    return promise;
  }
  async stop(taskId?: string) {
    if (taskId === undefined) this.stopping = true;
    const operations = [...this.operations.values()].filter((op) => taskId === undefined || op.claim.taskId === taskId);
    for (const operation of operations) {
      operation.controller.abort();
      try {
        await this.tasks.cancel(operation.claim);
      } catch (error) {
        if (!(error instanceof FleetError) || !["TASK_FENCED", "CLAIM_FENCED"].includes(error.code)) throw error;
      }
    }
  }
  async drain() {
    await Promise.allSettled([...this.operations.values()].map((op) => op.promise));
  }
}
export class PlatformHost {
  constructor(
    private tasks: TaskStore,
    private bindings: Bindings,
    private environments: EnvironmentRegistry,
    private engines: EngineRegistry,
    private model: ModelAdmission,
    private commands: CommandExecutor,
    readonly supervisor: OperationSupervisor,
    private scopeFactory?: (
      context: EngineContext,
      definition: ArchitectureDefinition,
      session: EnvironmentSession | undefined,
    ) => Promise<{ services: ScopedServices; operation: ScopedOperation }>,
  ) {}
  async run(claim: TaskClaim) {
    return this.supervisor.run(claim, async (signal) => {
      const engine = this.engines.resolve(claim.profile),
        binding = await this.bindings.get(claim.bindingId),
        task = await this.tasks.get(claim.taskId);
      const adapter = this.environments.resolve(binding.environment);
      requireCapabilities(adapter, engine.requiredCapabilities, engine.requiredSchemas);
      let session: EnvironmentSession | undefined;
      if (engine.observationOwner !== "engine")
        session = await this.environments.connect(binding, engine.requiredCapabilities, engine.requiredSchemas);
      try {
        const observe = async (query: import("../domain.js").Data) => {
          await this.tasks.check(claim);
          if (signal.aborted) throw new FleetError("TASK_FENCED");
          if (!session) throw new FleetError("OBSERVATION_OWNED_BY_ENGINE");
          const result = await session.observe(query);
          await this.tasks.check(claim);
          assertDeadline((await this.tasks.get(claim.taskId)).deadline, result.environmentTime, this.tasks.store.now());
          return result;
        };
        const observation: Observation = session
          ? await observe({})
          : {
              schemaId: adapter.schemas.observations[0],
              revision: "delegated",
              observedAt: this.tasks.store.now().toISOString(),
              environmentTime: { clockId: "unavailable", value: "unavailable" },
              sourceRefs: [],
              payload: {},
              coverage: {
                delegated: true,
                detail:
                  "Compatibility controller performs its original observation flow; this is not a world snapshot.",
              },
            };
        await new Observability(this.tasks.store).record(
          claim.turn,
          "observing",
          session ? "Task observation delivered" : "Task observation delegated to compatibility engine",
          {
            taskId: task.id,
            bindingId: binding.id,
            profile: claim.profile,
            environment: binding.environment,
            sourceRefs: task.sourceRefs,
            sourceCount: task.sourceCount,
            sourceRefsOmitted: task.sourceRefsOmitted,
            observation,
          },
        );
        const context: EngineContext = {
          claim,
          binding,
          task,
          observation,
          model: this.model.guarded(
            async () => {
              await observe({});
            },
            adapter.capabilities.parallelReasoning &&
              (
                this.engines.architectures?.resolve(claim.profile).manifest.executionModes ??
                engine.executionModes ??
                []
              ).includes("sibling-reasoning"),
          ),
          commands: this.commands,
          observe,
          eventRefs: task.sourceRefs,
          signal,
          schemas: adapter.schemas,
          goal: adapter.presentation.defaultGoal,
          instructions: adapter.instructions,
          accountObjective: adapter.accountObjective?.bind(adapter),
          trace: async (stage, label, detail) => {
            await this.tasks.check(claim);
            await new Observability(this.tasks.store).record(claim.turn, stage, label, detail);
          },
          capabilities: adapter.capabilities,
          waitSchema: session?.waitSchema,
          validateWait: session?.validateWait,
          validateProposal: session?.validateProposal,
          actionContracts: session?.actionContracts,
          packObservation: session?.packObservation,
          catalog: async () => {
            if (!session) throw new FleetError("OBSERVATION_OWNED_BY_ENGINE");
            await this.tasks.check(claim);
            return session.catalog();
          },
          waitForEvent: async () => {
            await this.tasks.check(claim);
            await this.tasks.store.pool.query(
              "UPDATE platform_tasks SET wake=$2 WHERE id=$1 AND fence=$3 AND state='running'",
              [claim.taskId, { kind: "event" }, claim.fence],
            );
          },
        };
        const definition =
          this.engines.architectures?.resolve(claim.profile) ??
          ("create" in engine
            ? { manifest: engine.manifest, validate: () => [], create: engine.create.bind(engine) }
            : undefined);
        if (this.scopeFactory && definition) {
          const scope = await this.scopeFactory(context, definition, session);
          await definition.create(scope.services).run(scope.operation);
        } else if ("create" in engine) throw new FleetError("SCOPED_HOST_REQUIRED");
        else await (engine as import("./engine-registry.js").AgentEngine).run(context);
      } finally {
        await session?.close().catch(() => {});
      }
    });
  }
  async tick(worker: string) {
    const claim = await this.tasks.claim(worker, this.tasks.store.now());
    if (claim) await this.run(claim);
    return claim;
  }
  stop(taskId?: string) {
    return this.supervisor.stop(taskId);
  }
  drain() {
    return this.supervisor.drain();
  }
}
