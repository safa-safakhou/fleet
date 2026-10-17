import { FleetError } from "../../../src/domain.js";
import type { BindingRef, EnvironmentAdapter, EnvironmentSession } from "../../../src/platform/contracts.js";

export const boardRef = { id: "board", version: "1", instanceId: "fixture:boards" };
export function boardEnvironment() {
  const receipts = new Map<string, { payload: string; binding: string }>();
  const squares = new Map<string, string>();
  let executions = 0,
    connections = 0;
  const adapter: EnvironmentAdapter = {
    ref: { id: "board", version: "1" },
    schemas: { observations: ["board.position.v1"], actions: ["board.move.v1"] },
    presentation: {
      accountLabel: "Player",
      actorLabel: "Seat",
      entityLabel: "Board",
      defaultGoal: "Play the current position.",
    },
    capabilities: {
      timing: "turn",
      events: "none",
      idempotency: "native",
      outcomeLookup: true,
      parallelReasoning: false,
      social: false,
      simulationControls: false,
    },
    async connect(binding: BindingRef): Promise<EnvironmentSession> {
      connections++;
      return {
        async observe() {
          return {
            schemaId: "board.position.v1",
            revision: String(executions),
            observedAt: "2026-10-17T12:00:00.000Z",
            environmentTime: { clockId: "board.ply", value: String(executions) },
            sourceRefs: [`position:${executions}`],
            payload: { seat: binding.actorRef, square: squares.get(binding.id) ?? "a1" },
            coverage: { complete: true },
          };
        },
        async catalog() {
          return [
            {
              name: "board_move",
              inputSchema: {
                type: "object",
                properties: { to: { type: "string" } },
                required: ["to"],
                additionalProperties: false,
              },
              annotations: { readOnlyHint: false },
            },
          ];
        },
        async execute(intent) {
          if (intent.bindingId !== binding.id || intent.schemaId !== "board.move.v1")
            throw new FleetError("INVALID_ACTION_INTENT");
          const old = receipts.get(intent.commandId),
            payload = JSON.stringify(intent.payload);
          if (old && (old.payload !== payload || old.binding !== binding.id)) throw new FleetError("COMMAND_ID_REUSE");
          if (!old) {
            executions++;
            receipts.set(intent.commandId, { payload, binding: binding.id });
            squares.set(binding.id, String(intent.payload.to));
          }
          return {
            commandId: intent.commandId,
            status: "confirmed",
            code: "MOVED",
            sourceRefs: [`receipt:${intent.commandId}`],
          };
        },
        async resolve(commandId) {
          return receipts.get(commandId)?.binding === binding.id
            ? { commandId, status: "confirmed", code: "MOVED", sourceRefs: [`receipt:${commandId}`] }
            : { commandId, status: "unknown", code: "RECEIPT_UNAVAILABLE", sourceRefs: [] };
        },
        async close() {},
      };
    },
  };
  return {
    adapter,
    get executions() {
      return executions;
    },
    get connections() {
      return connections;
    },
  };
}
