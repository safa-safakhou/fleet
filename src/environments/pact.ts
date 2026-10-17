import { type Data, FleetError, type GamePort, object, safeCode } from "../domain.js";
import { pactAdapter } from "../games/pact/adapter.js";
import { RemoteRejection } from "../http.js";
import type { Bindings } from "../platform/bindings.js";
import type { ActionOutcome, BindingRef, EnvironmentAdapter } from "../platform/contracts.js";
import type { Store } from "../store.js";
import { validateTool } from "../tools.js";

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
}): EnvironmentAdapter {
  return {
    ref: { id: "pact", version: "1" },
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
      events: "none",
      idempotency: "native",
      outcomeLookup: true,
      parallelReasoning: false,
      social: true,
      simulationControls: false,
    },
    async connect(binding) {
      const agentId = await ports.bindings.agentFor(binding),
        game = await ports.game(agentId);
      try {
        if ((await game.profile()).accountId !== binding.accountRef) throw new FleetError("IDENTITY_MISMATCH");
      } catch (error) {
        await game.close();
        throw error;
      }
      return {
        async observe(query) {
          let payload: Data;
          if (typeof query.tool === "string") {
            const tool = (await game.tools()).find((tool) => tool.name === query.tool);
            if (!tool || !pactAdapter.isRead(tool) || tool.annotations?.readOnlyHint !== true)
              throw new FleetError("READ_TOOL_FORBIDDEN");
            validateTool(tool, object(query.args));
            payload = await game.read(tool.name, object(query.args));
          } else payload = await pactAdapter.initial(game, binding.entityRef);
          const world = object(payload.world),
            time = world.asOfGameTimeMs ?? payload.asOfGameTimeMs;
          return {
            schemaId: "pact.observation.v1",
            revision: typeof time === "string" ? time : "unavailable",
            observedAt: ports.now().toISOString(),
            environmentTime: { clockId: "pact.game-time-ms", value: typeof time === "string" ? time : "unavailable" },
            sourceRefs: [`authorized-read:${String(query.tool ?? "initial")}:${String(time ?? "unavailable")}`],
            payload,
            coverage: {
              authorizedView: true,
              environmentTimeAvailable: typeof time === "string",
              detail: "Existing authenticated reads; no event feed or full-world guarantee.",
            },
          };
        },
        async catalog() {
          const tools = await game.tools();
          pactAdapter.validateCatalog?.(tools);
          return tools;
        },
        async execute(intent) {
          try {
            if (intent.bindingId !== binding.id) throw new FleetError("BINDING_MISMATCH");
            if (intent.schemaId !== "pact.action.v1") throw new FleetError("UNSUPPORTED_SCHEMA");
            if (intent.expectedVersion !== undefined) throw new FleetError("UNSUPPORTED_EXPECTED_VERSION");
            if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(intent.commandId))
              throw new FleetError("INVALID_COMMAND_ID");
            validateTool(
              { name: "pact.action.v1", inputSchema: pactAdapter.actionSchema(String(intent.payload.kind)) },
              intent.payload,
            );
            await ports.bindings.agentFor(binding);
            await game.open();
          } catch (error) {
            throw new FleetError(safeCode(error), true);
          }
          try {
            return receipt(intent.commandId, await game.submit(intent.commandId, intent.payload));
          } catch (error) {
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
