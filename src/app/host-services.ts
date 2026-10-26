import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { Cognition } from "../cognition.js";
import { transaction } from "../db.js";
import { type Data, FleetError } from "../domain.js";
import type { ModelAdmission } from "../platform/admission.js";
import { type ArchitectureDefinition, immutable } from "../platform/architecture.js";
import type { Bindings } from "../platform/bindings.js";
import type { EnvironmentSession, ReadQueryOptions } from "../platform/contracts.js";
import type { ScopedEvidence, ScopedOperation, ScopedServices } from "../platform/engine-context.js";
import type { EngineContext } from "../platform/engine-registry.js";
import type { CommandExecutor } from "../platform/execution.js";
import { executeGroundedDecision } from "../platform/native-grounding.js";
import type { TaskClaim, TaskStore } from "../platform/tasks.js";
import type { Store } from "../store.js";
import { ContinuityV1Repository } from "./continuity-v1-repository.js";
import { createParticipantPorts } from "./participant-context.js";
import { SkillExecutionStore } from "./skill-execution.js";

const scopes = new WeakMap<ScopedServices, { operation: ScopedOperation; context: EngineContext }>();
export function scopedOperationFor(services: ScopedServices): ScopedOperation {
  const scope = scopes.get(services);
  if (!scope) throw new FleetError("UNKNOWN_OPERATION_SCOPE");
  return scope.operation;
}
/** Temporary compatibility adapter owned only by composition; never a public engine port. */
export function compatibilityContextFor(services: ScopedServices): EngineContext {
  const scope = scopes.get(services);
  if (!scope) throw new FleetError("UNKNOWN_OPERATION_SCOPE");
  return scope.context;
}
export async function createScopedServices(
  claim: TaskClaim,
  definition: ArchitectureDefinition,
  _session: EnvironmentSession | undefined,
  deps: {
    context: EngineContext;
    store: Store;
    tasks: TaskStore;
    bindings: Bindings;
    model: ModelAdmission;
    commands: CommandExecutor;
  },
): Promise<ScopedServices> {
  const { context, store, tasks, bindings, commands } = deps,
    owned = structuredClone(claim);
  if (
    context.claim !== claim ||
    context.binding.id !== owned.bindingId ||
    context.task.id !== owned.taskId ||
    !isDeepStrictEqual(definition.manifest.ref, owned.profile)
  )
    throw new FleetError("OPERATION_SCOPE_MISMATCH");
  if ((await bindings.agentFor(context.binding)) !== owned.turn.agentId) throw new FleetError("BINDING_MISMATCH");
  await tasks.check(owned);
  const binding = immutable(structuredClone(context.binding)),
    instanceId = `${binding.id}:${owned.profile.id}@${owned.profile.version}`;
  const selectedModel = owned.turn.cohort.model;
  if (!selectedModel) throw new FleetError("MODEL_CONFIGURATION_REQUIRED");
  const mode =
    definition.manifest.executionModes.includes("sibling-reasoning") &&
    context.capabilities?.parallelReasoning &&
    context.model.supportsSiblingReasoning(selectedModel)
      ? "sibling-reasoning"
      : "serial";
  await transaction(store.pool, async (db) => {
    await tasks.check(owned, db);
    await db.query(
      "INSERT INTO architecture_operations VALUES($1,$2,$3,$4,$5,$6,1,$7) ON CONFLICT(turn_id) DO NOTHING",
      [owned.turn.id, instanceId, binding.id, owned.profile.id, owned.profile.version, mode, store.now()],
    );
    const row = (await db.query("SELECT * FROM architecture_operations WHERE turn_id=$1", [owned.turn.id])).rows[0];
    if (
      row.instance_id !== instanceId ||
      row.binding_id !== binding.id ||
      row.profile_id !== owned.profile.id ||
      row.profile_version !== owned.profile.version ||
      row.mode !== mode
    )
      throw new FleetError("OPERATION_SCOPE_MISMATCH");
  });
  const guard = async () => {
    if (context.signal.aborted) throw new FleetError("TASK_FENCED");
    await tasks.check(owned);
  };
  const codecAllowed = (codec: string) => {
    if (!definition.manifest.stateCodecs.some((c) => `${c.id}.${c.version}` === codec))
      throw new FleetError("UNDECLARED_STATE_CODEC");
  };
  const live = async () => {
    await guard();
    const current = await store.cohort(owned.turn.cohortId);
    return current.observation_consent;
  };
  const now = () => store.now(),
    cutoff = () => new Date(now().getTime() - 30 * 86400000),
    max = (value: unknown) => {
      if (Buffer.byteLength(JSON.stringify(value)) > 64000) throw new FleetError("SCOPED_DATA_LIMIT");
    };
  const op: ScopedOperation = Object.freeze({
    id: owned.turn.id,
    instanceId,
    binding,
    profile: immutable(structuredClone(owned.profile)),
    task: immutable({
      id: context.task.id,
      key: context.task.key,
      revision: context.task.revision,
      sourceCount: context.task.sourceCount,
      sourceRefsOmitted: context.task.sourceRefsOmitted,
    }),
    signal: context.signal,
    observation: immutable(structuredClone(context.observation)),
    eventRefs: immutable([...context.eventRefs]),
    ...(context.task.participantId ? { participantId: context.task.participantId } : {}),
  });
  const model = owned.turn.cohort.model,
    budget = owned.turn.cohort.budget;
  if (!model || !budget) throw new FleetError("MODEL_CONFIGURATION_REQUIRED");
  const candidateGrounding = _session?.decisionGrounding;
  const grounding =
    candidateGrounding && (candidateGrounding.appliesTo?.(owned.profile) ?? true) ? candidateGrounding : undefined;
  const reserve = grounding?.inputReserveBytes ?? 0;
  if (!Number.isSafeInteger(reserve) || reserve < 0 || reserve >= budget.inputByteLimit)
    throw new FleetError("INVALID_GROUNDING_RESERVE", true);
  const initialInputLimit = budget.inputByteLimit - reserve;
  let latestObservation = context.observation;
  const services: ScopedServices = {
    configuration: immutable({
      model: structuredClone(model),
      budget: { ...structuredClone(budget), inputByteLimit: initialInputLimit },
      architectureConfig:
        (
          await store.pool.query("SELECT architecture_config FROM cohort_engine_profiles WHERE cohort_id=$1", [
            owned.turn.cohortId,
          ])
        ).rows[0]?.architecture_config ?? {},
      goal: context.goal,
      instructions: context.instructions,
      parentBudgetId: owned.turn.cohortId,
    }),
    observe: async (query) => {
      await guard();
      const result = await context.observe(query);
      await guard();
      latestObservation = result;
      return result;
    },
    model: {
      correctionEnabled: Boolean(grounding),
      inputBytes: (input) => {
        const prepared = grounding ? grounding.prepare(input, latestObservation) : input;
        return (
          Buffer.byteLength(JSON.stringify(prepared.messages)) + Buffer.byteLength(JSON.stringify(prepared.schema))
        );
      },
      decideWithFeedback: async (request, policy) => {
        await guard();
        if (
          Object.keys(request).some(
            (k) => !["messages", "schema", "outputContract", "maxOutputTokens", "stage", "signal"].includes(k),
          )
        )
          throw new FleetError("MODEL_REQUEST_NOT_ADMITTED", true);
        const result = await context.model.decideWithFeedback(
          owned,
          {
            model,
            messages: request.messages,
            schema: request.schema,
            outputContract: request.outputContract,
            maxOutputTokens: request.maxOutputTokens,
            signal: request.signal ? AbortSignal.any([context.signal, request.signal]) : context.signal,
          },
          policy,
          request.stage,
        );
        await guard();
        return result;
      },
      remainingCalls: async () => {
        await guard();
        return context.model.remainingCalls(owned);
      },
      decide: async (request) => {
        await guard();
        if (
          Object.keys(request).some(
            (k) => !["messages", "schema", "outputContract", "maxOutputTokens", "stage", "signal"].includes(k),
          )
        )
          throw new FleetError("MODEL_REQUEST_NOT_ADMITTED", true);
        if (grounding) {
          if (
            Buffer.byteLength(JSON.stringify(request.messages)) + Buffer.byteLength(JSON.stringify(request.schema)) >
            initialInputLimit
          )
            throw new FleetError("CONTEXT_LIMIT", true);
          const outcome = await executeGroundedDecision(
            {
              model,
              messages: request.messages,
              schema: request.schema,
              outputContract: request.outputContract,
              maxOutputTokens: request.maxOutputTokens,
              signal: request.signal ? AbortSignal.any([context.signal, request.signal]) : context.signal,
            },
            latestObservation,
            grounding,
            {
              run: (attempt, policy) => context.model.decideWithFeedback(owned, attempt, policy, request.stage),
              observe: (query) => services.observe(query),
            },
          );
          await guard();
          await services.trace("deciding", "Native grounded decision", {
            ...outcome.metrics,
            stopReason: outcome.stopReason,
            requestScope: grounding.feedbackScope?.(outcome.observation),
          });
          if (outcome.metrics.unknownUsageCalls > 0) throw new FleetError("USAGE_UNKNOWN");
          if (!outcome.result) throw new FleetError(outcome.error ?? "MODEL_FEEDBACK_FAILED", true);
          const result = outcome.result as typeof outcome.result & { allocationId?: string };
          if (!result.allocationId) throw new FleetError("ALLOCATION_ID_REQUIRED");
          return {
            ...result,
            allocationId: result.allocationId,
            groundedObservation: outcome.observation,
            ...(outcome.stopReason === "accepted"
              ? {}
              : { decisionError: outcome.error ?? "MODEL_FEEDBACK_EXHAUSTED" }),
          };
        }
        const result = await context.model.decide(
          owned,
          {
            model,
            messages: request.messages,
            schema: request.schema,
            outputContract: request.outputContract,
            maxOutputTokens: request.maxOutputTokens,
            signal: request.signal ? AbortSignal.any([context.signal, request.signal]) : context.signal,
          },
          request.stage,
        );
        if (!result.allocationId) throw new FleetError("ALLOCATION_ID_REQUIRED");
        await guard();
        return { ...result, allocationId: result.allocationId };
      },
    },
    actions: {
      submit: async (intent) => {
        await guard();
        if (intent.bindingId !== binding.id) throw new FleetError("BINDING_MISMATCH", true);
        const result = await commands.submit(owned, intent, _session);
        await guard();
        return result;
      },
      resolve: async (commandId) => {
        await guard();
        const row = (
          await store.pool.query("SELECT turn_id FROM platform_commands WHERE command_id=$1 AND binding_id=$2", [
            commandId,
            binding.id,
          ])
        ).rows[0];
        if (!row) throw new FleetError("COMMAND_SCOPE_MISMATCH");
        const result = await commands.reconcile(row.turn_id, commandId);
        await guard();
        return result;
      },
    },
    state: {
      load: async (codec) => {
        codecAllowed(codec);
        if (!(await live())) return null;
        const row = (
          await store.pool.query(
            "SELECT * FROM architecture_scoped_state WHERE instance_id=$1 AND binding_id=$2 AND codec=$3",
            [instanceId, binding.id, codec],
          )
        ).rows[0];
        await guard();
        if (row && new Date(row.updated_at).getTime() <= cutoff().getTime()) return { version: row.version, value: {} };
        return row
          ? {
              version: row.version,
              value: store.vault.decrypt<Data>(
                row.value_cipher,
                `architecture-state:${instanceId}:${binding.id}:${codec}`,
              ),
            }
          : null;
      },
      accept: async (input) => {
        codecAllowed(input.codec);
        max(input.value);
        await guard();
        if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0)
          throw new FleetError("INVALID_STATE_VERSION");
        return transaction(store.pool, async (db) => {
          await db.query("SELECT id FROM cohorts WHERE id=$1 FOR UPDATE", [owned.turn.cohortId]);
          await tasks.check(owned, db);
          if (context.signal.aborted) throw new FleetError("TASK_FENCED");
          if (!(await store.cohort(owned.turn.cohortId, db)).observation_consent)
            return { version: input.expectedVersion, accepted: false };
          await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,19281501))", [
            `${instanceId}:${input.codec}`,
          ]);
          const row = (
            await db.query(
              "SELECT version FROM architecture_scoped_state WHERE instance_id=$1 AND binding_id=$2 AND codec=$3 FOR UPDATE",
              [instanceId, binding.id, input.codec],
            )
          ).rows[0];
          const version = row?.version ?? 0;
          if (version !== input.expectedVersion) throw new FleetError("STALE_STATE_VERSION");
          await db.query(
            "INSERT INTO architecture_scoped_state VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(instance_id,binding_id,codec) DO UPDATE SET version=excluded.version,value_cipher=excluded.value_cipher,updated_at=excluded.updated_at",
            [
              instanceId,
              binding.id,
              input.codec,
              version + 1,
              store.vault.encrypt(input.value, `architecture-state:${instanceId}:${binding.id}:${input.codec}`),
              now(),
            ],
          );
          return { version: version + 1, accepted: true };
        });
      },
    },
    evidence: {
      capture: async (input) => {
        max(input);
        if (input.kind.length > 100 || input.sourceRefs.length > 100 || input.sourceRefs.some((s) => s.length > 8000))
          throw new FleetError("SCOPED_DATA_LIMIT");
        if (!(await live()))
          return {
            id: "unavailable",
            kind: input.kind,
            detail: { available: false, code: "CONSENT_REQUIRED" },
            sourceRefs: [],
          };
        const evidence: ScopedEvidence = { id: randomUUID(), ...structuredClone(input) };
        await transaction(store.pool, async (db) => {
          await db.query("SELECT id FROM cohorts WHERE id=$1 FOR UPDATE", [owned.turn.cohortId]);
          await tasks.check(owned, db);
          if (context.signal.aborted) throw new FleetError("TASK_FENCED");
          if (!(await store.cohort(owned.turn.cohortId, db)).observation_consent)
            throw new FleetError("CONSENT_REQUIRED");
          await db.query("INSERT INTO architecture_scoped_evidence VALUES($1,$2,$3,$4,$5,$6)", [
            evidence.id,
            instanceId,
            binding.id,
            input.kind,
            store.vault.encrypt(evidence, `architecture-evidence:${instanceId}:${binding.id}:${evidence.id}`),
            now(),
          ]);
        });
        return evidence;
      },
      retained: async (ids) => {
        if (ids.length > 100) throw new FleetError("SCOPED_DATA_LIMIT");
        if (!(await live())) return [];
        const rows = (
          await store.pool.query(
            "SELECT id,detail_cipher FROM architecture_scoped_evidence WHERE instance_id=$1 AND binding_id=$2 AND id=ANY($3::uuid[]) AND created_at>$4 ORDER BY created_at,id",
            [instanceId, binding.id, ids, cutoff()],
          )
        ).rows;
        await guard();
        return rows.map((r) =>
          store.vault.decrypt<ScopedEvidence>(
            r.detail_cipher,
            `architecture-evidence:${instanceId}:${binding.id}:${r.id}`,
          ),
        );
      },
    },
    tasks: {
      waitForEvent: async () => {
        await guard();
        await context.waitForEvent?.();
        await guard();
      },
    },
    trace: async (stage, label, detail) => {
      await guard();
      await context.trace?.(stage, label, detail);
      await guard();
    },
    environment: {
      specialistObservationPolicies: context.specialistObservationPolicies
        ? immutable(structuredClone(context.specialistObservationPolicies))
        : undefined,
      specialistObservationPolicy: context.specialistObservationPolicy
        ? immutable(structuredClone(context.specialistObservationPolicy))
        : undefined,
      skillTemplates: context.skillSupport?.templates
        ? immutable(structuredClone(context.skillSupport.templates))
        : undefined,
      capabilities: immutable(
        structuredClone(
          context.capabilities ?? {
            timing: "turn",
            events: "none",
            idempotency: "none",
            outcomeLookup: false,
            parallelReasoning: false,
            social: false,
            simulationControls: false,
          },
        ),
      ),
      schemas: immutable(structuredClone(context.schemas ?? { observations: [], actions: [] })),
      specialistPresets: context.specialistPresets ? immutable(structuredClone(context.specialistPresets)) : undefined,
      observationSemantics: context.observationSemantics,
      observationSemanticsFor: context.observationSemanticsFor,
      conditionContracts: context.conditionContracts
        ? immutable(structuredClone(context.conditionContracts))
        : undefined,
      accountObjective: context.accountObjective,
      catalog: async () => {
        await guard();
        const result = (await context.catalog?.()) ?? [];
        await guard();
        return result;
      },
      refreshProposal: context.refreshProposal
        ? async (proposal, observation) => {
            await guard();
            const refresh = context.refreshProposal;
            if (!refresh) throw new FleetError("UNSUPPORTED_CAPABILITY");
            const result = await refresh(proposal, observation);
            await guard();
            return result;
          }
        : undefined,
      validateProposal: context.validateProposal
        ? async (...args: Parameters<NonNullable<EngineContext["validateProposal"]>>) => {
            await guard();
            const fn = context.validateProposal;
            if (!fn) throw new FleetError("UNSUPPORTED_CAPABILITY");
            const result = await fn(...args);
            await guard();
            return result;
          }
        : undefined,
      readQuerySchema: context.readQuerySchema
        ? async (options?: ReadQueryOptions) => {
            await guard();
            const result = await context.readQuerySchema?.(options);
            await guard();
            if (!result) throw new FleetError("UNSUPPORTED_CAPABILITY");
            return result;
          }
        : undefined,
      waitSchema: context.waitSchema
        ? async (...args: Parameters<NonNullable<EngineContext["waitSchema"]>>) => {
            await guard();
            const fn = context.waitSchema;
            if (!fn) throw new FleetError("UNSUPPORTED_CAPABILITY");
            const result = await fn(...args);
            await guard();
            return result;
          }
        : undefined,
      validateWait: context.validateWait
        ? async (...args: Parameters<NonNullable<EngineContext["validateWait"]>>) => {
            await guard();
            const fn = context.validateWait;
            if (!fn) throw new FleetError("UNSUPPORTED_CAPABILITY");
            const result = await fn(...args);
            await guard();
            return result;
          }
        : undefined,
      actionContracts: context.actionContracts
        ? async (...args: Parameters<NonNullable<EngineContext["actionContracts"]>>) => {
            await guard();
            const fn = context.actionContracts;
            if (!fn) throw new FleetError("UNSUPPORTED_CAPABILITY");
            const result = await fn(...args);
            await guard();
            return result;
          }
        : undefined,
      projectObservation: context.projectObservation,
      packObservation: context.packObservation,
    },
  };
  if (definition.manifest.modules.some((m) => m.id === "continuity" && m.version === "1")) {
    const id = owned.profile.id;
    if (id !== "reactive-cognition" && id !== "specialist-coordinator")
      throw new FleetError("UNSUPPORTED_CONTINUITY_NAMESPACE");
    const repository = new ContinuityV1Repository(tasks, bindings, new Cognition(store), {
      id,
      version: owned.profile.version,
    });
    services.continuity = {
      context: (o) => repository.context(binding, owned, o),
      restrict: (c) => repository.restrict(owned, c),
      apply: (version, raw) => repository.apply(binding, owned, version, raw),
      recordCommand: (r) => repository.recordCommand(binding, owned, r),
    };
  }
  scopes.set(services, { operation: op, context });
  if (definition.manifest.modules.some((m) => m.id === "participant-state" && m.version === "1"))
    services.participants = await createParticipantPorts({
      store,
      tasks,
      commands,
      context,
      operation: op,
      services,
      definition,
      session: _session,
    });
  return services;
}

