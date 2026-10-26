import { type Data, FleetError, type GamePort, object, safeCode } from "../domain.js";
import {
  assertPactEffectCatalog,
  normalizePactEffects,
  pactEffectCommand,
  pactRemoteGuard,
} from "../games/pact/action-effects.js";
import { pactAdapter } from "../games/pact/adapter.js";
import { pactAgentBriefing } from "../games/pact/briefing.js";
import { PactCoordination } from "../games/pact/coordination.js";
import { pactEvents } from "../games/pact/events.js";
import { pactCurrentObjective, pactWaitSchema, validatePactWait } from "../games/pact/goal-state.js";
import { projectPactObservation } from "../games/pact/negotiation-state.js";
import { pactNamedObservationSemantics } from "../games/pact/observation-semantics.js";
import { pactContinuity } from "../games/pact/outlook.js";
import { packPactObservation } from "../games/pact/packing.js";
import { pactActionContracts, pactProposalGuide, validatePactProposal } from "../games/pact/proposals.js";
import { pactReadQuerySchema } from "../games/pact/read-queries.js";
import { createPactFactTracker, type PactFactRequest } from "../games/pact/requested-facts.js";
import { RemoteRejection } from "../http.js";
import type { Bindings } from "../platform/bindings.js";
import type {
  ActionOutcome,
  BindingRef,
  EnvironmentAdapter,
  Observation,
  ReadQueryOptions,
} from "../platform/contracts.js";
import type { Store } from "../store.js";
import { validateTool } from "../tools.js";
import { pactSpecialistPresets } from "./pact-presets.js";
import { createPactSkillSupport } from "./pact-skills.js";

