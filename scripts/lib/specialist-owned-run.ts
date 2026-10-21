import type { OwnedSpecialistWorld } from "../../../pact/tests/evaluation/specialist-owned-world.js";
import { builtinArchitectures } from "../../src/app/builtins.js";
import { hostScopeFactory } from "../../src/app/host-services.js";
import { SpecialistRepository } from "../../src/app/participant-services.js";
import { SkillExecutionStore } from "../../src/app/skill-execution.js";
import {
  type Data,
  FleetError,
  type GamePort,
  type ModelPort,
  type ModelSettings,
  object,
  safeCode,
} from "../../src/domain.js";
import { createPactEnvironment, PactBindings } from "../../src/environments/pact.js";
import { pactSpecialistPresets } from "../../src/environments/pact-presets.js";
import { designDigest } from "../../src/negotiation-plan.js";
import { ModelAdmission, type ModelResult, RouteCapacity } from "../../src/platform/admission.js";
import { Bindings } from "../../src/platform/bindings.js";
import { EngineRegistry } from "../../src/platform/engine-registry.js";
import { EnvironmentRegistry } from "../../src/platform/environment-registry.js";
import { CommandExecutor } from "../../src/platform/execution.js";
import { OperationSupervisor, PlatformHost } from "../../src/platform/supervisor.js";
import { type TaskClaim, TaskStore } from "../../src/platform/tasks.js";
import {
  assessSpecialistCell,
  type SpecialistCell,
  type SpecialistCellEvidence,
  type SpecialistGrant,
  type SpecialistProtocol,
  validateSpecialistGrant,
} from "../../src/specialist-qualification.js";
import type { Store } from "../../src/store.js";

export type PreparedSpecialistCell = {
  cell: SpecialistCell;
  world: OwnedSpecialistWorld;
  binding: SpecialistGrant["bindings"][number];
  authorityDigest: string;
  model: ModelSettings;
  budgetDeadline: string;
};
const configuration = (c: SpecialistCell) => ({
  preset: c.preset,
  maxActiveGoals: 8,
  memoryBytes: 6000,
  skillMode: c.skillMode,
  learning: true,
  qualificationPolicy: "skills-policy.v1",
});
async function authorityFacts(w: OwnedSpecialistWorld) {
  return (
    await w.pool.query(
      "SELECT m.account_id,m.allowed_actions,m.resource_limits,m.reserve_floors,m.version,k.ambition FROM kingdom_mandates m JOIN kingdoms k ON k.account_id=m.account_id AND k.product_scope=m.product_scope WHERE m.account_id=ANY($1::uuid[]) ORDER BY m.account_id",
      [(await w.leaseFacts()).map((l) => l.accountId)],
    )
  ).rows;
}
export async function prepareOwnedSpecialistCohort(
  store: Store,
  world: OwnedSpecialistWorld,
  cell: SpecialistCell,
  model: ModelSettings,
  fixtureNonce: string,
  evidenceRef: string,
  keyRef: string,
): Promise<PreparedSpecialistCell> {
  const ref = { id: "pact", version: "1", instanceId: world.worldId },
    bindings = new Bindings(store, ref),
    tasks = new TaskStore(store, bindings, 1);
  const group = await store.create({
    name: cell.id,
    count: 1,
    intervalMinutes: 15,
    seed: cell.id.slice(0, 40),
    strategies: ["merchant"],
  });
  await store.configure(group.id, {
    model,
    budget: {
      mode: "finite",
      callLimit: cell.limits.calls,
      tokenLimit: cell.limits.reservedTokens,
      deadlineAt: new Date(Date.now() + 21600000).toISOString(),
      perCallTokenLimit: 40000,
      maxOutputTokens: 2000,
      inputByteLimit: 24000,
      maxCallsPerTurn: 3,
      maxActionsPerTurn: 3,
      concurrency: 1,
    },
  });
  await store.consent(group.id, true);
  await tasks.enroll(group.id, cell.profile);
  await store.pool.query(
    "UPDATE cohort_engine_profiles SET architecture_config=$2,non_model_limits=$3 WHERE cohort_id=$1",
    [group.id, configuration(cell), cell.workLimits],
  );
  const agent = (await store.pool.query("SELECT id FROM agents WHERE cohort_id=$1", [group.id])).rows[0];
  await store.pool.query(
    "UPDATE agents SET account_id=$2,kingdom_id=$3,state='ready',credential_state='ready' WHERE id=$1",
    [agent.id, world.accountId, world.actorId],
  );
  const b = await new PactBindings(store, bindings).attach(agent.id),
    instanceId = `${b.id}:autonomous-specialists@1`;
  const preset = pactSpecialistPresets.find((p) => p.id === cell.preset);
  if (!preset) throw new FleetError("KQ1_PRESET", true);
  await new SpecialistRepository(store, { instanceId, bindingId: b.id }).initialize(preset.roles.map((r) => r.charter));
  const budgetDeadline = (await store.cohort(group.id)).budget?.deadlineAt;
  if (!budgetDeadline) throw new FleetError("KQ1_BUDGET_REQUIRED", true);
  return {
    cell,
    world,
    model: structuredClone(model),
    budgetDeadline,
    authorityDigest: designDigest(await authorityFacts(world)),
    binding: {
      cellId: cell.id,
      worldId: world.worldId,
      cohortId: group.id,
      actorId: world.actorId,
      peerId: world.peerId,
      bindingId: b.id,
      fixtureNonce,
      evidenceRef,
      keyRef,
    },
  };
}
type Dependencies = {
  store: Store;
  prepared: PreparedSpecialistCell[];
  provider: ModelPort;
  evidenceLevel: "fake-provider" | "real-provider";
  verifyArtifacts(): Promise<void>;
  reviewResponse(claim: TaskClaim, result: ModelResult): Promise<void>;
  persist(kind: string, detail: unknown): Promise<void>;
};
type CellResult = {
  cellId: string;
  status: "completed" | "failed" | "not_started";
  reason?: string;
  assessment?: ReturnType<typeof assessSpecialistCell>;
};
async function ledger(store: Store, cohortId: string) {
  return (
    await store.pool.query(
      "SELECT id,turn_id,tokens::int reserved_tokens,input_tokens::int,output_tokens::int,status FROM compute_ledger WHERE cohort_id=$1 ORDER BY created_at,id",
      [cohortId],
    )
  ).rows;
}
/** All real effects remain native host/PACT operations. This runner owns no
 * destructive teardown, recovery review, replay, provider launch or hidden turn. */
