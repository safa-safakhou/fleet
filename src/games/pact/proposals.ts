import { type Data, object, safeCode } from "../../domain.js";
import type { ActionContract, ProposalValidation } from "../../platform/contracts.js";
import { ToolArgumentError, validateTool } from "../../tools.js";
import { pactAdapter } from "./adapter.js";
import { observedActionSchema } from "./choices.js";
import { goalActionOutcomeSchema, validateGoalAction } from "./goal-state.js";
import { observedSignaturePerspective, tradeExpectedOutcomeSchema, tradePreflight } from "./trade.js";

function signatureContracts(shape: Data, facts: Data): { bound: ActionContract[]; remaining?: Data } {
  const properties = object(shape.properties),
    ids = object(properties.offerId).enum;
  if (!Array.isArray(ids)) return { bound: [], remaining: shape };
  const bound: ActionContract[] = [],
    remaining: unknown[] = [];
  for (const id of ids) {
    const offer = (
      Array.isArray(object(facts.guide).openSupplyOffers) ? (object(facts.guide).openSupplyOffers as unknown[]) : []
    )
      .map(object)
      .find((o) => o.id === id);
    const version = offer?.version;
    const trade = observedSignaturePerspective({ kind: "game.supply.sign", offerId: id, version }, facts);
    if (!Number.isSafeInteger(version) || Number(version) < 1 || !trade) {
      remaining.push(id);
      continue;
    }
    const signature = { kind: "game.supply.sign", offerId: id, version };
    try {
      validateTool({ name: "observed-signature", inputSchema: shape }, signature);
    } catch (error) {
      if (!(error instanceof ToolArgumentError)) throw error;
      remaining.push(id);
      continue;
    }
    const exactPayload =
      shape.additionalProperties === false &&
      JSON.stringify(Object.keys(properties).sort()) === JSON.stringify(Object.keys(signature).sort()) &&
      JSON.stringify((shape.required as string[]).slice().sort()) === JSON.stringify(Object.keys(signature).sort());
    const outcome = tradeExpectedOutcomeSchema();
    bound.push({
      schemaId: "pact.action.v1",
      payloadSchema: exactPayload
        ? { const: signature }
        : {
            ...shape,
            properties: {
              ...properties,
              // Each literal was checked against the complete original shape.
              // Repeating its UUID grammar and numeric bounds adds no constraint.
              offerId: { const: id },
              version: { const: version },
            },
          },
      expectedOutcomeSchema: goalActionOutcomeSchema(facts, ["game.supply.sign"], {
        ...outcome,
        properties: { ...object(outcome.properties), trade: { const: trade } },
      }),
    });
  }
  return {
    bound,
    ...(remaining.length
      ? {
          remaining: {
            ...shape,
            properties: {
              ...properties,
              offerId: { ...object(properties.offerId), enum: remaining },
            },
          },
        }
      : {}),
  };
}

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
  const signatures: ActionContract[] = [];
  const genericTrade = trade.flatMap((shape) => {
    if (object(object(shape.properties).kind).const !== "game.supply.sign") return [shape];
    const split = signatureContracts(shape, facts);
    signatures.push(...split.bound);
    return split.remaining ? [split.remaining] : [];
  });
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
    ...(genericTrade.length
      ? [
          {
            schemaId: "pact.action.v1",
            payloadSchema: { anyOf: genericTrade },
            expectedOutcomeSchema: goalActionOutcomeSchema(facts, kinds(genericTrade), tradeExpectedOutcomeSchema()),
          },
        ]
      : []),
    ...signatures,
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
