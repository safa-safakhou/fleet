import { isDeepStrictEqual } from "node:util";
import { FleetError } from "../../../src/domain.js";
import { type ActionEffects, actionIntentDigest } from "../../../src/platform/action-effects.js";
import type { ActionIntent, ActionOutcome } from "../../../src/platform/contracts.js";
import type { boardEnvironment } from "./board.js";

/** Synthetic authoritative board: quote and execution share exact token rules. */
export function enableBoardEffects(board: ReturnType<typeof boardEnvironment>, now: () => Date) {
  const connect = board.adapter.connect,
    receipts = new Map<string, { intent: ActionIntent; outcome: ActionOutcome }>();
  const quote = (intent: ActionIntent): ActionEffects => ({
    schemaVersion: "fleet.action-effects.v1",
    revision: `revision:${board.executions + 1}`,
    intentDigest: actionIntentDigest(intent),
    actionKey: "board.move.v1",
    claims: [{ kind: "resource", schemaId: "tokens.v1", key: "stock", units: "6" }],
    capacities: [{ schemaId: "tokens.v1", key: "stock", remainingUnits: String(10 - board.executions * 6) }],
    sourceRefs: ["board:1"],
    validUntil: { clockId: "utc", value: new Date(now().getTime() + 60000).toISOString() },
    coverage: { complete: true, omitted: [] },
    supported: true,
  });
  board.adapter.capabilities.actionEffects = true;
  board.adapter.connect = async (binding) => {
    const session = await connect(binding);
    return {
      ...session,
      effects: async (intent) => quote(intent),
      execute: async (intent) => {
        const old = receipts.get(intent.commandId);
        if (old) {
          if (!isDeepStrictEqual(old.intent, intent)) throw new FleetError("COMMAND_ID_REUSE", true);
          return old.outcome;
        }
        const current = quote(intent),
          guard = intent.guard;
        if (!guard || Date.parse(guard.expectedEffects.validUntil.value) <= now().getTime())
          throw new FleetError("ACTION_QUOTE_EXPIRED", true);
        if (
          guard.expectedRevision !== current.revision ||
          !isDeepStrictEqual({ ...current, validUntil: guard.expectedEffects.validUntil }, guard.expectedEffects)
        )
          throw new FleetError("STALE_ACTION_EFFECTS", true);
        if (board.executions > 0) throw new FleetError("INSUFFICIENT_TOKENS", true);
        const outcome = await session.execute(intent);
        receipts.set(intent.commandId, { intent: structuredClone(intent), outcome });
        return outcome;
      },
    };
  };
  return quote;
}