/** Preserve the agent UUID used as the existing vault associated-data identity. */
export class PactBindings {
  constructor(
    private store: Store,
    readonly bindings: Bindings,
  ) {}
  async attach(agentId: string) {
    if (this.bindings.selected.id !== "pact") throw new FleetError("ENVIRONMENT_NOT_SELECTED");
    const agent = await this.store.agent(agentId);
    if (!agent.account_id || !agent.kingdom_id) throw new FleetError("AUTH_REQUIRED");
    return this.bindings.bind(
      agentId,
      {
        environment: this.bindings.selected,
        accountRef: agent.account_id,
        actorRef: agent.account_id,
        entityRef: agent.kingdom_id,
      },
      "inferred_legacy",
    );
  }
  async agentFor(binding: BindingRef) {
    const id = await this.bindings.agentFor(binding),
      agent = await this.store.agent(id);
    if (
      binding.accountRef !== agent.account_id ||
      binding.actorRef !== agent.account_id ||
      binding.entityRef !== agent.kingdom_id
    )
      throw new FleetError("BINDING_MISMATCH");
    return id;
  }
}
function receipt(id: string, result: Data): ActionOutcome {
  if (result.commandId !== id) return { commandId: id, status: "unknown", code: "RECEIPT_MISMATCH", sourceRefs: [] };
  const code = String(result.code ?? "TRANSPORT_UNCERTAIN");
  if (["COMMITTED", "ALREADY_COMMITTED"].includes(code))
    return { commandId: id, status: "confirmed", code, sourceRefs: [`command:${id}`] };
  if (code === "PENDING") return { commandId: id, status: "pending", code, sourceRefs: [] };
  if (["RECEIPT_NOT_FOUND", "NOT_FOUND", "TRANSPORT_UNCERTAIN"].includes(code))
    return { commandId: id, status: "unknown", code, sourceRefs: [] };
  const knownRejection = pactAdapter.rejection(new RemoteRejection(code, 400), false);
  return {
    commandId: id,
    status: knownRejection ? "rejected" : "unknown",
    code,
    sourceRefs: knownRejection ? [`command:${id}`] : [],
  };
}
export function createPactEnvironment(ports: {
  store: Store;
  bindings: PactBindings;
  game: (agentId: string) => Promise<GamePort>;
  now: () => Date;
  eventFeedVersion?: "pact.agent-events.v1";
  outlookVersion?: "pact.agent-outlook.v1";
  actionEffectsVersion?: "fleet.action-effects.v1";
  factRequests?: PactFactRequest[];
  coordinationVersion?: "pact.coordination.v1";
}): EnvironmentAdapter {
  if (ports.coordinationVersion && (!ports.outlookVersion || !ports.actionEffectsVersion))
    throw new FleetError("COORDINATION_PROTOCOL_REQUIRED", true);
  return {
    ref: { id: "pact", version: "1" },
    specialistPresets: pactSpecialistPresets,
    observationSemanticsFor: (observation) =>
      pactNamedObservationSemantics(
        observation.payload,
        ["pact.observation.specialists.v4", "pact.observation.specialists.v5"].includes(observation.schemaId)
          ? { social: true }
          : {},
      ),
    observationSemantics:
      "Amounts and rates are different. Supply goals need actual external delivery over the stated GAME window; stock, founding allowance, own production, quotes and signatures do not prove it.",
    specialistObservationPolicy: { id: "specialists", version: "1" },
    specialistObservationPolicies: [
      { id: "specialists", version: "1" },
      { id: "specialists", version: "2" },
      { id: "specialists", version: "3" },
      { id: "specialists", version: "4" },
      { id: "specialists", version: "5" },
    ],
    ...(ports.actionEffectsVersion ? { skillSupport: createPactSkillSupport() } : {}),
    instructions: pactAdapter.instructions,
    accountObjective: (observation) => pactCurrentObjective(observation.payload),
    schemas: { observations: ["pact.observation.v1"], actions: ["pact.action.v1"] },
    presentation: {
      accountLabel: "Account",
      actorLabel: "Envoy",
      entityLabel: "Kingdom",
      defaultGoal: "Follow the authenticated account's owner intent and authority.",
    },
    enrollment: { attachExisting: (id) => ports.bindings.attach(id) },
    capabilities: {
      timing: "realtime",
      events: ports.eventFeedVersion ? "poll" : "none",
      idempotency: "native",
      outcomeLookup: true,
      parallelReasoning: false,
      social: true,
      simulationControls: false,
      continuity: Boolean(ports.outlookVersion),
      ...(ports.actionEffectsVersion ? { actionEffects: true } : {}),
      ...(ports.coordinationVersion ? { coordination: true } : {}),
    },
    async connect(binding) {
      const agentId = await ports.bindings.agentFor(binding);
      const requests = (ports.factRequests ?? []).filter((r) => r.entityRef === binding.entityRef);
      const tracker = createPactFactTracker(requests, binding.entityRef);
      const game = await ports.game(agentId);
      const coordination = ports.coordinationVersion ? new PactCoordination(binding, game, ports.now) : undefined;
      let leaseOpened = false;
      const ensureWriteLease = async () => {
        if (coordination) return coordination.ensureLease();
        if (!leaseOpened) {
          await game.open();
          leaseOpened = true;
        }
      };
      const finish = async (observation: Observation, query: Data): Promise<Observation> =>
        requests.length
          ? {
              ...observation,
              requestedFacts: tracker.update(
                query,
                observation.payload.requestedRead,
                (await game.tools()).filter(pactAdapter.isRead),
              ),
            }
          : observation;
      try {
        if ((await game.profile()).accountId !== binding.accountRef) throw new FleetError("IDENTITY_MISMATCH");
        if (ports.actionEffectsVersion) {
          const tools = await game.tools();
          if (
            coordination &&
            !tools.some((t) => t.name === "pact_decision_support_v2" && t.annotations?.readOnlyHint === true)
          )
            throw new FleetError("COORDINATION_PROTOCOL_REQUIRED", true);
          if (!game.effects || !game.submitGuarded) throw new FleetError("ACTION_EFFECTS_PROTOCOL_REQUIRED", true);
          assertPactEffectCatalog(tools);
        }
      } catch (error) {
        await game.close();
        throw error;
      }
      return {
        ...(coordination ? { decisionGrounding: coordination.grounding } : {}),
        ...(ports.actionEffectsVersion
          ? {
              effects: async (intent: import("../platform/contracts.js").ActionIntent) => {
                await ports.bindings.agentFor(binding);
                await ensureWriteLease();
                const command = pactEffectCommand(binding, intent, ports.now());
                if (!game.effects) throw new FleetError("ACTION_EFFECTS_PROTOCOL_REQUIRED", true);
                return normalizePactEffects(intent, command, await game.effects(command));
              },
            }
          : {}),
        async readQuerySchema(options?: ReadQueryOptions) {
          const tools = (await game.tools()).filter(pactAdapter.isRead);
          const emptyNames = options?.requireKnownArguments
            ? tools
                .filter((tool) => {
                  try {
                    validateTool(tool, {});
                    return true;
                  } catch (error) {
                    if (error instanceof FleetError && error.code === "INVALID_TOOL_ARGUMENTS") return false;
                    throw error;
                  }
                })
                .map((t) => t.name)
            : [];
          return pactReadQuerySchema(
            tools.map((t) => t.name),
            Boolean(ports.outlookVersion),
            options?.requireKnownArguments ? tools.filter((t) => t.name === options.retrievedTool) : undefined,
            emptyNames,
            options?.contractVersion,
          );
        },
        async observe(query) {
          try {
            validateTool(
              { name: "pact.read-query", inputSchema: pactReadQuerySchema(undefined, Boolean(ports.outlookVersion)) },
              query,
            );
          } catch {
            throw new FleetError("INVALID_READ_QUERY", true);
          }
          const schemaTool =
            typeof query.readSchema === "string"
              ? (await game.tools()).find((tool) => tool.name === query.readSchema && pactAdapter.isRead(tool))
              : undefined;
          if (typeof query.readSchema === "string" && !schemaTool) throw new FleetError("READ_TOOL_FORBIDDEN");
          if (query.continuity === true) {
            if (!ports.outlookVersion) throw new FleetError("UNSUPPORTED_CAPABILITY");
            const catalog = await game.tools();
            const tool = catalog.find(
              (t) => t.name === "pact_agent_outlook_v1" && t.annotations?.readOnlyHint === true,
            );
            if (!tool) throw new FleetError("UNSUPPORTED_SCHEMA");
            const raw = await game.read(tool.name, { forecastMinutes: 60 }),
              mapped = pactContinuity(raw, binding.entityRef);
            mapped.continuity.self.capabilities = catalog.slice(0, 40).map((tool) => tool.name);
            mapped.continuity.self.needs.capabilityCatalogOmitted = Math.max(0, catalog.length - 40);
            const extra: Data = {};
            if (typeof query.tool === "string") {
              const read = (await game.tools()).find((t) => t.name === query.tool);
              if (!read || !pactAdapter.isRead(read) || read.annotations?.readOnlyHint !== true)
                throw new FleetError("READ_TOOL_FORBIDDEN");
              validateTool(read, object(query.args));
              extra.requestedRead = await game.read(read.name, object(query.args));
              if (read.name === "pact_council_thread_v1") {
                const result = object(extra.requestedRead),
                  peer = object(query.args).kingdomId;
                for (const raw of Array.isArray(result.messages) ? result.messages : []) {
                  const message = object(raw);
                  if (
                    typeof message.id !== "string" ||
                    typeof message.body !== "string" ||
                    message.senderKingdomId !== peer ||
                    peer === binding.entityRef ||
                    typeof peer !== "string"
                  )
                    continue;
                  const sourceRef = `message:${message.id}`;
                  mapped.continuity.facts.unshift({
                    sourceRef,
                    kind: "statement",
                    subject: peer,
                    predicate: "statement",
                    value:
                      message.body.length > 400 ? `[partial statement] ${message.body.slice(0, 380)}` : message.body,
                  });
                  mapped.sourceRefs.push(sourceRef);
                }
                mapped.continuity.self.needs.statementFactsOmitted = Math.max(0, mapped.continuity.facts.length - 40);
                mapped.continuity.facts = mapped.continuity.facts.slice(0, 40);
              }
            }
            const current = await pactAdapter.initial(game, binding.entityRef);
            const result = await finish(
              {
                schemaId: "pact.observation.v1",
                revision: mapped.revision,
                observedAt: ports.now().toISOString(),
                environmentTime: { clockId: "pact.game-time-ms", value: mapped.time },
                sourceRefs: mapped.sourceRefs,
                payload: { agentBriefing: pactAgentBriefing(current), ...current, ...extra },
                coverage: {
                  authorizedView: true,
                  completeWorld: false,
                  requestedReadSeparateSnapshot: Boolean(extra.requestedRead),
                },
                continuity: mapped.continuity,
              },
              query,
            );
            if (query.coordination === true && coordination) {
              return coordination.observe(result);
            }
            return result;
          }
          const payload: Data = await pactAdapter.initial(game, binding.entityRef);
          if (schemaTool) {
            payload.requestedRead = {
              name: schemaTool.name,
              ...(schemaTool.description ? { description: schemaTool.description } : {}),
              inputSchema: schemaTool.inputSchema,
            };
            payload.requestedReadTool = `schema:${schemaTool.name}`;
          }
          if (typeof query.tool === "string") {
            const tool = (await game.tools()).find((tool) => tool.name === query.tool);
            if (!tool || !pactAdapter.isRead(tool) || tool.annotations?.readOnlyHint !== true)
              throw new FleetError("READ_TOOL_FORBIDDEN");
            validateTool(tool, object(query.args));
            payload.requestedRead = await game.read(tool.name, object(query.args));
            payload.requestedReadTool = tool.name;
            pactAdapter.applyRead?.(
              payload,
              tool.name,
              object(query.args),
              object(payload.requestedRead),
              binding.entityRef,
            );
          }
          const world = object(payload.world),
            rawTime = world.asOfGameTimeMs ?? payload.asOfGameTimeMs,
            time =
              typeof rawTime === "number" && Number.isSafeInteger(rawTime) && rawTime >= 0
                ? String(rawTime)
                : typeof rawTime === "string" && /^\d+$/.test(rawTime)
                  ? rawTime
                  : undefined;
          return finish(
            {
              schemaId: "pact.observation.v1",
              revision: typeof time === "string" ? time : "unavailable",
              observedAt: ports.now().toISOString(),
              environmentTime: { clockId: "pact.game-time-ms", value: typeof time === "string" ? time : "unavailable" },
              sourceRefs: [
                `authorized-read:${String(query.tool ?? (schemaTool ? `schema:${schemaTool.name}` : "initial"))}:${String(time ?? "unavailable")}`,
              ],
              payload: {
                agentBriefing: pactAgentBriefing(payload),
                ...payload,
                actionGuide: pactProposalGuide(payload),
              },
              coverage: {
                authorizedView: true,
                requestedReadSeparateSnapshot: typeof query.tool === "string" || Boolean(schemaTool),
                environmentTimeAvailable: typeof time === "string",
                detail:
                  "Existing authenticated reads; current snapshot with explicit coverage, no full-world guarantee.",
              },
            },
            query,
          );
        },
        ...(ports.eventFeedVersion ? { events: (cursor: string | null) => pactEvents(game, cursor, ports.now) } : {}),
        async catalog() {
          const tools = await game.tools();
          pactAdapter.validateCatalog?.(tools);
          // observe() accepts read tools; writes use native action contracts.
          // Validate the full MCP protocol catalog, then advertise only tools
          // callable through this decision port. Continuity keeps native capabilities.
          return tools.filter(pactAdapter.isRead);
        },
        projectObservation: projectPactObservation,
        packObservation: packPactObservation,
        refreshProposal: coordination
          ? (proposal, observation) => coordination.refreshProposal(proposal, observation)
          : undefined,
        validateProposal: async (proposal, observation) => {
          const local = validatePactProposal(proposal.intent.payload, observation.payload, proposal.expectedOutcome);
          if (!local.valid) return local;
          return proposal.intent.expectedVersion !== undefined && coordination
            ? coordination.validate(proposal, observation)
            : local;
        },
        waitSchema: async (observation) => pactWaitSchema(observation.payload),
        validateWait: async (basis, observation) => validatePactWait(basis, observation.payload),
        actionContracts: async (observation, allowedActionKeys) =>
          pactActionContracts(observation.payload, allowedActionKeys),
        async execute(intent) {
          try {
            if (intent.bindingId !== binding.id) throw new FleetError("BINDING_MISMATCH");
            if (intent.schemaId !== "pact.action.v1") throw new FleetError("UNSUPPORTED_SCHEMA");
            if (intent.expectedVersion !== undefined && !coordination)
              throw new FleetError("UNSUPPORTED_EXPECTED_VERSION");
            if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(intent.commandId))
              throw new FleetError("INVALID_COMMAND_ID");
            validateTool(
              { name: "pact.action.v1", inputSchema: pactAdapter.actionSchema(String(intent.payload.kind)) },
              intent.payload,
            );
            await ports.bindings.agentFor(binding);
            await ensureWriteLease();
          } catch (error) {
            throw new FleetError(safeCode(error), true);
          }
          try {
            if (intent.expectedVersion !== undefined && coordination)
              return receipt(intent.commandId, await coordination.execute(intent));
            if (intent.guard) {
              if (!ports.actionEffectsVersion || !game.submitGuarded)
                throw new FleetError("ACTION_EFFECTS_PROTOCOL_REQUIRED", true);
              const command = pactEffectCommand(binding, intent, ports.now());
              return receipt(
                intent.commandId,
                await game.submitGuarded(command, pactRemoteGuard(intent, intent.guard, command)),
              );
            }
            return receipt(intent.commandId, await game.submit(intent.commandId, intent.payload));
          } catch (error) {
            if (error instanceof FleetError && error.notDispatched) throw error;
            const denied = pactAdapter.rejection(error, false);
            return {
              commandId: intent.commandId,
              status: denied ? "rejected" : "unknown",
              code: denied ?? safeCode(error),
              sourceRefs: [],
            };
          }
        },
        async resolve(id) {
          try {
            return receipt(id, await game.receipt(id));
          } catch (error) {
            return { commandId: id, status: "unknown", code: safeCode(error), sourceRefs: [] };
          }
        },
        close: () => game.close(),
      };
    },
  };
}
