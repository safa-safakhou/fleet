import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { NegotiationActor, NegotiationWorld } from "../../../../pact/tests/evaluation/negotiation-world.js";
import { builtinArchitectures } from "../../../src/app/builtins.js";
import { hostScopeFactory } from "../../../src/app/host-services.js";
import { connect, migrate } from "../../../src/db.js";
import type { Data, GamePort, ModelPort, Tool } from "../../../src/domain.js";
import { createPactEnvironment, PactBindings } from "../../../src/environments/pact.js";
import {
  assessNegotiation,
  type NegotiationAssessment,
  type NegotiationClaimReviews,
  type NegotiationEvidence,
} from "../../../src/negotiation-evaluation.js";
import type { NegotiationCell } from "../../../src/negotiation-plan.js";
import { ModelAdmission, RouteCapacity } from "../../../src/platform/admission.js";
import type { ArchitectureDefinition } from "../../../src/platform/architecture.js";
import { Bindings } from "../../../src/platform/bindings.js";
import { EngineRegistry } from "../../../src/platform/engine-registry.js";
import { EnvironmentRegistry } from "../../../src/platform/environment-registry.js";
import { CommandExecutor } from "../../../src/platform/execution.js";
import { OperationSupervisor, PlatformHost } from "../../../src/platform/supervisor.js";
import { TaskStore } from "../../../src/platform/tasks.js";
import { Store } from "../../../src/store.js";
import { Vault } from "../../../src/vault.js";
import { assertOwnedFixture } from "../../architecture-fixture.js";
import { tools as baseTools, budget, fixture, testUrl } from "../../helpers.js";
export type FixtureProviders = {
  alternateRoles?: boolean;
  candidateDefinition?: ArchitectureDefinition;
  request?: (detail: {
    actor: number;
    round: number;
    inputBytes: number;
    schemaBytes: number;
    maxOutputTokens: number;
    packet: Data;
  }) => void;
  stopOnFirstFailure?: boolean;
  ownedUtcPreflight?: boolean;
  maxRounds?: number;
  skipSettlement?: boolean;
  packing?: (detail: {
    actor: number;
    round: number;
    allowance: number;
    observationBytes: number;
    payloadFieldBytes: Record<string, number>;
    standalonePackedBytes: number | null;
    packedBytes: number | null;
    error: string | null;
  }) => void;
  actors: readonly [ModelPort, ModelPort];
  review: (e: NegotiationEvidence) => Pick<NegotiationClaimReviews, "reviews" | "claims">;
  fault?: {
    point:
      | "before_dispatch"
      | "after_dispatch"
      | "before_state"
      | "after_state"
      | "after_commit"
      | "before_result"
      | "revoked"
      | "cutoff";
    actor: number;
    round: number;
  };
  capture?: (result: {
    evidence: NegotiationEvidence;
    solo: NegotiationEvidence;
    packets: Data[];
    answers: unknown[];
    failures: string[];
    recoveries: Data[];
    commands: Data[];
    stateVersions: number[];
    turns: Data[];
    ledger: Data[];
    selectedProfile: { id: string; version: string };
    continuityNamespaces: string[];
    outputRetries: Data[];
  }) => void;
};
const uuid = { type: "string" },
  read = (name: string, inputSchema: Data): Tool => ({ name, inputSchema, annotations: { readOnlyHint: true } });
const tools: Tool[] = [
  ...baseTools,
  read("pact_kingdom_discover_v2", {
    type: "object",
    properties: { rotation: { type: "integer" }, limit: { type: "integer" } },
  }),
  read("pact_observation_read_v2", {
    type: "object",
    properties: {
      section: { enum: ["social_attention", "agreements", "requests"] },
      limit: { type: "integer" },
      recordId: uuid,
    },
  }),
  read("pact_agent_outlook_v1", { type: "object" }),
];
function facade(world: NegotiationWorld, index: number): GamePort {
  const player = world.players[index];
  if (!player) throw Error("ACTOR_SCOPE");
  const actor: NegotiationActor = world.actor(player.kingdomId);
  return {
    profile: async () => ({ accountId: player.accountId }),
    tools: async () => tools,
    open: async () => {},
    close: async () => {},
    receipt: async (id) =>
      ((await actor.receipt(id)) as unknown as Data) ?? { commandId: id, code: "RECEIPT_NOT_FOUND" },
    submit: async (id, action) =>
      (await actor.dispatch(action as Parameters<NegotiationActor["dispatch"]>[0], id)) as unknown as Data,
    read: async (tool, args) => {
      if (tool === "pact_agent_guide_v1")
        return await actor.guide(args.topic as Parameters<NegotiationActor["guide"]>[0]);
      if (tool === "pact_world_read_v1") return (await actor.readSelf()) as unknown as Data;
      if (tool === "pact_kingdom_discover_v2") return (await actor.discover(args)) as unknown as Data;
      if (tool === "pact_observation_read_v2")
        return (await actor.readSection(
          args as unknown as Parameters<NegotiationActor["readSection"]>[0],
        )) as unknown as Data;
      if (tool === "pact_council_thread_v1") return (await actor.thread(String(args.kingdomId))) as unknown as Data;
      if (tool === "pact_agent_outlook_v1") return (await actor.outlook()) as unknown as Data;
      throw Error("UNSUPPORTED_SCOPED_READ");
    },
  };
}
/** Test-only driver. Model outputs go verbatim through the selected engine, real
 * Host admission, adapter and normal authenticated PACT handler. No term repair.
 */
