import type { PoolClient } from "pg";
import { type Data, FleetError } from "../domain.js";
import { runTrustedCases } from "../modules/skills/v1/qualification.js";
import { RecipeRunner, SkillSelector } from "../modules/skills/v1/runner.js";
import type { SkillVersion } from "../modules/skills/v1/schema.js";
import type { Observation } from "../platform/contracts.js";
import type { ScopedOperation, ScopedServices } from "../platform/engine-context.js";
import type { EngineContext } from "../platform/engine-registry.js";
import type { CommandExecutor } from "../platform/execution.js";
import { launchDigest } from "../platform/launch.js";
import type { SpecialistScope } from "../platform/participant-state.js";
import type { TaskStore } from "../platform/tasks.js";
import type { Store } from "../store.js";
import { ParticipantActions } from "./action-services.js";
import type { SpecialistRepository } from "./participant-services.js";
import { SkillExecutionStore } from "./skill-execution.js";
import { ScopedSkillRepository } from "./skill-services.js";
export function ownerIntentDigest(context: EngineContext, services: ScopedServices, observation: Observation) {
  const objective = context.accountObjective?.(observation);
  return launchDigest({
    owner: typeof objective === "string" ? objective : (objective?.intent ?? null),
    goal: services.configuration.goal ?? null,
    instructions: services.configuration.instructions ?? null,
  });
}
export async function attachSkillExecution(d: {
  store: Store;
  tasks: TaskStore;
  commands: CommandExecutor;
  context: EngineContext;
  operation: ScopedOperation;
  services: ScopedServices;
  scope: SpecialistScope;
  repository: SpecialistRepository;
  guardWithin(db: PoolClient): Promise<void>;
  accept(
    input: Parameters<NonNullable<ScopedServices["participants"]>["accept"]>[0],
    recipe?: {
      validate(): Promise<void>;
      constraints(effects: import("../platform/action-effects.js").ActionEffects): Record<string, string>;
      verifiedGoalIds?: string[];
    },
  ): Promise<{ version: number; accepted: boolean; outcome?: import("../platform/contracts.js").ActionOutcome }>;
}) {
  const { store, context, operation: op, services, scope, repository } = d,
    support = context.skillSupport;
  if (!support) throw new FleetError("GUARDED_SKILLS_UNSUPPORTED", true);
  const db = new SkillExecutionStore(store, scope, d.guardWithin),
    library = new ScopedSkillRepository(store, scope, d.guardWithin);
  // Validate a finite parent before any invocation or qualification work.
  await db.limits({ reads: 0, actions: 0, messages: 0, steps: 1, wallTimeMs: 1 });
  let current = op.observation;
  const goal = async (id: string) => {
    const state = await repository.load(scope),
      g = state.goals.find((g) => g.id === id);
    if (!g?.routine) return null;
    const stamp = (
      await store.pool.query(
        "SELECT * FROM specialist_goal_routines WHERE instance_id=$1 AND binding_id=$2 AND specialist_id=$3 AND goal_id=$4",
        [scope.instanceId, scope.bindingId, scope.specialistId, id],
      )
    ).rows[0];
    const owner = ownerIntentDigest(context, services, current),
      revision = launchDigest(g);
    return {
      id,
      kind: g.routine.kind,
      parameters: g.routine.parameters,
      revision,
      ownerRevision: owner,
      active: g.status === "active" && stamp?.goal_digest === revision && stamp?.owner_digest === owner,
      allowedActions: state.charter.allowedActions,
    };
  };
  const children = async (s: SkillVersion) => {
    const found = new Map<string, SkillVersion>();
    const visit = async (v: SkillVersion, depth: number) => {
      if (depth > 2) throw new FleetError("SKILL_COMPOSITION_DEPTH", true);
      for (const ref of v.body.procedure.children) {
        const key = `${ref.id}:${ref.version}:${ref.digest}`;
        if (found.has(key)) continue;
        const [child] = await library.loadSelected(scope, [ref]);
        found.set(key, child);
        await visit(child, depth + 1);
      }
    };
    await visit(s, 0);
    return found;
  };
  const runner = new RecipeRunner({
    scope,
    registry: support.registry,
    repository: db,
    work: db,
    load: async (ref) => (await library.loadSelected(scope, [ref]))[0],
    children,
    eligible: (s, c) => library.executionEligible(scope, s.ref, support.registry, support.policy, c),
    goal,
    observe: async (query) => {
      current = await context.observe(query, true);
      return current.payload;
    },
    submit: async (payload, commandId, validate, read) => {
      const state = await repository.load(scope);
      const result = await d.accept(
        {
          expectedVersion: state.version,
          envelope: {
            goals: [],
            memories: [],
            predictions: [],
            plan: state.plan,
            deliveryIds: (await services.participants!.inbox()).records.map((r) => r.id),
            messages: [],
            wakeConditions: [],
          },
          intent: { commandId, bindingId: scope.bindingId, schemaId: support.schemaId, payload },
        },
        {
          validate: async () => {
            await read();
            current = await context.observe({}, true);
            await validate();
          },
          constraints: (effects) => support.reserveConstraints?.(activeInputs, effects) ?? {},
        },
      );
      return result.outcome as unknown as Data;
    },
    recover: async (commandId) => {
      const r = (
        await store.pool.query(
          "SELECT p.state FROM specialist_intents i JOIN platform_commands p ON p.command_id=i.command_id WHERE i.command_id=$1 AND i.instance_id=$2 AND i.binding_id=$3 AND i.specialist_id=$4",
          [commandId, scope.instanceId, scope.bindingId, scope.specialistId],
        )
      ).rows[0];
      if (!r) return { status: "not_prepared" };
      const actions = new ParticipantActions({
        store,
        tasks: d.tasks,
        commands: d.commands,
        binding: op.binding,
        scope,
      });
      const outcome =
        r.state === "prepared" ? await actions.expirePrepared(commandId) : await actions.reconcile(commandId);
      return { status: outcome.status, outcome: outcome as unknown as Data };
    },
    request: async () => {
      throw new FleetError("SKILL_MESSAGE_TEMPLATE_UNSUPPORTED", true);
    },
    now: () => store.now(),
    signal: op.signal,
  });
  let activeInputs: Data = {};
  services.skills!.tryKnownGoal = async () => {
    const triggerId = launchDigest({ taskId: op.task.id, revision: op.task.revision, eventRefs: op.eventRefs });
    // Recovery is considered first even when a goal, source or skill has since changed.
    const pending = (
      await store.pool.query(
        "SELECT id FROM skill_invocations WHERE instance_id=$1 AND binding_id=$2 AND specialist_id=$3 AND state IN('active','waiting','unknown') ORDER BY started_at LIMIT 2",
        [scope.instanceId, scope.bindingId, scope.specialistId],
      )
    ).rows;
    if (pending.length > 1) return { handled: false, reason: "AMBIGUOUS_SKILL_INVOCATION" };
    let invocation: import("../modules/skills/v1/checkpoints.js").Invocation | undefined;
    if (pending[0]) {
      const old = await db.load(pending[0].id);
      activeInputs = old.inputs;
      invocation = await runner.resume(old.id, triggerId);
    } else {
      const state = await repository.load(scope),
        goals = state.goals.filter((g) => g.routine && g.status === "active");
      if (goals.length !== 1) return { handled: false, reason: "EXACT_ROUTINE_GOAL_REQUIRED" };
      const g = await goal(goals[0].id);
      if (!g?.active) return { handled: false, reason: "SKILL_GOAL_CHANGED" };
      const index = [
          ...(await library.retrieve(scope, { goal: g.kind, event: "", limit: 8 })),
          ...(await library.qualificationCandidates(scope)),
        ],
        candidates: SkillVersion[] = [];
      await db.hostWork(op.id, "skill-retrieval", { steps: 1 });
      for (const summary of index) {
        if (!summary.goalKinds.includes(g.kind)) continue;
        let [s] = await library.loadSelected(scope, [summary.ref]);
        if (s.status === "candidate" && s.body.representation === "recipe") {
          const cases = support.cases(s);
          if (!cases) {
            await library.transition(scope, s.ref, { expectedStatus: "candidate", nextStatus: "advisory" });
            continue;
          }
          await db.hostWork(op.id, `qualification:${s.ref.id}:${s.ref.version}`, {
            steps: cases.cases.length * s.body.procedure.nodes.length,
            wallTimeMs: cases.cases.length * support.policy.maxCaseTimeMs,
          });
          const began = performance.now(),
            c = await children(s);
          await library.recordQualification(
            scope,
            s.ref,
            support.registry,
            support.policy,
            await runTrustedCases(s, support.registry, support.policy, cases, s.body.evidence.sourceIds, c),
            c,
          );
          await db.hostActual(
            op.id,
            `qualification:${s.ref.id}:${s.ref.version}`,
            Math.max(1, Math.ceil(performance.now() - began)),
          );
          [s] = await library.loadSelected(scope, [s.ref]);
        }
        candidates.push(s);
      }
      const choice = new SkillSelector().choose(g, candidates);
      if (choice.kind !== "recipe") return { handled: false, reason: choice.reason };
      activeInputs = g.parameters;
      invocation = await runner.start(scope, {
        goalId: g.id,
        inputs: g.parameters,
        skillRef: choice.skillRef,
        triggerId,
      });
    }
    await services.trace("deciding", "Guarded routine checkpoint", {
      invocationId: invocation.id,
      state: invocation.state,
      nodeIndex: invocation.nodeIndex,
      reason: invocation.reason,
      modelCalls: 0,
    });
    let proofId: string | undefined;
    if (invocation.state === "completed" && (invocation.values.verification as Data | undefined)?.fulfilled === true) {
      proofId = (
        await services.participants!.captureOriginal({
          kind: "outcome",
          causalKey: `goal:${invocation.goalId}`,
          sourceRefs: current.sourceRefs,
          entityRefs: [],
          goalRefs: [invocation.goalId],
          detail: {
            goalId: invocation.goalId,
            fulfilled: true,
            verification: invocation.values.verification,
            observedRevision: current.revision,
          },
        })
      ).id;
    }
    const used = !!(
      await store.pool.query(
        "SELECT 1 FROM specialist_updates WHERE instance_id=$1 AND binding_id=$2 AND specialist_id=$3 AND operation_id=$4",
        [scope.instanceId, scope.bindingId, scope.specialistId, op.id],
      )
    ).rowCount;
    const handled = used || ["active", "waiting", "unknown", "completed"].includes(invocation.state);
    if (handled && !used) {
      const state = await repository.load(scope),
        g = state.goals.find((g) => g.id === invocation.goalId),
        completed =
          proofId && g
            ? { ...g, status: "completed" as const, evidenceIds: [...new Set([...g.evidenceIds, proofId])] }
            : undefined;
      await d.accept(
        {
          expectedVersion: state.version,
          envelope: {
            goals: completed ? [completed] : [],
            memories: [],
            predictions: [],
            plan: state.plan,
            deliveryIds: (await services.participants!.inbox()).records.map((r) => r.id),
            messages: [],
            wakeConditions: [],
          },
        },
        completed ? { validate: async () => {}, constraints: () => ({}), verifiedGoalIds: [completed.id] } : undefined,
      );
    }
    return {
      handled,
      state: invocation.state,
      reason: invocation.reason ?? undefined,
    };
  };
}