export function compatibilityRuntime(
  services: ScopedServices,
  make: () => import("../platform/engine-registry.js").RegisteredEngine,
): import("../platform/architecture.js").ArchitectureRuntime {
  const engine = make();
  if ("create" in engine && engine.create) return engine.create(services);
  return {
    route: () => [],
    run: async (operation) => {
      if (operation !== scopedOperationFor(services)) throw new FleetError("OPERATION_SCOPE_MISMATCH");
      await (engine as import("../platform/engine-registry.js").AgentEngine).run(compatibilityContextFor(services));
    },
  };
}

export function hostScopeFactory(deps: {
  store: Store;
  tasks: TaskStore;
  bindings: Bindings;
  model: ModelAdmission;
  commands: CommandExecutor;
}) {
  const factory = async (
    context: EngineContext,
    definition: ArchitectureDefinition,
    session: EnvironmentSession | undefined,
  ) => {
    const services = await createScopedServices(context.claim, definition, session, { ...deps, context });
    return { services, operation: scopedOperationFor(services) };
  };
  const counts = new Map<string, number>();
  const work = async (claim: TaskClaim, bootstrap: boolean) => {
    const row = (
      await deps.store.pool.query("SELECT architecture_config FROM cohort_engine_profiles WHERE cohort_id=$1", [
        claim.turn.cohortId,
      ])
    ).rows[0];
    if (
      row?.architecture_config?.skillMode !== "guarded" ||
      !deps.store.architectures
        .resolve(claim.profile)
        .manifest.modules.some((m) => m.id === "skills" && m.version === "1")
    )
      return;
    const task = await deps.tasks.get(claim.taskId);
    if (!task.participantId) throw new FleetError("PARTICIPANT_SCOPE_REQUIRED", true);
    if (bootstrap) counts.set(claim.turn.id, 0);
    const index = counts.get(claim.turn.id) ?? 0;
    counts.set(claim.turn.id, index + 1);
    await new SkillExecutionStore(
      deps.store,
      {
        instanceId: `${claim.bindingId}:${claim.profile.id}@${claim.profile.version}`,
        bindingId: claim.bindingId,
        specialistId: task.participantId,
      },
      (db) => deps.tasks.check(claim, db),
    ).hostWork(claim.turn.id, bootstrap ? "bootstrap" : `observation:${index}`, { reads: 1, steps: 1 });
  };
  return Object.assign(factory, {
    beforeConnect: (claim: TaskClaim) => work(claim, true),
    beforeObserve: (claim: TaskClaim) => work(claim, false),
    finished: (claim: TaskClaim) => {
      counts.delete(claim.turn.id);
    },
  });
}
