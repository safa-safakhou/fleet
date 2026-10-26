import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { builtinArchitectures } from "../../src/app/builtins.js";
import { compatibilityContextFor, hostScopeFactory } from "../../src/app/host-services.js";
import { Cognition } from "../../src/cognition.js";
import { type Data, FleetError, type ModelPort, type ModelSettings, object, safeCode } from "../../src/domain.js";
import { LegacyEngineBridge } from "../../src/engines/legacy/bridge.js";
import { currentLegacyClaim } from "../../src/engines/legacy/execution.js";
import { type GenerationProgress, modelFailureProgress } from "../../src/model-progress.js";
import { compileGenerationSchema } from "../../src/model-schema.js";
import { ModelAdmission, RouteCapacity } from "../../src/platform/admission.js";
import { Bindings } from "../../src/platform/bindings.js";
import { type CacheProfile, cacheResource, capacityDemand } from "../../src/platform/cache-profile.js";
import type { BindingRef, EnvironmentEvent } from "../../src/platform/contracts.js";
import { EngineRegistry } from "../../src/platform/engine-registry.js";
import { EnvironmentRegistry } from "../../src/platform/environment-registry.js";
import { EventIntake } from "../../src/platform/event-intake.js";
import { CommandExecutor } from "../../src/platform/execution.js";
import { OperationSupervisor, PlatformHost } from "../../src/platform/supervisor.js";
import { type TaskClaim, TaskStore } from "../../src/platform/tasks.js";
import { WorkerPool } from "../../src/platform/worker-pool.js";
import { Store } from "../../src/store.js";
import { Vault } from "../../src/vault.js";
import { rehearsalTurnCode } from "./native-rehearsal-control.js";
import { nativeSimulation, type SimCheck } from "./native-sim-environment.js";

