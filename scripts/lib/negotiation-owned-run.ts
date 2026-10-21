import { readNegotiationEvidence } from "../../../pact/tests/evaluation/negotiation-outcome.js";
import type { OwnedNegotiationWorld } from "../../../pact/tests/evaluation/negotiation-owned-run.js";
import { builtinArchitectures } from "../../src/app/builtins.js";
import { hostScopeFactory } from "../../src/app/host-services.js";
import { NegotiationNonceStore, readNativeNegotiationAccounting } from "../../src/app/negotiation-ledger.js";
import {
  type Data,
  FleetError,
  type GamePort,
  type ModelPort,
  type ModelSettings,
  type Tool,
} from "../../src/domain.js";
import { createPactEnvironment, PactBindings } from "../../src/environments/pact.js";
import {
  assessNegotiation,
  type NegotiationClaimReviews,
  type NegotiationEvidence,
} from "../../src/negotiation-evaluation.js";
import { designDigest, type NegotiationCell } from "../../src/negotiation-plan.js";
import type {
  NegotiationBinding,
  NegotiationExecutionPorts,
  NegotiationGrant,
  NegotiationGuardInput,
  ProtocolPreview,
} from "../../src/negotiation-run.js";
import { ModelAdmission, type ModelResult, RouteCapacity } from "../../src/platform/admission.js";
import { Bindings } from "../../src/platform/bindings.js";
import { EngineRegistry } from "../../src/platform/engine-registry.js";
import { EnvironmentRegistry } from "../../src/platform/environment-registry.js";
import { CommandExecutor } from "../../src/platform/execution.js";
import { OperationSupervisor, PlatformHost } from "../../src/platform/supervisor.js";
import { type TaskClaim, TaskStore } from "../../src/platform/tasks.js";
import type { PostE3Cell } from "../../src/post-e3-rc2-plan.js";
import type { Store } from "../../src/store.js";
import { runNativeOwnedCell } from "./negotiation-native-run.js";

