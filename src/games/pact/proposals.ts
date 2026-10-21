import { type Data, object, safeCode } from "../../domain.js";
import type { ActionContract, ProposalValidation } from "../../platform/contracts.js";
import { validateTool } from "../../tools.js";
import { pactAdapter } from "./adapter.js";
import { observedActionSchema } from "./choices.js";
import { goalActionOutcomeSchema, validateGoalAction } from "./goal-state.js";
import { tradeExpectedOutcomeSchema, tradePreflight } from "./trade.js";

/** Generation constraints describe conditional choices, never permission. */
export function pactActionContracts(facts: Data, allowedActionKeys?: readonly string[]): ActionContract[] {
  const available = pactAdapter.availableActions?.(facts, null);
  const variants = (available?.kinds ?? [])
    .filter((kind) => allowedActionKeys === undefined || allowedActionKeys.includes(kind))
    .flatMap((kind) => {
      const shape = observedActionSchema(kind, facts);
      return shape ? [shape] : [];
    });
  const trade = variants.filter((s) =>
    ["game.supply.offer", "game.supply.counter", "game.supply.sign"].includes(
      String(object(object(s.properties).kind).const),
    ),
  );
  const other = variants.filter((s) => !trade.includes(s));
  const kinds = (items: Data[]) => items.map((s) => String(object(object(s.properties).kind).const));
  const otherOutcome = goalActionOutcomeSchema(facts, kinds(other));
  return [
    ...(other.length
      ? [
          {
            schemaId: "pact.action.v1",
            payloadSchema: { anyOf: other },
            ...(otherOutcome ? { expectedOutcomeSchema: otherOutcome } : {}),
          },
        ]
      : []),
    ...(trade.length
      ? [
          {
            schemaId: "pact.action.v1",
            payloadSchema: { anyOf: trade },
            expectedOutcomeSchema: goalActionOutcomeSchema(facts, kinds(trade), tradeExpectedOutcomeSchema()),
          },
        ]
      : []),
  ];
}
/** Pure local shape/reference check only. Never grants authority or opens a lease. */
export function validatePactProposal(payload: Data, facts: Data, expectedOutcome?: Data): ProposalValidation {
  try {
    validateTool({ name: "pact.action.v1", inputSchema: pactAdapter.actionSchema(String(payload.kind)) }, payload);
    const denied =
      pactAdapter.preflight?.(payload, facts) ??
      tradePreflight(payload, facts, expectedOutcome) ??
      validateGoalAction(payload, facts, expectedOutcome);
    return denied
      ? {
          valid: false,
          code: String(denied.code),
          ...(denied.guidance ? { guidance: String(denied.guidance) } : {}),
          ...(denied.detail ? { detail: denied.detail as Data } : {}),
        }
      : { valid: true, code: "VALID" };
  } catch (error) {
    return { valid: false, code: safeCode(error) };
  }
}

export function pactProposalGuide(facts: Data): Data {
  return {
    schemaId: "pact.action.v1",
    payload:
      "A bare action object with kind and its exact arguments directly in payload. Fleet assigns commandId outside payload; do not nest another action/command envelope. Only a concrete supported kind is executable; intended outcomes are not action kinds.",
    kinds: pactAdapter.availableActions?.(facts, null)?.kinds ?? [],
    schemaDelivery: "Exact argument shapes are in the decision output schema; they are not duplicated in this guide.",
    coverage:
      "Shapes are conditional advertisements, never authority; current server permissions and prerequisites still apply.",
  };
}
