import { vi } from "vitest";
import { builtinArchitectures } from "../src/app/builtins.js";
import { compatibilityRuntime, createScopedServices, scopedOperationFor } from "../src/app/host-services.js";
import { Cognition } from "../src/cognition.js";
import { type Data, type ModelPort, object, safeCode } from "../src/domain.js";
import { ContinuityEngine } from "../src/engines/continuity/engine.js";
import { ContinuityModule } from "../src/engines/continuity/state.js";
import { LegacyEngineBridge } from "../src/engines/legacy/bridge.js";
import { ReactiveEngine } from "../src/engines/reactive/engine.js";
import { SpecialistCoordinatorEngine } from "../src/engines/specialists/coordinator.js";
import { pactAdapter } from "../src/games/pact/adapter.js";
import { EngineRegistry } from "../src/platform/engine-registry.js";
import type { EngineProfileRef } from "../src/platform/profiles.js";
import { PlatformHost } from "../src/platform/supervisor.js";
import type { Claim, Store } from "../src/store.js";
import { CoordinationBoard } from "./fixtures/environments/coordination-board.js";
import { FakeGame, fixture, ready } from "./helpers.js";
import { platformFixture } from "./platform-helpers.js";

export interface ArchitectureTranscript {
  profile: EngineProfileRef;
  scenario: string;
  modelPackets: unknown[];
  commands: unknown[];
  allocations: { status: string; tokens: string }[];
  code: string;
  turn: Data;
  continuity: unknown;
  wake: unknown;
  recovery: unknown;
  trace: unknown;
}

/** Only generated synthetic IDs are normalized. Decision text, timestamps and values are unchanged. */
function normalize(value: unknown, claim: Claim): ArchitectureTranscript {
  const ids = new Map<string, string>([
    [claim.id, "fixture-turn"],
    [claim.agentId, "fixture-agent"],
    [claim.cohortId, "fixture-cohort"],
  ]);
  if (claim.agent.account_id) ids.set(claim.agent.account_id, "fixture-account");
  if (claim.agent.kingdom_id) ids.set(claim.agent.kingdom_id, "fixture-entity");
  let next = 0;
  return JSON.parse(
    JSON.stringify(value).replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, (id) => {
      if (!ids.has(id)) ids.set(id, `fixture-generated-${++next}`);
      return ids.get(id) as string;
    }),
  );
}