const readTool = (name: string, inputSchema: Data): Tool => ({
  name,
  inputSchema,
  annotations: { readOnlyHint: true },
});
const tools: Tool[] = [
  readTool("pact_agent_guide_v1", { type: "object" }),
  readTool("pact_world_read_v1", {
    type: "object",
    properties: { forecastMinutes: { type: "integer", minimum: 1, maximum: 60 } },
  }),
  readTool("pact_council_thread_v1", {
    type: "object",
    required: ["kingdomId"],
    properties: { kingdomId: { type: "string" } },
  }),
  readTool("pact_kingdom_discover_v2", {
    type: "object",
    properties: { rotation: { type: "integer" }, limit: { type: "integer" } },
  }),
  readTool("pact_observation_read_v2", {
    type: "object",
    properties: {
      section: { enum: ["social_attention", "agreements", "requests"] },
      limit: { type: "integer" },
      recordId: { type: "string" },
    },
  }),
  readTool("pact_agent_outlook_v1", { type: "object" }),
  {
    name: "pact_game_action_v2",
    inputSchema: {
      type: "object",
      required: ["commandId", "action"],
      properties: { commandId: { type: "string" }, action: { type: "object" } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false },
  },
];
export type PreparedNegotiationCell<C extends NegotiationCell | PostE3Cell = NegotiationCell> = {
  cell: C;
  binding: NegotiationBinding;
  world: OwnedNegotiationWorld<C>;
  control: OwnedNegotiationWorld<C>;
  authorityDigest: string;
};
async function authorityDigest(world: Pick<OwnedNegotiationWorld, "pool" | "players">) {
  const rows = (
    await world.pool.query(
      "SELECT account_id,allowed_actions,resource_limits,reserve_floors,version FROM kingdom_mandates WHERE product_scope='pact' AND account_id=ANY($1::uuid[]) ORDER BY account_id",
      [world.players.map((p) => p.accountId)],
    )
  ).rows;
  if (rows.length !== 2) throw new FleetError("NEGOTIATION_AUTHORITY_SCOPE", true);
  return designDigest(rows);
}
export type OwnedExecutionDependencies = {
  store: Store;
  prepared: PreparedNegotiationCell[];
  provider: ModelPort;
  model: ModelSettings;
  evidenceLevel: "fake-provider" | "real-provider";
  /** Read-only, exact file/process/route/nonce ownership verification. */
  verifyArtifacts: () => Promise<void>;
  reviewResponse: (claim: TaskClaim, result: ModelResult) => Promise<void>;
  reviewOutcome: (
    cell: NegotiationCell,
    evidence: NegotiationEvidence,
  ) => Promise<Pick<NegotiationClaimReviews, "claims" | "reviews">>;
  persist: (kind: string, detail: unknown) => Promise<void>;
};

/** No credential, evaluator, solo state or opposing private goal is exported. */
export function facade(
  world: Pick<OwnedNegotiationWorld, "players" | "actor">,
  index: number,
  guard: () => Promise<void>,
): GamePort {
  const p = world.players[index];
  if (!p) throw new FleetError("NEGOTIATION_ACTOR_SCOPE", true);
  const a = world.actor(p.kingdomId);
  return {
    profile: async () => ({ accountId: p.accountId }),
    tools: async () => tools,
    open: async () => {},
    close: async () => {},
    receipt: async (id) => ((await a.receipt(id)) as unknown as Data) ?? { commandId: id, code: "RECEIPT_NOT_FOUND" },
    submit: async (id, action) => {
      await guard();
      return (await a.dispatch(action as Parameters<typeof a.dispatch>[0], id)) as unknown as Data;
    },
    read: async (tool, args) => {
      if (tool === "pact_agent_guide_v1") return await a.guide(args.topic as Parameters<typeof a.guide>[0]);
      if (tool === "pact_world_read_v1") return (await a.readSelf()) as unknown as Data;
      if (tool === "pact_kingdom_discover_v2") return (await a.discover(args)) as unknown as Data;
      if (tool === "pact_observation_read_v2")
        return (await a.readSection(args as unknown as Parameters<typeof a.readSection>[0])) as unknown as Data;
      if (tool === "pact_council_thread_v1") return (await a.thread(String(args.kingdomId))) as unknown as Data;
      if (tool === "pact_agent_outlook_v1") return (await a.outlook()) as unknown as Data;
      throw new FleetError("UNSUPPORTED_SCOPED_READ", true);
    },
  };
}
export async function prepareOwnedNegotiationCohort<C extends NegotiationCell | PostE3Cell>(
  store: Store,
  world: OwnedNegotiationWorld<C>,
  control: OwnedNegotiationWorld<C>,
  cell: C,
  model: ModelSettings,
  fixtureNonce: string,
  evidenceRef: string,
  keyRef: string,
): Promise<PreparedNegotiationCell<C>> {
  if (
    world.control ||
    !control.control ||
    world.worldId === control.worldId ||
    designDigest(world.cell) !== designDigest(cell) ||
    designDigest(control.cell) !== designDigest(cell)
  )
    throw new FleetError("NEGOTIATION_WORLD_SCOPE", true);
  const ref = { id: "pact", version: "1", instanceId: world.worldId };
  const bindings = new Bindings(store, ref),
    pact = new PactBindings(store, bindings),
    tasks = new TaskStore(store, bindings, 1);
  const group = await store.create({
    name: `Negotiation ${cell.id}`.slice(0, 80),
    count: 2,
    intervalMinutes: "study" in cell && cell.study === "negotiation-r2" ? cell.periodicReviewMinutes : 15,
    seed: cell.worldSeed.slice(0, 40),
    strategies: ["merchant"],
  });
  await store.configure(group.id, {
    model,
    budget: {
      mode: "finite",
      callLimit: cell.limits.callsPerWorld,
      tokenLimit: cell.limits.reservedTokensPerWorld,
      deadlineAt: new Date(Date.now() + cell.limits.wallDeadlineMs).toISOString(),
      perCallTokenLimit: 40000,
      maxOutputTokens: 2000,
      inputByteLimit: cell.limits.inputBytes,
      maxCallsPerTurn: 3,
      maxActionsPerTurn: 3,
      concurrency: 1,
    },
  });
  await store.consent(group.id, true);
  const agents = (await store.pool.query("SELECT id FROM agents WHERE cohort_id=$1 ORDER BY ordinal", [group.id])).rows;
  const bindingIds: string[] = [];
  for (let i = 0; i < 2; i++) {
    const p = world.players[i],
      a = agents[i];
    if (!p || !a) throw new FleetError("NEGOTIATION_ACTOR_SCOPE", true);
    await store.pool.query(
      "UPDATE agents SET account_id=$2,kingdom_id=$3,state='ready',credential_state='ready' WHERE id=$1",
      [a.id, p.accountId, p.kingdomId],
    );
    bindingIds.push((await pact.attach(a.id)).id);
  }
  await tasks.enroll(group.id, cell.profile, cell.clockMode === "native");
  return {
    cell,
    world,
    control,
    authorityDigest: await authorityDigest(world),
    binding: {
      cellId: cell.id,
      worldId: world.worldId,
      controlWorldId: control.worldId,
      cohortId: group.id,
      actorIds: world.players.map((p) => p.kingdomId),
      bindingIds,
      fixtureNonce,
      evidenceRef,
      keyRef,
    },
  };
}

/** Fixed native composition. Injected ports are for deterministic acceptance;
 * the operational entrypoint supplies only pinned HttpModel and retained worlds.
 * This module contains no fixture creation, teardown, reset or provider launch. */
export function createOwnedNegotiationExecution(
  protocol: ProtocolPreview,
  grant: NegotiationGrant,
  deps: OwnedExecutionDependencies,
): NegotiationExecutionPorts {
  const { store } = deps,
    nonceStore = new NegotiationNonceStore(store),
    native = protocol.selection.stage === "E4",
    nativeStop = new AbortController();
  const abortNative = () => {
    if (native) {
      closed = true;
      nativeStop.abort();
    }
  };
  let running: PreparedNegotiationCell | undefined,
    nextGame: string | null = null,
    closed = false;
  const prepared = (b: NegotiationBinding) => {
    const p = deps.prepared.find((p) => p.cell.id === b.cellId);
    if (
      !p ||
      designDigest(p.binding) !== designDigest(b) ||
      !protocol.cells.some((c) => c.id === b.cellId && c.configurationDigest === p.cell.configurationDigest)
    )
      throw new FleetError("NEGOTIATION_PREPARED_SCOPE", true);
    return p;
  };
  const state = async (p: PreparedNegotiationCell) => {
    const marker = (await p.world.pool.query("SELECT nonce FROM public.architecture_fixture_owner")).rows;
    const leases = await p.world.leaseFacts();
    const time = String(
      (await p.world.pool.query("SELECT committed_game_time_ms FROM world_clocks WHERE product_scope='pact'")).rows[0]
        ?.committed_game_time_ms,
    );
    return {
      ownershipValid: marker.length === 1 && marker[0].nonce === p.binding.fixtureNonce,
      privacyValid: (await store.cohort(p.binding.cohortId)).observation_consent === true,
      authorityValid:
        leases.length === 2 &&
        leases.every((l) => l.live && p.binding.actorIds.includes(l.kingdomId)) &&
        (await authorityDigest(p.world)) === p.authorityDigest,
      duplicateEffects: Number(
        (
          await p.world.pool.query(
            "SELECT count(*)::int n FROM (SELECT command_id FROM negotiation_fixture_commands GROUP BY command_id HAVING count(*)>1) duplicate_commands",
          )
        ).rows[0].n,
      ),
      gameTimeMs: time,
      startGameTimeMs: String(p.world.decisionStartGameTimeMs),
      nextScheduledGameTimeMs: running === p ? nextGame : null,
    };
  };
  const ports: NegotiationExecutionPorts = {
    ...(native ? { timingMode: "native" as const } : {}),
    now: () => Date.now(),
    preflight: async () => {
      await deps.verifyArtifacts();
      let owned = deps.prepared.length === grant.bindings.length,
        fresh = true;
      for (const binding of grant.bindings) {
        const p = prepared(binding);
        const s = await state(p);
        owned &&= s.ownershipValid;
        const count = (
          await store.pool.query("SELECT count(*)::int n FROM turns WHERE cohort_id=$1", [binding.cohortId])
        ).rows[0].n;
        fresh &&= count === 0;
      }
      return {
        sources: grant.sources,
        modelDigest: grant.modelDigest,
        policyDigest: grant.policyDigest,
        settingsDigest: grant.settingsDigest,
        owned,
        fresh,
        evidenceReady: true,
      };
    },
    claimNonce: (...args) => nonceStore.claimNonce(...args),
    openCell: async (b, window) => {
      const p = prepared(b),
        c = await store.cohort(b.cohortId);
      const expected = Math.min(Date.parse(grant.cutoffAt), Date.parse(window.startsAt) + p.cell.limits.wallDeadlineMs);
      if (
        !c.budget ||
        Date.parse(window.cutoffAt) !== expected ||
        Date.now() >= expected ||
        Date.parse(window.startsAt) < Date.parse(grant.startsAt)
      )
        throw new FleetError("NEGOTIATION_CELL_WINDOW", true);
      for (const q of deps.prepared) {
        const facts = await q.world.leaseFacts();
        if (facts.length !== 2) throw new FleetError("NEGOTIATION_LEASE_SCOPE", true);
        if (facts.every((l) => l.leaseId === null)) await q.world.activateLeases();
        else if (!facts.every((l) => l.live)) throw new FleetError("NEGOTIATION_LEASE_LOST", true);
      }
      await store.configure(b.cohortId, { model: deps.model, budget: { ...c.budget, deadlineAt: window.cutoffAt } });
    },
    accounting: async (b) => readNativeNegotiationAccounting(store, b, prepared(b).cell, await state(prepared(b))),
    closeAdmission: async (b, reason) => {
      closed = true;
      abortNative();
      await store.setState(b.cohortId, "paused", true);
      await deps.persist("admission-closed", { cellId: b.cellId, reason });
    },
    finishNonce: (...args) => nonceStore.finishNonce(...args),
    runCell: async (cell, binding, controls) => {
      const p = prepared(binding);
      running = p;
      if (!native) closed = false;
      const cutoff = Date.parse(controls.cutoffAt);
      // Preparation sets a conservative draft deadline; execution can only narrow it.
      const cohort = await store.cohort(binding.cohortId);
      if (
        !cohort.budget ||
        cohort.model?.route !== deps.model.route ||
        designDigest(cohort.model) !== designDigest(deps.model)
      )
        throw new FleetError("NEGOTIATION_MODEL_DRIFT", true);
      await store.configure(binding.cohortId, {
        model: deps.model,
        budget: { ...cohort.budget, deadlineAt: controls.cutoffAt },
      });
      await store.setState(binding.cohortId, "running", true);
      const ref = { id: "pact", version: "1", instanceId: p.world.worldId },
        bindings = new Bindings(store, ref),
        pb = new PactBindings(store, bindings),
        tasks = new TaskStore(store, bindings, 1);
      let claim: TaskClaim | undefined, renewalError: unknown;
      const assertOpen = () => {
        if (closed || controls.signal.aborted || nativeStop.signal.aborted || Date.now() >= cutoff)
          throw new FleetError("NEGOTIATION_CUTOFF", true);
        if (renewalError) throw new FleetError("NEGOTIATION_LEASE_LOST", true);
      };
      const check = async (input: NegotiationGuardInput) => {
        assertOpen();
        await controls.guard(input);
        if (cell.clockMode === "controlled") {
          await p.world.refreshControlledSchedule();
          await p.control.refreshControlledSchedule();
        }
        assertOpen();
      };
      const renew = async () => {
        for (const q of deps.prepared) await q.world.renewLeases();
      };
      await renew();
      const renewal = setInterval(() => {
        void renew().catch((e) => {
          renewalError = e;
          abortNative();
        });
      }, 300000);
      const adapter = createPactEnvironment({
        store,
        bindings: pb,
        now: () => new Date(),
        outlookVersion: "pact.agent-outlook.v1",
        eventFeedVersion: "pact.agent-events.v1",
        game: async (agentId) => {
          const a = await store.agent(agentId),
            index = p.world.players.findIndex((x) => x.accountId === a.account_id && x.kingdomId === a.kingdom_id);
          return facade(p.world, index, async () => {
            if (!claim) throw new FleetError("NEGOTIATION_NO_CLAIM", true);
            await check({ phase: "action", actorId: claim.turn.agent.kingdom_id ?? undefined, turnId: claim.turn.id });
          });
        },
      });
      const environments = new EnvironmentRegistry([adapter], ref);
      const provider: ModelPort = {
        tracksDispatch: true,
        decide: async (request) => {
          if (!claim) throw new FleetError("NEGOTIATION_NO_CLAIM", true);
          const current = claim;
          return deps.provider.decide({
            ...request,
            signal: AbortSignal.any([request.signal, controls.signal, nativeStop.signal]),
            onDispatch: async () => {
              await check({
                phase: "dispatch",
                actorId: current.turn.agent.kingdom_id ?? undefined,
                turnId: current.turn.id,
              });
              await request.onDispatch?.();
            },
          });
        },
      };
      const admission = new ModelAdmission(
        store,
        tasks,
        provider,
        new RouteCapacity(store, () => ({ key: `negotiation:${grant.batchNonce}`, capacity: 1 })),
        async (c) => check({ phase: "call", actorId: c.turn.agent.kingdom_id ?? undefined, turnId: c.turn.id }),
      ).reviewed(async (c, result) => {
        try {
          await deps.reviewResponse(c, result);
        } catch (error) {
          abortNative();
          throw error;
        }
      });
      const commands = new CommandExecutor(store, tasks, bindings, environments),
        supervisor = new OperationSupervisor(tasks);
      const host = new PlatformHost(
        tasks,
        bindings,
        environments,
        new EngineRegistry([], builtinArchitectures()),
        admission,
        commands,
        supervisor,
        hostScopeFactory({ store, tasks, bindings, model: admission, commands }),
      );
      const start = p.world.decisionStartGameTimeMs / 60000;
      const lifecycle: NegotiationEvidence["lifecycle"] = [];
      const clock = async (target: number) => {
        if (cell.clockMode !== "controlled") throw new FleetError("NEGOTIATION_CLOCK_ADVANCE_FORBIDDEN", true);
        let current = Number((await state(p)).gameTimeMs) / 60000;
        while (current < target) {
          nextGame = String((current + 1) * 60000);
          await check({ phase: "clock", targetGameTimeMs: nextGame });
          await p.world.advanceTo(current + 1);
          await p.control.advanceTo(current + 1);
          current++;
        }
        nextGame = null;
      };
      try {
        if (native)
          return await runNativeOwnedCell({
            cell,
            binding,
            world: p.world,
            control: p.control,
            tasks,
            host,
            signal: AbortSignal.any([controls.signal, nativeStop.signal]),
            cutoff,
            check,
            setClaim: (c) => {
              claim = c;
            },
            abortBatch: abortNative,
            persist: deps.persist,
            allocations: async () =>
              (await ports.accounting(binding)).allocations.map((a) => ({
                ...a,
                status: a.status as "reported" | "unknown",
              })),
            reviewOutcome: deps.reviewOutcome,
            evidenceLevel: deps.evidenceLevel,
          });
        for (let round = 0; round < cell.limits.turnsPerActor; round++) {
          await clock(start + round * 15);
          const first = (((cell.seed + 1) % 2) + round) % 2;
          for (const index of [first, 1 - first]) {
            const b = await bindings.get(binding.bindingIds[index]);
            await check({ phase: "turn", actorId: b.entityRef });
            const event = {
              id: `${cell.id}:periodic:${round}:${index}`,
              type: "periodic",
              sourceRef: `${cell.id}:periodic:${round}:${index}`,
              observedAt: new Date().toISOString(),
              environmentTime: { clockId: "pact.game-time-ms", value: String((start + round * 15) * 60000) },
              metadata: {},
            };
            await tasks.upsertFromEvent(b, event, event.id);
            claim = (await tasks.claim(`negotiation:${grant.batchNonce}`, new Date())) ?? undefined;
            if (!claim || claim.bindingId !== b.id) throw new FleetError("NEGOTIATION_TASK_ADMISSION", true);
            const turn = claim;
            if (round === 0)
              for (const stage of ["opportunity", "exposure"] as const)
                lifecycle.push({
                  stage,
                  actorId: b.entityRef,
                  referenceId: turn.turn.id,
                  gameTimeMs: event.environmentTime.value,
                  wallTime: new Date().toISOString(),
                  sourceRefs: [`fleet-turn:${turn.turn.id}`],
                  scriptedPrefix: false,
                });
            await deps.persist("turn-start", { cellId: cell.id, actorId: b.entityRef, turnId: turn.turn.id, round });
            await host.run(turn);
            lifecycle.push({
              stage: "later_decision",
              actorId: b.entityRef,
              referenceId: turn.turn.id,
              gameTimeMs: event.environmentTime.value,
              wallTime: new Date().toISOString(),
              sourceRefs: [`fleet-turn:${turn.turn.id}`],
              scriptedPrefix: false,
            });
            await deps.persist("turn-finish", { cellId: cell.id, actorId: b.entityRef, turnId: turn.turn.id });
            claim = undefined;
          }
        }
        await clock(start + cell.limits.gameHorizonMinutes);
        const evidence = await readNegotiationEvidence(p.world),
          solo = await readNegotiationEvidence(p.control);
        evidence.lifecycle.push(...lifecycle);
        const accounting = await ports.accounting(binding);
        const reviews = await deps.reviewOutcome(cell, evidence);
        const assessment = assessNegotiation(cell, evidence, solo, {
          evidenceLevel: deps.evidenceLevel,
          allocations: accounting.allocations.map((a) => ({ ...a, status: a.status as "reported" | "unknown" })),
          ...reviews,
        });
        await deps.persist("cell-result", { evidence, solo, assessment });
        return assessment;
      } finally {
        clearInterval(renewal);
        nextGame = null;
        await store.setState(binding.cohortId, "paused", true);
        await supervisor.drain();
      }
    },
  };
  return ports;
}