export async function executeOwnedSpecialistProtocol(
  protocol: SpecialistProtocol,
  grant: SpecialistGrant,
  d: Dependencies,
) {
  const { store } = d,
    check = validateSpecialistGrant(protocol, grant, Date.now());
  if (!check.valid) throw new FleetError(check.reasons[0] ?? "KQ1_GRANT", true);
  if (
    (await store.pool.query("SELECT 1 FROM specialist_qualification_batches WHERE nonce=$1", [grant.batchNonce]))
      .rowCount
  )
    throw new FleetError("KQ1_NONCE_CONSUMED", true);
  if (
    d.prepared.length !== 8 ||
    protocol.cells.some(
      (c) =>
        !d.prepared.some(
          (p) =>
            designDigest(p.cell) === designDigest(c) &&
            grant.bindings.some((b) => designDigest(b) === designDigest(p.binding)),
        ),
    )
  )
    throw new FleetError("KQ1_PREPARED_SCOPE", true);
  await d.verifyArtifacts();
  const saved = await store.pool.query(
    "INSERT INTO specialist_qualification_batches VALUES($1,$2,$3,'consumed',$4,NULL,NULL) ON CONFLICT DO NOTHING",
    [grant.batchNonce, protocol.digest, designDigest(grant), new Date()],
  );
  if (!saved.rowCount) throw new FleetError("KQ1_NONCE_CONSUMED", true);
  const cells: CellResult[] = protocol.cells.map((c) => ({ cellId: c.id, status: "not_started" }));
  const batchAbort = new AbortController();
  let stopped = false,
    closed = false,
    parkFailed = false;
  try {
    for (const [index, cell] of protocol.cells.entries()) {
      if (stopped) break;
      const p = d.prepared.find((p) => p.cell.id === cell.id);
      if (!p) throw new FleetError("KQ1_PREPARED_SCOPE", true);
      const began = Date.now(),
        cutoff = Math.min(Date.parse(grant.cutoffAt), began + cell.limits.wallDeadlineMs),
        ref = { id: "pact", version: "1", instanceId: p.world.worldId };
      const bindings = new Bindings(store, ref),
        pb = new PactBindings(store, bindings);
      let claim: TaskClaim | undefined,
        expectedAuthority = p.authorityDigest,
        expectedDeadline = p.budgetDeadline,
        renewalError: unknown,
        workSequence = 0,
        zeroCallReuse = 0,
        exactGoal = false;
      let activated = false;
      const guard = async () => {
        if (closed || renewalError) throw renewalError ?? new FleetError("KQ1_ADMISSION_CLOSED", true);
        if (Date.now() >= cutoff) throw new FleetError("KQ1_UTC_CUTOFF", true);
        await d.verifyArtifacts();
        const marker = (await store.pool.query("SELECT nonce FROM public.architecture_fixture_owner")).rows;
        if (marker.length !== 1 || marker[0].nonce !== p.binding.fixtureNonce)
          throw new FleetError("KQ1_OWNER_DRIFT", true);
        const group = await store.cohort(p.binding.cohortId),
          profile = (
            await store.pool.query("SELECT * FROM cohort_engine_profiles WHERE cohort_id=$1", [p.binding.cohortId])
          ).rows[0];
        if (
          !group.observation_consent ||
          !group.budget ||
          group.budget.mode !== "finite" ||
          designDigest(group.model) !== designDigest(p.model) ||
          group.budget.deadlineAt !== expectedDeadline ||
          group.interval_minutes !== 15 ||
          group.budget.callLimit !== cell.limits.calls ||
          group.budget.tokenLimit !== cell.limits.reservedTokens ||
          group.budget.perCallTokenLimit !== 40000 ||
          group.budget.maxCallsPerTurn !== 3 ||
          group.budget.maxActionsPerTurn !== 3 ||
          group.budget.maxOutputTokens !== 2000 ||
          group.budget.inputByteLimit !== 24000 ||
          group.budget.concurrency !== 1 ||
          profile?.profile_id !== "autonomous-specialists" ||
          profile.profile_version !== "1" ||
          profile.timed_reviews ||
          designDigest(profile.architecture_config) !== designDigest(configuration(cell)) ||
          designDigest(profile.non_model_limits) !== designDigest(cell.workLimits)
        )
          throw new FleetError("KQ1_CONFIGURATION_DRIFT", true);
        const b = await bindings.get(p.binding.bindingId);
        if (
          b.entityRef !== p.world.actorId ||
          b.accountRef !== p.world.accountId ||
          b.actorRef !== p.world.accountId ||
          b.environment.instanceId !== p.world.worldId ||
          b.environment.id !== "pact" ||
          b.environment.version !== "1"
        )
          throw new FleetError("KQ1_BINDING_DRIFT", true);
        if (designDigest(await authorityFacts(p.world)) !== expectedAuthority)
          throw new FleetError("KQ1_AUTHORITY_DRIFT", true);
        if (activated && !(await p.world.leaseFacts()).every((l) => l.live && l.leaseId))
          throw new FleetError("KQ1_LEASE_LOST", true);
        const allocations = await ledger(store, p.binding.cohortId);
        if (allocations.some((a) => a.status === "unknown")) throw new FleetError("KQ1_UNKNOWN_USAGE", true);
        if (allocations.some((a) => a.status === "reserved" && a.turn_id !== claim?.turn.id))
          throw new FleetError("KQ1_ORPHAN_RESERVATION", true);
        if (
          allocations.length > cell.limits.calls ||
          allocations.reduce((n, a) => n + Number(a.reserved_tokens), 0) > cell.limits.reservedTokens
        )
          throw new FleetError("KQ1_MODEL_CAP", true);
        if (
          (
            await store.pool.query(
              "SELECT 1 FROM platform_commands c JOIN turns t ON t.id=c.turn_id WHERE t.cohort_id=$1 AND c.state IN ('pending','unknown') LIMIT 1",
              [p.binding.cohortId],
            )
          ).rowCount
        )
          throw new FleetError("KQ1_UNCERTAIN_COMMAND", true);
        if (closed || Date.now() >= cutoff) throw new FleetError("KQ1_ADMISSION_CLOSED", true);
        await p.world.refreshControlledSchedule();
      };
      let tasks: TaskStore;
      const meter = async (work: { reads?: number; actions?: number; messages?: number; steps?: number }) => {
        if (!claim) throw new FleetError("KQ1_CLAIM_REQUIRED", true);
        const task = await tasks.get(claim.taskId);
        if (!task.participantId || !cell.roles.includes(task.participantId))
          throw new FleetError("KQ1_ROLE_SCOPE", true);
        await new SkillExecutionStore(
          store,
          {
            instanceId: `${claim.bindingId}:autonomous-specialists@1`,
            bindingId: claim.bindingId,
            specialistId: task.participantId,
          },
          (db) => tasks.check(claim as TaskClaim, db),
        ).hostWork(claim.turn.id, `KQ1:owned-port:${workSequence++}`, work);
      };
      const game: GamePort = {
        profile: async () => ({ accountId: p.world.accountId }),
        open: async () => {},
        close: async () => {},
        tools: async () => [
          ...[
            "pact_world_read_v1",
            "pact_agent_guide_v1",
            "pact_observation_read_v2",
            "pact_action_effects_quote_v1",
          ].map((name) => ({ name, inputSchema: { type: "object" }, annotations: { readOnlyHint: true } })),
          ...["pact_game_action_v2", "pact_action_effects_execute_v1"].map((name) => ({
            name,
            inputSchema: { type: "object" },
            annotations: { readOnlyHint: false },
          })),
        ],
        read: async (name, args) => {
          await guard();
          await meter({ reads: 1, steps: 1 });
          if (name === "pact_world_read_v1") return (await p.world.actor.readSelf()) as unknown as Data;
          if (name === "pact_agent_guide_v1")
            return await p.world.actor.guide(args.topic as Parameters<typeof p.world.actor.guide>[0]);
          if (name === "pact_observation_read_v2")
            return (await p.world.actor.readSection(
              args as unknown as Parameters<typeof p.world.actor.readSection>[0],
            )) as unknown as Data;
          throw new FleetError("UNSUPPORTED_SCOPED_READ", true);
        },
        submit: async () => {
          throw new FleetError("KQ1_UNGUARDED_LANE_FORBIDDEN", true);
        },
        effects: async (command) => {
          await guard();
          await meter({ reads: 1, steps: 1 });
          return (await p.world.actor.effects(command)) as unknown as Data;
        },
        submitGuarded: async (command, rawGuard) => {
          await guard();
          await meter({ actions: 1, steps: 1 });
          return (await p.world.actor.submitGuarded(
            command,
            rawGuard as unknown as Parameters<typeof p.world.actor.submitGuarded>[1],
          )) as unknown as Data;
        },
        receipt: async (id) => {
          await guard();
          await meter({ reads: 1, steps: 1 });
          return ((await p.world.actor.receipt(id)) as unknown as Data) ?? { commandId: id, code: "RECEIPT_NOT_FOUND" };
        },
      };
      const adapter = createPactEnvironment({
          store,
          bindings: pb,
          game: async () => game,
          now: () => new Date(),
          eventFeedVersion: "pact.agent-events.v1",
          actionEffectsVersion: "fleet.action-effects.v1",
        }),
        environments = new EnvironmentRegistry([adapter], ref);
      tasks = new TaskStore(store, bindings, 1, environments);
      const provider: ModelPort = {
        tracksDispatch: true,
        decide: async (request) => {
          const onDispatch = async () => {
            await guard();
            await request.onDispatch?.();
          };
          if (!d.provider.tracksDispatch) await onDispatch();
          return d.provider.decide({
            ...request,
            onDispatch,
            signal: AbortSignal.any([
              request.signal,
              batchAbort.signal,
              AbortSignal.timeout(Math.max(1, cutoff - Date.now())),
            ]),
          });
        },
      };
      const admission = new ModelAdmission(
        store,
        tasks,
        provider,
        new RouteCapacity(store, () => ({ key: `KQ1:${grant.batchNonce}`, capacity: 1 })),
        async () => guard(),
      ).reviewed(async (c, result) => {
        await guard();
        await d.reviewResponse(c, result);
        await guard();
        const update = object(object(result.decision).update),
          messages = Array.isArray(update.messages) ? update.messages : [];
        if (messages.length) await meter({ messages: messages.length, steps: messages.length });
      });
      const commands = new CommandExecutor(store, tasks, bindings, environments),
        host = new PlatformHost(
          tasks,
          bindings,
          environments,
          new EngineRegistry([], builtinArchitectures()),
          admission,
          commands,
          new OperationSupervisor(tasks),
          hostScopeFactory({ store, tasks, bindings, model: admission, commands }),
        );
      const renewal = setInterval(() => {
        if (activated)
          void p.world.renewLeases().catch((e) => {
            renewalError = e;
            closed = true;
            batchAbort.abort(e);
          });
      }, 300000);
      try {
        await guard();
        await p.world.activateLeases();
        activated = true;
        await store.pool.query(
          "UPDATE cohorts SET budget=jsonb_set(budget,'{deadlineAt}',to_jsonb($2::text)) WHERE id=$1",
          [p.binding.cohortId, new Date(cutoff).toISOString()],
        );
        expectedDeadline = new Date(cutoff).toISOString();
        await store.setState(p.binding.cohortId, "running", true);
        const binding = await bindings.get(p.binding.bindingId),
          scope = {
            instanceId: `${binding.id}:autonomous-specialists@1`,
            bindingId: binding.id,
            specialistId: "diplomacy",
          },
          repo = new SpecialistRepository(store, scope);
        const currentOwner = JSON.parse(String((await p.world.actor.readSelf())?.ambition)),
          expectedRoutine = currentOwner.routine;
        if (cell.scenario === "changed-consent-reserve") {
          const before = await authorityFacts(p.world);
          await p.world.applyCounterexample();
          const after = await authorityFacts(p.world),
            expected = before.map((row) =>
              row.account_id === p.world.accountId
                ? {
                    ...row,
                    allowed_actions: row.allowed_actions.filter((a: string) => a !== "supply.sign"),
                    version: row.version + 1,
                  }
                : row,
            );
          if (designDigest(after) !== designDigest(expected))
            throw new FleetError("KQ1_COUNTEREXAMPLE_AUTHORITY_DRIFT", true);
          expectedAuthority = designDigest(after);
          await d.persist("planned-counterexample", {
            cellId: cell.id,
            authorityDigest: expectedAuthority,
            minute: 0,
            beforeFirstModelDecision: true,
          });
        }
        for (const [cycle, minute] of [0, 16, 32, 112].entries()) {
          await guard();
          await p.world.advanceTo(minute);
          const event = {
            id: `${cell.id}:cycle:${cycle}`,
            type: "periodic_review",
            sourceRef: `${cell.id}:cycle:${cycle}`,
            observedAt: new Date().toISOString(),
            environmentTime: { clockId: "pact.game-time-ms", value: String(minute * 60000) },
            metadata: {},
          };
          const published = await tasks.publishFromEvent(binding, event, event.id);
          if (
            published.length !== cell.roles.length ||
            new Set(published.map((t) => t.participantId)).size !== cell.roles.length ||
            published.some((t) => !t.participantId || !cell.roles.includes(t.participantId))
          )
            throw new FleetError("KQ1_ROUTING_SCOPE", true);
          for (const task of published) {
            await guard();
            const count = (
              await store.pool.query(
                "SELECT count(*)::int n FROM platform_task_claims c JOIN platform_tasks t ON t.id=c.task_id WHERE t.cohort_id=$1 AND t.participant_id=$2",
                [p.binding.cohortId, task.participantId],
              )
            ).rows[0].n;
            if (count >= 4) throw new FleetError("KQ1_ROLE_TURN_CAP", true);
            const prior = (await repo.load(scope)).goals.filter(
              (g) => g.status === "active" && g.routine && designDigest(g.routine) === designDigest(expectedRoutine),
            );
            if (prior.length) exactGoal = true;
            const beforeCalls = (await ledger(store, p.binding.cohortId)).length;
            claim =
              (await tasks.claim(`KQ1:${grant.batchNonce}`, new Date(), task.id, async () => guard())) ?? undefined;
            if (!claim || claim.bindingId !== binding.id) throw new FleetError("KQ1_TASK_ADMISSION", true);
            await d.persist("turn-start", {
              cellId: cell.id,
              cycle,
              minute,
              role: task.participantId,
              turnId: claim.turn.id,
            });
            await host.run(claim);
            if (
              task.participantId === "diplomacy" &&
              prior.length &&
              beforeCalls === (await ledger(store, p.binding.cohortId)).length &&
              (
                await store.pool.query(
                  "SELECT 1 FROM skill_invocations WHERE binding_id=$1 AND goal_id=ANY($2::uuid[]) AND state IN ('waiting','completed') LIMIT 1",
                  [binding.id, prior.map((g) => g.id)],
                )
              ).rowCount
            )
              zeroCallReuse++;
            claim = undefined;
          }
        }
        await guard();
        await p.world.advanceTo(120);
        const material = await p.world.evidence(),
          allocations = await ledger(store, p.binding.cohortId),
          roleRows = (
            await store.pool.query(
              "SELECT t.participant_id,count(*)::int n FROM platform_task_claims c JOIN platform_tasks t ON t.id=c.task_id WHERE t.cohort_id=$1 GROUP BY t.participant_id",
              [p.binding.cohortId],
            )
          ).rows;
        const workRows = (
          await store.pool.query(
            "SELECT kind,sum(units)::text reserved,sum(actual_units)::text actual FROM (SELECT w.kind,w.units,w.actual_units FROM specialist_turn_work w WHERE cohort_id=$1 UNION ALL SELECT w.kind,w.units,w.actual_units FROM skill_work_reservations w JOIN skill_invocations i ON i.id=w.invocation_id WHERE i.cohort_id=$1) work GROUP BY kind",
            [p.binding.cohortId],
          )
        ).rows;
        const work = { reads: 0, actions: 0, messages: 0, steps: 0, wallTimeMs: 0 };
        for (const r of workRows) if (r.kind in work) work[r.kind as keyof typeof work] = Number(r.reserved);
        const evidence: SpecialistCellEvidence = {
          complete: true,
          evidenceLevel: d.evidenceLevel,
          sourceRefs: [`fleet-cohort:${p.binding.cohortId}`, ...material.sourceRefs],
          allocations: allocations.map((a) => ({
            id: a.id,
            reservedTokens: Number(a.reserved_tokens),
            inputTokens: a.input_tokens,
            outputTokens: a.output_tokens,
            status: a.status,
          })),
          roleTurns: Object.fromEntries(roleRows.map((r) => [r.participant_id, r.n])),
          criticalFailures: [],
          actualFullDelivery: material.actualFullDelivery,
          exactExistingGoal: exactGoal,
          zeroCallReuseOpportunities: zeroCallReuse,
          prohibitedEffects: cell.scenario === "changed-consent-reserve" ? material.raw.contracts.length : 0,
          learningObserved: Boolean(
            (await store.pool.query("SELECT 1 FROM skill_versions WHERE binding_id=$1 LIMIT 1", [binding.id])).rowCount,
          ),
          work,
        };
        const assessment = assessSpecialistCell(cell, evidence);
        await d.persist("cell-outcome", {
          cellId: cell.id,
          evidence,
          material: material.raw,
          workRows,
          elapsedMs: Date.now() - began,
        });
        cells[index] = { cellId: cell.id, status: assessment.status === "pass" ? "completed" : "failed", assessment };
        if (assessment.criticalFailures.length) stopped = true;
      } catch (error) {
        cells[index] = { cellId: cell.id, status: "failed", reason: safeCode(error) };
        stopped = true;
        if (
          claim &&
          (await store.pool.query("SELECT state FROM turns WHERE id=$1", [claim.turn.id])).rows[0]?.state === "running"
        )
          await tasks.finish(claim, safeCode(error));
        await d.persist("cell-stopped", { cellId: cell.id, reason: safeCode(error) });
      } finally {
        clearInterval(renewal);
        await store.setState(p.binding.cohortId, "paused", true);
        await p.world.pauseClock("KQ1_TERMINAL");
      }
    }
  } finally {
    closed = true;
    batchAbort.abort();
    const errors: unknown[] = [];
    for (const p of d.prepared)
      try {
        await p.world.pauseClock("KQ1_BATCH_TERMINAL");
      } catch (error) {
        errors.push(error);
      }
    parkFailed = errors.length > 0;
  }
  if (parkFailed) throw new FleetError("KQ1_PARK_FAILED", true);
  const result = {
    schemaVersion: "fleet.specialist-qualification-batch.v1",
    protocolDigest: protocol.digest,
    batchNonce: grant.batchNonce,
    status: stopped ? ("stopped" as const) : ("complete" as const),
    cells,
    productionQualified: false,
  };
  await d.persist("batch-terminal", result);
  if (
    (
      await store.pool.query(
        "UPDATE specialist_qualification_batches SET status=$2,finished_at=$3,result_digest=$4 WHERE nonce=$1 AND status='consumed' RETURNING nonce",
        [grant.batchNonce, result.status, new Date(), designDigest(result)],
      )
    ).rowCount !== 1
  )
    throw new FleetError("KQ1_NONCE_ALREADY_TERMINAL", true);
  return result;
}