export async function captureArchitectureTranscript(
  ref: EngineProfileRef,
  capture: { scenario: string },
): Promise<ArchitectureTranscript> {
  if (
    ref.version !== "1" ||
    !["legacy-loop", "legacy-cognition", "reactive-basic", "reactive-cognition", "specialist-coordinator"].includes(
      ref.id,
    )
  ) {
    throw Error("UNSUPPORTED_CAPTURE_PROFILE");
  }
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-11T12:00:00.000Z"));
  const packets: Parameters<ModelPort["decide"]>[0][] = [];
  let store: Store | undefined, claim: Claim | undefined, game: FakeGame | undefined;
  let code = "COMPLETED",
    board: CoordinationBoard | undefined;
  const model: ModelPort = {
    async decide(input) {
      packets.push(input);
      if (capture.scenario === "unknown" || (capture.scenario === "sibling-failure" && packets.length === 2)) {
        throw Error("TRANSPORT_UNCERTAIN");
      }
      if (capture.scenario === "correction" && packets.length === 1) {
        return { decision: null, decisionError: "MODEL_THINKING_WITHOUT_FINAL", inputTokens: 70, outputTokens: 44 };
      }
      const payload = object(JSON.parse(input.messages[1].content));
      let decision: unknown;
      if (ref.id === "specialist-coordinator") {
        if (payload.stage === "worker") {
          const focus = object(payload.focus),
            observation = object(focus.observation);
          decision = {
            summary: "Synthetic current proposal",
            proposal: {
              intent: { schemaId: "board.move.v1", payload: { to: focus.id } },
              evidenceRefs: focus.sourceRefs,
              expectedOutcome: { hypothesis: "Improve the synthetic position" },
              claims: [{ schemaId: "energy.v1", kind: "resource", key: "shared", units: observation.cost }],
              conflicts: [],
            },
          };
        } else {
          if (capture.scenario === "stale") board?.advance();
          const proposals = payload.proposals as { intent: { commandId: string } }[];
          decision = { commandIds: [proposals[0].intent.commandId], judgement: "One funded synthetic action" };
        }
      } else if (ref.id.startsWith("legacy-")) {
        decision =
          packets.length === 1
            ? {
                kind: "action",
                action: { kind: "game.building.queue", building: "farm", targetLevel: 2, slot: 1 },
                summary: "Queue the synthetic farm",
              }
            : { kind: "wait", summary: "Wait for actual completion" };
      } else {
        const action = {
          kind: "action",
          schemaId: "board.move.v1",
          payload: { to: "a4" },
          summary: "Move to the synthetic legal position",
        };
        decision = ref.id === "reactive-cognition" ? { decision: action } : action;
      }
      return { decision, inputTokens: 500, outputTokens: 50 };
    },
  };
  try {
    if (ref.id.startsWith("legacy-")) {
      const f = await fixture();
      store = f.store;
      const cohort = await ready(store, 1);
      await f.pool.query("UPDATE cohorts SET observation_consent=true, model=model||$2::jsonb WHERE id=$1", [
        cohort,
        ref.id === "legacy-cognition" ? { cognition: "llm-centered-v1" } : {},
      ]);
      const value = await store.claim("architecture-parity");
      if (!value) throw Error("NO_CAPTURE_CLAIM");
      claim = value;
      game = new FakeGame(claim);
      await new LegacyEngineBridge(store, model, async () => game as FakeGame, true, pactAdapter).run(claim);
    } else {
      const f = await platformFixture();
      store = f.store;
      await store.setState(f.group.id, "paused", true);
      await f.tasks.enroll(f.group.id, ref);
      await f.pool.query("UPDATE cohorts SET observation_consent=true WHERE id=$1", [f.group.id]);
      f.board.adapter.capabilities.events = "poll";
      f.board.adapter.capabilities.continuity = ref.id === "reactive-cognition";
      if (ref.id === "specialist-coordinator") board = new CoordinationBoard(f.board.adapter, f.now);
      else {
        const connect = f.board.adapter.connect;
        f.board.adapter.connect = async (binding) => {
          const session = await connect(binding);
          return {
            ...session,
            events: async (cursor) => ({ events: [], nextCursor: cursor, resyncRequired: false }),
            observe: async (query) => {
              const observed = { ...(await session.observe(query)), observedAt: f.now().toISOString() };
              return ref.id !== "reactive-cognition"
                ? observed
                : {
                    ...observed,
                    continuity: {
                      schemaVersion: "fleet.continuity-observation.v1" as const,
                      self: {
                        capabilities: ["move"],
                        needs: { position: "legal" },
                        dependencies: {},
                        ownerValues: { objective: "finish" },
                      },
                      facts: [
                        {
                          sourceRef: observed.sourceRefs[0],
                          kind: "state" as const,
                          subject: "self",
                          predicate: "position",
                          value: String(object(observed.payload).square),
                        },
                      ],
                    },
                  };
            },
          };
        };
      }
      await store.setState(f.group.id, "running", true);
      await f.enqueue(
        undefined,
        "capture",
        "capture:source",
        capture.scenario === "zero" ? { clockId: "board.ply", value: "0" } : undefined,
      );
      const task = await f.claim();
      claim = task.turn;
      const host = f.host(model);
      if (ref.id === "reactive-basic") host.engines.register(new ReactiveEngine());
      else {
        const continuity = new ContinuityModule(f.tasks, f.bindings, new Cognition(store), {
          id: ref.id === "reactive-cognition" ? "reactive-cognition" : "specialist-coordinator",
          version: "1",
        });
        host.engines.register(
          ref.id === "reactive-cognition"
            ? new ContinuityEngine(continuity)
            : new SpecialistCoordinatorEngine(continuity),
        );
      }
      const architectures = builtinArchitectures({
        [`${ref.id}@${ref.version}`]: (services) =>
          compatibilityRuntime(services, () => {
            if (ref.id === "reactive-basic") return new ReactiveEngine();
            const c = new ContinuityModule(f.tasks, f.bindings, new Cognition(f.store), {
              id: ref.id === "reactive-cognition" ? "reactive-cognition" : "specialist-coordinator",
              version: "1",
            });
            return ref.id === "reactive-cognition" ? new ContinuityEngine(c) : new SpecialistCoordinatorEngine(c);
          }),
      });
      const executing = new PlatformHost(
        f.tasks,
        f.bindings,
        f.environments,
        new EngineRegistry(host.engines.list(), architectures),
        host.admission,
        host.commands,
        host.supervisor,
        async (context, definition, session) => {
          const services = await createScopedServices(context.claim, definition, session, {
            context,
            store: f.store,
            tasks: f.tasks,
            bindings: f.bindings,
            model: host.admission,
            commands: host.commands,
          });
          return { services, operation: scopedOperationFor(services) };
        },
      );
      try {
        await executing.run(task);
      } catch (error) {
        code = safeCode(error);
      }
    }
    if (!store || !claim) throw Error("CAPTURE_NOT_INITIALIZED");
    const turn = (
      await store.pool.query(
        "SELECT state,code,calls,actions,unknown_usage,pending_command,pending_action FROM turns WHERE id=$1",
        [claim.id],
      )
    ).rows[0];
    const allocations = (
      await store.pool.query(
        "SELECT status,tokens::text,input_tokens::text,output_tokens::text FROM compute_ledger WHERE turn_id=$1 ORDER BY status,input_tokens,output_tokens,tokens",
        [claim.id],
      )
    ).rows;
    const commands = game
      ? game.submits
      : (
          await store.pool.query(
            "SELECT command_id,state,outcome FROM platform_commands WHERE turn_id=$1 ORDER BY command_id",
            [claim.id],
          )
        ).rows;
    const resolutions = (
      await store.pool.query(
        "SELECT command_id,code,source FROM command_resolutions WHERE turn_id=$1 ORDER BY command_id",
        [claim.id],
      )
    ).rows;
    return normalize(
      {
        profile: ref,
        scenario: capture.scenario,
        modelPackets: packets.map(({ model, messages, schema, maxOutputTokens }) => ({
          model,
          messages,
          schema,
          maxOutputTokens,
        })),
        commands,
        allocations,
        code: code === "COMPLETED" ? turn.code : code,
        turn,
        continuity: {
          state: (await store.pool.query("SELECT namespace,version FROM continuity_states ORDER BY namespace")).rows,
          cognitive: (await store.pool.query("SELECT version FROM cognitive_states ORDER BY version")).rows,
          episodes: (await store.pool.query("SELECT kind FROM cognitive_episodes ORDER BY sequence")).rows,
        },
        wake: (
          await store.pool.query("SELECT task_key,state,code,wake,revision,fence FROM platform_tasks ORDER BY sequence")
        ).rows,
        recovery: {
          agent: (await store.pool.query("SELECT state,reason FROM agents WHERE id=$1", [claim.agentId])).rows,
          resolutions,
        },
        trace: (
          await store.pool.query(
            "SELECT e.stage,e.label,c.observation_consent FROM turn_events e JOIN cohorts c ON c.id=e.cohort_id WHERE e.turn_id=$1 ORDER BY e.sequence",
            [claim.id],
          )
        ).rows,
      },
      claim,
    );
  } finally {
    await store?.pool.end();
    vi.useRealTimers();
  }
}