export type NativeCall = {
  turnId: string;
  taskId: string;
  bindingId: string;
  architecture: string;
  participant: string | null;
  elapsedMs: number;
  inputBytes: number;
  inputTokens: number | null;
  outputTokens: number | null;
  decision: unknown;
  error?: string;
  startedAt: string;
  dispatched: boolean;
  execution?: GenerationProgress;
};
export async function nativeArchitectureHarness(
  pool: Pool,
  provider: ModelPort,
  model: ModelSettings,
  report?: (kind: string, data: unknown) => void,
  options: { tokenCapacity?: number; tokenBlockSize?: number; cacheProfile?: CacheProfile } = {},
) {
  const checks: SimCheck[] = [],
    calls: NativeCall[] = [],
    runs: Data[] = [],
    scope = new AsyncLocalStorage<TaskClaim>();
  const sim = await nativeSimulation(pool, `native-rehearsal:${randomUUID()}`, checks);
  let legacyModel: ModelPort;
  const architectures = builtinArchitectures(
    Object.fromEntries(
      ["legacy-loop@1", "legacy-cognition@1"].map((key) => [
        key,
        (services: Parameters<typeof compatibilityContextFor>[0]) => ({
          route: () => [],
          run: async () => {
            const ctx = compatibilityContextFor(services),
              { adapter, game } = sim.legacy(ctx.binding);
            const engine = new LegacyEngineBridge(
              store,
              legacyModel,
              async () => game,
              true,
              adapter,
              undefined,
              undefined,
              new Cognition(store),
            );
            const stop = () => engine.stop();
            ctx.signal.addEventListener("abort", stop, { once: true });
            try {
              await engine.run(ctx.claim.turn);
            } finally {
              ctx.signal.removeEventListener("abort", stop);
            }
          },
        }),
      ]),
    ),
  );
  const store = new Store(pool, new Vault(Buffer.alloc(32, 11).toString("base64")), () => new Date(), architectures);
  const bindings = new Bindings(store, sim.ref),
    environments = new EnvironmentRegistry([sim.adapter], sim.ref),
    tasks = new TaskStore(store, bindings, 8, environments),
    intake = new EventIntake(tasks, bindings, environments);
  let activeCalls = 0,
    peakCalls = 0;
  const metered: ModelPort = {
    tracksDispatch: provider.tracksDispatch,
    ...(provider.estimateInputTokens ? { estimateInputTokens: provider.estimateInputTokens.bind(provider) } : {}),
    decide: async (request) => {
      const claim = scope.getStore();
      if (!claim) throw Error("REHEARSAL_SCOPE_REQUIRED");
      const started = performance.now(),
        row: NativeCall = {
          turnId: claim.turn.id,
          taskId: claim.taskId,
          bindingId: claim.bindingId,
          architecture: `${claim.profile.id}@${claim.profile.version}`,
          participant: (await tasks.get(claim.taskId)).participantId ?? null,
          elapsedMs: 0,
          inputBytes:
            Buffer.byteLength(JSON.stringify(request.messages)) + Buffer.byteLength(JSON.stringify(request.schema)),
          inputTokens: null,
          outputTokens: null,
          decision: null,
          startedAt: new Date().toISOString(),
          dispatched: !provider.tracksDispatch,
        };
      calls.push(row);
      activeCalls++;
      peakCalls = Math.max(peakCalls, activeCalls);
      try {
        const result = await provider.decide({
          ...request,
          onDispatch: async () => {
            await request.onDispatch?.();
            row.dispatched = true;
          },
        });
        Object.assign(row, {
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          decision: result.decision,
          execution: result.execution,
          ...(result.decisionError ? { error: result.decisionError } : {}),
        });
        return result;
      } catch (error) {
        row.error = safeCode(error);
        row.execution = modelFailureProgress(error);
        report?.("providerError", { code: row.error, detail: String(error) });
        throw error;
      } finally {
        activeCalls--;
        row.elapsedMs = performance.now() - started;
        report?.("call", row);
      }
    },
  };
  const capacity = new RouteCapacity(
    store,
    () => ({
      key: `rehearsal:${sim.ref.instanceId}`,
      capacity: 4,
      ...(options.tokenCapacity ? { tokenCapacity: options.tokenCapacity } : {}),
      ...(options.cacheProfile ? { resource: cacheResource(options.cacheProfile) } : {}),
    }),
    async (request) => {
      if (options.cacheProfile) return capacityDemand(provider, options.cacheProfile, request);
      if (!provider.estimateInputTokens) throw new Error("PROVIDER_TOKENIZER_REQUIRED");
      const block = options.tokenBlockSize ?? 1;
      if (!Number.isSafeInteger(block) || block < 1) throw new Error("INVALID_TOKEN_BLOCK_SIZE");
      return Math.ceil(((await provider.estimateInputTokens(request)) + request.maxOutputTokens) / block) * block;
    },
  );
  legacyModel = capacity.wrap(metered, currentLegacyClaim);
  const admission = new ModelAdmission(store, tasks, metered, capacity),
    commands = new CommandExecutor(store, tasks, bindings, environments),
    supervisor = new OperationSupervisor(tasks),
    engines = new EngineRegistry([], architectures),
    host = new PlatformHost(
      tasks,
      bindings,
      environments,
      engines,
      admission,
      commands,
      supervisor,
      hostScopeFactory({ store, tasks, bindings, model: admission, commands }),
    );
  const roster: { cohortId: string; binding: BindingRef; architecture: string; preset?: string }[] = [];
  for (const manifest of architectures.list())
    for (let copy = 0; copy < 3; copy++) {
      const architecture = `${manifest.ref.id}@${manifest.ref.version}`,
        preset = copy === 0 ? "resources-diplomacy" : "full";
      const { id } = await store.create({
        name: `Synthetic ${architecture} ${copy + 1}`,
        count: 1,
        intervalMinutes: 5,
        seed: `native:${architecture}:${copy}`,
        strategies: ["guardian"],
      });
      await tasks.enroll(id, manifest.ref, false);
      if (manifest.ref.id === "autonomous-specialists")
        await pool.query("UPDATE cohort_engine_profiles SET architecture_config=$2 WHERE cohort_id=$1", [
          id,
          {
            ...manifest.defaults,
            preset,
            learning: false,
            skillMode: "off",
            decisionContract: "read-final.v3",
            contextPackingContract: "required-first.v2",
            readQueryContract: "environment.v3",
          },
        ]);
      await store.configure(id, {
        model: { ...model, ...(manifest.ref.id === "legacy-cognition" ? { cognition: "llm-centered-v1" } : {}) },
        budget: {
          mode: "finite",
          callLimit: 600,
          tokenLimit: 24000000,
          deadlineAt: new Date(Date.now() + 4000000).toISOString(),
          perCallTokenLimit: 40000,
          maxOutputTokens: 1536,
          inputByteLimit: 32000,
          maxCallsPerTurn: 3,
          maxActionsPerTurn: 1,
          concurrency: 1,
        },
      });
      await store.consent(id, true);
      const agent = (await pool.query("SELECT id FROM agents WHERE cohort_id=$1", [id])).rows[0].id;
      const account = randomUUID(),
        entity = randomUUID();
      await pool.query(
        "UPDATE agents SET account_id=$2,kingdom_id=$3,state='ready',credential_state='ready' WHERE id=$1",
        [agent, account, entity],
      );
      const binding = await bindings.bind(agent, {
        environment: sim.ref,
        accountRef: account,
        actorRef: randomUUID(),
        entityRef: entity,
      });
      await sim.add(binding);
      if (manifest.triggers.includes("event"))
        await intake.enroll(id, {
          enabled: true,
          categories: ["message", "resource", "result"],
          periodicReviewMinutes: 5,
          quietCategories: [],
        });
      await store.setState(id, "running", true);
      roster.push({
        cohortId: id,
        binding,
        architecture,
        ...(manifest.ref.id === "autonomous-specialists" ? { preset } : {}),
      });
    }
  await sim.pair();
  const workers = new WorkerPool(8);
  let running = 0;
  async function dispatch() {
    while (workers.hasCapacity) {
      const claim = await tasks.claim("isolated-native-rehearsal", new Date());
      if (!claim) break;
      running++;
      const started = performance.now();
      void workers
        .run(() =>
          scope.run(claim, async () => {
            const row: Data = {
              turnId: claim.turn.id,
              taskId: claim.taskId,
              bindingId: claim.bindingId,
              architecture: `${claim.profile.id}@${claim.profile.version}`,
              participant: (await tasks.get(claim.taskId)).participantId ?? null,
              startedAt: new Date().toISOString(),
            };
            try {
              await host.run(claim);
              row.code = "RETURNED";
            } catch (error) {
              row.code = safeCode(error);
              row.detail = error instanceof Error ? error.stack : String(error);
            } finally {
              row.controlCode = row.code;
              try {
                const persisted = (
                  await pool.query("SELECT state,code,unknown_usage FROM turns WHERE id=$1", [claim.turn.id])
                ).rows[0];
                if (persisted) {
                  row.engineCode = persisted.code;
                  row.engineState = persisted.state;
                  row.unknownUsage = persisted.unknown_usage;
                  row.code = rehearsalTurnCode(persisted, row.code === "RETURNED" ? undefined : String(row.code));
                } else {
                  row.code = "TURN_OUTCOME_UNAVAILABLE";
                  row.outcomeUnknown = true;
                }
              } catch {
                row.code = "TURN_OUTCOME_UNAVAILABLE";
                row.outcomeUnknown = true;
              }
              row.elapsedMs = performance.now() - started;
              runs.push(row);
              report?.("run", row);
              running--;
            }
          }),
        )
        .catch((error) => report?.("workerError", { code: safeCode(error) }));
    }
  }
  const peerSequences = new Map<string, number>();
  async function round(n: number) {
    await sim.round(n);
    for (const member of roster) {
      const event: EnvironmentEvent = {
        id: `round:${n}:${member.binding.id}`,
        type: member.architecture.startsWith("legacy-") ? "scheduled" : "changed",
        sourceRef: `sim-round:${n}`,
        observedAt: new Date().toISOString(),
        environmentTime: { clockId: "utc", value: new Date().toISOString() },
        metadata: { category: "message", groupRef: `round:${n}` },
      };
      if (member.architecture.startsWith("legacy-"))
        await tasks.publishFromEvent(member.binding, event, `sim-round:${n}`);
      else {
        const cursor = await intake.cursor(member.binding);
        const messages = (
          await pool.query("SELECT * FROM sim_messages WHERE recipient=$1 AND sequence>$2 ORDER BY sequence LIMIT 40", [
            member.binding.id,
            peerSequences.get(member.binding.id) ?? 0,
          ])
        ).rows;
        const peerEvents = messages.map((m) => ({
          ...event,
          id: `peer:${m.id}`,
          sourceRef: `sim-message:${m.id}`,
          metadata: { category: "message", groupRef: `round:${n}`, sender: m.sender, body: m.body },
        }));
        await intake.ingest(member.binding, {
          events: [event, ...peerEvents],
          fromCursor: cursor,
          nextCursor: `round:${n}`,
          resyncRequired: false,
        });
        if (messages.length) peerSequences.set(member.binding.id, Number(messages.at(-1).sequence));
      }
    }
  }
  async function drain() {
    const limit = performance.now() + 45000;
    do {
      if (performance.now() > limit) throw Error("REHEARSAL_DRAIN_LIMIT");
      await dispatch();
      if (running) await new Promise((r) => setTimeout(r, 20));
    } while (running);
  }
  return {
    store,
    tasks,
    host,
    sim,
    roster,
    calls,
    checks,
    runs,
    round,
    dispatch,
    drain,
    get running() {
      return running;
    },
    get peakCalls() {
      return peakCalls;
    },
    async close() {
      workers.close();
      await workers.drain();
      await sim.close();
    },
  };
}
export const scriptedNativeProvider: ModelPort = {
  tracksDispatch: true,
  decide: async (request) => {
    const packet = request.messages
      .toReversed()
      .map((m) => {
        try {
          return object(JSON.parse(m.content));
        } catch {
          return {};
        }
      })
      .find((p) => p.nativeGrounding);
    if (!packet) throw Error("SCRIPTED_NATIVE_CONTEXT_REQUIRED");
    const ground = object(packet.nativeGrounding),
      selection = object(ground.selection),
      scores = object(selection.scores);
    const best = Object.entries(scores).reduce((a, b) => (BigInt(String(b[1])) > BigInt(String(a[1])) ? b : a))[0];
    const decision = JSON.parse(JSON.stringify(ground.outputExample).replaceAll("<legal choice ID>", best));
    if (!compileGenerationSchema(request.schema)(decision)) throw new FleetError("SCRIPTED_OUTPUT_CONTRACT", true);
    await request.onDispatch?.();
    return { decision, inputTokens: 300, outputTokens: 100 };
  },
};
