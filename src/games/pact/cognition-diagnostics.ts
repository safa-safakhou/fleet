import { randomUUID } from "node:crypto";
import type { RecallPort } from "../../cognition.js";
import { Cognition } from "../../cognition.js";
import { type DiagnosticScenario, diagnosticSituation } from "../../cognition-diagnostic-cases.js";
import { type Data, FleetError, type GamePort, type ModelPort, safeCode, type Tool } from "../../domain.js";
import { ContinuityEngine } from "../../engines/continuity/engine.js";
import { ContinuityModule } from "../../engines/continuity/state.js";
import { LegacyEngineBridge } from "../../engines/legacy/bridge.js";
import { ModelAdmission, RouteCapacity } from "../../platform/admission.js";
import { Bindings } from "../../platform/bindings.js";
import type { ActionOutcome, EnvironmentAdapter, Observation } from "../../platform/contracts.js";
import { EngineRegistry } from "../../platform/engine-registry.js";
import { EnvironmentRegistry } from "../../platform/environment-registry.js";
import { CommandExecutor } from "../../platform/execution.js";
import { OperationSupervisor, PlatformHost } from "../../platform/supervisor.js";
import { TaskStore } from "../../platform/tasks.js";
import type { Store } from "../../store.js";
import { pactAdapter } from "./adapter.js";
import { actionContract } from "./contracts.js";
import { pactActionContracts, pactProposalGuide, validatePactProposal } from "./proposals.js";

