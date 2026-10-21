import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { transaction } from "../db.js";
import { FleetError } from "../domain.js";
import type { Original } from "../modules/evidence/negotiation/v1.js";
import type { ArchitectureDefinition } from "../platform/architecture.js";
import type { EnvironmentSession } from "../platform/contracts.js";
import type { ScopedEvidence, ScopedOperation, ScopedServices } from "../platform/engine-context.js";
import type { EngineContext } from "../platform/engine-registry.js";
import type { CommandExecutor } from "../platform/execution.js";
import { launchDigest } from "../platform/launch.js";
import { SpecialistPresetSchema, type SpecialistScope } from "../platform/participant-state.js";
import type { TaskStore } from "../platform/tasks.js";
import type { Store } from "../store.js";
import { ParticipantActions } from "./action-services.js";
import { ParticipantMessages } from "./participant-messaging.js";
import { SpecialistRepository } from "./participant-services.js";

export async function createParticipantPorts(deps: {
  store: Store;
  tasks: TaskStore;
  commands: CommandExecutor;
  context: EngineContext;
  operation: ScopedOperation;
  services: ScopedServices;
  definition: ArchitectureDefinition;
  session?: EnvironmentSession;
}): Promise<NonNullable<ScopedServices["participants"]>> {
  const { store, tasks, commands, context, operation: op, services, definition, session } = deps;
  if (!op.participantId || !session?.effects) throw new FleetError("PARTICIPANT_SCOPE_REQUIRED", true);
  const config = services.configuration.architectureConfig,
    raw = context.specialistPresets?.find((p) => p.id === config.preset);
  if (!raw) throw new FleetError("SPECIALIST_PRESET_REQUIRED", true);
  const preset = SpecialistPresetSchema.parse(raw),
    scope: SpecialistScope = { instanceId: op.instanceId, bindingId: op.binding.id, specialistId: op.participantId };
  if (!preset.roles.some((r) => r.charter.id === scope.specialistId)) throw new FleetError("UNKNOWN_SPECIALIST", true);
  const guardWithin = async (db: PoolClient) => {
    if (op.signal.aborted) throw new FleetError("TASK_FENCED", true);
    await tasks.check(context.claim, db);
  };
  const guard = () => transaction(store.pool, guardWithin);
  const repository = new SpecialistRepository(store, scope, guardWithin);
  await repository.initialize(
    preset.roles.map((r) => ({
      ...r.charter,
      maxActiveGoals: Math.min(r.charter.maxActiveGoals, Number(config.maxActiveGoals)),
    })),
  );
  const cutoff = () => new Date(store.now().getTime() - 30 * 86400000);
  const inbox = async () => {
    await guard();
    const rows = (
      await store.pool.query(
        "SELECT * FROM specialist_deliveries WHERE instance_id=$1 AND binding_id=$2 AND recipient=$3 AND task_id=$4 AND status='pending' ORDER BY sequence LIMIT 100",
        [scope.instanceId, scope.bindingId, scope.specialistId, op.task.id],
      )
    ).rows;
    const count = (
      await store.pool.query(
        "SELECT count(*)::int n FROM specialist_deliveries WHERE instance_id=$1 AND binding_id=$2 AND recipient=$3 AND task_id=$4 AND status='pending'",
        [scope.instanceId, scope.bindingId, scope.specialistId, op.task.id],
      )
    ).rows[0].n;
    await guard();
    return {
      records: rows.map((r) => ({
        id: r.id as string,
        rootId: r.root_id as string,
        depth: r.depth as number,
        event:
          r.detail_cipher && new Date(r.received_at) > cutoff()
            ? store.vault.decrypt<import("../platform/contracts.js").EnvironmentEvent>(
                r.detail_cipher,
                `specialist-delivery:${scope.instanceId}:${scope.bindingId}:${scope.specialistId}:${r.id}`,
              )
            : null,
      })),
      omitted:
        Math.max(0, count - rows.length) +
        rows.filter((r) => !r.detail_cipher || new Date(r.received_at) <= cutoff()).length,
    };
  };
  const ports: NonNullable<ScopedServices["participants"]> = {
    load: () => repository.load(scope),
    inbox,
    captureOriginal: async (input) => {
      if (Buffer.byteLength(JSON.stringify(input)) > 64000 || !input.sourceRefs.length || input.sourceRefs.length > 100)
        throw new FleetError("SPECIALIST_DATA_LIMIT", true);
      return transaction(store.pool, async (db) => {
        await db.query("SELECT id FROM cohorts WHERE id=$1 FOR UPDATE", [context.claim.turn.cohortId]);
        await guardWithin(db);
        if (!(await store.cohort(context.claim.turn.cohortId, db)).observation_consent)
          throw new FleetError("CONSENT_REQUIRED", true);
        const key = launchDigest(input),
          old = (
            await db.query(
              "SELECT e.id,e.detail_cipher,e.created_at FROM specialist_original_index i JOIN architecture_scoped_evidence e ON e.id=i.evidence_id WHERE i.instance_id=$1 AND i.binding_id=$2 AND i.origin_key=$3 FOR UPDATE OF i",
              [scope.instanceId, scope.bindingId, key],
            )
          ).rows[0];
        if (old && new Date(old.created_at) > cutoff())
          return store.vault.decrypt<ScopedEvidence>(
            old.detail_cipher,
            `architecture-evidence:${scope.instanceId}:${scope.bindingId}:${old.id}`,
          ).detail as Original;
        const id = randomUUID(),
          original: Original = {
            ...input,
            id,
            bindingId: scope.bindingId,
            createdAt: store.now().toISOString(),
            expiresAt: new Date(store.now().getTime() + 30 * 86400000).toISOString(),
          };
        const evidence: ScopedEvidence = {
          id,
          kind: `specialist-${input.kind}.v1`,
          detail: original,
          sourceRefs: input.sourceRefs,
        };
        await db.query("INSERT INTO architecture_scoped_evidence VALUES($1,$2,$3,$4,$5,$6)", [
          id,
          scope.instanceId,
          scope.bindingId,
          evidence.kind,
          store.vault.encrypt(evidence, `architecture-evidence:${scope.instanceId}:${scope.bindingId}:${id}`),
          store.now(),
        ]);
        await db.query(
          "INSERT INTO specialist_original_index VALUES($1,$2,$3,$4) ON CONFLICT(instance_id,binding_id,origin_key) DO UPDATE SET evidence_id=excluded.evidence_id",
          [scope.instanceId, scope.bindingId, key, id],
        );
        return original;
      });
    },
    originals: async () => {
      await guard();
      const rows = (
        await store.pool.query(
          "SELECT id,detail_cipher FROM architecture_scoped_evidence WHERE instance_id=$1 AND binding_id=$2 AND kind IN('specialist-outcome.v1','specialist-promise.v1','specialist-observation.v1') AND created_at>$3 ORDER BY CASE kind WHEN 'specialist-outcome.v1' THEN 0 WHEN 'specialist-promise.v1' THEN 1 ELSE 2 END,created_at DESC,id LIMIT 100",
          [scope.instanceId, scope.bindingId, cutoff()],
        )
      ).rows;
      await guard();
      return rows.map(
        (r) =>
          store.vault.decrypt<ScopedEvidence>(
            r.detail_cipher,
            `architecture-evidence:${scope.instanceId}:${scope.bindingId}:${r.id}`,
          ).detail as Original,
      );
    },
    accept: async (input) => {
      input = structuredClone(input);
      const completed = input.envelope.goals.filter((g) => g.status === "completed");
      if (completed.length) {
        const current = await services.observe({}),
          previous = await repository.load(scope);
        for (const goal of completed) {
          const condition = goal.assessmentCondition,
            old = previous.goals.find((g) => g.id === goal.id);
          if (!condition || (old && launchDigest(old.assessmentCondition) !== launchDigest(condition)))
            throw new FleetError("GOAL_OUTCOME_REQUIRED", true);
          const predicate = context.conditionPredicates?.get(`${condition.name}@${condition.version}`);
          let satisfied = false;
          try {
            satisfied = predicate?.(condition.args, current.payload) === true;
          } catch {
            /* malformed predicate inputs are not completion evidence */
          }
          if (!satisfied) throw new FleetError("GOAL_OUTCOME_REQUIRED", true);
          const proof = await ports.captureOriginal({
            kind: "outcome",
            causalKey: `goal:${goal.id}`,
            sourceRefs: current.sourceRefs,
            entityRefs: [],
            goalRefs: [goal.id],
            detail: {
              goalId: goal.id,
              fulfilled: true,
              assessmentCondition: condition,
              observedRevision: current.revision,
              environmentTime: current.environmentTime,
            },
          });
          goal.evidenceIds = [...new Set([...goal.evidenceIds, proof.id])];
        }
      }
      const delivered = await inbox();
      const messaging = new ParticipantMessages(store, tasks, op.binding, op.instanceId, {
        taskId: op.task.id,
        deliveryIds: delivered.records.map((r) => r.id),
        clock: op.observation.environmentTime,
      });
      const effects = messaging.acceptWithin.bind(messaging);
      const state = new SpecialistRepository(store, scope, guardWithin, effects);
      const result = input.intent
        ? await new ParticipantActions({
            store,
            tasks,
            commands,
            claim: context.claim,
            binding: op.binding,
            specialistId: scope.specialistId,
            quote: (intent) => {
              if (!session.effects) throw new FleetError("ACTION_EFFECTS_PROTOCOL_REQUIRED", true);
              return session.effects(intent);
            },
            clock: op.observation.environmentTime,
            messagesWithin: effects,
            resultRecipients: (event) =>
              definition.route?.(
                { instanceId: op.instanceId, binding: op.binding, event },
                {
                  ...config,
                  subscriptions: preset.roles.map((r) => ({
                    participantId: r.charter.id,
                    subscriptionVersion: r.subscriptions.version,
                    categories: r.subscriptions.categories,
                    periodic: r.subscriptions.periodic,
                  })),
                },
              ) ?? [],
          }).acceptAndDispatch(input)
        : await state.accept(scope, {
            expectedVersion: input.expectedVersion,
            operationId: op.id,
            envelope: input.envelope,
          });
      await messaging.deliverOutbox(8, op.signal);
      return result;
    },
  };
  return ports;
}