export async function runNegotiationFixture(
  cell: NegotiationCell,
  providers: FixtureProviders,
): Promise<NegotiationAssessment> {
  const root = process.env.PACT_ACCEPTANCE_ROOT,
    pactUrl = process.env.PACT_ACCEPTANCE_DATABASE_URL,
    nonce = process.env.FLEET_ARCHITECTURE_NONCE;
  if (!root || !pactUrl || !nonce || process.env.FLEET_ARCHITECTURE_TEST !== "1")
    throw Error("OWNED_OFFLINE_NEGOTIATION_REQUIRED");
  if (cell.clockMode !== "controlled") throw Error("NATIVE_TIMING_NOT_OFFLINE_CERTIFIED");
  const worlds = (await import(
    pathToFileURL(resolve(root, "tests/evaluation/negotiation-world.ts")).href
  )) as typeof import("../../../../pact/tests/evaluation/negotiation-world.js");
  const outcomes = (await import(
    pathToFileURL(resolve(root, "tests/evaluation/negotiation-outcome.ts")).href
  )) as typeof import("../../../../pact/tests/evaluation/negotiation-outcome.js");
  if (providers.candidateDefinition && !providers.ownedUtcPreflight)
    throw Error("CANDIDATE_REQUIRES_OWNED_OFFLINE_PREFLIGHT");
  const architectures = () =>
    builtinArchitectures(
      {},
      providers.candidateDefinition &&
        !builtinArchitectures()
          .list()
          .some(
            (m) =>
              m.ref.id === providers.candidateDefinition?.manifest.ref.id &&
              m.ref.version === providers.candidateDefinition?.manifest.ref.version,
          )
        ? [providers.candidateDefinition]
        : [],
    );
  const retainedSchemas: string[] = [];
  const makeWorld = async (control = false): Promise<NegotiationWorld> => {
    if (!providers.ownedUtcPreflight) return worlds.createNegotiationWorld({ pactUrl, nonce }, cell, { control });
    const owned = (await import(
      pathToFileURL(resolve(root, "tests/evaluation/negotiation-owned-run.ts")).href
    )) as typeof import("../../../../pact/tests/evaluation/negotiation-owned-run.js");
    const world = await owned.prepareOwnedNegotiationWorld({ pactUrl, nonce }, cell, {
      control,
      retention: "preserve",
      secrets: {
        rulesKey: randomBytes(32).toString("base64"),
        tokenKey: randomBytes(32).toString("base64"),
        encryptionKey: randomBytes(32).toString("base64"),
      },
      onCreated: async (schema) => {
        retainedSchemas.push(schema);
      },
    });
    if (!control) {
      await world.activateLeases();
      await world.renewLeases();
    }
    // This wrapper belongs ONLY to the explicitly disposable offline test driver.
    // The operational adapter exposes disconnect, never this teardown surface.
    return { ...world, close: () => world.disconnect() };
  };
  const cleanOwnedTestSchemas = async () => {
    const { createPool, dropTestSchema } = (await import(
      pathToFileURL(resolve(root, "packages/db/dist/index.js")).href
    )) as typeof import("../../../../pact/packages/db/src/index.js");
    const admin = createPool(pactUrl);
    try {
      const marker = (await admin.query("SELECT nonce FROM public.architecture_fixture_owner")).rows;
      if (marker.length !== 1 || marker[0].nonce !== nonce) throw Error("OWNED_TEST_CLEANUP_REFUSED");
      for (const schema of retainedSchemas) await dropTestSchema(admin, schema);
    } finally {
      await admin.end();
    }
  };
  const world = await makeWorld();
  let solo: NegotiationWorld | undefined;
  const f = await (async () => {
    if (!providers.ownedUtcPreflight) return fixture();
    await assertOwnedFixture(testUrl, nonce);
    const pool = connect(testUrl);
    await migrate(pool);
    return {
      pool,
      store: new Store(pool, new Vault(randomBytes(32).toString("base64")), () => new Date(), architectures()),
      now: () => new Date(),
      advance: (_ms: number) => {},
    };
  })();
  let ownedCohort: string | undefined;
  try {
    solo = await makeWorld(true);
    const ref = { id: "pact", version: "1", instanceId: world.worldId },
      bindings = new Bindings(f.store, ref),
      pactBindings = new PactBindings(f.store, bindings),
      tasks = new TaskStore(f.store, bindings, 1);
    const { id } = await f.store.create({
      name: "Owned negotiation actors",
      count: 2,
      intervalMinutes: 15,
      seed: cell.worldSeed.slice(0, 40),
      strategies: ["merchant"],
    });
    ownedCohort = id;
    await f.store.configure(id, {
      model: { route: "ollama", model: "fake-negotiation" },
      budget: {
        ...budget,
        callLimit: cell.limits.callsPerWorld,
        tokenLimit: cell.limits.reservedTokensPerWorld,
        deadlineAt: new Date(f.now().getTime() + cell.limits.wallDeadlineMs).toISOString(),
        concurrency: 1,
      },
    });
    await f.store.consent(id, true);
    const agents = (await f.pool.query("SELECT id FROM agents WHERE cohort_id=$1 ORDER BY ordinal", [id])).rows;
    const refs = [];
    for (let i = 0; i < 2; i++) {
      const p = world.players[i],
        agent = agents[i];
      if (!p || !agent) throw Error("ACTOR_SCOPE");
      await f.pool.query(
        "UPDATE agents SET account_id=$2,kingdom_id=$3,state='ready',credential_state='ready' WHERE id=$1",
        [agent.id, p.accountId, p.kingdomId],
      );
      refs.push(await pactBindings.attach(agent.id));
    }
    await tasks.enroll(id, providers.candidateDefinition?.manifest.ref ?? cell.profile);
    await f.store.setState(id, "running", true);
    let actorIndex = 0,
      round = 0,
      faulted = false;
    const packets: Data[] = [],
      answers: unknown[] = [],
      decisions: NegotiationEvidence["lifecycle"] = [],
      failures: string[] = [];
    const adapter = createPactEnvironment({
      store: f.store,
      bindings: pactBindings,
      now: f.now,
      outlookVersion: "pact.agent-outlook.v1",
      eventFeedVersion: "pact.agent-events.v1",
      game: async (agentId) => {
        const index = agents.findIndex((a) => a.id === agentId);
        const game = facade(world, index),
          submit = game.submit;
        game.submit = async (commandId, action) => {
          const result = await submit(commandId, action);
          if (
            !faulted &&
            providers.fault?.point === "after_commit" &&
            actorIndex === providers.fault.actor &&
            round === providers.fault.round
          ) {
            faulted = true;
            throw Error("SYNTHETIC_AFTER_COMMIT");
          }
          return result;
        };
        return game;
      },
    });
    const environments = new EnvironmentRegistry([adapter], ref),
      capacity = new RouteCapacity(f.store, () => ({ key: `fixture:${world.worldId}`, capacity: 1 }));
    const model: ModelPort = {
      tracksDispatch: true,
      decide: async (request) => {
        const fault = providers.fault,
          hit = !faulted && fault && fault.actor === actorIndex && fault.round === round;
        if (hit && fault.point === "before_dispatch") {
          faulted = true;
          throw Error("SYNTHETIC_BEFORE_DISPATCH");
        }
        await request.onDispatch?.();
        if (hit && fault.point === "after_dispatch") {
          faulted = true;
          throw Error("SYNTHETIC_AFTER_DISPATCH");
        }
        const packet = JSON.parse(request.messages[1].content);
        providers.request?.({
          actor: actorIndex,
          round,
          inputBytes:
            Buffer.byteLength(JSON.stringify(request.messages)) + Buffer.byteLength(JSON.stringify(request.schema)),
          schemaBytes: Buffer.byteLength(JSON.stringify(request.schema)),
          maxOutputTokens: request.maxOutputTokens,
          packet,
        });
        packets.push(packet);
        const result = await providers.actors[actorIndex].decide(request);
        answers.push(structuredClone(result.decision));
        if (hit && fault.point === "cutoff") {
          faulted = true;
          f.advance(cell.limits.wallDeadlineMs + 1);
        }
        if (hit && fault.point === "before_result") {
          faulted = true;
          throw Error("SYNTHETIC_RESULT_LOST");
        }
        return result;
      },
    };
    // A fresh host per ordinary scheduled operation exercises durable restart paths.
    const recoveries: Data[] = [];
    let lastCommands: CommandExecutor | undefined;
    const host = () => {
      const admission = new ModelAdmission(f.store, tasks, model, capacity),
        commands = new CommandExecutor(f.store, tasks, bindings, environments);
      lastCommands = commands;
      const factory = hostScopeFactory({ store: f.store, tasks, bindings, model: admission, commands });
      return new PlatformHost(
        tasks,
        bindings,
        environments,
        new EngineRegistry([], architectures()),
        admission,
        commands,
        new OperationSupervisor(tasks),
        async (...args: Parameters<typeof factory>) => {
          const scope = await factory(...args),
            accept = scope.services.state.accept;
          const pack = scope.services.environment.packObservation;
          if (pack && providers.packing)
            scope.services.environment.packObservation = (observation, allowance) => {
              const detail = {
                actor: actorIndex,
                round,
                allowance,
                observationBytes: Buffer.byteLength(JSON.stringify(observation)),
                payloadFieldBytes: Object.fromEntries(
                  Object.entries(observation.payload)
                    .filter(([, value]) => value !== undefined)
                    .map(([key, value]) => [key, Buffer.byteLength(JSON.stringify(value))]),
                ),
                standalonePackedBytes: (() => {
                  try {
                    return Buffer.byteLength(JSON.stringify(pack(observation, 24000)));
                  } catch {
                    return null;
                  }
                })(),
              };
              try {
                const result = pack(observation, allowance);
                providers.packing?.({ ...detail, packedBytes: Buffer.byteLength(JSON.stringify(result)), error: null });
                return result;
              } catch (error) {
                providers.packing?.({
                  ...detail,
                  packedBytes: null,
                  error: error instanceof Error ? error.message : "PACKING_FAILED",
                });
                throw error;
              }
            };
          scope.services.state.accept = async (input) => {
            const fault = providers.fault,
              hit = !faulted && fault?.actor === actorIndex && fault?.round === round;
            if (hit && fault.point === "before_state") {
              faulted = true;
              throw Error("SYNTHETIC_BEFORE_STATE");
            }
            const result = await accept(input);
            if (hit && fault.point === "after_state") {
              faulted = true;
              throw Error("SYNTHETIC_AFTER_STATE");
            }
            return result;
          };
          return scope;
        },
      );
    };
    const start = world.decisionStartGameTimeMs / 60000;
    scheduled: for (round = 0; round < (providers.maxRounds ?? cell.limits.turnsPerActor); round++) {
      await world.advanceTo(start + round * 15);
      for (const index of providers.alternateRoles && round % 2 ? [1, 0] : [0, 1]) {
        actorIndex = index;
        const binding = refs[actorIndex];
        if (!binding) throw Error("ACTOR_SCOPE");
        if (
          providers.fault?.point === "revoked" &&
          round === providers.fault.round &&
          actorIndex === providers.fault.actor
        ) {
          await world.ownerSetSupplyPermission(actorIndex, false);
          faulted = true;
        }
        const event = {
          id: `periodic:${round}:${actorIndex}`,
          type: "periodic",
          sourceRef: `periodic:${round}:${actorIndex}`,
          observedAt: f.now().toISOString(),
          environmentTime: { clockId: "pact.game-time-ms", value: String((start + round * 15) * 60000) },
          metadata: {},
        };
        await tasks.upsertFromEvent(binding, event, event.id);
        await tasks.upsertFromEvent(binding, event, event.id);
        const claim = await tasks.claim(`fixture:${world.worldId}`, f.now());
        if (!claim) {
          failures.push("NO_ADMISSION_WITHIN_FROZEN_CAP");
          continue;
        }
        const time = String((start + round * 15) * 60000),
          refSource = `fleet-turn:${claim.turn.id}`;
        if (round === 0)
          decisions.push(
            ...(["opportunity", "exposure"] as const).map((stage) => ({
              stage,
              actorId: binding.entityRef,
              referenceId: claim.turn.id,
              gameTimeMs: time,
              wallTime: f.now().toISOString(),
              sourceRefs: [refSource],
              scriptedPrefix: false,
            })),
          );
        try {
          await host().run(claim);
          decisions.push({
            stage: "later_decision",
            actorId: binding.entityRef,
            referenceId: claim.turn.id,
            gameTimeMs: time,
            wallTime: f.now().toISOString(),
            sourceRefs: [refSource],
            scriptedPrefix: false,
          });
        } catch (error) {
          failures.push(error instanceof Error ? error.message : "SYNTHETIC_FAILURE");
          if (providers.stopOnFirstFailure) break scheduled;
        }
        const unknown = (
          await f.pool.query("SELECT 1 FROM compute_ledger WHERE cohort_id=$1 AND status='unknown' LIMIT 1", [id])
        ).rowCount;
        const pending = (
          await f.pool.query(
            "SELECT command_id FROM platform_commands WHERE turn_id=$1 AND state IN('unknown','pending','dispatched')",
            [claim.turn.id],
          )
        ).rows;
        if (pending.length && providers.fault?.point === "after_commit" && lastCommands) {
          for (const command of pending) {
            recoveries.push(await lastCommands.reconcile(claim.turn.id, command.command_id));
          }
        }
        if (
          unknown ||
          pending.length ||
          f.now().getTime() >= new Date(claim.turn.cohort.budget?.deadlineAt ?? "9999-01-01T00:00:00Z").getTime()
        )
          break scheduled;
      }
      f.advance(15 * 60000);
    }
    const finalMinute = start + cell.limits.gameHorizonMinutes;
    if (!providers.skipSettlement) {
      await world.advanceTo(finalMinute);
      await solo.advanceTo(finalMinute);
    }
    const evidence = await outcomes.readNegotiationEvidence(world),
      control = await outcomes.readNegotiationEvidence(solo);
    evidence.lifecycle.push(...decisions);
    if (failures.length) {
      evidence.coverage.complete = false;
      evidence.coverage.omitted.push("retained_fixture_operation_failure");
    }
    const ledger = (
      await f.pool.query(
        "SELECT l.*,a.kingdom_id FROM compute_ledger l JOIN turns t ON t.id=l.turn_id JOIN agents a ON a.id=t.agent_id WHERE l.cohort_id=$1 ORDER BY l.created_at,l.id",
        [id],
      )
    ).rows;
    const reviews = providers.review(evidence),
      allocations: NegotiationClaimReviews["allocations"] = ledger.map((l) => ({
        id: l.id,
        actorId: l.kingdom_id,
        turnId: l.turn_id,
        reservedTokens: Number(l.tokens),
        inputTokens: l.input_tokens === null ? null : Number(l.input_tokens),
        outputTokens: l.output_tokens === null ? null : Number(l.output_tokens),
        status: l.status,
      }));
    const assessment = assessNegotiation(cell, evidence, control, {
      evidenceLevel: "fake-provider",
      allocations,
      ...reviews,
    });
    providers.capture?.({
      evidence,
      solo: control,
      packets,
      answers,
      ledger,
      selectedProfile: providers.candidateDefinition?.manifest.ref ?? cell.profile,
      outputRetries: (
        await f.pool.query(
          "SELECT id,detail_cipher FROM turn_events WHERE cohort_id=$1 AND label='Debug: Model output retry' ORDER BY sequence",
          [id],
        )
      ).rows.map((r) => f.store.vault.decrypt<Data>(r.detail_cipher, `turn-event:${r.id}`)),
      continuityNamespaces: (
        await f.pool.query("SELECT DISTINCT namespace FROM continuity_states WHERE cohort_id=$1", [id])
      ).rows.map((r) => r.namespace),
      failures,
      recoveries,
      commands: (
        await f.pool.query(
          "SELECT p.command_id,p.state,p.outcome FROM platform_commands p JOIN turns t ON t.id=p.turn_id WHERE t.cohort_id=$1 ORDER BY p.created_at,p.command_id",
          [id],
        )
      ).rows,
      stateVersions: (await f.pool.query("SELECT version FROM architecture_scoped_state")).rows.map((r) => r.version),
      turns: (
        await f.pool.query(
          "SELECT code,calls,actions,started_at,deadline_at FROM turns WHERE cohort_id=$1 ORDER BY started_at,id",
          [id],
        )
      ).rows,
    });
    return assessment;
  } finally {
    if (providers.ownedUtcPreflight && ownedCohort) await f.store.setState(ownedCohort, "paused", true);
    await f.pool.end();
    await solo?.close();
    await world.close();
    if (providers.ownedUtcPreflight) await cleanOwnedTestSchemas();
  }
}