const peer = "22222222-2222-4222-8222-222222222222";
const tools: Tool[] = [
  { name: "pact_agent_guide_v1", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } },
  { name: "pact_world_read_v1", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } },
  {
    name: "pact_council_thread_v1",
    inputSchema: { type: "object", properties: { kingdomId: { type: "string" } }, required: ["kingdomId"] },
    annotations: { readOnlyHint: true },
  },
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
/** No game transport or real identities. Own synthetic cohorts only; wall-clock deadlines stay real. */
export class DiagnosticEpisodes {
  private sessions = new Map<string, { id: string; agent: string; account: string; kingdom: string; next: number }>();
  constructor(
    private store: Store,
    private deadlineAt: string,
    private runId: string,
  ) {}
  async run(
    profile: "legacy-cognition" | "reactive-cognition",
    thinking: boolean,
    scenario: DiagnosticScenario,
    step: number,
    model: ModelPort,
    recall: RecallPort,
  ) {
    const situation = diagnosticSituation(scenario, step),
      trial = `${scenario}:${step}`,
      key = `${thinking}:${profile}:${scenario}`;
    let session = this.sessions.get(key);
    if (!session) {
      if (step !== 0) throw new FleetError("DIAGNOSTIC_EPISODE_ORDER");
      const { id } = await this.store.create({
        name: `Diagnostic ${profile} ${scenario}`,
        count: 1,
        intervalMinutes: 15,
        seed: key,
        strategies: ["guardian"],
      });
      await this.store.configure(id, {
        model: {
          route: "ollama",
          model: "nemotron-3-nano:4b",
          thinking,
          ...(profile === "legacy-cognition" ? { cognition: "llm-centered-v1", recallAssist: "laya-recall-v1" } : {}),
        },
        budget: {
          mode: "finite",
          callLimit: scenario === "promise" || scenario === "reserve" ? 6 : 2,
          tokenLimit: scenario === "promise" || scenario === "reserve" ? 240000 : 80000,
          deadlineAt: this.deadlineAt,
          perCallTokenLimit: 40000,
          maxOutputTokens: 2000,
          inputByteLimit: 24000,
          maxCallsPerTurn: 2,
          maxActionsPerTurn: 2,
          concurrency: 1,
        },
      });
      await this.store.pool.query("UPDATE cohorts SET observation_consent=true WHERE id=$1", [id]);
      const agent = (await this.store.pool.query("SELECT id FROM agents WHERE cohort_id=$1", [id])).rows[0].id,
        account = randomUUID(),
        kingdom = randomUUID();
      await this.store.pool.query(
        "UPDATE agents SET account_id=$2,kingdom_id=$3,state='ready',credential_state='ready',strategy=jsonb_set(strategy,'{objective}',$4::jsonb) WHERE id=$1",
        [agent, account, kingdom, JSON.stringify(situation.goal)],
      );
      session = { id, agent, account, kingdom, next: 0 };
      this.sessions.set(key, session);
    }
    if (session.next !== step) throw new FleetError("DIAGNOSTIC_EPISODE_ORDER");
    session.next++;
    const { id, agent, account, kingdom } = session,
      store = this.store,
      legacy = profile === "legacy-cognition";
    // Explicit diagnostic turn request, never a production schedule change.

    let bindingId: string | undefined;
    let withheld = 0,
      scopeViolation = false,
      invalidActions = 0;
    const world: Data = {
      profile: { kingdomId: kingdom },
      ambition: situation.goal,
      asOfGameTimeMs: String(1000 + step * 1000),
      balances: { iron: { ordinaryUnits: scenario === "reserve" ? "100" : "1200" } },
      buildings: [
        { kind: "hall", level: 1 },
        { kind: "iron_mine", level: 1 },
      ],
      builders: [],
      contracts: [],
      upkeep: { coverage: "synthetic only" },
    };
    const guide: Data = {
      contacts: [{ kingdomId: peer, name: "Synthetic contact" }],
      contactRequests: [],
      openSupplyOffers: [],
      planningCautions: [situation.story],
      mandate: { version: 1 },
      firstContact: "Introductions do not guarantee a reply; communication remains optional.",
      principle: situation.story,
    };
    const receipts = new Map<string, Data>();
    const capture = (commandId: string, action: Data) => {
      withheld++;
      try {
        actionContract(action);
      } catch {
        invalidActions++;
      }
      const result = {
        commandId,
        code: "QUALIFICATION_COMMAND_WITHHELD",
        status: "rejected",
        sourceRefs: [`fixture:${scenario}`],
      };
      receipts.set(commandId, result);
      return result;
    };
    const game: GamePort = {
      profile: async () => ({ accountId: account, entityId: kingdom }),
      tools: async () => structuredClone(tools),
      read: async (tool, _args) => {
        if (!tools.some((t) => t.name === tool && t.annotations?.readOnlyHint)) {
          scopeViolation = true;
          throw new FleetError("QUALIFICATION_SCOPE_VIOLATION");
        }
        return structuredClone(
          tool === "pact_world_read_v1"
            ? world
            : tool === "pact_council_thread_v1"
              ? {
                  messages: [
                    {
                      id: "33333333-3333-4333-8333-333333333333",
                      senderKingdomId: peer,
                      body: situation.story,
                      sentGameTimeMs: String(1000 + step * 1000),
                    },
                  ],
                  next: null,
                }
              : guide,
        );
      },
      open: async () => {},
      submit: async (commandId, action) => capture(commandId, action),
      receipt: async (commandId) => receipts.get(commandId) ?? { commandId, code: "QUALIFICATION_COMMAND_WITHHELD" },
      close: async () => {},
    };
    const cognition = new Cognition(store, recall);
    let turnId: string | undefined, errorCode: string | undefined;
    try {
      if (legacy) {
        await store.setState(id, "running", true);
        await store.pool.query("UPDATE agents SET next_due_at=$2 WHERE id=$1 AND cohort_id=$3", [
          agent,
          store.now(),
          id,
        ]);
        const claim = await store.claim(`diagnostic:${this.runId}`);
        if (!claim || claim.agentId !== agent) throw new FleetError("NO_CLAIM");
        turnId = claim.id;
        for (const fact of situation.facts)
          await cognition.capture(
            claim,
            fact.kind === "statement" ? "message" : "observation",
            `diagnostic:${scenario}:${step}:${fact.predicate}`,
            {
              peerId: fact.subject === "self" ? undefined : peer,
              direction: "incoming",
              summary: fact.value,
              body: fact.value,
              gameTimeMs: String(1000 + step * 1000),
            },
          );
        await new LegacyEngineBridge(
          store,
          model,
          async () => game,
          true,
          pactAdapter,
          undefined,
          undefined,
          cognition,
        ).run(claim);
      } else {
        const ref = { id: "pact-cognition-diagnostic", version: "1", instanceId: this.runId },
          bindings = new Bindings(store, ref),
          tasks = new TaskStore(store, bindings, 1);
        await tasks.enroll(id, { id: profile, version: "1" });
        const binding = await bindings.bind(agent, {
          environment: ref,
          accountRef: account,
          actorRef: agent,
          entityRef: kingdom,
        });
        bindingId = binding.id;
        const observation: Observation = {
          schemaId: "pact.observation.v1",
          revision: String(step + 1),
          observedAt: store.now().toISOString(),
          environmentTime: { clockId: "diagnostic.game-time", value: String(1000 + step * 1000) },
          sourceRefs: situation.facts.map((f) => `fixture:${scenario}:${step}:${f.predicate}`),
          payload: {
            world,
            guide,
            story: situation.story,
            peerId: peer,
            actionGuide: pactProposalGuide({ world, guide }),
          },
          coverage: { scope: "synthetic_fixtures_only", commands: "withheld" },
          continuity: {
            schemaVersion: "fleet.continuity-observation.v1",
            self: {
              capabilities: ["observe", "propose_action", "wait"],
              needs: {},
              dependencies: {},
              ownerValues: { objective: world.ambition },
            },
            facts: situation.facts.map((f) => ({ ...f, sourceRef: `fixture:${scenario}:${step}:${f.predicate}` })),
          },
        };
        const adapter: EnvironmentAdapter = {
          ref,
          schemas: { observations: ["pact.observation.v1"], actions: ["pact.action.v1"] },
          presentation: {
            accountLabel: "Synthetic account",
            actorLabel: "Fixture actor",
            entityLabel: "Fixture kingdom",
            defaultGoal: String(world.ambition),
          },
          capabilities: {
            timing: "realtime",
            events: "poll",
            idempotency: "native",
            outcomeLookup: true,
            parallelReasoning: false,
            social: true,
            simulationControls: false,
            continuity: true,
          },
          connect: async () => ({
            observe: async () => structuredClone(observation),
            catalog: async () => structuredClone(tools),
            validateProposal: async (proposal, observed) =>
              validatePactProposal(proposal.intent.payload, observed.payload),
            actionContracts: async (observed) => pactActionContracts(observed.payload),
            execute: async (intent) => capture(intent.commandId, intent.payload) as ActionOutcome,
            resolve: async (commandId) =>
              (receipts.get(commandId) ?? {
                commandId,
                status: "rejected",
                code: "QUALIFICATION_COMMAND_WITHHELD",
                sourceRefs: [],
              }) as ActionOutcome,
            events: async () => ({ events: [], nextCursor: null, resyncRequired: false }),
            close: async () => {},
          }),
        };
        const environments = new EnvironmentRegistry([adapter], ref),
          route = new RouteCapacity(store, () => ({ key: "qualification-local", capacity: 1 }));
        await tasks.upsertFromEvent(
          binding,
          {
            id: `fixture:${trial}`,
            type: "qualification",
            sourceRef: `fixture:${scenario}`,
            observedAt: store.now().toISOString(),
            environmentTime: observation.environmentTime,
            metadata: {},
          },
          trial,
        );
        await store.setState(id, "running", true);
        await store.pool.query("UPDATE agents SET next_due_at=$2 WHERE id=$1 AND cohort_id=$3", [
          agent,
          store.now(),
          id,
        ]);
        const claim = await tasks.claim(`diagnostic:${this.runId}`, store.now());
        if (!claim || claim.turn.agentId !== agent) throw new FleetError("NO_CLAIM");
        turnId = claim.turn.id;
        const engine = new ContinuityEngine(new ContinuityModule(tasks, bindings, cognition));
        const host = new PlatformHost(
          tasks,
          bindings,
          environments,
          new EngineRegistry([engine]),
          new ModelAdmission(store, tasks, model, route),
          new CommandExecutor(store, tasks, bindings, environments),
          new OperationSupervisor(tasks),
        );
        await host.run(claim);
      }
    } catch (e) {
      errorCode = safeCode(e);
    } finally {
      await store.setState(id, "paused", true);
    }
    const turn = turnId
      ? (await store.pool.query("SELECT code,calls,actions,state,pending_command FROM turns WHERE id=$1", [turnId]))
          .rows[0]
      : undefined;
    return {
      cohortId: id,
      agentId: agent,
      bindingId,
      step,
      scenario,
      turnId,
      profile,
      trial,
      code: errorCode ?? turn?.code ?? "NO_TURN",
      calls: turn?.calls ?? 0,
      withheld,
      semanticRejections: turnId
        ? (
            await store.pool.query(
              "SELECT count(*)::int n FROM turn_events WHERE turn_id=$1 AND label=ANY($2::text[])",
              [
                turnId,
                [
                  "Proposal rejected before command preparation",
                  "Decision update rejected before command preparation",
                  "Proposed action deferred before submission",
                  "Action shape rejected before submission",
                  "Read tool rejected before submission",
                  "Read arguments rejected before submission",
                  "Read reference rejected before submission",
                ],
              ],
            )
          ).rows[0].n
        : 0,
      proposalRejections: turnId
        ? (
            await store.pool.query(
              "SELECT count(*)::int n FROM turn_events WHERE turn_id=$1 AND label='Proposal rejected before command preparation'",
              [turnId],
            )
          ).rows[0].n
        : 0,
      invalidActions,
      scopeViolation,
      pending: !!turn?.pending_command,
      coverage: "synthetic_fixtures_only",
      helperPath:
        profile === "legacy-cognition"
          ? "laya-recall-v1"
          : profile === "reactive-cognition"
            ? "retained-evidence-no-laya-path"
            : "none",
    };
  }
}
